# Organization MCP

Organization exposes one unified, application-owned MCP endpoint at `https://organization.singha.io/mcp`. It is an interface to validated Organization operations, not a database, filesystem, Docker, or server-administration gateway.

## Current tools

- `organization_get_profile`: stable identity represented by the authenticated connection.
- `organization_get_context`: scheduled, Someday, and recently completed context around a date.
- `actions_list` and `actions_get`: bounded owner-scoped reads.
- `actions_create`, `actions_update`, and `actions_move`: normal application writes and ordering.
- `action_note_append`: preserve existing rich content while appending agent-authored text.
- `actions_delete`: explicit permanent deletion, annotated as destructive.
- `activity_get`: daily completion totals for one year.

Journal, goals, reflection sessions, and future modules belong on this same endpoint. They are not advertised until their data models exist.

## Authorization and containment

Organization supports two credential classes:

- Personal MCP clients receive independently revocable `orgmcp_…` credentials. Only their SHA-256 hashes are stored.
- Interactive hosts such as ChatGPT authenticate through a dedicated Authentik OAuth 2.1 provider using authorization code, PKCE `S256`, short-lived JWT access tokens, and renewable refresh tokens.

Both resolve to the same Organization owner, enforce `organization:read` and `organization:write`, and record the authentication method, tool, result, target identifier, and time without logging titles or note contents. The route never accepts browser cookies or Internet-supplied Authentik identity headers.

Users manage credentials from **Account → Settings → MCP**. The page shows the server URL, creates one independently revocable credential per device or client, displays a new token once, reports creation and last-use times, and retains revoked records for accountability. The browser API that backs this page is protected by the same Authentik owner session as Actions.

OAuth discovery is published at `/.well-known/oauth-protected-resource`. OAuth access tokens must be issued by the configured Authentik issuer for the Organization MCP resource/client, contain a verified email and stable Authentik subject, and carry the required tool scope. The server also advertises OAuth security metadata on every tool and exposes a standard profile tool for connected-account identification.

Actions carry monotonically increasing revisions. MCP writers can submit the revision they last read; stale writes fail instead of silently overwriting newer browser or agent changes.

## Agent behavior

The server instructions tell clients to read relevant context before broad planning, preview broad reorganizations, apply explicit single-action requests directly, preserve the user's words, label interpretations as hypotheses, and use permanent deletion only on explicit request.

The conversational agent conducts reflection. MCP supplies durable context and operations; it does not initiate unsolicited conversations or impersonate the user.
