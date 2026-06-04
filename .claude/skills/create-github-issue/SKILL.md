---
name: create-github-issue
description: Create a GitHub issue from a bug or problem description found during testing.
---

# Create GitHub Issue Skill

You are executing the `/create-github-issue` skill. This skill creates a GitHub issue with the problem description provided as an argument. It is called manually when you find a bug during testing (e.g., after running `/playwright-ui` or other verification tasks).

## Accepted Arguments

```
/create-github-issue Login redirects to blank page after OAuth callback
/create-github-issue Board DnD drops card in wrong lane on Firefox
/create-github-issue {free-text description of the issue}
```

If no argument is provided, you will prompt the user for a title and optional details.

---

## Step 1 — Validate GitHub MCP Availability

Attempt to use the GitHub MCP tool (e.g., by checking if `mcp__github__create_issue` is available). If the GitHub MCP server is not available:

- Print: `GitHub MCP not available — set GITHUB_PAT env var and restart Claude Code.`
- Return early. Do not continue.

---

## Step 2 — Parse Arguments

Read `$ARGUMENTS`. This is the user's description of the issue.

- **If `$ARGUMENTS` is non-empty:** use it as the issue description.
- **If `$ARGUMENTS` is empty:** prompt the user via `AskUserQuestion`:
  ```
  Enter the issue title or description:
  ```
  Use the user's response as the issue description.

Store the description in a variable (e.g., `issueDescription`).

---

## Step 3 — Gather Context

Run the following shell commands **in parallel**:

```bash
git branch --show-current              # → currentBranch
git remote get-url origin              # → remoteUrl (e.g., https://github.com/owner/repo.git)
date -u +"%Y-%m-%dT%H:%M:%SZ"           # → timestamp
```

From `remoteUrl`, extract `owner` and `repo`:
- Pattern: `https://github.com/owner/repo.git` or `git@github.com:owner/repo.git`
- Extract `owner` and `repo` (last two path segments, `.git` suffix stripped)

If extraction fails (e.g., not a GitHub repo), print an error and return.

---

## Step 4 — Prompt User to Confirm Details

Use `AskUserQuestion` to confirm before creating the issue:

**Question 1: Issue Title** (single-select, required)
- Label: "Title"
- Options:
  - Suggested title (first sentence or up to 72 chars of `issueDescription`), marked as "(Recommended)"
  - "Custom title" — if selected, prompt for custom text
- Store the chosen title in `issueTitle`

**Question 2: Labels** (multi-select, optional)
- Label: "Labels"
- Options (multi-select):
  - `bug` (selected by default)
  - `enhancement`
  - `ui`
  - `backend`
  - `database`
  - `documentation`
- Allow the user to select multiple. Store selected labels in `issueLabels` (default: `["bug"]` if none selected).

---

## Step 5 — Create the Issue via GitHub MCP

Call `mcp__github__create_issue` with the following parameters:

```
owner: {owner}
repo: {repo}
title: {issueTitle}
body: |
  ## Description
  {issueDescription}

  ## Environment
  - Branch: {currentBranch}
  - Date: {timestamp}
  - Reported via: `/create-github-issue` skill
labels: {issueLabels}
```

Store the response (which includes the issue URL) in a variable (e.g., `issueResponse`).

---

## Step 6 — Print Success and Issue URL

If the MCP call succeeds, print:

```
✅ GitHub issue created:
{issueResponse.html_url}
```

Example:
```
✅ GitHub issue created:
https://github.com/anthropics/claude-code/issues/42
```

If the MCP call fails, print a detailed error message and the reason.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "GitHub MCP not available" | Set `GITHUB_PAT` env var with `repo` scope, then restart Claude Code. Run `npm run build` or reload the Claude Code window. |
| "Could not extract owner/repo from remote URL" | Ensure this is a valid GitHub repository. Check `git remote -v` and confirm the origin URL is a GitHub repo. |
| Issue creation fails with "Bad credentials" | Verify `GITHUB_PAT` is set correctly and has `repo` scope. Test with `gh auth status`. |
| "Repository not found" or "Access denied" | Verify the token has `repo` access to the target repository. |

---

## Session Notes

- The skill is stateless; each invocation is independent.
- Issues are created in the repository derived from `git remote get-url origin`.
- No automatic issue creation — this skill is always called manually.
- The `GITHUB_PAT` env var must be set before starting Claude Code for the GitHub MCP server to initialize.
