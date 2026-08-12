import { randomUUID } from "node:crypto";
import type { DatabaseSync, StatementResultingChanges } from "node:sqlite";
import {
  ACTION_COLORS,
  type CreateActionInput,
  type MoveActionInput,
  type MoveActionsInput,
  type OrganizationAction,
  type OrganizationUser,
  type RichTextDocument,
  type UpdateActionInput,
} from "../shared/contracts.js";
import { DEVELOPMENT_ACTIONS } from "./development-seed.js";

type ActionRow = {
  id: string;
  revision: number;
  title: string;
  scheduled_for: string | null;
  note_document: string;
  completed: number;
  completed_at: string | null;
  color: string;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ActionRepository {
  constructor(private readonly database: DatabaseSync) {}

  ensureDevelopmentUser(user: OrganizationUser) {
    this.database.prepare(`
      INSERT INTO organization_users(id, email, display_name)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = CURRENT_TIMESTAMP
    `).run(user.id, user.email, user.displayName);

    const row = this.database.prepare("SELECT count(*) AS count FROM actions WHERE owner_id = ?")
      .get(user.id);
    if (Number(row?.count ?? 0) > 0) return;

    const insert = this.database.prepare(`
      INSERT INTO actions(
        id, owner_id, title, scheduled_for, notes, completed, completed_at, color, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const positions = new Map<string, number>();

    this.transaction(() => {
      for (const action of DEVELOPMENT_ACTIONS) {
        const target = action.date ?? "someday";
        const position = (positions.get(target) ?? 0) + 1024;
        positions.set(target, position);
        insert.run(
          action.id,
          user.id,
          action.title,
          action.date,
          action.notes,
          action.completed ? 1 : 0,
          action.completed ? new Date().toISOString() : null,
          action.color,
          position,
        );
      }
    });
  }

  ensureAuthenticatedUser(identity: {
    subject: string;
    email: string;
    displayName: string;
  }): OrganizationUser {
    const bySubject = this.database.prepare(`
      SELECT id, email, display_name
      FROM organization_users
      WHERE provider_subject = ?
    `).get(identity.subject) as unknown as UserRow | undefined;
    const byEmail = this.database.prepare(`
      SELECT id, email, display_name
      FROM organization_users
      WHERE email = ? COLLATE NOCASE
    `).get(identity.email) as unknown as UserRow | undefined;

    if (bySubject && byEmail && bySubject.id !== byEmail.id) {
      throw new Error("The authenticated subject and email belong to different users.");
    }

    const existing = bySubject ?? byEmail;
    if (existing) {
      this.database.prepare(`
        UPDATE organization_users
        SET provider_subject = ?, email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(identity.subject, identity.email, identity.displayName, existing.id);
      return { id: existing.id, email: identity.email, displayName: identity.displayName };
    }

    const id = `authentik:${identity.subject}`;
    this.database.prepare(`
      INSERT INTO organization_users(id, provider_subject, email, display_name)
      VALUES (?, ?, ?, ?)
    `).run(id, identity.subject, identity.email, identity.displayName);
    return { id, email: identity.email, displayName: identity.displayName };
  }

  list(ownerId: string): OrganizationAction[] {
    const rows = this.database.prepare(`
      SELECT id, revision, title, scheduled_for, note_document, completed, completed_at, color
      FROM actions
      WHERE owner_id = ?
      ORDER BY scheduled_for IS NOT NULL, scheduled_for, position, created_at
    `).all(ownerId) as unknown as ActionRow[];
    return rows.map(toAction);
  }

  create(ownerId: string, input: CreateActionInput): OrganizationAction {
    const title = validateTitle(input.title);
    const date = validateDate(input.date);
    const id = randomUUID();

    this.transaction(() => {
      const orderedIds = this.idsForDate(ownerId, date);
      const requestedIndex = input.beforeId ? orderedIds.indexOf(input.beforeId) : -1;
      const insertionIndex = requestedIndex >= 0 ? requestedIndex : orderedIds.length;
      orderedIds.splice(insertionIndex, 0, id);
      this.database.prepare(`
        INSERT INTO actions(id, owner_id, title, scheduled_for, position)
        VALUES (?, ?, ?, ?, 0)
      `).run(id, ownerId, title, date);
      this.reindex(ownerId, date, orderedIds);
    });

    return this.getRequired(ownerId, id);
  }

  get(ownerId: string, id: string) {
    return this.getRequired(ownerId, id);
  }

  findUserByEmail(email: string) {
    const row = this.database.prepare(`
      SELECT id, email, display_name
      FROM organization_users
      WHERE email = ? COLLATE NOCASE
    `).get(email) as unknown as UserRow | undefined;
    return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
  }

  update(
    ownerId: string,
    id: string,
    input: UpdateActionInput,
    expectedRevision?: number,
  ): OrganizationAction {
    const current = this.getRequired(ownerId, id);
    requireRevision(current.revision, expectedRevision);

    if (Object.hasOwn(input, "date") && input.date !== current.date) {
      this.move(ownerId, id, { date: validateDate(input.date ?? null) }, expectedRevision);
      expectedRevision = undefined;
    }

    const assignments: string[] = [];
    const values: Array<string | number | null> = [];

    if (Object.hasOwn(input, "title")) {
      assignments.push("title = ?");
      values.push(validateTitle(input.title ?? ""));
    }
    if (Object.hasOwn(input, "note")) {
      assignments.push("note_document = ?");
      values.push(validateNote(input.note));
    }
    if (Object.hasOwn(input, "color")) {
      if (!ACTION_COLORS.includes(input.color!)) throw new InputError("Unknown action color.");
      assignments.push("color = ?");
      values.push(input.color!);
    }
    if (Object.hasOwn(input, "completed")) {
      assignments.push("completed = ?", "completed_at = ?");
      values.push(input.completed ? 1 : 0, input.completed ? new Date().toISOString() : null);
    }

    if (assignments.length > 0) {
      assignments.push("revision = revision + 1", "updated_at = CURRENT_TIMESTAMP");
      const result = this.database.prepare(`
        UPDATE actions SET ${assignments.join(", ")}
        WHERE owner_id = ? AND id = ?
          AND (? IS NULL OR revision = ?)
      `).run(...values, ownerId, id, expectedRevision ?? null, expectedRevision ?? null) as StatementResultingChanges;
      if (result.changes !== 1) throw new ConflictError("The action changed after it was read. Reload it and try again.");
    }

    return this.getRequired(ownerId, id);
  }

  move(
    ownerId: string,
    id: string,
    input: MoveActionInput,
    expectedRevision?: number,
  ): OrganizationAction[] {
    const date = validateDate(input.date);
    const current = this.getRequired(ownerId, id);
    requireRevision(current.revision, expectedRevision);

    this.transaction(() => {
      const targetIds = this.idsForDate(ownerId, date).filter((candidate) => candidate !== id);
      const beforeIndex = input.beforeId ? targetIds.indexOf(input.beforeId) : -1;
      targetIds.splice(beforeIndex >= 0 ? beforeIndex : targetIds.length, 0, id);
      this.database.prepare(`
        UPDATE actions
        SET scheduled_for = ?, position = 0, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE owner_id = ? AND id = ?
      `).run(date, ownerId, id);
      this.reindex(ownerId, date, targetIds);
      if (current.date !== date) {
        this.reindex(ownerId, current.date, this.idsForDate(ownerId, current.date));
      }
    });

    return this.list(ownerId);
  }

  moveMany(ownerId: string, input: MoveActionsInput): OrganizationAction[] {
    const date = validateDate(input.date);
    if (!Array.isArray(input.ids)) throw new InputError("Select actions to move.");
    const ids = [...new Set(input.ids)];
    if (ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== "string" || !id)) {
      throw new InputError("Select between 1 and 500 actions to move.");
    }

    const moving = ids.map((id) => this.getRequired(ownerId, id));
    const movingIds = new Set(ids);
    const sourceDates = new Set(moving.map((action) => action.date));

    this.transaction(() => {
      const targetIds = this.idsForDate(ownerId, date).filter((id) => !movingIds.has(id));
      const requestedIndex = input.beforeId ? targetIds.indexOf(input.beforeId) : -1;
      targetIds.splice(requestedIndex >= 0 ? requestedIndex : targetIds.length, 0, ...ids);

      const update = this.database.prepare(`
        UPDATE actions
        SET scheduled_for = ?, position = 0, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE owner_id = ? AND id = ?
      `);
      ids.forEach((id) => update.run(date, ownerId, id));
      this.reindex(ownerId, date, targetIds);

      sourceDates.delete(date);
      sourceDates.forEach((sourceDate) => {
        this.reindex(ownerId, sourceDate, this.idsForDate(ownerId, sourceDate));
      });
    });

    return this.list(ownerId);
  }

  delete(ownerId: string, id: string, expectedRevision?: number) {
    const current = this.getRequired(ownerId, id);
    requireRevision(current.revision, expectedRevision);
    const result = this.database.prepare(`
      DELETE FROM actions
      WHERE owner_id = ? AND id = ? AND (? IS NULL OR revision = ?)
    `).run(ownerId, id, expectedRevision ?? null, expectedRevision ?? null) as StatementResultingChanges;
    if (result.changes !== 1) throw new ConflictError("The action changed after it was read. Reload it and try again.");
  }

  private getRequired(ownerId: string, id: string) {
    const row = this.database.prepare(`
      SELECT id, revision, title, scheduled_for, note_document, completed, completed_at, color
      FROM actions WHERE owner_id = ? AND id = ?
    `).get(ownerId, id) as unknown as ActionRow | undefined;
    if (!row) throw new NotFoundError("Action not found.");
    return toAction(row);
  }

  private idsForDate(ownerId: string, date: string | null) {
    const rows = this.database.prepare(`
      SELECT id FROM actions
      WHERE owner_id = ? AND scheduled_for IS ?
      ORDER BY position, created_at
    `).all(ownerId, date);
    return rows.map((row) => String(row.id));
  }

  private reindex(ownerId: string, date: string | null, ids: string[]) {
    const update = this.database.prepare(`
      UPDATE actions SET position = ?, updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND scheduled_for IS ? AND id = ?
    `);
    ids.forEach((id, index) => update.run((index + 1) * 1024, ownerId, date, id));
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const result = operation();
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}

function toAction(row: ActionRow): OrganizationAction {
  return {
    id: row.id,
    revision: row.revision,
    title: row.title,
    date: row.scheduled_for,
    note: parseNote(row.note_document),
    completed: Boolean(row.completed),
    completedAt: row.completed_at,
    color: row.color as OrganizationAction["color"],
  };
}

function validateTitle(value: string) {
  const title = value.trim();
  if (!title || title.length > 500) throw new InputError("Action titles must be 1–500 characters.");
  return title;
}

function validateDate(value: string | null) {
  if (value === null) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !DATE_PATTERN.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new InputError("Dates must use YYYY-MM-DD format.");
  }
  return value;
}

function validateNote(value: RichTextDocument | undefined) {
  if (!value || value.type !== "doc" || (value.content && !Array.isArray(value.content))) {
    throw new InputError("The action note must be a valid editor document.");
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 1_000_000) {
    throw new InputError("Action notes cannot exceed 1 MB.");
  }
  return serialized;
}

function parseNote(serialized: string): RichTextDocument {
  try {
    const value = JSON.parse(serialized) as RichTextDocument;
    if (value.type === "doc") return value;
  } catch {
    // The migration and write path guarantee JSON; this fallback keeps one damaged row readable.
  }
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export class InputError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

function requireRevision(current: number, expected?: number) {
  if (expected !== undefined && current !== expected) {
    throw new ConflictError("The action changed after it was read. Reload it and try again.");
  }
}
