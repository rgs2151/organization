import { randomUUID } from "node:crypto";
import type { DatabaseSync, StatementResultingChanges } from "node:sqlite";
import {
  ACTION_COLORS,
  type CreateActionInput,
  type MoveActionInput,
  type OrganizationAction,
  type OrganizationUser,
  type UpdateActionInput,
} from "../shared/contracts.js";
import { DEVELOPMENT_ACTIONS } from "./development-seed.js";

type ActionRow = {
  id: string;
  title: string;
  scheduled_for: string | null;
  notes: string;
  completed: number;
  completed_at: string | null;
  color: string;
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

  list(ownerId: string): OrganizationAction[] {
    const rows = this.database.prepare(`
      SELECT id, title, scheduled_for, notes, completed, completed_at, color
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

  update(ownerId: string, id: string, input: UpdateActionInput): OrganizationAction {
    const current = this.getRequired(ownerId, id);

    if (Object.hasOwn(input, "date") && input.date !== current.date) {
      this.move(ownerId, id, { date: validateDate(input.date ?? null) });
    }

    const assignments: string[] = [];
    const values: Array<string | number | null> = [];

    if (Object.hasOwn(input, "title")) {
      assignments.push("title = ?");
      values.push(validateTitle(input.title ?? ""));
    }
    if (Object.hasOwn(input, "notes")) {
      assignments.push("notes = ?");
      values.push(String(input.notes ?? "").slice(0, 50_000));
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
      assignments.push("updated_at = CURRENT_TIMESTAMP");
      const result = this.database.prepare(`
        UPDATE actions SET ${assignments.join(", ")}
        WHERE owner_id = ? AND id = ?
      `).run(...values, ownerId, id) as StatementResultingChanges;
      if (result.changes !== 1) throw new NotFoundError("Action not found.");
    }

    return this.getRequired(ownerId, id);
  }

  move(ownerId: string, id: string, input: MoveActionInput): OrganizationAction[] {
    const date = validateDate(input.date);
    const current = this.getRequired(ownerId, id);

    this.transaction(() => {
      const targetIds = this.idsForDate(ownerId, date).filter((candidate) => candidate !== id);
      const beforeIndex = input.beforeId ? targetIds.indexOf(input.beforeId) : -1;
      targetIds.splice(beforeIndex >= 0 ? beforeIndex : targetIds.length, 0, id);
      this.database.prepare(`
        UPDATE actions
        SET scheduled_for = ?, position = 0, updated_at = CURRENT_TIMESTAMP
        WHERE owner_id = ? AND id = ?
      `).run(date, ownerId, id);
      this.reindex(ownerId, date, targetIds);
      if (current.date !== date) {
        this.reindex(ownerId, current.date, this.idsForDate(ownerId, current.date));
      }
    });

    return this.list(ownerId);
  }

  delete(ownerId: string, id: string) {
    const result = this.database.prepare("DELETE FROM actions WHERE owner_id = ? AND id = ?")
      .run(ownerId, id) as StatementResultingChanges;
    if (result.changes !== 1) throw new NotFoundError("Action not found.");
  }

  private getRequired(ownerId: string, id: string) {
    const row = this.database.prepare(`
      SELECT id, title, scheduled_for, notes, completed, completed_at, color
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
    title: row.title,
    date: row.scheduled_for,
    notes: row.notes,
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

export class InputError extends Error {}
export class NotFoundError extends Error {}
