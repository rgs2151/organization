import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ActionRepository } from "./action-repository.js";
import { openDatabase } from "./database.js";
import { SessionResolver, UnauthorizedError } from "./session.js";

test("Authentik proxy sessions require the intended app and verified identity headers", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "organization-session-test-"));
  const database = openDatabase(path.join(directory, "organization.sqlite"));
  context.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const resolver = new SessionResolver(new ActionRepository(database), {
    authMode: "authentik-proxy",
    authentikAppSlug: "organization",
    developmentUser: { id: "unused", email: "unused@example.com", displayName: "Unused" },
  });

  assert.throws(() => resolver.resolve(requestWithHeaders({})), UnauthorizedError);
  assert.throws(() => resolver.resolve(requestWithHeaders({
    "x-authentik-meta-app": "another-app",
    "x-authentik-uid": "subject-1",
    "x-authentik-email": "person@example.com",
  })), UnauthorizedError);

  const session = resolver.resolve(requestWithHeaders({
    "x-authentik-meta-app": "organization",
    "x-authentik-uid": "subject-1",
    "x-authentik-email": "Person@Example.com",
    "x-authentik-name": "Person Name",
  }));
  assert.equal(session.mode, "authenticated");
  assert.equal(session.user.email, "person@example.com");
  assert.equal(session.user.displayName, "Person Name");
});

function requestWithHeaders(headers: IncomingMessage["headers"]) {
  return { headers } as IncomingMessage;
}
