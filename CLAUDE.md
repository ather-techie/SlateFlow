# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands are run from the repo root unless noted.

```bash
# Development (runs client on :5173 and server on :3000 concurrently)
npm run dev

# Run only client or server
npm run dev -w client
npm run dev -w server

# Production build
npm run build

# Lint (client only — no lint config exists for server)
npm run lint -w client

# Docker (self-hosted, single container)
docker-compose up -d        # build + start on :3000
docker-compose down         # stop
docker-compose build        # rebuild after source changes
```

No test suite is configured.

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | `dev-secret-change-in-production` | Signs auth tokens. **Must be changed in production.** |
| `DATABASE_PATH` | `server/slateflow.db` | SQLite file path; Docker sets to `/data/slateflow.db` |
| `PORT` | `3000` | Server listen port |

## Authentication & RBAC Architecture

SlateFlow uses **JWT stored in httpOnly cookies** (`sf_token`, 7-day TTL) for session management. The `requireAuth` middleware (applied to all `/api/*` routes except `/api/auth/login` and `/api/auth/logout`) verifies the cookie and injects a `user` object into the Hono context via `c.set('user', user)`.

### Roles

| Role | Scope | Capabilities |
|---|---|---|
| `super_admin` | Global (org-level) | Full access; CRUD on users; not assignable via epic access panel |
| `epic_admin` | Epic-scoped | Manages users within their epics; full CRUD on epic + descendants |
| `contributor` | Epic-scoped | CRUD on Features, Stories, Tasks, Tests within their epics |
| `reader` | Epic-scoped | Read-only access to their epics and descendants |

- A `member` with no `epic_access` rows sees nothing beyond the Default Epic.
- The same user can be `contributor` on Epic A and `reader` on Epic B.
- **Default Epic rule:** All authenticated users automatically have `contributor` access to every project's Default Epic — no `epic_access` row required.
- `super_admin` is a global role and is NOT assignable via the epic access panel.

### Default admin account

On first run the server seeds `admin@flow.local` with role `super_admin` and password `Admin1234!`. Change the password immediately after first login via the user menu → Profile settings (`PATCH /api/auth/me`).

### New DB tables

| Table | Purpose |
|---|---|
| `users` | User accounts with bcrypt password hashes; soft-deleted via `deleted_at` |
| `epic_access` | Join table: `user_id + epic_id + role`; one row per user–epic pair |
| `notifications` | Inbox for @mention, assignment, and board-update events |

### New server files

| File | Purpose |
|---|---|
| `server/src/lib/auth.ts` | JWT sign/verify, bcrypt helpers |
| `server/src/lib/epicAccess.ts` | `canRead` / `canWrite` / `canManageUsers` per-epic predicates; Default Epic auto-contributor logic |
| `server/src/lib/eventBus.ts` | In-process `EventEmitter` for SSE board events |
| `server/src/middleware/requireAuth.ts` | Cookie → JWT → DB user injection |
| `server/src/middleware/requireRole.ts` | `requireSuperAdmin` middleware factory |
| `server/src/routes/auth.ts` | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `PATCH /api/auth/me` |
| `server/src/routes/users.ts` | Super Admin user CRUD + user search |
| `server/src/routes/epicAccess.ts` | Epic access grant / revoke |
| `server/src/routes/notifications.ts` | Notification list and mark-read |
| `server/src/routes/sse.ts` | `GET /api/events` — SSE stream for board changes and mentions |
| `server/src/types/hono.d.ts` | Extends `ContextVariableMap` so `c.get('user')` is fully typed |

### Real-time (SSE)

Board mutations emit events via `eventBus.ts` (Node.js `EventEmitter`). `GET /api/events` fans them out to connected clients. The frontend `useBoardEvents` hook (`client/src/hooks/useBoardEvents.ts`) subscribes and patches the Zustand `boardStore` in real time. No external message broker is needed for a single-node deployment.

### @mention notifications

When a comment body contains `@word` patterns, the server resolves matching users by display_name (space-stripped, lowercased) or email prefix, inserts `notifications` rows, and emits SSE `notification` events to the mentioned users. The notification bell in `Layout.tsx` shows an unread badge and marks all read on click.

## Architecture

SlateFlow is a Kanban board app — a full-stack monorepo using **npm workspaces** (`client/` and `server/`).

### Frontend (`client/`)

- **Vite + React 18 + TypeScript**. Entry: `client/src/main.tsx` → `App.tsx`.
- `App.tsx` sets up React Router 7. Root (`/`) checks whether any projects exist: redirects to `/dashboard` if yes, `/projects/new` if no. Project-scoped pages are wrapped in a shared `Layout` component.
- API calls go through two clients: `client/src/api.ts` (fetch-based, flat exports — used by all existing components via `import { api } from '../api'`) and `client/src/api/index.ts` (axios-based, namespaced). Both expose the same surface; `api.ts` is the authoritative one since TypeScript resolves the bare `'../api'` import to the file before the directory. Vite proxies `/api` to `localhost:3000` during development.
- Drag-and-drop (card and lane reordering) uses `@dnd-kit/core` + `@dnd-kit/sortable` with `PointerSensor`.
- Styling is Tailwind CSS v3 via PostCSS.
- Global state is managed with **Zustand** (`client/src/store/boardStore.ts` for lane/card state, `projectStore.ts` for active project).
- Toast notifications use **react-hot-toast**.
- Burndown charts use **recharts** (`LineChart`) in `SprintsPage`.

### Work-item hierarchy

SlateFlow uses a 6-level Azure DevOps–style hierarchy: **Project → Sprint → Epic → Feature → Story → Task**.

| Level | DB table | Notes |
|---|---|---|
| Project | `projects` | Top-level container; each has a Default Project (`is_default = 1`) that cannot be deleted |
| Sprint | `sprints` | Always belongs to a Project; each project has a Default Sprint (`is_default = 1`) that cannot be deleted |
| Epic | `epics` | Filter only on Board; each project has a Default Epic |
| Feature | `features` | Filter only on Board; each project has a Default Feature |
| Story | `cards` (renamed concept) | Moves across swim lanes on the Board; always assigned to a sprint (defaults to Default Sprint) |
| Task | `tasks` | Nested inside Story card |

| Level | Board? | Backlog? | Epics page? |
|---|---|---|---|
| Epic | Filter only | Yes | Yes |
| Feature | Filter only | Yes | Yes |
| Story | Yes (moves across lanes) | Yes | Yes |
| Task | Nested inside Story card | Yes | — |

### Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `RootRedirect` (inline) | Checks projects, redirects to `/dashboard` or `/projects/new` |
| `/projects/new` | `ProjectSetupPage` | Create a project; choose a lane preset or enter custom lanes |
| `/dashboard` | `DashboardPage` | All-projects overview — stats, active sprints, recent activity |
| `/projects/:id/board` | `BoardPage` | Kanban board with DnD; Epic/Feature filter dropdowns; sprint sub-banner |
| `/projects/:id/backlog` | `BacklogPage` | All work items; 5 type-filter tabs (All / Epics / Features / Stories / Tasks); "All" shows full hierarchy |
| `/projects/:id/epics` | `EpicsPage` | Drill-down hierarchy: Epic → Feature → Story rows, collapsible, inline creation at each level |
| `/projects/:id/sprints` | `SprintsPage` | Sprint list, create form, progress bars, burndown chart, complete sprint |
| `/projects/:id/tests` | `TestSuitePage` | Test case management — suites, cases, run history, bulk status updates |
| `*` | `NotFoundPage` | 404 fallback |

### Components

- **`Layout`** — shell shared by Dashboard and project pages; renders a left sidebar with nav links (Board, Backlog, Epics, Sprints, Tests) and an `<Outlet />`.
- **`Header`** — top bar showing project name, active sprint name + dates inline, sprint filter dropdown, and project switcher (when multiple projects exist).
- **`Board/Card`**, **`Board/Column`**, **`Board/AddCardForm`** — DnD-aware board sub-components living in `components/Board/`.
- **`Board/ManageLanesModal`** — modal for adding, renaming, reordering, and deleting swim lanes.
- **`BoardPage`** — Kanban with DnD; dark sub-banner shows selected/active sprint name, dates, goal, and status; Epic and Feature filter dropdowns narrow visible stories.
- **`BacklogPage`** — type-filter tabs (All / Epics / Features / Stories / Tasks); All tab shows a collapsible full hierarchy; each Story has a "Move to sprint…" select; Epics/Features show status badge + assignee.
- **`EpicsPage`** — collapsible drill-down hierarchy (Epic rows → Feature rows → Story rows); inline creation at each level via `InlineForm`; story rows link to `CardModal`.
- **`SprintsPage`** — fetches sprints and columns; renders collapsible `SprintCard` components each showing progress bar (done cards = lane with `is_done_col = 1`), burndown chart (ideal vs. remaining story points), card list, Activate/Complete Sprint buttons; includes `CreateSprintForm`.
- **`TestSuitePage`** — test case management UI; lists test suites and their cases, records test runs, shows pass/fail/blocked/skipped status, supports bulk status updates and drag-to-reorder.
- **`CardModal`** — full story detail editor; right sidebar includes Feature selector (calls `PATCH /cards/:id { feature_id }`) after Sprint; Description tab includes inline Tasks checklist with status toggle, assignee, add/delete; task progress badge shown on board card via `boardStore.taskSummary`.

### Backend (`server/`)

- **Hono 4.5** on Node.js via `@hono/node-server`, listening on port 3000.
- Entry: `server/src/index.ts` — registers all route groups and enables CORS for `http://localhost:5173`. When `NODE_ENV=production`, also serves `client/dist/` as static files and adds an SPA fallback so React Router works.
- Routes live in `server/src/routes/` (one file per resource: projects, sprints, columns, cards, comments, labels, lanes, presets, activity, dashboard, testcases).
- All responses use the `{ data, error }` envelope from `server/src/lib/response.ts`.
- Request body validation uses **Zod** in each route handler.

### Database (`server/src/db/`)

- **SQLite** via `better-sqlite3` with WAL mode and foreign keys enabled.
- `index.ts` initializes the DB, runs `schema.sql`, and seeds demo data on first boot.
- Schema: `projects → swim_lanes`, `projects → sprints`, `projects → columns` (legacy), `swim_lanes → cards`, `cards ↔ labels` (join: `card_labels`), `cards → comments`, `cards → activity_log`, `lane_presets` (global presets for project setup), `projects → test_suites`, `cards → test_cases` (optionally grouped under a suite), `test_cases → test_runs`, `projects → epics`, `epics → features`, `features → cards` (via `feature_id`), `cards → tasks`.
- `cards` represents **Stories** in the hierarchy. It has both `swim_lane_id` (primary) and `column_id` (legacy). New stories are created in swim lanes; columns table retained for backward compatibility.
- `cards.feature_id` (nullable FK → `features.id`) links a story to its parent feature. Added via additive `ALTER TABLE` migration (try/catch) to preserve existing data.
- `epics` and `features` both have `priority` (`p0`–`p3`), `status` (`new`|`active`|`resolved`|`closed`), `assignee`, `position`, and `is_default` (0/1).
- Each project has exactly one **Default Epic** and one **Default Feature** (`is_default = 1`). These are created automatically when a project is created and cannot be deleted. Any story created without a `feature_id` is auto-assigned to the project's Default Feature; any feature created without an `epic_id` is auto-assigned to the project's Default Epic. On server startup, any existing project missing defaults receives them (backfill migration).
- `projects.is_default` (0/1) — exactly one **Default Project** exists globally. It is created on first startup if none exists and cannot be deleted (DELETE returns 409). It receives its own Default Epic, Default Feature, and Default Sprint automatically.
- `sprints.is_default` (0/1) — each project has exactly one **Default Sprint** (`is_default = 1`). Created automatically when a project is created and cannot be deleted (DELETE returns 409). On startup, any project missing a Default Sprint receives one (backfill migration). Sprint always belongs to a project; the Default Project is the fallback when no project context exists.
- **Story–Sprint mapping is one-to-one.** Every story is always assigned to a sprint. When a story is created without an explicit `sprint_id`, the server automatically assigns it to the project's Default Sprint (`is_default = 1`). When creating a story on the Board, the sprint currently selected in the Header dropdown is passed as `sprint_id`; if "All" (no filter) is active, the server resolves the Default Sprint.
- `tasks` are sub-items of a story (`story_id` FK → `cards.id` ON DELETE CASCADE). Status: `to-do`|`in-progress`|`done`.
- `swim_lanes.is_done_col` (0/1) flags the "done" lane for burndown/progress calculations; replaces the old convention of "last column by position = done".
- Projects have a `color` field (hex, default `#6366f1`).
- `activity_log` records `create`, `update`, and `move` actions as JSON `meta`.
- DB path is controlled by the `DATABASE_PATH` env var (defaults to `server/slateflow.db` in dev; Docker sets it to `/data/slateflow.db` on a named volume).

### Key API endpoint groups

| Group | Routes file | Highlights |
|---|---|---|
| Projects | `projects.ts` | CRUD; create accepts `color`, `preset_id`, `custom_lanes`; automatically creates Default Epic, Default Feature, and Default Sprint for the new project; DELETE returns `409` for the Default Project |
| Swim lanes | `lanes.ts` | CRUD + bulk reorder (`POST /projects/:id/lanes/reorder`) |
| Lane presets | `presets.ts` | `GET /lane-presets` — global templates shown in project setup |
| Stories (cards) | `cards.ts` | CRUD in lanes (`/lanes/:id/cards`); move via `PATCH /cards/:id/move`; accepts `feature_id` (auto-assigns to Default Feature if omitted); task sub-routes (`GET/POST /cards/:id/tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `POST /cards/:id/tasks/reorder`); `GET /projects/:id/tasks` returns all tasks |
| Epics | `epics.ts` | CRUD (`/projects/:id/epics`, `/epics/:id`); list includes `feature_count` + `story_count` + `is_default`; DELETE returns `409` for the Default Epic |
| Features | `features.ts` | CRUD (`/projects/:id/features`, `/features/:id`); list supports `?epic_id=` filter; includes `story_count` + `done_story_count` + `is_default`; POST auto-assigns to Default Epic when `epic_id` omitted; DELETE returns `409` for the Default Feature; `GET /features/:id/stories` returns linked stories |
| Sprints | `sprints.ts` | Create/update/complete/delete sprints; `GET /projects/:id/backlog`; DELETE returns `409` for the Default Sprint; list includes `is_default` field |
| Activity | `activity.ts` | `GET /cards/:id/activity`, `GET /projects/:id/activity` |
| Dashboard | `dashboard.ts` | `GET /dashboard/stats`, `/dashboard/projects`, `/dashboard/activity` |
| Comments | `comments.ts` | CRUD on card comments |
| Labels | `labels.ts` | Project labels; attach/detach on stories |
| Test cases | `testcases.ts` | Test suites (project-level), test cases (story-level), test runs; bulk status + reorder |
| Columns (legacy) | `columns.ts` | Retained for backward compatibility |
| Auth | `auth.ts` | `POST /auth/login` (sets httpOnly `sf_token` cookie); `POST /auth/logout`; `GET /auth/me`; `PATCH /auth/me` (own profile/password) |
| Users | `users.ts` | Super Admin only: CRUD + soft-delete + `GET /users/search?q=` for typeahead |
| Epic access | `epicAccess.ts` | Grant/revoke/update epic-scoped roles; accessible to super_admin and epic_admin |
| Notifications | `notifications.ts` | `GET /notifications?unread_only=1`; mark one or all as read |
| SSE | `sse.ts` | `GET /events` — EventSource stream for `card:created`, `card:updated`, `card:moved`, `card:deleted`, `epic:updated`, `notification` events |

### API Reference

Full REST API documentation with curl examples is in [docs/api.md](docs/api.md).

## Docker / Self-hosting

| File | Purpose |
|---|---|
| `Dockerfile.server` | 5-stage multi-stage build: deps → prod-deps → client-build → server-build → production |
| `docker-compose.yml` | Single `slateflow` service; named volume `slateflow-data` mounted at `/data` |
| `.env.example` | Documents `PORT`, `DATABASE_PATH`, `SECRET` |
| `.dockerignore` | Excludes `node_modules`, `dist`, `*.db` from build context |

In production mode the server compiles to `server/dist/` and serves `client/dist/` as static files. `schema.sql` must be copied alongside `index.js` in `server/dist/db/` (done by the Dockerfile's `cp` step since `tsc` doesn't copy non-TS assets).

## Contributor License Agreement (CLA) Enforcement

All pull requests require a signed Contributor License Agreement before merge. This protects SlateFlow's ability to relicense (e.g., offer proprietary SaaS variants) without renegotiating with contributors.

### CLA Setup

- **CLA Document:** [CLA.md](CLA.md) — Individual CLA with non-assignment, broad sublicensing/relicensing rights, employer authorization clause
- **Enforcement:** CLAassistant bot checks all PRs and posts a comment with signing link; status check must pass before merge (branch protection rule recommended)
- **FAQ:** [docs/CLA_FAQ.md](docs/CLA_FAQ.md) — Common questions for contributors
- **Configuration:** CLAassistant is integrated via GitHub App; contact maintainers to configure bot settings or whitelist GitHub usernames

### Maintainer Responsibilities

1. **PR Review:** Watch for CLAassistant comment on PRs; look for ✅ "CLA Signed" status
2. **Non-signers:** If a contributor has not signed (❌ status), comment asking them to sign before merge attempt
3. **Branch Protection (optional):** Require CLAassistant status check in GitHub repository settings under Branch Protection → Require status checks to pass
4. **Whitelist (optional):** If core maintainers should skip CLA signing for rapid iteration, configure GitHub username whitelist via CLAassistant settings

### Key Points

- **Non-assignment:** Contributor retains copyright; SlateFlow gets broad usage rights
- **One-time signing:** Contributor signs once; covers all past and future contributions
- **SaaS-friendly:** Explicit relicensing clause allows proprietary variants and dual-licensing
- **Employer clause:** Protects against employer IP disputes
