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

Liteboard is a Kanban board app — a full-stack monorepo using **npm workspaces** (`client/` and `server/`).

### Frontend (`client/`)

- **Vite + React 18 + TypeScript**. Entry: `client/src/main.tsx` → `App.tsx`.
- `App.tsx` sets up React Router 7; the root redirects to `/projects/:projectId` which renders `BoardPage`. Additional routes: `/projects/:projectId/backlog` → `BacklogPage`, `/projects/:projectId/sprints` → `SprintsPage`.
- All API calls are centralized in `client/src/api.ts` as a typed fetch wrapper hitting `/api/*`. Vite proxies `/api` to `localhost:3000` during development.
- Drag-and-drop (card and column reordering) uses `@dnd-kit/core` + `@dnd-kit/sortable` with `PointerSensor`.
- Styling is Tailwind CSS v3 via PostCSS.
- No global state library — components use local `useState`/`useRef` and call `api.ts` directly.
- Burndown charts use **recharts** (`LineChart`) in `SprintsPage`.

### Pages

| Route | Component | Purpose |
|---|---|---|
| `/projects/:id` | `BoardPage` | Kanban board with DnD; shows sprint sub-banner |
| `/projects/:id/backlog` | `BacklogPage` | Cards with no sprint, grouped by column; "Move to sprint" per card |
| `/projects/:id/sprints` | `SprintsPage` | Sprint list, create form, progress bars, burndown chart, complete sprint |

### Components

- **`Header`** — top nav with Board / Backlog / Sprints links (NavLink active state), active sprint name + dates inline, sprint filter dropdown.
- **`BoardPage`** — Kanban with DnD; dark sub-banner shows selected/active sprint name, dates, goal, and status.
- **`BacklogPage`** — fetches `GET /projects/:id/backlog`; groups cards by column; each card has a "Move to sprint…" select that calls `PATCH /cards/:id { sprint_id }`.
- **`SprintsPage`** — fetches sprints and columns; renders collapsible `SprintCard` components each showing progress bar (done cards = last column by position), burndown chart (ideal vs. remaining story points), card list, Activate/Complete Sprint buttons; includes `CreateSprintForm`.

### Backend (`server/`)

- **Hono 4.5** on Node.js via `@hono/node-server`, listening on port 3000.
- Entry: `server/src/index.ts` — registers all route groups and enables CORS for `http://localhost:5173`. When `NODE_ENV=production`, also serves `client/dist/` as static files and adds an SPA fallback so React Router works.
- Routes live in `server/src/routes/` (one file per resource: projects, sprints, columns, cards, comments, labels).
- All responses use the `{ data, error }` envelope from `server/src/lib/response.ts`.
- Request body validation uses **Zod** in each route handler.

### Database (`server/src/db/`)

- **SQLite** via `better-sqlite3` with WAL mode and foreign keys enabled.
- `index.ts` initializes the DB, runs `schema.sql`, and seeds demo data on first boot.
- Schema: `projects → sprints`, `projects → columns`, `columns → cards`, `cards ↔ labels` (join: `card_labels`), `cards → comments`, `cards → activity_log`.
- `activity_log` records `create`, `update`, and `move` actions as JSON `meta`.
- DB path is controlled by the `DATABASE_PATH` env var (defaults to `server/liteboard.db` in dev; Docker sets it to `/data/liteboard.db` on a named volume).

### Sprint API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/projects/:id/sprints` | List all sprints for a project |
| `POST` | `/projects/:id/sprints` | Create sprint (`name`, `goal`, `start_date`, `end_date`, `status`) |
| `PATCH` | `/sprints/:id` | Partial update |
| `POST` | `/sprints/:id/complete` | Mark completed **and** move all sprint cards to backlog (`sprint_id = NULL`) |
| `GET` | `/sprints/:id/cards` | List cards assigned to a sprint |
| `GET` | `/projects/:id/backlog` | Cards with `sprint_id IS NULL`, joined with `column_name` and `column_color` |

### API Reference

Full REST API documentation with curl examples is in [docs/api.md](docs/api.md).

## Docker / Self-hosting

| File | Purpose |
|---|---|
| `Dockerfile.server` | 5-stage multi-stage build: deps → prod-deps → client-build → server-build → production |
| `docker-compose.yml` | Single `liteboard` service; named volume `liteboard-data` mounted at `/data` |
| `.env.example` | Documents `PORT`, `DATABASE_PATH`, `SECRET` |
| `.dockerignore` | Excludes `node_modules`, `dist`, `*.db` from build context |

In production mode the server compiles to `server/dist/` and serves `client/dist/` as static files. `schema.sql` must be copied alongside `index.js` in `server/dist/db/` (done by the Dockerfile's `cp` step since `tsc` doesn't copy non-TS assets).
