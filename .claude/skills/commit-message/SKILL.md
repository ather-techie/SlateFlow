---
name: commit-message
description: Draft and apply a git commit message from staged/unstaged changes, following this project's commit style.
---

You are executing the /commit-message skill. Follow these steps exactly.

## Step 1 — Gather context (run in parallel)

Run all three commands at once:

```bash
git status
```
```bash
git diff --staged
```
```bash
git log --oneline -15
```

If `git diff --staged` is empty, also run:

```bash
git diff
```

## Step 2 — Analyse the diff

- Identify the primary intent: new feature, bug fix, refactor, docs, config, test, chore, etc.
- Note which files changed and the scope of change.
- If there are no changes at all (empty `git status`), tell the user and stop.

## Step 3 — Study the project's commit style

From `git log`, infer:
- Capitalisation (sentence case vs lower-case first word)
- Tense (imperative "Add …" vs past "Added …")
- Whether scope prefixes like `feat:` / `fix:` are used
- Typical length and detail level

Match that style in your draft.

## Step 4 — Draft a commit message

Write a message that:
- Summarises the *what* and *why* in the first line (≤ 72 chars)
- Adds a short body paragraph only when the change is large or non-obvious (skip it for small/obvious changes)
- Does NOT start with a bullet list, emoji, or meta-commentary
- Ends with: `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`

Show the draft to the user as a code block.

## Step 5 — Confirm and commit

Ask the user: **"Commit with this message? (yes / edit / cancel)"**

- **yes** — run the commit (see below)
- **edit** — ask the user to provide the edited message, then commit with that
- **cancel** — stop without committing

To commit, stage any unstaged files the user wants included (ask if ambiguous), then run:

```bash
git commit -m "$(cat <<'EOF'
<message here>
EOF
)"
```

Report the resulting commit hash.
