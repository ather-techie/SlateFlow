# Liteboard

A lightweight, self-hostable Kanban board for agile teams — sprints, backlog management, and drag-and-drop in a single deployable container.

## Screenshots

> Screenshots live in the [`screenshots/`](screenshots/) folder. See that folder for a `PLACEHOLDER.md` with instructions on adding your own.

## Features

- **Kanban board** — columns and cards with full drag-and-drop reordering (cards and columns)
- **Sprint management** — create, activate, and complete sprints; burndown charts per sprint
- **Backlog** — unassigned cards grouped by column; move to any sprint in one click
- **Drag-and-drop** — powered by `@dnd-kit` with pointer sensor support
- **Activity log** — automatic `create`, `update`, and `move` events per card
- **Labels & comments** — tag cards and leave threaded comments
- **Self-host** — single Docker container, SQLite database on a named volume; no external services required

## Quick Start

**Prerequisites:** Node.js 20+

```bash
git clone https://github.com/your-org/liteboard.git
cd liteboard
npm install
npm run dev
```

| URL | What |
|-----|------|
| http://localhost:5173 | Kanban board (React + Vite HMR) |
| http://localhost:3000 | REST API (Hono) |

The SQLite database (`server/liteboard.db`) is created and seeded with a demo project on first boot.

## Docker Quick Start

**Prerequisites:** Docker and Docker Compose

```bash
# (Optional) copy and edit env vars — defaults work out of the box
cp .env.example .env

# Build and start on port 3000
docker-compose up -d
```

Open http://localhost:3000. The database is stored in the `liteboard-data` Docker volume and survives container restarts.

```bash
docker-compose down          # stop
docker-compose build         # rebuild after source changes
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
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| Backend | Node.js, Hono 4, TypeScript, tsx |
| Database | SQLite (better-sqlite3), WAL mode |
| Monorepo | npm workspaces |
| Container | Docker + Docker Compose (single image) |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE)
