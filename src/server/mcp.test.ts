import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ActionRepository } from "./action-repository.js";
import { openDatabase } from "./database.js";
import { createOrganizationMcp } from "./mcp.js";
import { McpTokenRepository } from "./mcp-token-repository.js";

test("Organization MCP authenticates a revocable owner credential and uses application operations", async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "organization-mcp-test-"));
  const database = openDatabase(path.join(directory, "organization.sqlite"));
  const actions = new ActionRepository(database);
  const credentials = new McpTokenRepository(database);
  const owner = { id: "mcp-owner", email: "mcp@example.com", displayName: "MCP Owner" };
  actions.ensureDevelopmentUser(owner);
  const createdCredential = credentials.create(owner.id, "Test client");

  let mcp: ReturnType<typeof createOrganizationMcp> | null = null;
  const httpServer = createServer((request, response) => {
    void mcp?.handle(request, response).catch((error) => {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  mcp = createOrganizationMcp(actions, credentials, origin);

  const client = new Client({ name: "organization-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin), {
    authProvider: { token: async () => createdCredential.token },
  });

  context.after(async () => {
    await client.close().catch(() => undefined);
    await mcp?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  assert.equal((await fetch(`${origin}/mcp`)).status, 401);
  await client.connect(transport);
  const listedTools = await client.listTools();
  assert.ok(listedTools.tools.some((tool) => tool.name === "organization_get_context"));
  assert.ok(listedTools.tools.some((tool) => tool.name === "actions_move"));

  const createResult = await client.callTool({
    name: "actions_create",
    arguments: { title: "Created through MCP", date: null, note: "Original thought" },
  });
  assert.equal(createResult.isError, undefined);
  const createdAction = (createResult.structuredContent as { action: { id: string; revision: number } }).action;
  assert.ok(createdAction.id);

  const appendResult = await client.callTool({
    name: "action_note_append",
    arguments: { id: createdAction.id, expectedRevision: createdAction.revision, text: "Follow-up" },
  });
  assert.equal(appendResult.isError, undefined);
  assert.match(JSON.stringify(appendResult.structuredContent), /Follow-up/);

  credentials.revoke(owner.id, createdCredential.credential.id);
  assert.equal((await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${createdCredential.token}`, "content-type": "application/json" },
    body: "{}",
  })).status, 401);
});
