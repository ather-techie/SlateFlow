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

## Contributor License Agreement

Before contributing, please read and agree to the [Contributor License Agreement (CLA)](../CLA.md).

All pull requests must be signed by the contributor before they can be merged. The automated **CLAassistant** bot will check your CLA signature on every PR and post a comment with a signing link if needed. Signing takes about **2 minutes** and covers all your current and future contributions.

**Why a CLA?** It clarifies intellectual property rights while allowing SlateFlow to:
- Offer proprietary editions or SaaS variants
- Respond to future business opportunities
- Protect the Project's long-term sustainability

For common questions, see [CLA FAQ](../docs/CLA_FAQ.md).

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

## License Compliance

Before submitting a PR with new dependencies, verify that all licenses are compatible:

### Steps to generate a license report:

1. **Install license-checker globally** (if not already):
   ```bash
   npm install -g license-checker
   ```

2. **Generate license reports** in both workspaces:
   ```bash
   cd client
   license-checker --json > ../license-report-client.json
   cd ../server
   license-checker --json > ../license-report-server.json
   cd ..
   ```

3. **Review the generated reports** at `license-report-client.json` and `license-report-server.json` to ensure all dependencies use compatible licenses (e.g., MIT, Apache 2.0, ISC).

4. **Consolidate** (optional): To create a single combined report:
   ```bash
   npx license-checker --json > license-report.json
   ```

5. **Share** the license report(s) in your PR comments if adding significant new dependencies.

For questions about license compatibility, consult [LABELS.md](LABELS.md) or reach out to the maintainers.

**Note:** Before submitting a PR with new dependencies, ensure You have signed the [CLA](../CLA.md).

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

Test cases are attached to individual Kanban cards and grouped into optional **test suites**. Each case has a lifecycle status (`untested → passed / failed / blocked / skipped`) that is updated by appending **test runs**; the parent case's status is auto-mirrored from the most recent run, and the result is written to `activity_log`.

For the full request/response surface (creating cases, recording runs, suite management, the per-card `summary` shape that drives the card-tile indicator), see **[docs/api.md §Test Cases](docs/api.md#test-cases)**, **§Test Suites**, and **§Test Runs**.

## Freeing Port 3000

If the API server port is already in use, kill the process before starting:

**PowerShell:**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
# or, manually:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Bash (Git Bash / WSL):**
```bash
npx kill-port 3000
```

## Reporting Issues

Use the GitHub issue templates:

- **Bug report** — unexpected behaviour, crashes, data loss
- **Feature request** — new capabilities or improvements

Please search existing issues before opening a new one.
