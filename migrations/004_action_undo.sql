ALTER TABLE actions
  ADD COLUMN deleted_at TEXT;

CREATE INDEX actions_owner_deleted
  ON actions(owner_id, deleted_at);
