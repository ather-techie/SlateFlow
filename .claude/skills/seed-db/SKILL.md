---
name: seed-db
description: Reset and re-seed slateflow.db with realistic test data for local dev and demos.
---

# Seeding SlateFlow Database

This skill resets the SQLite database and populates it with realistic test data: projects, sprints, epics, features, cards, and multiple users.

## Prerequisites

- Node.js 20+ and npm 10+
- Development environment set up (`npm install` already run)

## Step 1 — Stop the dev server

If the dev server is running (`npm run dev`), stop it first. The database file must not be locked.

```bash
# Kill any running npm dev processes
# On Windows: use Task Manager or Ctrl+C in the terminal
# On Linux/macOS: pkill -f "npm run dev"
```

## Step 2 — Remove the existing database

```bash
rm -f server/slateflow.db
```

## Step 3 — Run the seed script

The seed script is located at `.claude/skills/seed-db/seed.js`. It will:
- Create a fresh SQLite database
- Run `server/src/db/schema.sql` to create all tables
- Insert a **Default Project** with default sprint, epic, and feature
- Create **2–3 sprints** with realistic status (active, completed, backlog)
- Create **2 epics** (1 default, 1 custom) with features
- Create **15–20 cards** distributed across lanes (todo, in-progress, review, done)
- Create **2 users**: `admin@flow.local` (super_admin) and `dev@flow.local` (contributor)

Run the seed script:

```bash
node .claude/skills/seed-db/seed.js
```

You should see output like:
```
✓ Database created at server/slateflow.db
✓ Schema initialized
✓ Default project, sprint, epic, feature inserted
✓ 2 sprints created
✓ 20 cards created
✓ 2 users created
Database seeded successfully!
```

## Step 4 — Verify the seed

Start the dev server:

```bash
npm run dev
```

Once running (`http://localhost:5173`), log in with:
- **Email:** `admin@flow.local`
- **Password:** `Admin1234!`

You should see:
- **Dashboard** with activity and stats
- **Board** with cards in multiple swim lanes (To Do, In Progress, Review, Done)
- **Backlog** with unscheduled cards
- **Sprints** with 2–3 sprints (one active, one completed, one backlog)
- **Epics** with features

If anything is missing, the seed failed — check the seed script output and the database file path in `.env`.

## Alternative: Dry run (view seed data without inserting)

If you want to preview what the seed script will insert:

```bash
node .claude/skills/seed-db/seed.js --dry-run
```

This prints the SQL statements without executing them.

## Troubleshooting

| Problem | Solution |
|---|---|
| `ENOENT: no such file or directory, open 'server/slateflow.db'` | The seed script ran successfully but the path is wrong. Check `DATABASE_PATH` in `.env` (defaults to `server/slateflow.db`). |
| `database is locked` | The dev server is still running. Stop it with Ctrl+C and try again. |
| Cards don't appear on the board | Log in as `admin@flow.local` / `Admin1234!` (the seeded admin user). The board is project-scoped. |
| `Cannot find module 'better-sqlite3'` | Run `npm install` in the root directory. |

## Resetting after seeding

To re-seed at any time:

```bash
rm -f server/slateflow.db
node .claude/skills/seed-db/seed.js
```

The script is idempotent — running it twice on a fresh database produces the same result.
