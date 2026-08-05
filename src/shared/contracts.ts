export const ACTION_COLORS = ["plain", "sun", "mint", "lilac", "rose"] as const;

export type ActionColor = (typeof ACTION_COLORS)[number];

export type OrganizationUser = {
  id: string;
  email: string;
  displayName: string;
};

export type OrganizationSession = {
  user: OrganizationUser;
  mode: "development" | "authenticated";
};

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type RichTextDocument = RichTextNode & {
  type: "doc";
};

export const EMPTY_NOTE: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type OrganizationAction = {
  id: string;
  title: string;
  date: string | null;
  note: RichTextDocument;
  completed: boolean;
  completedAt: string | null;
  color: ActionColor;
};

export type CreateActionInput = {
  title: string;
  date: string | null;
  beforeId?: string;
};

export type UpdateActionInput = Partial<
  Pick<OrganizationAction, "title" | "date" | "note" | "completed" | "color">
>;

export type MoveActionInput = {
  date: string | null;
  beforeId?: string;
};

export type ActionAttachment = {
  id: string;
  src: string;
  alt: string;
};
