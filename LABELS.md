# GitHub Label Suggestions

Apply these labels when setting up the repository. Labels marked **good first issue** are specifically suited to new contributors.

## Type labels

| Label | Color | Description |
|-------|-------|-------------|
| `bug` | `#d73a4a` | Something is broken or behaving unexpectedly |
| `enhancement` | `#a2eeef` | New feature or improvement to an existing feature |
| `chore` | `#e4e669` | Maintenance, tooling, dependency updates |
| `documentation` | `#0075ca` | Improvements or additions to docs |
| `question` | `#d876e3` | Further information is requested |

## Priority labels

| Label | Color | Description |
|-------|-------|-------------|
| `priority: high` | `#b60205` | Blocking or critical path |
| `priority: medium` | `#fbca04` | Should be addressed soon |
| `priority: low` | `#0e8a16` | Nice to have, not blocking |

## Status labels

| Label | Color | Description |
|-------|-------|-------------|
| `good first issue` | `#7057ff` | Suitable for first-time contributors |
| `help wanted` | `#008672` | Extra attention or expertise needed |
| `blocked` | `#e4e669` | Waiting on an external dependency or decision |
| `wontfix` | `#ffffff` | Will not be worked on |
| `duplicate` | `#cfd3d7` | This issue or PR already exists |

## Good first issue candidates

When triaging issues, apply `good first issue` to tasks that meet these criteria:

- Isolated to a single file or route (e.g. add a missing API field, fix a typo in UI copy)
- No architectural decisions required
- The expected outcome is clearly defined
- Reproducible in a local dev setup with `npm install && npm run dev`

**Examples of good "good first issue" tasks:**
- Add a missing field to an API response (e.g. `created_at` on cards)
- Fix a UI alignment or colour inconsistency
- Improve an error message in a Zod validation handler
- Add a `PATCH /columns/:id` endpoint to rename a column
- Add keyboard shortcut hint tooltips to action buttons
