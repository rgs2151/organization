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

export type OrganizationAction = {
  id: string;
  title: string;
  date: string | null;
  notes: string;
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
  Pick<OrganizationAction, "title" | "date" | "notes" | "completed" | "color">
>;

export type MoveActionInput = {
  date: string | null;
  beforeId?: string;
};
