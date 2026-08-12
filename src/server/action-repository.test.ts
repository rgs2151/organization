import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ActionRepository, ConflictError } from "./action-repository.js";
import { AttachmentRepository } from "./attachment-repository.js";
import { openDatabase } from "./database.js";

test("actions remain owner-scoped and support the complete persistence lifecycle", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "organization-test-"));
  const database = openDatabase(path.join(directory, "organization.sqlite"));
  context.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const repository = new ActionRepository(database);
  const attachments = new AttachmentRepository(database);
  const owner = {
    id: "test-owner",
    displayName: "Test Owner",
    email: "owner@example.com",
  };
  repository.ensureDevelopmentUser(owner);

  assert.equal(repository.list(owner.id).length, 14);

  const created = repository.create(owner.id, {
    title: "Persist this action",
    date: null,
    beforeId: "a-12",
  });
  assert.equal(repository.list(owner.id).findIndex((action) => action.id === created.id), 0);

  const updated = repository.update(owner.id, created.id, {
    note: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Stored in SQLite" }] }],
    },
    completed: true,
    color: "mint",
  });
  assert.equal(updated.note.content?.[0]?.content?.[0]?.text, "Stored in SQLite");
  assert.equal(updated.completed, true);
  assert.ok(updated.completedAt);
  assert.ok(updated.revision > created.revision);
  assert.throws(() => repository.update(owner.id, created.id, {
    title: "Overwrite a newer action",
  }, created.revision), ConflictError);

  attachments.create(owner.id, created.id, {
    id: "attachment-kept",
    storageKey: "kept.png",
    filename: "kept.png",
    contentType: "image/png",
    byteSize: 128,
  });
  attachments.create(owner.id, created.id, {
    id: "attachment-removed",
    storageKey: "removed.png",
    filename: "removed.png",
    contentType: "image/png",
    byteSize: 128,
  });
  assert.deepEqual(
    attachments.deleteUnreferenced(owner.id, created.id, new Set(["attachment-kept"])),
    ["removed.png"],
  );
  assert.equal(attachments.get(owner.id, "attachment-kept").filename, "kept.png");

  const moved = repository.move(owner.id, created.id, {
    date: "2026-08-05",
    beforeId: "a-01",
  });
  assert.equal(
    moved.filter((action) => action.date === "2026-08-05")[0]?.id,
    created.id,
  );

  const firstBatchAction = repository.create(owner.id, {
    title: "Move this first",
    date: "2026-08-06",
  });
  const secondBatchAction = repository.create(owner.id, {
    title: "Move this second",
    date: null,
  });
  const batchMoved = repository.moveMany(owner.id, {
    ids: [firstBatchAction.id, secondBatchAction.id],
    date: "2026-08-05",
    beforeId: "a-01",
  });
  assert.deepEqual(
    batchMoved.filter((action) => action.date === "2026-08-05").slice(0, 3).map((action) => action.id),
    [created.id, firstBatchAction.id, secondBatchAction.id],
  );

  const restoredPlacements = repository.restorePlacements(owner.id, [
    { id: firstBatchAction.id, date: "2026-08-06" },
    { id: secondBatchAction.id, date: null },
  ]);
  assert.equal(
    restoredPlacements.filter((action) => action.date === "2026-08-06").at(-1)?.id,
    firstBatchAction.id,
  );
  assert.equal(
    restoredPlacements.filter((action) => action.date === null).at(-1)?.id,
    secondBatchAction.id,
  );

  const firstOrdered = repository.create(owner.id, { title: "First ordered", date: "2026-09-01" });
  const middleOrdered = repository.create(owner.id, { title: "Middle ordered", date: "2026-09-01" });
  const lastOrdered = repository.create(owner.id, { title: "Last ordered", date: "2026-09-01" });
  repository.moveMany(owner.id, {
    ids: [firstOrdered.id, lastOrdered.id],
    date: "2026-09-02",
  });
  const restoredNoncontiguous = repository.restorePlacements(owner.id, [
    { id: firstOrdered.id, date: "2026-09-01", beforeId: middleOrdered.id },
    { id: lastOrdered.id, date: "2026-09-01" },
  ]);
  assert.deepEqual(
    restoredNoncontiguous.filter((action) => action.date === "2026-09-01").map((action) => action.id),
    [firstOrdered.id, middleOrdered.id, lastOrdered.id],
  );

  const restoredState = repository.restoreState(owner.id, created.id, {
    completed: true,
    completedAt: "2026-08-05T18:30:00.000Z",
    color: "rose",
  });
  assert.equal(restoredState.completedAt, "2026-08-05T18:30:00.000Z");
  assert.equal(restoredState.color, "rose");

  repository.delete(owner.id, created.id);
  assert.equal(repository.list(owner.id).some((action) => action.id === created.id), false);
  assert.equal(attachments.get(owner.id, "attachment-kept").filename, "kept.png");
  const restoredDeleted = repository.restore(owner.id, created.id, "a-01");
  assert.equal(restoredDeleted.find((action) => action.id === created.id)?.title, "Persist this action");
  assert.equal(
    restoredDeleted.filter((action) => action.date === "2026-08-05")[0]?.id,
    created.id,
  );
});

test("authenticated identities create empty accounts and safely claim a matching imported email", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "organization-identity-test-"));
  const database = openDatabase(path.join(directory, "organization.sqlite"));
  context.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const repository = new ActionRepository(database);
  const newUser = repository.ensureAuthenticatedUser({
    subject: "family-subject",
    email: "family@example.com",
    displayName: "Family Member",
  });
  assert.equal(repository.list(newUser.id).length, 0);

  const importedOwner = {
    id: "import-rudra",
    displayName: "Rudra Import",
    email: "rudra@example.com",
  };
  repository.ensureDevelopmentUser(importedOwner);
  const linked = repository.ensureAuthenticatedUser({
    subject: "rudra-subject",
    email: "rudra@example.com",
    displayName: "Rudra",
  });
  assert.equal(linked.id, importedOwner.id);
  assert.equal(repository.list(linked.id).length, 14);

  const repeated = repository.ensureAuthenticatedUser({
    subject: "rudra-subject",
    email: "rudra@example.com",
    displayName: "Rudramani Singha",
  });
  assert.equal(repeated.id, importedOwner.id);
  assert.equal(repeated.displayName, "Rudramani Singha");
});
