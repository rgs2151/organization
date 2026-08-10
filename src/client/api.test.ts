import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticationRequiredError,
  ConnectionError,
  createAction,
  createMcpCredential,
  listMcpCredentials,
  revokeMcpCredential,
} from "./api.js";

test("API requests distinguish expired authentication from connectivity failures", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { location: "https://auth.example/application/o/authorize/" },
  });
  await assert.rejects(
    createAction({ title: "Expired", date: null }),
    AuthenticationRequiredError,
  );

  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };
  await assert.rejects(
    createAction({ title: "Offline", date: null }),
    ConnectionError,
  );
});

test("Settings API manages the browser owner's MCP credentials", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const credential = {
    id: "16aa7dc1-08b8-4a13-8af1-15f82f8acbee",
    name: "Mac Codex",
    scopes: ["organization:read", "organization:write"],
    createdAt: "2026-08-10 12:00:00",
    lastUsedAt: null,
    revokedAt: null,
  };
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const body = init?.method === "POST"
      ? { token: "orgmcp_token", credential }
      : init?.method === "DELETE"
        ? { credential: { ...credential, revokedAt: "2026-08-10 12:01:00" } }
        : { credentials: [credential] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  assert.equal((await listMcpCredentials())[0]?.name, "Mac Codex");
  assert.equal((await createMcpCredential("Mac Codex")).token, "orgmcp_token");
  assert.equal((await revokeMcpCredential(credential.id)).revokedAt, "2026-08-10 12:01:00");
  assert.deepEqual(requests, [
    { url: "/api/settings/mcp-credentials", method: "GET", body: undefined },
    { url: "/api/settings/mcp-credentials", method: "POST", body: JSON.stringify({ name: "Mac Codex" }) },
    { url: `/api/settings/mcp-credentials/${credential.id}`, method: "DELETE", body: undefined },
  ]);
});
