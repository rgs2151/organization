import type { RichTextDocument, RichTextNode } from "../shared/contracts.js";
import { InputError } from "./action-repository.js";

/** Edit visible text without flattening headings, marks, checklists or attachments. */
export function editNoteText(note: RichTextDocument, edits: Array<{ find: string; replace: string }>) {
  const result = structuredClone(note);
  for (const edit of edits) {
    const matches: Array<{ nodes: RichTextNode[]; start: number }> = [];
    function visit(node: RichTextNode) {
      if (["paragraph", "heading", "codeBlock"].includes(node.type)) {
        // Non-text inline nodes separate runs, so a replacement cannot consume an image or break.
        let run: RichTextNode[] = [];
        function inspect() {
          const text = run.map((child) => child.text ?? "").join("");
          let start = text.indexOf(edit.find);
          while (start >= 0) {
            matches.push({ nodes: [...run], start });
            start = text.indexOf(edit.find, start + edit.find.length);
          }
          run = [];
        }
        for (const child of node.content ?? []) {
          if (child.type === "text") run.push(child);
          else inspect();
        }
        inspect();
      } else node.content?.forEach(visit);
    }
    visit(result);
    if (matches.length !== 1) {
      throw new InputError(matches.length === 0
        ? "The note text was not found. Read the latest note before editing."
        : "The note text occurs more than once. Use a longer, unique passage.");
    }
    const { nodes, start } = matches[0];
    const end = start + edit.find.length;
    let offset = 0;
    let inserted = false;
    for (const node of nodes) {
      const text = node.text ?? "";
      const next = offset + text.length;
      if (next > start && offset < end) {
        const prefix = text.slice(0, Math.max(0, start - offset));
        const suffix = text.slice(Math.min(text.length, end - offset));
        node.text = prefix + (inserted ? "" : edit.replace) + suffix;
        inserted = true;
      }
      offset = next;
    }
    function prune(node: RichTextNode) {
      if (node.content) {
        node.content = node.content.filter((child) => child.type !== "text" || child.text !== "");
        node.content.forEach(prune);
      }
    }
    prune(result);
  }
  return result;
}
