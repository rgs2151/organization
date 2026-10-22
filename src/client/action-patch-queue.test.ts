import assert from "node:assert/strict";
import test from "node:test";
import { ActionPatchQueue } from "./action-patch-queue.js";
import type { OrganizationAction, UpdateActionInput } from "../shared/contracts.js";

const initial: OrganizationAction = {
  id: "test-action", revision: 1, title: "Original", date: null,
  note: { type: "doc", content: [{ type: "paragraph" }] },
  completed: false, completedAt: null, color: "plain",
};

test("delayed save acknowledgements cannot overwrite newer typing or notes", async () => {
  let resolveSave!: (action: OrganizationAction) => void;
  const sent: UpdateActionInput[] = [];
  const received: OrganizationAction[] = [];
  const queue = new ActionPatchQueue(async (_id, patch) => {
    sent.push(patch);
    return new Promise((resolve) => { resolveSave = resolve; });
  }, (action) => received.push(action));
  queue.enqueue(initial.id, { title: "First edit" });
  const first = queue.flush(initial.id);
  await Promise.resolve(); await Promise.resolve();
  const note = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this" }] }] };
  queue.enqueue(initial.id, { title: "Newer typing", note });
  assert.equal(queue.overlay(initial).title, "Newer typing");
  resolveSave({ ...initial, title: "First edit", revision: 2 });
  await first;
  assert.equal(received[0].title, "Newer typing");
  assert.deepEqual(received[0].note, note);
  const second = queue.flush(initial.id);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(sent[1], { title: "Newer typing", note });
  resolveSave({ ...initial, title: "Newer typing", note, revision: 3 });
  await second;
  assert.equal(received[1].revision, 3);
});

test("failed saves keep the newest draft for an explicit retry", async () => {
  let fail = true;
  const queue = new ActionPatchQueue(async (_id, patch) => {
    if (fail) throw new Error("Offline");
    return { ...initial, ...patch, revision: 2 };
  }, () => undefined);
  queue.enqueue(initial.id, { title: "Do not lose this" });
  await assert.rejects(queue.flush(initial.id), /Offline/);
  assert.equal(queue.overlay(initial).title, "Do not lose this");
  queue.enqueue(initial.id, { title: "Newest text" });
  fail = false;
  await queue.flush(initial.id);
  assert.equal(queue.overlay(initial).title, "Original");
});
