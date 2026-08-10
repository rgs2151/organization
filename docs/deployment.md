# deployment contract

This document defines the container boundary without coupling the application repository to the private-server repository.

## Runtime

The image runs one non-root Node process on port `3000`. It serves the compiled client and API from the same origin, applies pending database migrations before accepting traffic, and stops cleanly on `SIGTERM` or `SIGINT`.

Mount one durable volume at `/data`:

```text
/data/
├── organization.sqlite
├── organization.sqlite-shm
├── organization.sqlite-wal
└── uploads/
```

The database and uploads are one backup unit. Copying only the SQLite file can leave Action Page images behind.

## Required production boundary

Production authentication uses Authentik's single-application forward-auth mode. Caddy authenticates the request and copies these headers to the application:

- `X-Authentik-Uid`
- `X-Authentik-Email`
- `X-Authentik-Name`
- `X-Authentik-Username`
- `X-Authentik-Meta-App`

The application rejects API requests unless the UID and email are present and `X-Authentik-Meta-App` matches `ORGANIZATION_AUTHENTIK_APP_SLUG`. On first access it creates an owner record; later requests resolve to the same owner by Authentik subject. A matching pre-existing email can be linked to that subject, which provides a controlled path for importing data before first production login.

The application container must remain on a private Docker network. Only Caddy may reach it. `/api/health` is intentionally unauthenticated for container orchestration; browser data endpoints require a resolved Authentik identity.

`/mcp` is the deliberate exception to browser forward authentication. Caddy routes that exact path to Organization without Authentik headers, and Organization requires a hashed, application-issued bearer credential on every request. This keeps remote MCP clients independent of browser cookies without exposing the database or a trusted-header bypass.

## Environment

| Variable | Container default | Meaning |
| --- | --- | --- |
| `ORGANIZATION_HOST` | `0.0.0.0` | Listen address inside the container |
| `ORGANIZATION_API_PORT` | `3000` | HTTP port |
| `ORGANIZATION_DATABASE_PATH` | `/data/organization.sqlite` | SQLite database |
| `ORGANIZATION_UPLOAD_PATH` | `/data/uploads` | Action Page image storage |
| `ORGANIZATION_AUTH_MODE` | `authentik-proxy` | Production identity adapter |
| `ORGANIZATION_AUTHENTIK_APP_SLUG` | `organization` | Required Authentik application header |
| `ORGANIZATION_PUBLIC_ORIGIN` | `https://organization.singha.io` | Canonical origin used to validate and serve MCP requests |

The compiled client and migration directories are internal image paths. `ORGANIZATION_CLIENT_PATH` and `ORGANIZATION_MIGRATIONS_PATH` exist for controlled testing but should not be overridden in the private-server deployment.

`ORGANIZATION_ALLOW_DEVELOPMENT_AUTH=true` only unlocks the development identity when `NODE_ENV=production`. It exists solely for loopback-bound container smoke tests and must never appear in the private-server runtime environment.

## MCP credentials

Owners create, copy, inspect, and revoke credentials from **Account → Settings → MCP**. The raw token is returned to that authenticated browser exactly once. Only the SHA-256 token hash is stored. Each credential belongs to one Organization owner, has explicit read/write scopes, records last use, can be revoked independently, and writes a metadata-only audit record for each tool call. The raw credential must be stored on the MCP client and never committed to Git or placed in an MCP URL.

The container command remains an emergency operator recovery interface, not the normal user flow:

```bash
node dist/server/server/mcp-token.js create --email person@example.com --name "Mac Codex"
node dist/server/server/mcp-token.js list --email person@example.com
node dist/server/server/mcp-token.js revoke --email person@example.com --id <credential-id>
```

## Image consumption

The private-server repository pins `ghcr.io/rgs2151/organization` by immutable digest, bind-mounts `/srv/private-server/data/organization` at `/data`, attaches the service to its internal application and edge networks, and exposes port `3000` only to Caddy.

## Backup and restore

For a consistent live backup, use SQLite's backup mechanism or briefly stop the container before copying the entire `/data` volume. Restore the database and uploads together, then start the same or newer application image so pending forward-only migrations can run.
