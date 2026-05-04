# SlateFlow

A lightweight, self-hostable Kanban board for agile teams — sprints, backlog management, and drag-and-drop in a single deployable container.

## Screenshots

> Screenshots live in the [`screenshots/`](screenshots/) folder. See that folder for a `PLACEHOLDER.md` with instructions on adding your own.

## Features

- **Dashboard** — project overview with stats (open cards, active sprints) and a cross-project activity feed
- **Kanban board** — swim lanes and cards with full drag-and-drop reordering; manage lanes inline
- **Lane presets** — pick a workflow template (e.g. Scrum, Kanban) when creating a project, or define custom lanes
- **Sprint management** — create, activate, and complete sprints; burndown charts per sprint
- **Backlog** — full CRUD on unassigned cards (create, click-to-edit via modal, delete); cards grouped by swim lane; move to any sprint in one click
- **Drag-and-drop** — powered by `@dnd-kit` with pointer sensor support
- **Activity log** — automatic `create`, `update`, and `move` events per card
- **Test management** — attach test cases to cards; group into test suites; record pass/fail/blocked runs; track status with a per-card summary bar
- **Labels & comments** — tag cards and leave threaded comments
- **Self-host** — single Docker container, SQLite database on a named volume; no external services required

### Planning & Visibility
- **Roadmap / timeline view** — Gantt-style view across Epics and Features with date ranges
- **Story dependencies** — "blocks / blocked by" relationships between stories
- **Capacity planning** — assignee workload view per sprint (story points per person)

### Reporting
- **Velocity chart** — story points completed per sprint, trend over time
- **Cycle time / lead time** — how long cards spend in each lane
- **CSV export** — backlog, sprint report, or full project snapshot as CSV

## Quick Start

**Prerequisites:** Node.js 20+

```bash
git clone https://github.com/your-org/slateflow.git
cd slateflow
npm install
npm run dev
```

| URL | What |
|-----|------|
| http://localhost:5173 | Kanban board (React + Vite HMR) |
| http://localhost:3000 | REST API (Hono) |

The SQLite database (`server/slateflow.db`) is created and seeded with a demo project on first boot.

## Docker Quick Start

**Prerequisites:** Docker and Docker Compose

```bash
# (Optional) copy and edit env vars — defaults work out of the box
cp .env.example .env

# Build and start on port 3000
docker-compose up -d
```

Open http://localhost:3000. The database is stored in the `slateflow-data` Docker volume and survives container restarts.

```bash
docker-compose down          # stop
docker-compose build         # rebuild after source changes
```

## Freeing Port 3000

If the server port is already in use, kill the process before starting:

**PowerShell:**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

Or find the PID manually and kill it:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Bash (Git Bash / WSL):**
```bash
npx kill-port 3000
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server concurrently |
| `npm run dev -w server` | Server only (tsx watch, port 3000) |
| `npm run dev -w client` | Client only (Vite HMR, port 5173) |
| `npm run build` | Production build (client + server) |
| `npm run lint -w client` | ESLint on the client workspace |

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS v3, react-router-dom v7, recharts |
| State | Zustand, react-hot-toast |
| HTTP client | axios |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| Backend | Node.js, Hono 4, TypeScript, tsx |
| Database | SQLite (better-sqlite3), WAL mode |
| Monorepo | npm workspaces |
| Container | Docker + Docker Compose (single image) |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE)
