# organization

A calm, self-hosted system for moving responsibilities out of your head and into a trustworthy visual plan.

The approved Actions experience is now frozen as the application foundation. The repository contains the React interface, owner-scoped Node API, SQLite persistence, image storage, production container, and automated GHCR publishing workflow. Journal remains intentionally unavailable while its product model is still undefined.

## What it does

- Capture undated work in a persistent **Someday** inbox.
- Schedule and reorder actions across week and month calendars.
- Navigate the year without losing the compact planning model.
- Open an Action Page with date, color, completion, and structured notes.
- Write headings, lists, checklists, quotes, code, and image attachments.
- Track only completed actions in a GitHub-inspired yearly Activity heatmap.
- Keep every action and attachment scoped to the authenticated owner.

Product language and settled interaction rules live in [docs/product.md](./docs/product.md). The editor contract is documented in [docs/editor.md](./docs/editor.md).

## System shape

```mermaid
flowchart LR
    Browser["Browser"] --> Gateway["Caddy + Authentik forward auth"]
    Gateway -->|"Verified X-Authentik headers"| App["organization container\nNode server + React client"]
    App --> SQLite[("/data/organization.sqlite")]
    App --> Uploads[("/data/uploads")]
    GitHub["Push to repository"] --> Actions["GitHub Actions\nchecks + container smoke test"]
    Actions --> GHCR["ghcr.io/rgs2151/organization"]
```

The application is one container and one process. The Node server owns the API, serves the compiled React application, applies database migrations on startup, and exposes `/api/health` for orchestration. SQLite uses WAL mode, foreign keys, a busy timeout, strict tables, and ordered SQL migrations.

## Local development

Requirements: Node.js 24.15 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Development mode runs Vite on port 3000 and the API on port 3001 with an explicit local identity and seeded sample data.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the client and API with live reload |
| `npm run check` | Type-check the client and server |
| `npm test` | Test owner isolation, persistence, attachments, and identity linking |
| `npm run build` | Compile the browser app and production server |
| `npm start` | Run the compiled single-process application |

Local variables are described in [.env.example](./.env.example). Runtime state under `var/` and all environment files remain outside Git.

## Container

Build and run an isolated local container:

```bash
docker build -t organization:local .
docker run --rm \
  --publish 127.0.0.1:3002:3000 \
  --volume organization-data:/data \
  --env ORGANIZATION_AUTH_MODE=development \
  --env ORGANIZATION_ALLOW_DEVELOPMENT_AUTH=true \
  organization:local
```

Open `http://127.0.0.1:3002`. The explicit development-auth override is only for a loopback-bound local container.

The production image defaults to Authentik proxy authentication, listens on port `3000`, and stores all durable state beneath `/data`. It must be reachable only through the private Docker network behind Caddy and Authentik; do not publish its port directly on a public interface. See [docs/deployment.md](./docs/deployment.md) for the runtime contract.

## Automated image publishing

Every repository update runs application checks, builds the container, starts it with an isolated temporary database, verifies both the health endpoint and application shell, and then publishes the image to `ghcr.io/rgs2151/organization`.

Published tags:

- `latest` and `main` for the newest accepted build;
- `sha-<commit>` for an immutable source revision.

The published image includes build provenance and a software bill of materials. This workflow builds the artifact only; integration with `organization.singha.io` and the private-server deployment workflow is deliberately deferred.

## Repository map

```text
organization/
├── .github/workflows/    validation and GHCR publishing
├── docs/                 product, editor, and deployment contracts
├── migrations/           ordered SQLite schema migrations
├── scripts/              local development orchestration
├── src/
│   ├── client/           React interface and API client
│   ├── server/           HTTP server, identity, storage, and repositories
│   └── shared/           client/server data contracts
├── Dockerfile            production multi-stage image
├── index.html
├── package.json
└── vite.config.ts
```

## Next phase

The next isolated task is Notion calendar migration. No general-purpose importer or upload UI is included in this release; the migration will be designed against the actual exported ZIP so source dates, completion values, titles, and page content can be mapped deliberately.
