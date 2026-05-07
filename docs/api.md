# SlateFlow REST API

Base URL: `http://localhost:3000/api`

All responses share this envelope:

```json
{ "data": <payload | null>, "error": <string | null> }
```

Success → `data` is populated, `error` is `null`.  
Error → `data` is `null`, `error` is a human-readable message.

> **Authentication required:** All endpoints except `POST /api/auth/login` and `POST /api/auth/logout` require a valid session. Include `credentials: 'include'` (fetch) or `withCredentials: true` (axios) so the `sf_token` httpOnly cookie is sent automatically.

---

## Authentication

### Login
```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@flow.local","password":"Admin1234!"}'
```
Sets an httpOnly `sf_token` cookie (7-day TTL) on success.  
Response: `{ "data": { "id": 1, "email": "...", "display_name": "Administrator", "role": "super_admin" } }`

### Logout
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```
Clears the `sf_token` cookie.

### Get current user
```bash
curl -b cookies.txt http://localhost:3000/api/auth/me
```
Returns the current user object including `project_access` array:
```json
{
  "data": {
    "id": 1, "email": "admin@flow.local", "display_name": "Administrator",
    "role": "super_admin",
    "project_access": [{ "project_id": 1, "role": "project_admin" }]
  }
}
```

### Update own profile / password
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/auth/me \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"New Name","current_password":"Admin1234!","new_password":"NewPass99!"}'
```

---

## Users (Super Admin only)

### List users
```bash
curl -b cookies.txt http://localhost:3000/api/users
```

### Search users (typeahead)
```bash
curl -b cookies.txt 'http://localhost:3000/api/users/search?q=alice'
```

### Create user
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","display_name":"Alice Smith","password":"Secret1234!","role":"global_reader"}'
```
`role` must be `global_reader` (default) or `super_admin`. To assign project-level roles (`project_admin`, `contributor`, `reader`) at creation time, call `POST /projects/:id/access` immediately after with the new user's `id`. The Admin Panel's Create User modal does this automatically.

### Update user
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/users/2 \
  -H 'Content-Type: application/json' \
  -d '{"role":"super_admin","is_active":true}'
```

### Soft-delete user (preserves history)
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/users/2
```

### Get project access for a user
```bash
curl -b cookies.txt http://localhost:3000/api/users/2/project-access
```
Returns **all** projects with this user's assigned role (`null` = no project-level access, user falls back to global reader):
```json
{
  "data": [
    { "project_id": 1, "project_name": "Alpha", "role": "contributor" },
    { "project_id": 2, "project_name": "Beta", "role": null }
  ]
}
```
Super Admin only. Used by the Admin Panel "Project Access" modal and the Create User modal's project assignment panel.

---

## Project Access

Project-scoped roles (`project_admin`, `contributor`, `reader`) are managed per user–project pair.  
`super_admin` can assign any role to any project. `project_admin` can only assign `contributor` or `reader` within their own project(s).

> **Global reader:** All new users default to `global_reader` — read-only access to all projects. A project-level role overrides this for that specific project.

### List access entries for a project
```bash
curl -b cookies.txt http://localhost:3000/api/projects/1/access
```

### Grant access
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/projects/1/access \
  -H 'Content-Type: application/json' \
  -d '{"user_id":2,"role":"contributor"}'
```

### Update role
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/projects/1/access/2 \
  -H 'Content-Type: application/json' \
  -d '{"role":"reader"}'
```

### Revoke access
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/projects/1/access/2
```

---

## Notifications

### List notifications
```bash
curl -b cookies.txt 'http://localhost:3000/api/notifications?unread_only=1'
```

### Mark one as read
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/notifications/12/read
```

### Mark all as read
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/notifications/read-all
```

---

## Real-Time Events (SSE)

```js
const es = new EventSource('/api/events', { withCredentials: true })
es.addEventListener('card:created', e => console.log(JSON.parse(e.data)))
es.addEventListener('card:updated', e => { /* patch local store */ })
es.addEventListener('card:moved',   e => { /* reorder */ })
es.addEventListener('card:deleted', e => { /* remove from UI */ })
es.addEventListener('notification', e => { /* show badge */ })
es.addEventListener('ping', () => {})   // keepalive every 25 s
```

Event names: `card:created`, `card:updated`, `card:moved`, `card:deleted`, `epic:updated`, `notification`.  
Each event's `data` field is a JSON string matching the updated resource shape.

---

## Work-Item Hierarchy

SlateFlow uses a 6-level hierarchy modelled after Azure DevOps:

```
Project
└── Sprint        (time-boxed iteration; stories are always assigned to a sprint)
Epic              (top-level theme or initiative; scoped to a project)
└── Feature       (deliverable within an epic)
    └── Story     (board card that moves across swim lanes)
        └── Task  (sub-item of a story; has to-do / in-progress / done status)
```

| Level   | DB table  | Default item      | Cannot delete default? |
|---------|-----------|-------------------|------------------------|
| Project | `projects`| Default Project   | Yes — returns 409      |
| Sprint  | `sprints` | Default Sprint    | Yes — returns 409      |
| Epic    | `epics`   | Default Epic      | Yes — returns 409      |
| Feature | `features`| Default Feature   | Yes — returns 409      |
| Story   | `cards`   | —                 | —                      |
| Task    | `tasks`   | —                 | —                      |

**Auto-assignment rules:**
- A Story created without `sprint_id` is assigned to the project's **Default Sprint**.
- A Story created without `feature_id` is assigned to the project's **Default Feature**.
- A Feature created without `epic_id` is assigned to the project's **Default Epic**.
- A Task must always have a parent Story (`story_id` is required).

---

## Projects

### List projects
```bash
curl http://localhost:3000/api/projects
```

### Create project
```bash
curl -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Project",
    "description": "Optional description",
    "color": "#6366f1",
    "preset_id": 1
  }'
```
Optional fields: `description`, `color` (hex, default `#6366f1`), `preset_id` (copies lanes from a lane preset), `custom_lanes` (array of lane name strings — used when `preset_id` is omitted).

### Get project
```bash
curl http://localhost:3000/api/projects/1
```

### Update project
```bash
curl -X PATCH http://localhost:3000/api/projects/1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Renamed","color":"#f59e0b"}'
```
Any subset of: `name`, `description`, `color`.

### Delete project
```bash
curl -X DELETE http://localhost:3000/api/projects/1
```
Returns `409` if the project is the Default Project (`is_default = 1`).

---

## Swim Lanes

Swim lanes are the primary board columns. Each project has its own lanes. One lane can be flagged `is_done_col` to mark cards as "done" for burndown/progress calculations.

### List lanes for a project
```bash
curl http://localhost:3000/api/projects/1/lanes
```

### Create lane
```bash
curl -X POST http://localhost:3000/api/projects/1/lanes \
  -H 'Content-Type: application/json' \
  -d '{"name":"In Review","color":"#8b5cf6"}'
```
Optional fields: `color` (hex, default `#6366f1`), `position` (integer, defaults to end).

### Update lane
```bash
# rename
curl -X PATCH http://localhost:3000/api/lanes/2 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Code Review"}'

# mark as done lane
curl -X PATCH http://localhost:3000/api/lanes/3 \
  -H 'Content-Type: application/json' \
  -d '{"is_done_col":true}'

# reorder (0-indexed)
curl -X PATCH http://localhost:3000/api/lanes/2 \
  -H 'Content-Type: application/json' \
  -d '{"position":0}'
```
Any subset of: `name`, `color`, `position`, `is_done_col`.

### Delete lane
```bash
curl -X DELETE http://localhost:3000/api/lanes/2
```
Returns `409` if the lane has cards — move or delete them first.

### Bulk reorder lanes
```bash
curl -X POST http://localhost:3000/api/projects/1/lanes/reorder \
  -H 'Content-Type: application/json' \
  -d '{"ordered_ids":[3,1,2]}'
```
Reassigns `position` values in the given order. All IDs must belong to the project.

---

## Lane Presets

Global lane templates shown during project setup.

### List presets
```bash
curl http://localhost:3000/api/lane-presets
```

---

## Columns (legacy)

The `columns` table is retained for backward compatibility. New projects use swim lanes instead.

### List columns for a project
```bash
curl http://localhost:3000/api/projects/1/columns
```

### Create column
```bash
curl -X POST http://localhost:3000/api/projects/1/columns \
  -H 'Content-Type: application/json' \
  -d '{"name":"Review","color":"#8b5cf6"}'
```
Optional fields: `color` (hex, default `#6366f1`), `position` (integer, defaults to end).

### Rename / reorder column
```bash
curl -X PATCH http://localhost:3000/api/columns/2 \
  -H 'Content-Type: application/json' \
  -d '{"name":"In Review"}'
```

### Delete column
```bash
curl -X DELETE http://localhost:3000/api/columns/2
```

---

## Stories (Cards)

Stories are the board-level work items that move across swim lanes. They map to the `cards` table. Every story belongs to a Feature via `feature_id` — if omitted on creation, the story is automatically assigned to the project's Default Feature.

### List stories in a lane
```bash
curl http://localhost:3000/api/lanes/1/cards
```
Stories are ordered by `position` ascending.

### Create story
```bash
curl -X POST http://localhost:3000/api/lanes/1/cards \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Fix login bug",
    "priority": "p0",
    "story_points": 3,
    "assignee": "alice",
    "sprint_id": 2,
    "feature_id": 5
  }'
```
Optional fields: `priority` (`p0`–`p3`, default `p2`), `story_points`, `assignee`, `sprint_id` (integer — attaches the story to a sprint; `null` means backlog), `feature_id` (integer — links story to a Feature; omit or `null` to auto-assign to the project's Default Feature).

### Get story
```bash
curl http://localhost:3000/api/cards/1
```

### Update story fields
```bash
curl -X PATCH http://localhost:3000/api/cards/1 \
  -H 'Content-Type: application/json' \
  -d '{"priority":"p1","assignee":"bob","story_points":5,"feature_id":3}'
```
Any subset of: `title`, `description`, `priority`, `story_points`, `assignee`, `sprint_id`, `feature_id`.

### Move story (change lane / reorder)
```bash
curl -X PATCH http://localhost:3000/api/cards/1/move \
  -H 'Content-Type: application/json' \
  -d '{"lane_id":2,"position":0}'
```
`position` is optional (defaults to end of target lane). Logs an `activity_log` entry.

### Delete story
```bash
curl -X DELETE http://localhost:3000/api/cards/1
```

---

## Sprints

### List sprints for a project
```bash
curl http://localhost:3000/api/projects/1/sprints
```
Each sprint includes an `is_default` field (0 or 1). The Default Sprint (`is_default = 1`) is created automatically with every project and cannot be deleted.

### Create sprint
```bash
curl -X POST http://localhost:3000/api/projects/1/sprints \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Sprint 1",
    "goal": "Ship the MVP.",
    "start_date": "2026-05-01",
    "end_date": "2026-05-14",
    "status": "planned"
  }'
```
`status` is one of `planned` (default) | `active` | `completed`.

### Update sprint
```bash
curl -X PATCH http://localhost:3000/api/sprints/1 \
  -H 'Content-Type: application/json' \
  -d '{"status":"active"}'
```

### Complete sprint
```bash
curl -X POST http://localhost:3000/api/sprints/1/complete
```
Sets `status = 'completed'`. Idempotent.

### Delete sprint
```bash
curl -X DELETE http://localhost:3000/api/sprints/1
```
Deletes the sprint and sets `sprint_id = NULL` on all assigned cards (moves them to the backlog). Returns `{ "data": { "id": 1 }, "error": null }`. Returns `409` if the sprint is the Default Sprint (`is_default = 1`).

### List cards in a sprint
```bash
curl http://localhost:3000/api/sprints/1/cards
```

### Backlog (stories with no sprint)
```bash
curl http://localhost:3000/api/projects/1/backlog
```
Returns all stories for the project where `sprint_id IS NULL`, enriched with `column_name` and `column_color` sourced from the story's swim lane (or legacy column).

**Create a backlog story** — post to the target swim lane with no `sprint_id`:
```bash
curl -X POST http://localhost:3000/api/lanes/1/cards \
  -H 'Content-Type: application/json' \
  -d '{"title":"Investigate auth bug","priority":"p1"}'
```

**Move a backlog story to a sprint**:
```bash
curl -X PATCH http://localhost:3000/api/cards/42 \
  -H 'Content-Type: application/json' \
  -d '{"sprint_id":7}'
```

---

## Epics

Epics are the top level of the work-item hierarchy. Each epic belongs to a project and can contain multiple Features. Each project has exactly one non-deletable **Default Epic** (`is_default = 1`) that acts as the parent for features created without an explicit epic.

### List epics for a project
```bash
curl http://localhost:3000/api/projects/1/epics
```
Each epic includes `feature_count` and `story_count` (stories under any of its features).

### Create epic
```bash
curl -X POST http://localhost:3000/api/projects/1/epics \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "User Authentication",
    "description": "All login and auth flows",
    "priority": "p1",
    "status": "active",
    "assignee": "alice"
  }'
```
Required: `title`. Optional: `description`, `priority` (`p0`–`p3`, default `p2`), `status` (`new`|`active`|`resolved`|`closed`, default `new`), `assignee`.

### Get epic
```bash
curl http://localhost:3000/api/epics/1
```

### Update epic
```bash
curl -X PATCH http://localhost:3000/api/epics/1 \
  -H 'Content-Type: application/json' \
  -d '{"status":"resolved","priority":"p0"}'
```
Any subset of: `title`, `description`, `priority`, `status`, `assignee`.

### Delete epic
```bash
curl -X DELETE http://localhost:3000/api/epics/1
```
Deleting an epic sets `epic_id = NULL` on its features (features are not deleted). Returns `409` if the epic is the project's Default Epic.

---

## Features

Features are the second level of the hierarchy. Each feature belongs to a project and always to an Epic. A feature contains Stories (cards). Each project has exactly one non-deletable **Default Feature** (`is_default = 1`) that acts as the parent for stories created without an explicit feature.

### List features for a project
```bash
curl http://localhost:3000/api/projects/1/features

# filter by epic
curl http://localhost:3000/api/projects/1/features?epic_id=2
```
Each feature includes `story_count` and `done_story_count` (stories in a lane with `is_done_col = 1`).

### Create feature
```bash
curl -X POST http://localhost:3000/api/projects/1/features \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Login Flow",
    "epic_id": 1,
    "priority": "p1",
    "status": "active",
    "assignee": "bob"
  }'
```
Required: `title`. Optional: `description`, `epic_id` (integer — omit or `null` to auto-assign to the project's Default Epic), `priority`, `status`, `assignee`.

### Get feature
```bash
curl http://localhost:3000/api/features/1
```

### List stories in a feature
```bash
curl http://localhost:3000/api/features/1/stories
```
Returns all stories (cards) with `feature_id` matching this feature.

### Update feature
```bash
curl -X PATCH http://localhost:3000/api/features/1 \
  -H 'Content-Type: application/json' \
  -d '{"epic_id":2,"status":"resolved"}'
```
Any subset of: `title`, `description`, `epic_id` (nullable), `priority`, `status`, `assignee`.

### Delete feature
```bash
curl -X DELETE http://localhost:3000/api/features/1
```
Deleting a feature sets `feature_id = NULL` on its stories (stories are not deleted). Returns `409` if the feature is the project's Default Feature.

---

## Tasks

Tasks are the fourth and lowest level of the work-item hierarchy. Each task belongs to a Story (`story_id` is required and cannot be null). They have a three-state status (`to-do`|`in-progress`|`done`) and are visible both as an inline checklist in the story's CardModal and as an expandable fourth level in the Epics hierarchy view.

### List tasks for a story
```bash
curl http://localhost:3000/api/cards/1/tasks
```
Ordered by `position` ascending.

### Create task
```bash
curl -X POST http://localhost:3000/api/cards/1/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Write unit tests","assignee":"alice","status":"to-do"}'
```
Required: `title`. Optional: `description`, `assignee`, `status` (default `to-do`).

### Update task
```bash
curl -X PATCH http://localhost:3000/api/tasks/5 \
  -H 'Content-Type: application/json' \
  -d '{"status":"done"}'
```
Any subset of: `title`, `description`, `status`, `assignee`.

### Delete task
```bash
curl -X DELETE http://localhost:3000/api/tasks/5
```

### Reorder tasks
```bash
curl -X POST http://localhost:3000/api/cards/1/tasks/reorder \
  -H 'Content-Type: application/json' \
  -d '{"ids":[3,1,2]}'
```
All IDs must belong to the story.

### List all tasks for a project
```bash
curl http://localhost:3000/api/projects/1/tasks
```
Returns all tasks across all stories in the project, each including `story_title`.

---

## Activity

### Card activity
```bash
curl http://localhost:3000/api/cards/1/activity
```
Returns all `activity_log` rows for the card, newest first.

### Project activity
```bash
curl http://localhost:3000/api/projects/1/activity
```
Returns up to 50 most recent activity rows across all cards in the project.

---

## Dashboard

### Aggregate stats
```bash
curl http://localhost:3000/api/dashboard/stats
```
Returns `{ total_projects, active_sprints, open_cards }`.

### All projects with lane card counts
```bash
curl http://localhost:3000/api/dashboard/projects
```
Returns each project with its lanes (including `card_count` per lane), `total_cards`, `open_cards`, and `active_sprint`.

### Recent activity (cross-project)
```bash
curl http://localhost:3000/api/dashboard/activity
```
Returns the 10 most recent activity items across all projects, each annotated with `card_title`, `project_id`, and `project_name`.

---

## Comments

### List comments on a card
```bash
curl http://localhost:3000/api/cards/1/comments
```

### Add comment
```bash
curl -X POST http://localhost:3000/api/cards/1/comments \
  -H 'Content-Type: application/json' \
  -d '{"author":"alice","body":"Reproduced locally — assigning to infra."}'
```

### Delete comment
```bash
curl -X DELETE http://localhost:3000/api/comments/3
```

---

## Labels

Labels are project-scoped tags that can be attached to cards.

### List labels for a project
```bash
curl http://localhost:3000/api/projects/1/labels
```

### Create label
```bash
curl -X POST http://localhost:3000/api/projects/1/labels \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug","color":"#ef4444"}'
```
Optional fields: `color` (hex, default `#6366f1`).

### List labels on a card
```bash
curl http://localhost:3000/api/cards/1/labels
```

### Add a label to a card
```bash
curl -X POST http://localhost:3000/api/cards/1/labels \
  -H 'Content-Type: application/json' \
  -d '{"label_id":3}'
```
Idempotent — adding the same label twice has no effect.

### Remove a label from a card
```bash
curl -X DELETE http://localhost:3000/api/cards/1/labels/3
```

---

## Test Suites

Test suites are project-level groupings for test cases.

### List test suites for a project
```bash
curl http://localhost:3000/api/projects/1/test-suites
```

### Create test suite
```bash
curl -X POST http://localhost:3000/api/projects/1/test-suites \
  -H 'Content-Type: application/json' \
  -d '{"name":"Login flows","description":"All authentication scenarios"}'
```
Optional fields: `description`.

### Update test suite
```bash
curl -X PATCH http://localhost:3000/api/test-suites/1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Auth flows"}'
```
Any subset of: `name`, `description`.

### Delete test suite
```bash
curl -X DELETE http://localhost:3000/api/test-suites/1
```
Test cases belonging to the suite have their `suite_id` set to `null` (they are not deleted).

---

## Test Cases

Test cases live on cards and can optionally be grouped into a test suite.

### List test cases for a card
```bash
curl http://localhost:3000/api/cards/1/test-cases
```
Returns `{ cases, summary }` where `summary` contains counts by status (`total`, `passed`, `failed`, `untested`, `blocked`, `skipped`). Each case includes a `latest_run` object (or `null`).

### Create test case
```bash
curl -X POST http://localhost:3000/api/cards/1/test-cases \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "User can log in with valid credentials",
    "suite_id": 1,
    "priority": "high",
    "test_type": "manual",
    "steps": [
      {"step": "Navigate to /login", "expected": "Login form is shown"},
      {"step": "Enter valid credentials and submit", "expected": "Redirected to dashboard"}
    ],
    "preconditions": "User account exists",
    "expected_result": "User is authenticated",
    "assigned_to": "alice"
  }'
```
Optional fields: `suite_id`, `description`, `priority` (`critical`|`high`|`medium`|`low`, default `medium`), `test_type` (`manual`|`automated`, default `manual`), `steps` (array of `{step, expected}` objects), `preconditions`, `expected_result`, `assigned_to`.

### Get test case (with run history)
```bash
curl http://localhost:3000/api/test-cases/1
```
Returns the test case with a `runs` array (all runs, newest first).

### Update test case
```bash
curl -X PATCH http://localhost:3000/api/test-cases/1 \
  -H 'Content-Type: application/json' \
  -d '{"status":"passed","priority":"critical"}'
```
Any subset of: `title`, `description`, `suite_id` (nullable), `status` (`untested`|`passed`|`failed`|`blocked`|`skipped`), `priority`, `test_type`, `steps`, `preconditions`, `expected_result`, `assigned_to`.

### Delete test case
```bash
curl -X DELETE http://localhost:3000/api/test-cases/1
```

### Reorder test cases on a card
```bash
curl -X POST http://localhost:3000/api/cards/1/test-cases/reorder \
  -H 'Content-Type: application/json' \
  -d '{"ordered_ids":[3,1,2]}'
```
All IDs must belong to the card.

### Bulk status update on a card
```bash
curl -X PATCH http://localhost:3000/api/cards/1/test-cases/bulk-status \
  -H 'Content-Type: application/json' \
  -d '{"ids":[1,2,3],"status":"passed"}'
```
All IDs must belong to the card.

### List all test cases for a project
```bash
curl http://localhost:3000/api/projects/1/test-cases
```
Supports query params to filter: `suite_id`, `status`, `priority`, `test_type`. Each result includes `card_title` and `latest_run`.

---

## Test Runs

Recording a test run updates the parent test case's `status` automatically and logs an `activity_log` entry.

### Record a test run
```bash
curl -X POST http://localhost:3000/api/test-cases/1/runs \
  -H 'Content-Type: application/json' \
  -d '{"status":"passed","notes":"Tested on Chrome 124","run_by":"alice"}'
```
Required: `status` (`passed`|`failed`|`blocked`|`skipped`). Optional: `notes`, `run_by`.

### List runs for a test case
```bash
curl http://localhost:3000/api/test-cases/1/runs
```
Returns runs newest-first.

---

---

## Feature Flags

### Get resolved feature flags (public — no auth required)
```bash
curl http://localhost:3000/api/config
```
Returns enabled/disabled state for all enterprise features. The frontend hydrates this on boot to conditionally render AI controls.
```json
{ "data": { "features": { "ai": false } }, "error": null }
```

---

## Admin Settings (super_admin only)

### List feature overrides
```bash
curl -b cookies.txt http://localhost:3000/api/admin/feature-overrides
```
Returns one entry per known flag with `env_enabled` (read from env var), `db_override` (nullable runtime override), and `resolved` (effective value).
```json
{
  "data": [
    { "flag": "ai", "env_enabled": true, "db_override": null, "resolved": true }
  ],
  "error": null
}
```

### Toggle a feature at runtime
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/admin/feature-overrides/ai \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```
Applies a DB override. The env var remains the hard ceiling — a DB override of `true` has no effect when `FEATURE_AI=false`. Returns the full updated flag list (same shape as GET).

---

## AI (requires `FEATURE_AI=true`)

All AI routes return `404` when the feature flag is disabled, regardless of auth.

### Summarize a story card
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/cards/1/summarize
```
Fetches the card's title and description, passes them to the configured AI provider, and returns a one-paragraph summary.
```json
{ "data": { "summary": "This card tracks…" }, "error": null }
```

---

## Error codes

| Status | Meaning                            |
|--------|------------------------------------|
| 400    | Bad request / invalid ID           |
| 401    | Unauthenticated — no valid session cookie |
| 403    | Forbidden — insufficient role or project access |
| 404    | Resource not found                 |
| 409    | Conflict (e.g. deleting a lane with cards, or deleting a Default Epic/Feature/Sprint/Project) |
| 422    | Validation error (zod)             |
| 500    | Server error                       |
