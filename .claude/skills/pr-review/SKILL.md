---
name: pr-review
description: Review a pull request. Accepts an optional GitHub PR number and/or scope (frontend | backend | db). Examples: /review · /review frontend · /review 123 · /review 123 db
---

You are executing the /review skill. Follow these steps exactly.

## Step 1 — Parse arguments

From the args passed to this skill, extract:
- PR_NUMBER: the first token if it is all digits, otherwise absent
- SCOPE: the first token that is one of `frontend`, `backend`, `db`; otherwise `general`

Examples:
  (no args)        → PR_NUMBER=none,  SCOPE=general
  frontend         → PR_NUMBER=none,  SCOPE=frontend
  123              → PR_NUMBER=123,   SCOPE=general
  123 db           → PR_NUMBER=123,   SCOPE=db

## Step 2 — Gather context (run in parallel)

If PR_NUMBER is set:
  gh pr view {PR_NUMBER} --json title,body,author,baseRefName,files,number
  gh pr diff {PR_NUMBER}

If PR_NUMBER is absent:
  git diff main...HEAD
  git log main...HEAD --oneline
  gh pr view --json title,body 2>/dev/null || echo "NO_PR"

## Step 3 — Understand the intent

Read the PR title and body (or commit messages). Note what the change is supposed to do.
For large diffs (> 400 lines), use Read and Grep on the most critical changed files
rather than reading the entire raw diff.

## Step 4 — Run the scope checklist

Run **only** the checklist for the active SCOPE. For `general`, run all five lenses.
Skip any lens with no real findings — do not pad the review.

### frontend lens
- React correctness: missing `key` props, stale closures in hooks, effect dependency arrays
- Zustand stores: mutations outside actions, missing resets on unmount, store shape drift
- Drag-and-drop (DnD): missing droppable/draggable IDs, incorrect `onDragEnd` mutation order
- FeatureGate usage: new UI surfaces not wrapped in `<FeatureGate flag="…">` where required
- Accessibility: interactive elements missing `aria-*` or keyboard handlers, color-only cues
- Network calls: raw `fetch` instead of the shared axios instance; missing error states in UI

### backend lens
- Hono routes: missing `requireAuth` or `requireFeature` middleware on protected endpoints
- RBAC: `canRead`/`canWrite`/`canManageUsers` from `lib/projectAccess.ts` not called; epic access not checked via `lib/epicAccess.ts`
- Response envelope: responses not wrapped in `{ data: … }` / `{ error: … }` convention
- SSE / eventBus: mutations not emitting the right event type on `lib/eventBus.ts`
- Feature flags: new flag not registered in all four sync points (featureFlags.ts, adminSettings.ts, featureFlagStore.ts, env-var table in CLAUDE.md)
- Input validation: user-supplied values used in SQL or shell without sanitisation

### db lens
- Schema safety: `NOT NULL` columns added without a DEFAULT on an existing table (breaks SQLite ALTER TABLE)
- Missing indexes: foreign key columns or frequently-queried columns without an index
- Cascade behaviour: FK without `ON DELETE CASCADE` / `ON DELETE SET NULL` where appropriate
- Default-item invariants: deleting or mutating a default project/sprint/epic/feature without the 409 guard
- Migration order: schema changes that would break existing rows if run on a live DB
- Data loss: `DROP COLUMN`, `DROP TABLE`, or destructive `UPDATE` without a backup note

### general lens (all five of the original lenses)
- Correctness / logic: off-by-one, wrong conditions, unhandled edge cases, bad async/await, race conditions, missing null guards
- Security: unvalidated input to DB/filesystem/shell; secrets in source; missing auth; unsafe eval
- Code quality: functions doing too many things, duplicated logic, dead code, confusing names
- Test coverage: new paths with no test; happy-path-only tests when edge cases exist
- Docs completeness: public endpoints or exports without JSDoc; user-visible changes without README/changelog entry

## Step 5 — Write the review

Output in this exact format:

---
## PR Review — <title or branch name> [<SCOPE>]

### Summary
One to three sentences: what the change does, whether the approach is sound,
and the top concern (or "looks good" if none).

### Findings

#### [MUST] <Short title>
**File:** `path/to/file.ts` (line N)
What the problem is and why it matters. One concrete fix suggestion.

#### [SHOULD] <Short title>
**File:** `path/to/file.ts` (line N)
What could be improved and the recommended approach.

#### [NIT] <Short title>
**File:** `path/to/file.ts`
Minor suggestion. Keep brief. At most two NITs total — omit the rest.

### Verdict
`APPROVE` / `REQUEST CHANGES` / `COMMENT`
One sentence explaining the verdict.
---

Severity guide:
- [MUST]   — Blocks merge. Bug, security issue, data-loss risk, or broken invariant.
- [SHOULD] — Strong recommendation: poor coverage, readability, or pattern inconsistency.
- [NIT]    — Optional. Never more than two per review.

Verdict logic:
- Any [MUST]             → REQUEST CHANGES
- Only [SHOULD] or [NIT] → COMMENT
- No findings or NIT only → APPROVE

If there are no findings at all: output "### Findings\nNone — looks good." and APPROVE.
