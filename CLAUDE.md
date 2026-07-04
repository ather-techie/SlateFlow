# CLAUDE.md

Top-level guidance for Claude Code working in this repo. **Scoped detail lives in [client/CLAUDE.md](client/CLAUDE.md) and [server/CLAUDE.md](server/CLAUDE.md)** — Claude auto-loads the right one when editing in those subtrees. Full REST surface is in [docs/api.md](docs/api.md).

## What SlateFlow is

A self-hosted, single-container project management platform. Drag-and-drop Kanban + Hierarchy (Project → Sprint → Epic → Feature → Story → Task) + sprint planning + roadmap + reporting (velocity, cycle time, capacity with committed limits) + test management + multi-user RBAC with user skills and capacity planning + AI summarisation + per-sprint Retrospective Board + Calendar (sprints/epics/features alongside holidays, events, and vacations). SQLite + Hono + React monorepo via npm workspaces (`client/`, `server/`).

## Commands

```bash
npm run dev               # client :5173 + server :3000 concurrently
npm run dev -w client     # client only
npm run dev -w server     # server only
npm run build             # production build
npm run lint -w client    # ESLint (client only — no lint config for server)
npm run test -w client    # unit tests (vitest)
npm run test:watch -w client # tests in watch mode
docker-compose up -d      # self-hosted single container on :3000
```

## Testing

### Unit & Component Tests

Client-side tests run with **Vitest** + **jsdom** + **@testing-library/react**. Test files live alongside source (e.g. `components/Board/Card.test.tsx`). Coverage includes components, hooks, and stores; run tests with `npm run test -w client` (once) or `npm run test:watch -w client` (watch mode).

Server-side tests use Vitest in Node environment; run with `npm run test -w server`.

### Browser-Level UI Verification with MCP Playwright

For testing real browser behavior (Kanban DnD, modals, SSE real-time updates, routing), use **MCP Playwright** via Claude Code's browser-control tools. The `.mcp.json` at the repo root configures the MCP Playwright server with `--allowed-origins http://localhost:5173;http://localhost:3000` (localhost-only safety boundary).

**Usage flow:**

1. Run `npm run dev` to start both dev servers.
2. Ask Claude Code to run a verification task, e.g.: "Test the login flow, then create a card on the Kanban board and drag it to the Done lane. Screenshot the result."
3. Claude will use `browser_navigate`, `browser_type`, `browser_click`, `browser_drag_and_drop`, and `browser_screenshot` tools to verify the UI.
4. All cookies (httpOnly `sf_token`) are handled automatically by the browser context.

**Key flows to verify with MCP Playwright:**
- Login and session establishment (prerequisite for all others)
- Kanban board card creation and DnD lane transitions
- Card modal: all 6 tabs, `@mention` in comments
- Sprint lifecycle: create → activate → complete, burndown chart rendering
- Admin panel: feature flag toggling and sidebar nav updates
- Auth guard: unauthenticated redirect to `/login`
- Roadmap Gantt: epic/feature date bars and date editor popover

**Running MCP Playwright manually** (e.g., to test that it starts cleanly):
```bash
npm run mcp:playwright
```

MCP Playwright is safe for local dev: the `--allowed-origins` flag prevents navigation outside localhost, and mutations happen only to the seeded dev database (reset anytime with `/seed-db`).

## Environment Variables

The dev server loads `.env` at the repo root on startup via `dotenv` ([server/src/loadEnv.ts](server/src/loadEnv.ts), imported first by [server/src/index.ts](server/src/index.ts)). Copy `.env.example` → `.env` and fill in the values you need. In Docker, env vars come from `docker-compose.yml` / your orchestrator — dotenv silently no-ops because `/app/.env` is absent inside the image.

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | `dev-secret-change-in-production` (dev only) | Signs auth tokens. **Required in production** — the server refuses to start without it when `NODE_ENV=production`. |
| `DATABASE_PATH` | `server/slateflow.db` | SQLite file path; Docker sets to `/data/slateflow.db` |
| `PORT` | `3000` | Server listen port |

All `FEATURE_*` flags (22 of them) plus their dependent config (`OAUTH_*`, `AI_*`, `SMTP_*`, `GITHUB_*`, `GITLAB_*`, `UPLOADS_DIR`) are documented in **[docs/feature-flags.md](docs/feature-flags.md)**.

See [server/CLAUDE.md](server/CLAUDE.md#mcp-server) for the MCP server's transport, RBAC, and default-filtering design decisions.

## Authentication & RBAC

JWT in httpOnly cookie (`sf_token`, 7-day TTL). Three login methods are available, each gated by an independent feature flag so a deployment can run "password-only", "GitHub + Google only", or any combination:

- **Email + password** (`POST /api/auth/login`) — gated by `auth_password`
- **Google OAuth** (`GET /api/auth/google/start` → `/api/auth/google/callback`) — gated by `auth_google`
- **GitHub OAuth** (`GET /api/auth/github/start` → `/api/auth/github/callback`) — gated by `auth_github`

Identities live in the `user_identities` table — a single user can have multiple linked providers. OAuth-only users are created with a locked random `password_hash` so they can never password-login. When a provider returns an email matching an existing user, the OAuth identity is auto-linked **only if the provider verified the email** (`email_verified=true` for Google; primary + verified email from GitHub `/user/emails`); otherwise the login is rejected with a `?error=email_not_verified` redirect.

If `FEATURE_AUTH_GOOGLE` / `FEATURE_AUTH_GITHUB` is enabled (env or DB override) but the matching `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` is unset, the flag resolves to **false**: the login button is hidden and the route 404s. Super-admins see a "credentials missing" hint next to the toggle in Admin → Settings.

The `requireAuth` middleware applies to all `/api/*` except `/api/auth/*` (login, logout, OAuth start/callback) and `/api/config`, and injects `c.set('user', user)`.

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

**Project Admin Panel:** project admins have a dedicated management interface at `/projects/:id/admin` (accessible via sidebar gear icon when `canManageProject` returns true). The panel has three tabs: Members (grant/update/revoke project-level roles, with search-and-add UI; only super_admin can assign `project_admin` role), Settings (edit project name/description/color), and Lanes (swim lane CRUD with inline rename, done-col toggle, reorder, and delete with card-count guards). This mirrors the super-admin `/admin` panel but is scoped to a single project.

### Default admin

First boot seeds `admin@flow.local` / `Admin1234!` (`super_admin`). Change immediately via `PATCH /api/auth/me`.

### User Profiles

Extended user profile fields support team context, resource planning, and scheduling. All 12 fields are optional, nullable TEXT or INTEGER, and live on the `users` table:

**Location & Context:**
- `country`, `state`, `city` — work location
- `home_country`, `home_state`, `home_city` — home location
- `timezone` — e.g. `America/Los_Angeles`
- `job_title`, `department`, `phone`, `gender` — work and personal info
- `reporting_manager_id` (FK → `users.id`) — org structure link

The profile is user-editable via `PATCH /auth/me` (self-service in ProfileSettingsModal) and admin-editable via `PATCH /users/:id` or `POST /users` (user creation/admin panel). `GET /auth/me` and `GET /users` resolve the manager's display name via LEFT JOIN when `reporting_manager_id` is set. The pattern extends easily to future profile fields (aliases, certifications, skills refinements, etc.) — keep them nullable and add to both client and server schemas symmetrically.

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

Twenty-two flags are currently registered — see **[docs/feature-flags.md](docs/feature-flags.md)** for the full list, their env vars/defaults, and dependent config. That doc also has the "adding a new flag" sync-point checklist (`server/src/lib/featureFlags.ts`, `client/src/store/featureFlagStore.ts`, and the env var table) — follow it whenever you add one.

## AI Providers

All providers talk directly to their APIs over native `fetch` (no vendor SDKs). `lib/ai.ts` defines the `AIProvider` interface (`complete` + `stream`); `getProvider()` is a lazy singleton picking the implementation from `AI_PROVIDER`.

| `AI_PROVIDER` | Default model | Auth |
|---|---|---|
| `claude` | `claude-sonnet-4-6` | `x-api-key` header |
| `gemini` | `gemini-2.0-flash` | `?key=` query param |
| `openai` | `gpt-4o` | `Authorization: Bearer` |
| `azure` | `gpt-4o` | `api-key` header — set `AI_BASE_URL` to the full deployment endpoint incl. `?api-version=…` |
| `ollama` | `llama3` | `Authorization: Bearer ollama`; default base `http://localhost:11434` |

`lib/sseLines.ts` is the shared SSE line reader used by every streaming provider. All provider fetches carry hard timeouts (`AbortSignal.timeout`), and token usage is logged per call (both `complete()` and streaming `stream()` calls) via `logUsage()`, which also persists a row to the `ai_usage` table when the caller passes a `usageContext` (`userId`, `projectId`, `endpoint`). Sixteen AI endpoints are implemented, all under the master `ai` flag plus a per-group sub-flag, rate-limited per user:

Base (`ai` only):
- `POST /api/ai/cards/:id/summarize` — 2–3 sentence story summary
- `POST /api/ai/parse-item` — natural-language work item parse (discriminated union), used by the universal NL input
- `POST /api/ai/cards/:id/generate-test-cases` (`auto_test_case_generation_ai`) — 3–5 test cases from a story
- `POST /api/ai/features/:id/generate-stories` (`auto_story_generation_ai`) — 3–7 story outlines from a feature

Ceremony digests (`ai_ceremony_digests`):
- `GET|POST /api/ai/sprints/:id/digest` — sprint health digest (markdown, persisted in `ai_digests`)
- `GET|POST /api/ai/projects/:id/standup-digest` — daily standup digest (persisted)
- `POST /api/ai/retrospectives/:id/synthesize` — retro themes + suggested actions + previous-retro follow-through (also requires `retrospective`)

Writing assist (`ai_writing_assist`):
- `POST /api/ai/cards/:id/generate-acceptance-criteria` — Given/When/Then criteria (client appends to description on confirm)
- `POST /api/ai/cards/:id/summarize-comments` — thread summary + decisions + open questions (≥5 comments)

Planning assist (`ai_planning_assist`):
- `POST /api/ai/cards/:id/suggest-assignee` — skills/load/vacation-aware assignee suggestions
- `POST /api/ai/cards/:id/suggest-estimate` — story points from comparable completed stories
- `POST /api/ai/projects/:id/plan-sprint` — proposed sprint scope (planned sprints only)
- `POST /api/ai/projects/:id/groom-backlog` — duplicates, vague stories, stale items (deterministic), priority order

Project chat (`ai_project_chat`):
- `POST /api/ai/projects/:id/chat` — **streaming SSE** project Q&A grounded in an RBAC-filtered context bundle ([server/src/lib/projectChatContext.ts](server/src/lib/projectChatContext.ts)); the only AI route that does not return the `{data,error}` envelope

Every JSON-returning endpoint validates model output with zod and filters hallucinated ids/names against the DB before responding.

## AI Token Usage Tracking

Every AI provider call persists a row to the `ai_usage` table (`project_id`, `user_id`, `provider`, `model`, `endpoint`, `input_tokens`, `output_tokens`, `created_at`) via `logUsage()` in [server/src/lib/ai.ts](server/src/lib/ai.ts). `GET /api/projects/:id/ai-usage` (gated by `ai` + `ai_usage_reporting`) aggregates these into daily totals via `getAiTokenUsage()` in [server/src/lib/reportData.ts](server/src/lib/reportData.ts), rendered as the "AI Token Usage" chart on the Reports page alongside Velocity and Cycle Time. `project_id` is nullable — routes that aren't project-scoped when the call is made (e.g. `POST /api/ai/parse-item` before an item exists) log usage without a project and won't appear in any project's report.

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
- [docs/api.md](docs/api.md) — full REST API with curl examples
- [docs/mcp.md](docs/mcp.md) — MCP server setup and full 29-tool reference
- [docs/feature-flags.md](docs/feature-flags.md) — full reference for all 22 feature flags, env vars, and dependent config

## OpenAPI Documentation

- **Live Swagger UI:** `GET /api/docs` serves a browsable Swagger UI (public endpoint)
- **OpenAPI spec JSON:** `GET /api/openapi.json` returns the full OpenAPI 3.0.3 spec (public endpoint)
- **Spec location:** `server/src/lib/openapi/` — root `index.ts` assembles the spec; `shared.ts` defines reusable schemas; `domains/*.ts` organize paths by endpoint group
- **Pattern:** Domain files export plain TypeScript objects (`testcasesPaths`, etc.) that are merged into the root spec. No code generation or route-level decorators — the spec is maintained as typed data alongside the route definitions

## Docker / Self-hosting

| File | Purpose |
|---|---|
| `Dockerfile.server` | 5-stage multi-stage build: deps → prod-deps → client-build → server-build → production |
| `docker-compose.yml` | Single `slateflow` service; named volume `slateflow-data` mounted at `/data` |
| `.env.example` | Documents `PORT`, `DATABASE_PATH`, `JWT_SECRET`, feature flags, OAuth/AI/SMTP settings |
| `.dockerignore` | Excludes `node_modules`, `dist`, `*.db` from build context |

In production the server compiles to `server/dist/` and serves `client/dist/` as static files. `schema.sql` is copied alongside `index.js` in `server/dist/db/` (the `tsc` step doesn't move non-TS assets).

## Contributor License Agreement

All PRs require a signed CLA before merge ([CLA.md](CLA.md), [docs/CLA_FAQ.md](docs/CLA_FAQ.md)). CLAassistant bot enforces this — look for the ✅ "CLA Signed" status check on every PR. Setup walkthrough: [docs/CLAassistant_Setup.md](docs/CLAassistant_Setup.md). Key points: non-assignment (contributor keeps copyright), one-time signing covers all past + future contributions, employer-IP clause, broad sublicensing/relicensing rights.

## Feature Development Rules

When implementing any new feature, update the following before marking the task complete:

- `README.md` — add the feature to the Features section
- `ROADMAP.md` — mark the item completed or update its status
- `CLAUDE.md` — record any new patterns, env vars, flags, or conventions

Do not consider any feature complete until all three files are updated.

## Card Attachments — File Upload & Storage

Card attachments let users upload files (images, PDFs, etc.) to story cards. Files are stored on disk at `UPLOADS_DIR` (default `./uploads`, `/data/uploads` in Docker) with UUID-prefixed filenames for obscurity. The feature is gated by `FEATURE_CARD_ATTACHMENTS` and requires write permission on the card's project to upload; uploader, project admin, or super_admin can delete.

**Security note:** `/uploads/*` is a public, unauthenticated static route (matched to all clients via the dev proxy and served unconditionally in production). File paths are unguessable due to UUID prefixing, but this is security-by-obscurity, not auth-gated access control. This trade-off is acceptable for self-hosted deployments. If stricter access control is needed, replace static serving with an authenticated `/api/attachments/:id/download` route that streams the file with proper RBAC checks.

**Routes:**
- `GET /api/cards/:id/attachments` — list attachments (requires read access)
- `POST /api/cards/:id/attachments` — upload file (requires write access, multipart/form-data)
- `DELETE /api/attachments/:id` — delete attachment (requires uploader, project_admin, or super_admin)

## Calendar Holidays — Country / State Tagging

Holidays in the `calendar_entries` table now support optional `country` and `state_province` fields (both nullable TEXT). Super-admins manage holidays via `/admin/holidays` (list with optional `?country=&state_province=` filters) and `/admin/holidays/:id` (create/update/delete). A holiday with `country = NULL` and `state_province = NULL` is treated as global and always visible.

On the calendar view (`GET /projects/:id/calendar`), holidays include country and state_province in the response. The client-side `CalendarPage` filters holidays based on a dropdown: users select a country (or "All countries") and see only matching holidays plus all global holidays (null country).

In the admin panel `HolidaysTab`, super-admins see country and state_province columns, and can filter the list by country and state_province using dedicated dropdown/input controls.

## Default Items Visibility

Default items (Default Project, Default Sprint, Default Epic, Default Feature) are system-level containers used as fallbacks for work items and are not intended for user-facing views. They are hidden from:

- **Calendar** (`GET /projects/:id/calendar`) — sprints, epics, and features with `is_default = 1` are filtered out
- **Roadmap** (`GET /projects/:id/roadmap`) — epics and features with `is_default = 1` are filtered out; sub-queries also exclude default features from counts
- **Sprints List** (`GET /projects/:id/sprints`) — sprints with `is_default = 1` are filtered out (used by Retrospective page, Board backlog, and other views)

When querying these endpoints, always add `AND is_default = 0` to filter directives. The default project itself is never listed in any view (only selected internally as a fallback when creating work items).
