# Contributing to SlateFlow

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Local Setup

**Prerequisites:** Node.js 20+, Git

```bash
git clone https://github.com/your-org/slateflow.git
cd slateflow
npm install
npm run dev
```

The app starts at http://localhost:5173 (client) and http://localhost:3000 (API). The SQLite database is created and seeded automatically on first boot at `server/slateflow.db`.

To reset the database, delete `server/slateflow.db` and restart the server.

## Branch Naming

| Prefix | Use for |
|--------|---------|
| `feat/` | New features (`feat/sprint-velocity-chart`) |
| `fix/` | Bug fixes (`fix/card-drag-after-column-reorder`) |
| `chore/` | Tooling, deps, CI, docs (`chore/upgrade-hono`) |

Branch off `main`. Keep branches focused on a single concern.

## Making Changes

1. **Fork** the repo and create your branch from `main`.
2. **Code** your change. Follow the existing patterns — no new abstractions unless the task requires them.
3. **Lint** before pushing: `npm run lint -w client`
4. **Type-check:** the CI workflow runs `tsc --noEmit` on both workspaces; fix any errors locally first.
5. **Test manually** — there is no automated test suite. Verify the golden path and any edge cases in the browser.
6. **Open a PR** against `main` and fill out the checklist below.

## Pull Request Checklist

Before requesting review, confirm:

- [ ] Branch is named with the correct prefix (`feat/`, `fix/`, `chore/`)
- [ ] `npm run lint -w client` passes with no new errors
- [ ] TypeScript compiles cleanly (`tsc --noEmit`) in both `client/` and `server/`
- [ ] `npm run build` succeeds end-to-end
- [ ] The feature or fix has been manually verified in the browser
- [ ] No unrelated files or debug code are included in the diff
- [ ] PR description explains **what** changed and **why**

## Project Structure

```
slateflow/
  client/       # React 18 + Vite frontend
  server/       # Hono 4 + SQLite backend
  docs/         # API reference
  screenshots/  # Project screenshots (see PLACEHOLDER.md)
```

See [CLAUDE.md](CLAUDE.md) for a detailed architecture walkthrough, API reference pointer, and Docker notes.

## Adding Test Cases to a Card

Test cases are attached to individual Kanban cards and are organised into optional **test suites**. Each test case has a lifecycle status (`untested → passed / failed / blocked / skipped`) that is updated by recording **test runs**.

### Data model

```
cards
 └── test_cases   (suite_id nullable → test_suites)
      └── test_runs
```

A `test_case` belongs to exactly one card (and therefore one project). `test_runs` are append-only execution records; the most recent run's status is mirrored back to the parent `test_case.status` automatically.

### Creating a test case

```bash
# POST /api/cards/:cardId/test-cases
curl -s -X POST http://localhost:3000/api/cards/42/test-cases \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "User can log in with valid credentials",
    "priority": "critical",
    "test_type": "manual",
    "steps": [
      { "step": "Open /login",                      "expected": "Login form is visible" },
      { "step": "Enter valid email and password",    "expected": "Fields accept input" },
      { "step": "Click \"Sign in\"",                "expected": "Redirect to dashboard" }
    ],
    "preconditions": "A test account exists with role user",
    "expected_result": "User lands on /dashboard and session cookie is set",
    "assigned_to": "qa@example.com"
  }'
```

The new case starts with `status = "untested"`.

### Recording a test run

```bash
# POST /api/test-cases/:id/runs
curl -s -X POST http://localhost:3000/api/test-cases/7/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "failed",
    "notes": "Login button unresponsive on Firefox 122",
    "run_by": "qa@example.com"
  }'
```

This call:
1. Inserts a `test_runs` row with the provided status, notes, and tester identity.
2. Sets `test_cases.status = "failed"` on the parent case.
3. Writes a `test_run` action to `activity_log` so the result appears in the dashboard activity feed and the card's history.

### How the card tile indicator is updated

`GET /api/cards/:cardId/test-cases` returns a `summary` object:

```json
{ "total": 4, "passed": 1, "failed": 1, "untested": 2, "blocked": 0, "skipped": 0 }
```

The `CardContent` component reads this summary whenever the card modal is opened and renders a colour-coded mini progress bar at the bottom of the card tile (green = passed, red = failed, amber = blocked, gray = untested/skipped). Recording a new run via the API will be reflected on the next fetch.

### Grouping test cases into suites

```bash
# 1. Create a suite
curl -s -X POST http://localhost:3000/api/projects/1/test-suites \
  -H 'Content-Type: application/json' \
  -d '{ "name": "Auth flows", "description": "Login, logout, and token refresh" }'

# 2. Assign a test case to the suite
curl -s -X PATCH http://localhost:3000/api/test-cases/7 \
  -H 'Content-Type: application/json' \
  -d '{ "suite_id": 1 }'
```

Deleting a suite sets `suite_id = null` on its test cases but does not delete the cases themselves.

## Reporting Issues

Use the GitHub issue templates:

- **Bug report** — unexpected behaviour, crashes, data loss
- **Feature request** — new capabilities or improvements

Please search existing issues before opening a new one.
