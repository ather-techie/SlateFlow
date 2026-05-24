---
name: check-feature-docs
description: Audit recent changes and verify that README.md, ROADMAP.md, and CLAUDE.md were all updated.
---

# Checking Feature Documentation

SlateFlow's CLAUDE.md enforces a rule: **Every new feature must update three documentation files before it's considered complete:**

1. **README.md** — add the feature to the Features section
2. **ROADMAP.md** — mark the item completed or update its status
3. **CLAUDE.md** — record any new patterns, env vars, flags, or conventions

This skill audits your recent commits and verifies all three were touched.

## Step 1 — Get the current branch context

Determine your base branch (usually `main`) and your current branch:

```bash
git branch -v
git log --oneline -1 origin/main
```

## Step 2 — Find recent changes

List the files you've modified since branching off `main`:

```bash
git diff main...HEAD --name-only
```

This will show all changed files on your branch. If it's empty, your branch is up-to-date with `main` (no feature changes to document).

## Step 3 — Check for the three documentation files

Grep the diff to see if any of these files were touched:

```bash
git diff main...HEAD --name-only | grep -E '^(README\.md|ROADMAP\.md|CLAUDE\.md)$'
```

If all three appear, you're compliant — stop here and proceed to Step 5.

If one or more are missing, continue to Step 4.

## Step 4 — Identify what was changed in the code

To understand what needs documenting, review the actual code changes:

```bash
# Show all changes (excluding the three doc files)
git diff main...HEAD --stat | grep -v -E '(README|ROADMAP|CLAUDE)'
```

This tells you which files changed (route, feature, config, etc.). Then decide which of the three doc files need updating:

- **README.md** — if you added a visible user-facing feature (new page, new command, new config)
- **ROADMAP.md** — if this work completes or changes a roadmap item (Phase 1–4 features)
- **CLAUDE.md** — if you added:
  - New environment variables
  - New feature flags (remember: 4 sync points!)
  - New API patterns or conventions
  - New architecture guidance

## Step 5 — View what's missing

Show the current state of the doc files to understand what should be added:

```bash
# View current README Features section
git show HEAD:README.md | grep -A 30 "^## Features"

# View current ROADMAP
git show HEAD:ROADMAP.md | head -50

# View the updated CLAUDE.md section on your branch
git show HEAD:CLAUDE.md | grep -A 20 "Feature Development Rules"
```

## Step 6 — Craft the updates

Decide what to add to each file:

### README.md

Find the **Features** section and add your feature to the bullet list:

```markdown
## Features

- Kanban board with drag-and-drop
- Sprint planning and burndown
- Roadmap with Gantt timeline
- **[NEW]** Retrospective board (per-sprint)
```

### ROADMAP.md

Update the status of the feature in the Phase section where it lives:

```markdown
## Phase 2: Collaboration & Insights

- [x] Real-time SSE event sync
- [ ] Email notifications (in progress — see PR #123)
```

### CLAUDE.md

Add patterns, env vars, or flags to the appropriate section:

```markdown
## Feature Flags

- `retrospective` (boolean, default false) — enables retrospective board and sidebar nav
- ...
```

If it's a **new environment variable**, also update the environment variables table:

```markdown
| `FEATURE_RETROSPECTIVE` | `false` | Enables the per-sprint Retrospective Board |
```

If it's a **new API pattern**, add a section under Architecture pointers.

## Step 7 — Apply the updates

Using the Edit tool, update each file. Then verify:

```bash
# Stage the doc updates
git add README.md ROADMAP.md CLAUDE.md

# Show what will be committed
git diff --staged
```

## Step 8 — Re-run the check

After making updates, verify all three files are now included:

```bash
git diff main...HEAD --name-only | grep -E '^(README\.md|ROADMAP\.md|CLAUDE\.md)$'
```

You should see all three. If still missing, go back to Step 4.

## Step 9 — Commit the docs

When the feature code is ready and all three doc files are updated, include them in your final commit:

```bash
git commit -m "Update docs for [feature name]"
```

Or include them in the same commit as the feature code:

```bash
git add .
git commit -m "Implement [feature name]

- Add [feature] to README Features
- Update ROADMAP Phase X status
- Document [env var / pattern / flag] in CLAUDE.md"
```

## Automation: Git Hook (Optional)

To enforce this automatically on every commit, add a pre-commit hook to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Warn if a feature was added but docs weren't touched
CHANGED=$(git diff --cached --name-only)
if echo "$CHANGED" | grep -E '^server/src/routes|^client/src/(pages|components|store)' | grep -qv -E '(README|ROADMAP|CLAUDE)'; then
  echo "⚠️  Warning: You've modified code but haven't updated README.md, ROADMAP.md, or CLAUDE.md"
  read -p "Continue anyway? (y/n) " -n 1
  echo
  [[ $REPLY = [Yy] ]] || exit 1
fi
exit 0
```

This runs automatically before every commit and warns if code changed but docs didn't.

## Troubleshooting

| Problem | Solution |
|---|---|
| `git diff main...HEAD` shows too many changes | Your branch is stale or based on an old commit. Consider rebasing: `git rebase main` |
| Can't find the Features section in README | The file structure may have changed. Run `cat README.md \| head -100` to explore. |
| `ROADMAP.md` doesn't have a Phase section for my feature | Add it under the appropriate phase (1–4). If unsure, ask the team or add to Phase 3 (future). |
| Not sure what to document in CLAUDE.md | If it's a new env var, config, or API pattern, document it. Otherwise, skip it. |

## Example: Retrospective Feature

Feature added: retrospective board (per-sprint reflection).

**README.md update:**

```markdown
- Per-sprint Retrospective Board for team reflection
```

**ROADMAP.md update:**

```markdown
### Phase 2: Collaboration & Insights
- [x] Real-time SSE event sync
- [x] Per-sprint Retrospective Board ← moved to done
```

**CLAUDE.md update:**

Added to Environment Variables table:

```markdown
| `FEATURE_RETROSPECTIVE` | `false` | Enables the per-sprint Retrospective Board (sidebar nav + `/api/sprints/:id/retrospective` and item endpoints) |
```

Then:

```bash
git add README.md ROADMAP.md CLAUDE.md
git commit -m "Document retrospective feature"
```

Done!
