# SlateFlow REST API

Base URL: `http://localhost:3000/api`

All responses share this envelope:

```json
{ "data": <payload | null>, "error": <string | null> }
```

Success → `data` is populated, `error` is `null`.  
Error → `data` is `null`, `error` is a human-readable message.

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

## Cards

### List cards in a lane
```bash
curl http://localhost:3000/api/lanes/1/cards
```
Cards are ordered by `position` ascending.

### Create card
```bash
curl -X POST http://localhost:3000/api/lanes/1/cards \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Fix login bug",
    "priority": "p0",
    "story_points": 3,
    "assignee": "alice",
    "sprint_id": 2
  }'
```
Optional fields: `priority` (`p0`–`p3`, default `p2`), `story_points`, `assignee`, `sprint_id` (integer — attaches the card to a sprint; `null` means backlog).

### Get card
```bash
curl http://localhost:3000/api/cards/1
```

### Update card fields
```bash
curl -X PATCH http://localhost:3000/api/cards/1 \
  -H 'Content-Type: application/json' \
  -d '{"priority":"p1","assignee":"bob","story_points":5}'
```
Any subset of: `title`, `description`, `priority`, `story_points`, `assignee`, `sprint_id`.

### Move card (change lane / reorder)
```bash
curl -X PATCH http://localhost:3000/api/cards/1/move \
  -H 'Content-Type: application/json' \
  -d '{"lane_id":2,"position":0}'
```
`position` is optional (defaults to end of target lane). Logs an `activity_log` entry.

### Delete card
```bash
curl -X DELETE http://localhost:3000/api/cards/1
```

---

## Sprints

### List sprints for a project
```bash
curl http://localhost:3000/api/projects/1/sprints
```

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
Deletes the sprint and sets `sprint_id = NULL` on all assigned cards (moves them to the backlog). Returns `{ "data": { "id": 1 }, "error": null }`.

### List cards in a sprint
```bash
curl http://localhost:3000/api/sprints/1/cards
```

### Backlog (cards with no sprint)
```bash
curl http://localhost:3000/api/projects/1/backlog
```
Returns all cards for the project where `sprint_id IS NULL`, enriched with `column_name` and `column_color` sourced from the card's swim lane (or legacy column). Supports both new cards (created via `POST /lanes/:id/cards`) and legacy cards (created via `POST /columns/:id/cards`).

**Create a backlog card** — post to the card's target swim lane with no `sprint_id`:
```bash
curl -X POST http://localhost:3000/api/lanes/1/cards \
  -H 'Content-Type: application/json' \
  -d '{"title":"Investigate auth bug","priority":"p1"}'
```

**Update a backlog card** (title, description, priority, story_points, assignee):
```bash
curl -X PATCH http://localhost:3000/api/cards/42 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Renamed","priority":"p0","story_points":3}'
```

**Move a backlog card to a sprint**:
```bash
curl -X PATCH http://localhost:3000/api/cards/42 \
  -H 'Content-Type: application/json' \
  -d '{"sprint_id":7}'
```

**Delete a backlog card**:
```bash
curl -X DELETE http://localhost:3000/api/cards/42
```

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

## Error codes

| Status | Meaning                            |
|--------|------------------------------------|
| 400    | Bad request / invalid ID           |
| 404    | Resource not found                 |
| 409    | Conflict (e.g. deleting a lane with cards) |
| 422    | Validation error (zod)             |
| 500    | Server error                       |
