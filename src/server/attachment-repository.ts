import type { DatabaseSync } from "node:sqlite";
import { NotFoundError } from "./action-repository.js";

export type StoredAttachment = {
  id: string;
  storageKey: string;
  filename: string;
  contentType: string;
  byteSize: number;
};

type AttachmentRow = {
  id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  byte_size: number;
};

export class AttachmentRepository {
  constructor(private readonly database: DatabaseSync) {}

  requireOwnedAction(ownerId: string, actionId: string) {
    const row = this.database.prepare(
      "SELECT 1 AS found FROM actions WHERE owner_id = ? AND id = ?",
    ).get(ownerId, actionId);
    if (!row) throw new NotFoundError("Action not found.");
  }

  create(ownerId: string, actionId: string, attachment: StoredAttachment) {
    this.requireOwnedAction(ownerId, actionId);
    this.database.prepare(`
      INSERT INTO action_attachments(
        id, owner_id, action_id, storage_key, filename, content_type, byte_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      attachment.id,
      ownerId,
      actionId,
      attachment.storageKey,
      attachment.filename,
      attachment.contentType,
      attachment.byteSize,
    );
  }

  get(ownerId: string, attachmentId: string): StoredAttachment {
    const row = this.database.prepare(`
      SELECT id, storage_key, filename, content_type, byte_size
      FROM action_attachments
      WHERE owner_id = ? AND id = ?
    `).get(ownerId, attachmentId) as unknown as AttachmentRow | undefined;
    if (!row) throw new NotFoundError("Attachment not found.");
    return fromRow(row);
  }

  storageKeysForAction(ownerId: string, actionId: string) {
    const rows = this.database.prepare(`
      SELECT storage_key FROM action_attachments
      WHERE owner_id = ? AND action_id = ?
    `).all(ownerId, actionId);
    return rows.map((row) => String(row.storage_key));
  }

  deleteUnreferenced(ownerId: string, actionId: string, retainedIds: Set<string>) {
    const rows = this.database.prepare(`
      SELECT id, storage_key FROM action_attachments
      WHERE owner_id = ? AND action_id = ?
    `).all(ownerId, actionId);
    const remove = rows.filter((row) => !retainedIds.has(String(row.id)));
    const statement = this.database.prepare(`
      DELETE FROM action_attachments
      WHERE owner_id = ? AND action_id = ? AND id = ?
    `);
    remove.forEach((row) => statement.run(ownerId, actionId, String(row.id)));
    return remove.map((row) => String(row.storage_key));
  }
}

function fromRow(row: AttachmentRow): StoredAttachment {
  return {
    id: row.id,
    storageKey: row.storage_key,
    filename: row.filename,
    contentType: row.content_type,
    byteSize: row.byte_size,
  };
}
