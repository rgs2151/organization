import assert from "node:assert/strict";
import test from "node:test";
import { editNoteText } from "./action-note.js";
import type { RichTextDocument } from "../shared/contracts.js";

test("note edits cross formatting boundaries while preserving marks, headings, tasks and images", () => {
  const note: RichTextDocument = { type: "doc", content: [
    { type: "heading", attrs: { level: 1, collapsed: true }, content: [{ type: "text", text: "Appointment" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Call the " },
      { type: "text", text: "old clinic", marks: [{ type: "bold" }] },
      { type: "text", text: " tomorrow", marks: [{ type: "italic" }] },
    ] },
    { type: "image", attrs: { src: "/api/attachments/eye-chart", alt: "Chart" } },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Referral sent" }] }] }] },
  ] };
  const changed = editNoteText(note, [{ find: "old clinic tomorrow", replace: "new clinic on Friday" }]);
  assert.equal(changed.content?.[1].content?.[1].text, "new clinic on Friday");
  assert.deepEqual(changed.content?.[1].content?.[1].marks, [{ type: "bold" }]);
  assert.deepEqual(changed.content?.[0], note.content?.[0]);
  assert.deepEqual(changed.content?.[2], note.content?.[2]);
  assert.deepEqual(changed.content?.[3], note.content?.[3]);
  assert.equal(note.content?.[1].content?.[1].text, "old clinic");
  assert.throws(() => editNoteText(note, [{ find: "missing", replace: "x" }]), /not found/);
  const duplicate: RichTextDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "again again" }] }] };
  assert.throws(() => editNoteText(duplicate, [{ find: "again", replace: "once" }]), /more than once/);
});
