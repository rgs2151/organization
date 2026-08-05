import type { ActionColor } from "../shared/contracts.js";

export type SeedAction = {
  id: string;
  title: string;
  date: string | null;
  notes: string;
  completed: boolean;
  color: ActionColor;
};

export const DEVELOPMENT_ACTIONS: SeedAction[] = [
  ["a-01", "Get eyes checked", "2026-08-05", "Call the clinic and ask for the first appointment after lunch.", false, "mint"],
  ["a-02", "Finish Ian's updates", "2026-08-05", "Review the final comments before sending the update.", false, "plain"],
  ["a-03", "Organize legal documents", "2026-08-05", "Move the signed copies into one folder and name them consistently.", false, "lilac"],
  ["a-04", "Get my W-2s", "2026-08-06", "Download both employers' copies and save them with tax documents.", false, "sun"],
  ["a-05", "Book appointment for myself", "2026-08-06", "Check the provider portal first, then call if no times appear.", false, "plain"],
  ["a-06", "Renew the electricity contract", "2026-08-07", "Compare the renewal rate with the current statement.", false, "rose"],
  ["a-07", "Pay rent", "2026-08-07", "Confirm the payment posts before the weekend.", true, "plain"],
  ["a-08", "Write my one-year, five-year, and ten-year plan", "2026-08-09", "Start with the direction, not a perfect list of milestones.", false, "lilac"],
  ["a-09", "Return Amazon phone arm", "2026-08-03", "Print the return label and take it downstairs.", true, "plain"],
  ["a-10", "Call Erfan", "2026-08-03", "Check timing for the next meeting.", true, "mint"],
  ["a-11", "Understand cross-dataset results", "2026-07-29", "Write down the two patterns that still need an explanation.", true, "sun"],
  ["a-12", "Find a better system for recurring bills", null, "No urgency. Capture options when they come up.", false, "plain"],
  ["a-13", "Plan the Notion calendar migration", null, "Wait until the new action model is stable.", false, "lilac"],
  ["a-14", "Research a quiet weekend trip", null, "Keep this fun and unhurried.", false, "mint"],
].map(([id, title, date, notes, completed, color]) => ({
  id: String(id),
  title: String(title),
  date: date === null ? null : String(date),
  notes: String(notes),
  completed: Boolean(completed),
  color: color as ActionColor,
}));
