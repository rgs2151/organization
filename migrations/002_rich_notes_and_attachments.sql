ALTER TABLE actions
  ADD COLUMN note_document TEXT NOT NULL
  DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}';

UPDATE actions
SET note_document = json_object(
  'type', 'doc',
  'content', json_array(
    json_object(
      'type', 'paragraph',
      'content', json_array(json_object('type', 'text', 'text', notes))
    )
  )
)
WHERE length(trim(notes)) > 0;

CREATE TABLE action_attachments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX action_attachments_owner_action
  ON action_attachments(owner_id, action_id);
