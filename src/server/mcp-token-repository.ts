import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { McpTokenSummary } from "../shared/contracts.js";
import { InputError, NotFoundError } from "./action-repository.js";

export const ORGANIZATION_MCP_SCOPES = ["organization:read", "organization:write"] as const;

type TokenRow = {
  id: string;
  owner_id: string;
  name: string;
  token_hash: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type McpPrincipal = {
  ownerId: string;
  tokenId: string;
  tokenName: string;
  scopes: string[];
};

export class McpTokenRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(ownerId: string, nameValue: string) {
    const name = typeof nameValue === "string" ? nameValue.trim() : "";
    if (!name || name.length > 100) {
      throw new InputError("MCP credential names must be 1–100 characters.");
    }

    const id = randomUUID();
    const token = `orgmcp_${id}_${randomBytes(32).toString("base64url")}`;
    const scopes = [...ORGANIZATION_MCP_SCOPES];
    this.database.prepare(`
      INSERT INTO mcp_tokens(id, owner_id, name, token_hash, scopes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, ownerId, name, tokenHash(token), JSON.stringify(scopes));

    return { token, credential: this.getRequired(ownerId, id) };
  }

  authenticate(token: string): McpPrincipal | null {
    const id = tokenId(token);
    if (!id) return null;
    const row = this.database.prepare(`
      SELECT id, owner_id, name, token_hash, scopes, created_at, last_used_at, revoked_at
      FROM mcp_tokens
      WHERE id = ? AND revoked_at IS NULL
    `).get(id) as unknown as TokenRow | undefined;
    if (!row || !safeHashEqual(row.token_hash, tokenHash(token))) return null;

    this.database.prepare(`
      UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);
    return {
      ownerId: row.owner_id,
      tokenId: row.id,
      tokenName: row.name,
      scopes: parseScopes(row.scopes),
    };
  }

  list(ownerId: string): McpTokenSummary[] {
    const rows = this.database.prepare(`
      SELECT id, owner_id, name, token_hash, scopes, created_at, last_used_at, revoked_at
      FROM mcp_tokens
      WHERE owner_id = ?
      ORDER BY created_at DESC
    `).all(ownerId) as unknown as TokenRow[];
    return rows.map(toSummary);
  }

  revoke(ownerId: string, id: string) {
    const result = this.database.prepare(`
      UPDATE mcp_tokens
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE owner_id = ? AND id = ?
    `).run(ownerId, id);
    if (result.changes !== 1) throw new NotFoundError("MCP credential not found.");
    return this.getRequired(ownerId, id);
  }

  recordAudit(principal: McpPrincipal, toolName: string, outcome: "success" | "error", targetId?: string) {
    this.database.prepare(`
      INSERT INTO mcp_audit_log(owner_id, token_id, tool_name, outcome, target_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(principal.ownerId, principal.tokenId, toolName, outcome, targetId ?? null);
  }

  private getRequired(ownerId: string, id: string) {
    const row = this.database.prepare(`
      SELECT id, owner_id, name, token_hash, scopes, created_at, last_used_at, revoked_at
      FROM mcp_tokens
      WHERE owner_id = ? AND id = ?
    `).get(ownerId, id) as unknown as TokenRow | undefined;
    if (!row) throw new NotFoundError("MCP credential not found.");
    return toSummary(row);
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeHashEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function tokenId(token: string) {
  const match = token.match(/^orgmcp_([0-9a-f-]{36})_[A-Za-z0-9_-]{40,}$/);
  return match?.[1] ?? null;
}

function parseScopes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((scope) => typeof scope === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function toSummary(row: TokenRow): McpTokenSummary {
  return {
    id: row.id,
    name: row.name,
    scopes: parseScopes(row.scopes),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}
