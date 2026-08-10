import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  CreatedMcpToken,
  McpTokenSummary,
  OrganizationSession,
} from "../shared/contracts";
import * as api from "./api";

type SettingsTab = "account" | "mcp";

export default function SettingsPage({
  session,
  onClose,
  onError,
}: {
  session: OrganizationSession;
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("account");
  const [credentials, setCredentials] = useState<McpTokenSummary[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(true);
  const [credentialName, setCredentialName] = useState("");
  const [created, setCreated] = useState<CreatedMcpToken | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"endpoint" | "token" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const endpoint = `${window.location.origin}/mcp`;

  useEffect(() => {
    let active = true;
    void api.listMcpCredentials()
      .then((items) => {
        if (active) setCredentials(items);
      })
      .catch((error: unknown) => {
        if (active) onError(error);
      })
      .finally(() => {
        if (active) setCredentialsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeCredentials = useMemo(
    () => credentials.filter((credential) => !credential.revokedAt),
    [credentials],
  );
  const revokedCredentials = useMemo(
    () => credentials.filter((credential) => credential.revokedAt),
    [credentials],
  );

  async function createCredential(event: FormEvent) {
    event.preventDefault();
    const name = credentialName.trim();
    if (!name || creating) return;
    setCreating(true);
    setLocalError(null);
    setCreated(null);
    try {
      const result = await api.createMcpCredential(name);
      setCreated(result);
      setCredentials((current) => [result.credential, ...current]);
      setCredentialName("");
    } catch (error) {
      onError(error);
    } finally {
      setCreating(false);
    }
  }

  async function revokeCredential(id: string) {
    if (revokingId) return;
    setRevokingId(id);
    setLocalError(null);
    try {
      const revoked = await api.revokeMcpCredential(id);
      setCredentials((current) => current.map((credential) =>
        credential.id === revoked.id ? revoked : credential
      ));
      if (created?.credential.id === id) setCreated(null);
      setConfirmingId(null);
    } catch (error) {
      onError(error);
    } finally {
      setRevokingId(null);
    }
  }

  async function copyValue(value: string, kind: "endpoint" | "token") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1800);
    } catch {
      setLocalError("Clipboard access was unavailable. Select the value and copy it manually.");
    }
  }

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <span className="settings-kicker">Organization</span>
            <h1 id="settings-title">Settings</h1>
          </div>
          <button className="settings-close" type="button" onClick={onClose} aria-label="Close settings">×</button>
        </header>

        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="Settings sections">
            <button type="button" className={tab === "account" ? "is-active" : ""} onClick={() => setTab("account")}>Account</button>
            <button type="button" className={tab === "mcp" ? "is-active" : ""} onClick={() => setTab("mcp")}>MCP</button>
          </nav>

          <div className="settings-content">
            {tab === "account" ? (
              <section className="settings-section" aria-labelledby="account-settings-title">
                <div className="settings-section-heading">
                  <h2 id="account-settings-title">Account</h2>
                  <p>Your Organization profile and authentication identity.</p>
                </div>
                <div className="account-settings-card">
                  <span className="settings-avatar" aria-hidden="true">
                    {session.user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="account-settings-identity">
                    <strong>{session.user.displayName}</strong>
                    <span>{session.user.email}</span>
                  </div>
                  <span className="account-settings-status">Authenticated</span>
                </div>
                <dl className="settings-facts">
                  <div><dt>Sign-in</dt><dd>Managed by Singha Auth</dd></div>
                  <div><dt>Session</dt><dd>Up to seven days</dd></div>
                </dl>
              </section>
            ) : (
              <section className="settings-section" aria-labelledby="mcp-settings-title">
                <div className="settings-section-heading">
                  <h2 id="mcp-settings-title">MCP access</h2>
                  <p>Connect trusted AI clients to your Organization account. Create a separate credential for each device or client.</p>
                </div>

                {localError && <div className="settings-inline-error" role="status">{localError}</div>}

                <div className="mcp-connection-card">
                  <div className="mcp-field-heading">
                    <div><strong>Server URL</strong><span>Streamable HTTP</span></div>
                    <button type="button" onClick={() => void copyValue(endpoint, "endpoint")}>
                      {copied === "endpoint" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <input readOnly value={endpoint} onFocus={(event) => event.currentTarget.select()} aria-label="Organization MCP server URL" />
                  <div className="mcp-capabilities">
                    <span>Actions</span><span>Scheduling</span><span>Action notes</span><span>Activity</span>
                  </div>
                </div>

                <form className="mcp-create" onSubmit={createCredential}>
                  <label htmlFor="mcp-credential-name">
                    <strong>New credential</strong>
                    <span>Name the device or client so you can revoke it independently.</span>
                  </label>
                  <div>
                    <input
                      id="mcp-credential-name"
                      value={credentialName}
                      maxLength={100}
                      onChange={(event) => setCredentialName(event.target.value)}
                      placeholder="Mac Codex"
                      autoComplete="off"
                    />
                    <button type="submit" disabled={!credentialName.trim() || creating}>
                      {creating ? "Creating…" : "Create credential"}
                    </button>
                  </div>
                </form>

                {created && (
                  <div className="mcp-token-reveal" role="status">
                    <div className="mcp-field-heading">
                      <div><strong>{created.credential.name}</strong><span>Copy this token now. It will not be shown again.</span></div>
                      <button type="button" onClick={() => void copyValue(created.token, "token")}>
                        {copied === "token" ? "Copied" : "Copy token"}
                      </button>
                    </div>
                    <input
                      readOnly
                      value={created.token}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label="New Organization MCP token"
                    />
                  </div>
                )}

                <div className="mcp-credentials-heading">
                  <div><h3>Credentials</h3><span>{activeCredentials.length} active</span></div>
                  <p>A credential grants read and write access to your Organization data.</p>
                </div>

                {credentialsLoading ? (
                  <div className="mcp-empty">Loading credentials…</div>
                ) : activeCredentials.length === 0 ? (
                  <div className="mcp-empty">No active MCP credentials.</div>
                ) : (
                  <div className="mcp-credential-list">
                    {activeCredentials.map((credential) => (
                      <CredentialRow
                        key={credential.id}
                        credential={credential}
                        confirming={confirmingId === credential.id}
                        revoking={revokingId === credential.id}
                        onConfirm={() => setConfirmingId(credential.id)}
                        onCancel={() => setConfirmingId(null)}
                        onRevoke={() => void revokeCredential(credential.id)}
                      />
                    ))}
                  </div>
                )}

                {revokedCredentials.length > 0 && (
                  <details className="mcp-revoked">
                    <summary>Revoked credentials ({revokedCredentials.length})</summary>
                    <div className="mcp-credential-list">
                      {revokedCredentials.map((credential) => (
                        <CredentialRow key={credential.id} credential={credential} />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CredentialRow({
  credential,
  confirming = false,
  revoking = false,
  onConfirm,
  onCancel,
  onRevoke,
}: {
  credential: McpTokenSummary;
  confirming?: boolean;
  revoking?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onRevoke?: () => void;
}) {
  const revoked = Boolean(credential.revokedAt);
  return (
    <article className={`mcp-credential ${revoked ? "is-revoked" : ""}`}>
      <div className="mcp-credential-mark" aria-hidden="true">{credential.name.slice(0, 1).toUpperCase()}</div>
      <div className="mcp-credential-details">
        <strong>{credential.name}</strong>
        <span>
          {revoked
            ? `Revoked ${formatTimestamp(credential.revokedAt)}`
            : credential.lastUsedAt
              ? `Last used ${formatTimestamp(credential.lastUsedAt)}`
              : `Created ${formatTimestamp(credential.createdAt)}`}
        </span>
      </div>
      {revoked ? (
        <span className="mcp-revoked-label">Revoked</span>
      ) : confirming ? (
        <div className="mcp-revoke-confirmation">
          <button type="button" onClick={onCancel} disabled={revoking}>Cancel</button>
          <button className="is-danger" type="button" onClick={onRevoke} disabled={revoking}>
            {revoking ? "Revoking…" : "Confirm revoke"}
          </button>
        </div>
      ) : (
        <button className="mcp-revoke" type="button" onClick={onConfirm}>Revoke</button>
      )}
    </article>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "never";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
