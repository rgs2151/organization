# Organization MCP

Organization exposes one unified, application-owned MCP endpoint at `https://organization.singha.io/mcp`. It is an interface to validated Organization operations, not a database, filesystem, Docker, or server-administration gateway.

## Current tools

- `organization_get_context`: scheduled, Someday, and recently completed context around a date.
- `actions_list` and `actions_get`: bounded owner-scoped reads.
- `actions_create`, `actions_update`, and `actions_move`: normal application writes and ordering.
- `action_note_append`: preserve existing rich content while appending agent-authored text.
- `actions_delete`: explicit permanent deletion, annotated as destructive.
- `activity_get`: daily completion totals for one year.

Journal, goals, reflection sessions, and future modules belong on this same endpoint. They are not advertised until their data models exist.

## Authorization and containment

Every client receives its own revocable bearer credential. Organization stores only a token hash, resolves every call to one owner, enforces read/write scopes, and records tool name, result, target identifier, token, and time without logging titles or note contents. The route never accepts Internet-supplied Authentik identity headers.

Actions carry monotonically increasing revisions. MCP writers can submit the revision they last read; stale writes fail instead of silently overwriting newer browser or agent changes.

## Agent behavior

The server instructions tell clients to read relevant context before broad planning, preview broad reorganizations, apply explicit single-action requests directly, preserve the user's words, label interpretations as hypotheses, and use permanent deletion only on explicit request.

The conversational agent conducts reflection. MCP supplies durable context and operations; it does not initiate unsolicited conversations or impersonate the user.
