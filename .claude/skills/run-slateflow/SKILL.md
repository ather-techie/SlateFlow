---
name: run-slateflow
description: Build and run SlateFlow — self-hosted project management platform with Kanban, sprints, roadmap, and reporting
---

# Running SlateFlow

SlateFlow is a self-hosted, single-container project management platform. The dev setup runs a concurrent React frontend (`:5173` or `:5174` on busy systems) and Hono backend API server (`:3000`). This skill builds, launches, and tests the app.

**Prerequisites:**
- Node.js 20+ and npm 10+
- Windows 11 (tested) or Linux/macOS

**Build & Launch (Development):**

```bash
cd c:/repo/slateFlow
npm install
npm run dev
```

This spawns:
- Backend API server on `http://localhost:3000`
- Frontend on `http://localhost:5173` (or `:5174` if 5173 is busy)
- Real-time SSE event bus for card mutations and notifications
- SQLite database at `server/slateflow.db` (auto-created)

The server logs appear in the terminal; frontend logs are in the browser console.

## Agent Path: Smoke Test via Driver

The driver (`driver.mjs`) runs quick smoke tests to verify the app is up and responsive:

```bash
node .claude/skills/run-slateflow/driver.mjs
```

This checks:
- API `/api/config` endpoint (config & feature flags)
- Frontend HTML (`<div id="root">`)
- Login endpoint (`POST /api/auth/login`) with default admin credentials
- Protected project endpoint (`GET /api/projects` — auth required)

All four must pass (exit 0).

**Default Login:**
- Email: `admin@flow.local`
- Password: `Admin1234!`

This user is pre-seeded on first boot as a `super_admin` (can see all projects, manage users, toggle feature flags).

## Interactive Testing via Curl

Once `npm run dev` is running, test the API:

```bash
# Check feature flags
curl http://localhost:3000/api/config | grep features

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.local","password":"Admin1234!"}'

# Fetch projects (requires auth cookie from login above)
curl http://localhost:3000/api/projects \
  -b cookies.txt  # httpOnly cookie from login response
```

## Browser Testing

Navigate to `http://localhost:5173` (or `:5174`) in any browser. You will see:

1. **Login Page** — email/password form (and OAuth buttons if configured)
2. **Dashboard** — default project with empty sprints and epics
3. **Sidebar** — projects, sprints, roadmap, calendar, retrospectives (if features enabled)
4. **Board** — Kanban board with drag-and-drop cards

Click around to verify:
- Can create/edit/delete cards
- Cards move between swim lanes in real time
- Sprint planning UI is accessible
- No console errors in DevTools

## Test Suite

No test suite is currently configured. The smoke test driver above covers the main API surface.

## Build for Production

```bash
npm run build
docker-compose up -d     # builds and runs single container on :3000
```

Production builds serve the static React bundle from the Hono server (no separate frontend port).

## Gotchas

- **Port conflicts:** If 5173 is busy, Vite picks 5174 automatically. Check the dev log for the actual frontend URL.
- **Database persists:** Mutations made during testing stay in `server/slateflow.db`. Delete it to reset to defaults on next run.
- **Real-time events:** The event bus is in-process, single-node only. For multi-node deployments, an external broker (Redis, NATS) would be needed.
- **Feature flags:** Most AI endpoints and calendar/retrospective features are controlled by env vars (`FEATURE_AI`, `FEATURE_CALENDAR`, etc.). Defaults are in `.env.example`; copy to `.env` and toggle as needed.
- **Auth:** JWT tokens are httpOnly cookies (`sf_token`, 7-day TTL). Browser testing works seamlessly; API testing via curl requires passing cookies back.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 3000 already in use` | `lsof -i :3000` (Linux/macOS) or `netstat -ano \| findstr :3000` (Windows); kill the process or set `PORT=3001` in `.env` |
| `Cannot find module '@slateflow/...'` | `npm install` didn't run; try `npm install --force` |
| Frontend shows blank page | Check browser console (F12) for errors; server logs should show API requests. If 404s, frontend port is wrong — check dev log for actual port |
| `ERR_INVALID_DB_PATH` | Database parent dir doesn't exist; `mkdir -p server/` or set `DATABASE_PATH` in `.env` to a valid path |
| Login fails with "user not found" | Default user only exists on first boot (initial DB creation). Check `server/slateflow.db` exists; if not, delete and restart. |
| `EADDRINUSE` on `:5173` | Another process is using the port. Either kill it or Vite will auto-pick `:5174`. Check the dev log. |
