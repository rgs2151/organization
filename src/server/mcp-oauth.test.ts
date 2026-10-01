import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { ActionRepository } from "./action-repository.js";
import { openDatabase } from "./database.js";
import { AuthentikMcpOAuth } from "./mcp-oauth.js";
import { McpTokenRepository } from "./mcp-token-repository.js";
import { createOrganizationMcp } from "./mcp.js";

test("Organization MCP accepts Authentik OAuth tokens and publishes ChatGPT metadata", async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "organization-oauth-test-"));
  const database = openDatabase(path.join(directory, "organization.sqlite"));
  const repository = new ActionRepository(database);
  const credentials = new McpTokenRepository(database);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { alg: "RS256", kid: "test-key", use: "sig" });

  const identityServer = createServer((request, response) => {
    const issuer = serverOrigin(identityServer);
    if (request.url === "/.well-known/openid-configuration") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        issuer,
        jwks_uri: `${issuer}/jwks`,
        code_challenge_methods_supported: ["S256"],
      }));
      return;
    }
    if (request.url === "/jwks") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    response.writeHead(404).end();
  });
  await listen(identityServer);
  const issuer = serverOrigin(identityServer);

  let mcp: ReturnType<typeof createOrganizationMcp> | null = null;
  const mcpServer = createServer((request, response) => {
    void mcp?.handle(request, response).catch((error) => {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error));
    });
  });
  await listen(mcpServer);
  const origin = serverOrigin(mcpServer);
  const resource = `${origin}/mcp`;
  const oauth = new AuthentikMcpOAuth(repository, {
    issuer,
    clientId: "organization-chatgpt",
    resource,
    audiences: [resource, "organization-chatgpt"],
  });
  mcp = createOrganizationMcp(repository, credentials, origin, oauth);

  const token = await new SignJWT({
    email: "Person@Example.com",
    email_verified: true,
    name: "Person Name",
    scope: "openid profile email offline_access organization:read organization:write",
    azp: "organization-chatgpt",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(resource)
    .setSubject("authentik-user-id")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const client = new Client({ name: "organization-oauth-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin), {
    authProvider: { token: async () => token },
  });

  context.after(async () => {
    await client.close().catch(() => undefined);
    await mcp?.close();
    await close(mcpServer);
    await close(identityServer);
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const metadata = oauth.protectedResourceMetadata();
  assert.equal(metadata.resource, resource);
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  assert.match(oauth.challenge(), /resource_metadata=/);

  await client.connect(transport);
  const tools = await client.listTools();
  const profileTool = tools.tools.find((tool) => tool.name === "organization_get_profile");
  assert.ok(profileTool);
  assert.equal(profileTool._meta?.["openai/profile"], true);
  assert.deepEqual(
    (profileTool._meta?.securitySchemes as Array<{ type: string }>).map((scheme) => scheme.type),
    ["oauth2"],
  );

  const profile = await client.callTool({ name: "organization_get_profile", arguments: {} });
  assert.deepEqual(profile.structuredContent, {
    id: "authentik:authentik-user-id",
    name: "Person Name",
    email: "person@example.com",
    nickname: "Person Name — Singha Organization",
  });

  const created = await client.callTool({
    name: "actions_create",
    arguments: { title: "Created through OAuth", date: null },
  });
  assert.equal(created.isError, undefined);
  assert.equal(repository.list("authentik:authentik-user-id").at(-1)?.title, "Created through OAuth");

  const audit = database.prepare(`
    SELECT auth_method, token_id, oauth_client_id, outcome
    FROM mcp_audit_log
    WHERE tool_name = 'actions_create'
  `).get() as Record<string, unknown>;
  assert.deepEqual({ ...audit }, {
    auth_method: "oauth",
    token_id: null,
    oauth_client_id: "organization-chatgpt",
    outcome: "success",
  });

  const wrongAudience = await new SignJWT({
    email: "person@example.com",
    email_verified: true,
    scope: "organization:read",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience("another-service")
    .setSubject("authentik-user-id")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  assert.equal(await oauth.authenticate(wrongAudience), null);
});

function serverOrigin(server: ReturnType<typeof createServer>) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
