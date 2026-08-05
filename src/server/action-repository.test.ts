import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ActionRepository } from "./action-repository.js";
import { openDatabase } from "./database.js";

test("actions remain owner-scoped and support the complete persistence lifecycle", (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "organization-test-"));
  const database = openDatabase(path.join(directory, "organization.sqlite"));
  context.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const repository = new ActionRepository(database);
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
    notes: "Stored in SQLite",
    completed: true,
    color: "mint",
  });
  assert.equal(updated.notes, "Stored in SQLite");
  assert.equal(updated.completed, true);
  assert.ok(updated.completedAt);

  const moved = repository.move(owner.id, created.id, {
    date: "2026-08-05",
    beforeId: "a-01",
  });
  assert.equal(
    moved.filter((action) => action.date === "2026-08-05")[0]?.id,
    created.id,
  );

  repository.delete(owner.id, created.id);
  assert.equal(repository.list(owner.id).some((action) => action.id === created.id), false);
});
