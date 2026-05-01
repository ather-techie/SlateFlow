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

## Architecture

SlateFlow is a Kanban board app — a full-stack monorepo using **npm workspaces** (`client/` and `server/`).

### Frontend (`client/`)

- **Vite + React 18 + TypeScript**. Entry: `client/src/main.tsx` → `App.tsx`.
- `App.tsx` sets up React Router 7. Root (`/`) checks whether any projects exist: redirects to `/dashboard` if yes, `/projects/new` if no. Project-scoped pages are wrapped in a shared `Layout` component.
- All API calls go through `client/src/api/index.ts` — an **axios**-based typed client that unwraps the `{ data, error }` envelope and shows a toast on error. Vite proxies `/api` to `localhost:3000` during development.
- Drag-and-drop (card and lane reordering) uses `@dnd-kit/core` + `@dnd-kit/sortable` with `PointerSensor`.
- Styling is Tailwind CSS v3 via PostCSS.
- Global state is managed with **Zustand** (`client/src/store/boardStore.ts` for lane/card state, `projectStore.ts` for active project).
- Toast notifications use **react-hot-toast**.
- Burndown charts use **recharts** (`LineChart`) in `SprintsPage`.

### Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `RootRedirect` (inline) | Checks projects, redirects to `/dashboard` or `/projects/new` |
| `/projects/new` | `ProjectSetupPage` | Create a project; choose a lane preset or enter custom lanes |
| `/dashboard` | `DashboardPage` | All-projects overview — stats, active sprints, recent activity |
| `/projects/:id/board` | `BoardPage` | Kanban board with DnD; shows sprint sub-banner |
| `/projects/:id/backlog` | `BacklogPage` | Cards with no sprint, grouped by column; "Move to sprint" per card |
| `/projects/:id/sprints` | `SprintsPage` | Sprint list, create form, progress bars, burndown chart, complete sprint |
| `/projects/:id/tests` | `TestSuitePage` | Test case management — suites, cases, run history, bulk status updates |
| `*` | `NotFoundPage` | 404 fallback |

### Components

- **`Layout`** — shell shared by Dashboard and project pages; renders the `Header` and an `<Outlet />`.
- **`Header`** — top nav with Board / Backlog / Sprints links (NavLink active state), active sprint name + dates inline, sprint filter dropdown.
- **`Board/Card`**, **`Board/Column`**, **`Board/AddCardForm`** — DnD-aware board sub-components living in `components/Board/`.
- **`Board/ManageLanesModal`** — modal for adding, renaming, reordering, and deleting swim lanes.
- **`BoardPage`** — Kanban with DnD; dark sub-banner shows selected/active sprint name, dates, goal, and status.
- **`BacklogPage`** — fetches `GET /projects/:id/backlog`; groups cards by column; each card has a "Move to sprint…" select that calls `PATCH /cards/:id { sprint_id }`.
- **`SprintsPage`** — fetches sprints and columns; renders collapsible `SprintCard` components each showing progress bar (done cards = lane with `is_done_col = 1`), burndown chart (ideal vs. remaining story points), card list, Activate/Complete Sprint buttons; includes `CreateSprintForm`.
- **`TestSuitePage`** — test case management UI; lists test suites and their cases, records test runs, shows pass/fail/blocked/skipped status, supports bulk status updates and drag-to-reorder.
- **`CardModal`** — full card detail editor; handles title/description/priority/story points/assignee, labels, comments, and an inline test case panel with a summary bar.

### Backend (`server/`)

- **Hono 4.5** on Node.js via `@hono/node-server`, listening on port 3000.
- Entry: `server/src/index.ts` — registers all route groups and enables CORS for `http://localhost:5173`. When `NODE_ENV=production`, also serves `client/dist/` as static files and adds an SPA fallback so React Router works.
- Routes live in `server/src/routes/` (one file per resource: projects, sprints, columns, cards, comments, labels, lanes, presets, activity, dashboard, testcases).
- All responses use the `{ data, error }` envelope from `server/src/lib/response.ts`.
- Request body validation uses **Zod** in each route handler.

### Database (`server/src/db/`)

- **SQLite** via `better-sqlite3` with WAL mode and foreign keys enabled.
- `index.ts` initializes the DB, runs `schema.sql`, and seeds demo data on first boot.
- Schema: `projects → swim_lanes`, `projects → sprints`, `projects → columns` (legacy), `swim_lanes → cards`, `cards ↔ labels` (join: `card_labels`), `cards → comments`, `cards → activity_log`, `lane_presets` (global presets for project setup), `projects → test_suites`, `cards → test_cases` (optionally grouped under a suite), `test_cases → test_runs`.
- `cards` has both `swim_lane_id` (primary) and `column_id` (legacy). New cards are created in swim lanes; the columns table is retained for backward compatibility.
- `swim_lanes.is_done_col` (0/1) flags the "done" lane for burndown/progress calculations; replaces the old convention of "last column by position = done".
- Projects have a `color` field (hex, default `#6366f1`).
- `activity_log` records `create`, `update`, and `move` actions as JSON `meta`.
- DB path is controlled by the `DATABASE_PATH` env var (defaults to `server/slateflow.db` in dev; Docker sets it to `/data/slateflow.db` on a named volume).

### Key API endpoint groups

| Group | Routes file | Highlights |
|---|---|---|
| Projects | `projects.ts` | CRUD; create accepts `color`, `preset_id`, `custom_lanes` |
| Swim lanes | `lanes.ts` | CRUD + bulk reorder (`POST /projects/:id/lanes/reorder`) |
| Lane presets | `presets.ts` | `GET /lane-presets` — global templates shown in project setup |
| Cards | `cards.ts` | CRUD in lanes (`/lanes/:id/cards`); move via `PATCH /cards/:id/move` with `{ lane_id, position }` |
| Sprints | `sprints.ts` | Create/update/complete/delete sprints; `GET /projects/:id/backlog` |
| Activity | `activity.ts` | `GET /cards/:id/activity`, `GET /projects/:id/activity` |
| Dashboard | `dashboard.ts` | `GET /dashboard/stats`, `/dashboard/projects`, `/dashboard/activity` |
| Comments | `comments.ts` | CRUD on card comments |
| Labels | `labels.ts` | Project labels; attach/detach on cards |
| Test cases | `testcases.ts` | Test suites (project-level), test cases (card-level), test runs; bulk status + reorder |
| Columns (legacy) | `columns.ts` | Retained for backward compatibility |

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
