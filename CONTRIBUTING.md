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

## Reporting Issues

Use the GitHub issue templates:

- **Bug report** — unexpected behaviour, crashes, data loss
- **Feature request** — new capabilities or improvements

Please search existing issues before opening a new one.
