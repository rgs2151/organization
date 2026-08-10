import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticationRequiredError,
  ConnectionError,
  createAction,
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
