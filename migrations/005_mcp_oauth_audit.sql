ALTER TABLE mcp_audit_log RENAME TO mcp_audit_log_legacy;

CREATE TABLE mcp_audit_log (
  id INTEGER PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  token_id TEXT REFERENCES mcp_tokens(id) ON DELETE SET NULL,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('personal_token', 'oauth')),
  oauth_client_id TEXT,
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'error')),
  target_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (auth_method = 'personal_token' AND token_id IS NOT NULL AND oauth_client_id IS NULL) OR
    (auth_method = 'oauth' AND token_id IS NULL AND oauth_client_id IS NOT NULL)
  )
) STRICT;

INSERT INTO mcp_audit_log(
  id,
  owner_id,
  token_id,
  auth_method,
  oauth_client_id,
  tool_name,
  outcome,
  target_id,
  occurred_at
)
SELECT
  id,
  owner_id,
  token_id,
  'personal_token',
  NULL,
  tool_name,
  outcome,
  target_id,
  occurred_at
FROM mcp_audit_log_legacy;

DROP TABLE mcp_audit_log_legacy;

CREATE INDEX mcp_audit_owner_time
  ON mcp_audit_log(owner_id, occurred_at DESC);
