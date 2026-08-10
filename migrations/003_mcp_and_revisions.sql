ALTER TABLE actions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE mcp_tokens (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
) STRICT;

CREATE INDEX mcp_tokens_owner_created
  ON mcp_tokens(owner_id, created_at DESC);

CREATE TABLE mcp_audit_log (
  id INTEGER PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL REFERENCES mcp_tokens(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'error')),
  target_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX mcp_audit_owner_time
  ON mcp_audit_log(owner_id, occurred_at DESC);
