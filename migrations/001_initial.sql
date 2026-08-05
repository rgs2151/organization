CREATE TABLE organization_users (
  id TEXT PRIMARY KEY,
  provider_subject TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  scheduled_for TEXT CHECK (
    scheduled_for IS NULL OR
    (length(scheduled_for) = 10 AND scheduled_for GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
  ),
  notes TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at TEXT,
  color TEXT NOT NULL DEFAULT 'plain' CHECK (color IN ('plain', 'sun', 'mint', 'lilac', 'rose')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX actions_owner_schedule_position
  ON actions(owner_id, scheduled_for, position);

CREATE INDEX actions_owner_completed_at
  ON actions(owner_id, completed_at);
