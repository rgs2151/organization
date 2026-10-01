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
  const importedActionId = "notion:0123456789abcdef0123456789abcdef";
  database.prepare(`
    INSERT INTO actions(id, owner_id, title, scheduled_for, position)
    VALUES (?, ?, ?, ?, ?)
  `).run(importedActionId, owner.id, "Imported through Notion", "2026-08-05", 8192);
  const createdCredential = credentials.create(owner.id, "Test client");
  const otherOwner = actions.ensureAuthenticatedUser({
    subject: "other-mcp-owner",
    email: "other-mcp@example.com",
    displayName: "Other MCP Owner",
  });
  const otherCredential = credentials.create(otherOwner.id, "Other client");
  assert.deepEqual(credentials.list(owner.id).map((credential) => credential.name), ["Test client"]);
  assert.throws(() => credentials.revoke(owner.id, otherCredential.credential.id));

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
  const discoverResponse = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${createdCredential.token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-method": "server/discover",
      "mcp-protocol-version": "2026-07-28",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "organization-modern-test", version: "1.0.0" },
        },
      },
    }),
  });
  assert.equal(discoverResponse.status, 200, await discoverResponse.text());
  await client.connect(transport);
  const listedTools = await client.listTools();
  assert.ok(listedTools.tools.some((tool) => tool.name === "organization_get_context"));
  assert.ok(listedTools.tools.some((tool) => tool.name === "actions_move"));

  const importedGetResult = await client.callTool({
    name: "actions_get",
    arguments: { id: importedActionId },
  });
  assert.equal(importedGetResult.isError, undefined);
  let importedAction = (importedGetResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;
  assert.equal(importedAction.id, importedActionId);

  const importedUpdateResult = await client.callTool({
    name: "actions_update",
    arguments: {
      id: importedActionId,
      expectedRevision: importedAction.revision,
      title: "Updated imported action",
    },
  });
  assert.equal(importedUpdateResult.isError, undefined);
  importedAction = (importedUpdateResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;

  const importedNoteResult = await client.callTool({
    name: "action_note_append",
    arguments: {
      id: importedActionId,
      expectedRevision: importedAction.revision,
      text: "Imported action note",
    },
  });
  assert.equal(importedNoteResult.isError, undefined);
  assert.match(JSON.stringify(importedNoteResult.structuredContent), /Imported action note/);
  importedAction = (importedNoteResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;

  const createResult = await client.callTool({
    name: "actions_create",
    arguments: {
      title: "Created through MCP",
      date: "2026-08-05",
      beforeId: importedActionId,
    },
  });
  assert.equal(createResult.isError, undefined);
  let createdAction = (createResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;
  assert.ok(createdAction.id);

  const createdGetResult = await client.callTool({
    name: "actions_get",
    arguments: { id: createdAction.id },
  });
  assert.equal(createdGetResult.isError, undefined);
  assert.equal((createdGetResult.structuredContent as { action: { id: string } }).action.id, createdAction.id);

  const createdUpdateResult = await client.callTool({
    name: "actions_update",
    arguments: {
      id: createdAction.id,
      expectedRevision: createdAction.revision,
      title: "Updated UUID action",
    },
  });
  assert.equal(createdUpdateResult.isError, undefined);
  createdAction = (createdUpdateResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;

  const createdNoteResult = await client.callTool({
    name: "action_note_append",
    arguments: {
      id: createdAction.id,
      expectedRevision: createdAction.revision,
      text: "UUID action note",
    },
  });
  assert.equal(createdNoteResult.isError, undefined);
  assert.match(JSON.stringify(createdNoteResult.structuredContent), /UUID action note/);
  createdAction = (createdNoteResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;

  const createdMoveResult = await client.callTool({
    name: "actions_move",
    arguments: {
      id: createdAction.id,
      expectedRevision: createdAction.revision,
      date: "2026-08-05",
      beforeId: importedActionId,
    },
  });
  assert.equal(createdMoveResult.isError, undefined);
  createdAction = (createdMoveResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;

  const importedMoveResult = await client.callTool({
    name: "actions_move",
    arguments: {
      id: importedActionId,
      expectedRevision: importedAction.revision,
      date: "2026-08-05",
      beforeId: createdAction.id,
    },
  });
  assert.equal(importedMoveResult.isError, undefined);
  importedAction = (importedMoveResult.structuredContent as {
    action: { id: string; revision: number };
  }).action;

  const importedDeleteResult = await client.callTool({
    name: "actions_delete",
    arguments: { id: importedActionId, expectedRevision: importedAction.revision },
  });
  assert.equal(importedDeleteResult.isError, undefined);
  assert.deepEqual(importedDeleteResult.structuredContent, { deleted: true, id: importedActionId });

  const createdDeleteResult = await client.callTool({
    name: "actions_delete",
    arguments: { id: createdAction.id, expectedRevision: createdAction.revision },
  });
  assert.equal(createdDeleteResult.isError, undefined);
  assert.deepEqual(createdDeleteResult.structuredContent, { deleted: true, id: createdAction.id });

  credentials.revoke(owner.id, createdCredential.credential.id);
  assert.equal((await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${createdCredential.token}`, "content-type": "application/json" },
    body: "{}",
  })).status, 401);
});
