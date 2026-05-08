# CLAUDE.md

Top-level guidance for Claude Code working in this repo. **Scoped detail lives in [client/CLAUDE.md](client/CLAUDE.md) and [server/CLAUDE.md](server/CLAUDE.md)** — Claude auto-loads the right one when editing in those subtrees. Full REST surface is in [docs/api.md](docs/api.md).

## What SlateFlow is

A self-hosted, single-container project management platform. Drag-and-drop Kanban + Azure DevOps–style hierarchy (Project → Sprint → Epic → Feature → Story → Task) + sprint planning + roadmap + reporting + test management + multi-user RBAC + AI summarisation. SQLite + Hono + React monorepo via npm workspaces (`client/`, `server/`).

## Commands

```bash
npm run dev               # client :5173 + server :3000 concurrently
npm run dev -w client     # client only
npm run dev -w server     # server only
npm run build             # production build
npm run lint -w client    # ESLint (client only — no lint config for server)
docker-compose up -d      # self-hosted single container on :3000
```

No test suite is configured.

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | `dev-secret-change-in-production` | Signs auth tokens. **Must be changed in production.** |
| `DATABASE_PATH` | `server/slateflow.db` | SQLite file path; Docker sets to `/data/slateflow.db` |
| `PORT` | `3000` | Server listen port |
| `FEATURE_AI` | `false` | Enterprise gate — `true` enables all AI endpoints and UI surfaces |
| `AI_PROVIDER` | _(none)_ | `claude` \| `gemini` \| `openai` \| `azure` \| `ollama` |
| `AI_MODEL` | provider default | Override the default model |
| `AI_API_KEY` | _(none)_ | Provider API key (not required for Ollama) |
| `AI_BASE_URL` | provider default | For `azure`: full deployment endpoint URL incl. `?api-version=…`; for others: base URL override |

## Authentication & RBAC

JWT in httpOnly cookie (`sf_token`, 7-day TTL). The `requireAuth` middleware applies to all `/api/*` except `/api/auth/login`, `/api/auth/logout`, `/api/config`, and injects `c.set('user', user)`.

Three role layers exist; **a higher layer always wins**:

### Global roles (`users.role`)

| Role | Capabilities |
|---|---|
| `super_admin` | Everything everywhere; CRUD on all users; can grant any role at any layer |
| `global_reader` | Read-only across all projects by default; **default for every new user** |

### Project-level roles (`project_access.role`)

| Role | Capabilities |
|---|---|
| `project_admin` | Full CRUD in project + manage users (assign contributor/reader only) |
| `contributor` | Full CRUD in project; no user management |
| `reader` | Read-only in project |

Project-level access checks: `lib/projectAccess.ts` exposes `canRead` / `canWrite` / `canManageUsers`. `super_admin` is implicitly true everywhere.

### Epic-level roles (`epic_access.role`)

| Role | Capabilities |
|---|---|
| `epic_admin` | Manage user access for the epic (super_admin only can grant) |
| `contributor` | Read + write features/cards in the epic |
| `reader` | Read-only in the epic |

**Default Epic special-case:** every project's Default Epic (`is_default = 1`) auto-grants `contributor` to every authenticated user — see [server/src/lib/epicAccess.ts:5-17](server/src/lib/epicAccess.ts#L5-L17). Non-default epics need an explicit `epic_access` row.

### Default admin

First boot seeds `admin@flow.local` / `Admin1234!` (`super_admin`). Change immediately via `PATCH /api/auth/me`.

## Feature Flags

Three-layer gate:

```
FEATURE_AI env var          ← hard ceiling; if 'false', /ai routes 404
      ↓
feature_overrides DB row    ← runtime toggle by super_admin
      ↓
resolved flag               → server: requireFeature('ai') middleware
                            → client: featureFlagStore + <FeatureGate flag="ai">
```

`GET /api/config` (public) exposes the resolved flags so the client can gate UI without hard-coding. `PATCH /api/admin/feature-overrides/:flag` (super_admin) toggles the runtime override. The env var is the authoritative ceiling for self-hosted deployments.

## AI Providers

All providers talk directly to their APIs over native `fetch` (no vendor SDKs). `lib/ai.ts` defines the `AIProvider` interface (`complete` + `stream`); `getProvider()` is a lazy singleton picking the implementation from `AI_PROVIDER`.

| `AI_PROVIDER` | Default model | Auth |
|---|---|---|
| `claude` | `claude-sonnet-4-6` | `x-api-key` header |
| `gemini` | `gemini-2.0-flash` | `?key=` query param |
| `openai` | `gpt-4o` | `Authorization: Bearer` |
| `azure` | `gpt-4o` | `api-key` header — set `AI_BASE_URL` to the full deployment endpoint incl. `?api-version=…` |
| `ollama` | `llama3` | `Authorization: Bearer ollama`; default base `http://localhost:11434` |

`lib/sseLines.ts` is the shared SSE line reader used by every streaming provider. Currently only `POST /api/ai/cards/:id/summarize` consumes the provider.

## Real-time (SSE)

Board mutations emit on the in-process `EventEmitter` in [server/src/lib/eventBus.ts](server/src/lib/eventBus.ts). `GET /api/events` fans them out. The `useBoardEvents` hook on the client subscribes and patches the Zustand `boardStore` in real time. No external broker — single-node only. Events: `card:created`, `card:updated`, `card:moved`, `card:deleted`, `epic:updated`, `notification`, `ping`.

@mention detection: comment bodies are scanned for `@word`; matched users (display_name or email prefix) get a `notifications` row + `notification` SSE event.

## Work-item hierarchy

| Level | DB table | Notes |
|---|---|---|
| Project | `projects` | One **Default Project** (`is_default = 1`); cannot be deleted |
| Sprint | `sprints` | Each project has one **Default Sprint**; cannot be deleted |
| Epic | `epics` | Each project has one **Default Epic**; cannot be deleted; auto-contributor for everyone |
| Feature | `features` | Each project has one **Default Feature**; cannot be deleted |
| Story | `cards` | Always assigned to a sprint; auto-falls-back to Default Sprint |
| Task | `tasks` | Sub-items of a story (`story_id` FK; cascade delete) |

Stories are the only level that move across swim lanes on the Board. The `swim_lanes.is_done_col` flag (not "last by position") marks the done lane for burndown / done counts.

DELETE on any default item returns `409`. Backfill on startup fills any missing default for legacy projects — see [server/src/db/index.ts](server/src/db/index.ts).

## Architecture pointers

- [client/CLAUDE.md](client/CLAUDE.md) — pages, components, stores, DnD, FeatureGate, fetch↔axios state
- [server/CLAUDE.md](server/CLAUDE.md) — Hono routes, response envelope, RBAC helpers, schema cheat sheet, AI providers
- [docs/api.md](docs/api.md) — full REST API with curl examples; `GET /api/openapi.json` exposes the test-case OpenAPI subset

## Docker / Self-hosting

| File | Purpose |
|---|---|
| `Dockerfile.server` | 5-stage multi-stage build: deps → prod-deps → client-build → server-build → production |
| `docker-compose.yml` | Single `slateflow` service; named volume `slateflow-data` mounted at `/data` |
| `.env.example` | Documents `PORT`, `DATABASE_PATH`, `SECRET` |
| `.dockerignore` | Excludes `node_modules`, `dist`, `*.db` from build context |

In production the server compiles to `server/dist/` and serves `client/dist/` as static files. `schema.sql` is copied alongside `index.js` in `server/dist/db/` (the `tsc` step doesn't move non-TS assets).

## Contributor License Agreement

All PRs require a signed CLA before merge ([CLA.md](CLA.md), [docs/CLA_FAQ.md](docs/CLA_FAQ.md)). CLAassistant bot enforces this — look for the ✅ "CLA Signed" status check on every PR. Setup walkthrough: [docs/CLAassistant_Setup.md](docs/CLAassistant_Setup.md). Key points: non-assignment (contributor keeps copyright), one-time signing covers all past + future contributions, employer-IP clause, broad sublicensing/relicensing rights.
