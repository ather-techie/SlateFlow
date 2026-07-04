# SlateFlow REST API

Base URL: `http://localhost:3000/api`

All responses share this envelope:

```json
{ "data": <payload | null>, "error": <string | null> }
```

Success → `data` is populated, `error` is `null`.  
Error → `data` is `null`, `error` is a human-readable message.

> **Authentication required:** All endpoints except `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/{google,github}/{start,callback}`, and `GET /api/config` require a valid session. Include `credentials: 'include'` (fetch) or `withCredentials: true` (axios) so the `sf_token` httpOnly cookie is sent automatically.

> **OpenAPI:** A subset (the test-case routes) is published as machine-readable JSON at `GET /api/openapi.json` for tooling integration.

---

## Authentication

SlateFlow supports three login methods, each independently gated by a feature flag:

- `POST /api/auth/login` — email + password (gated by `auth_password`)
- `GET /api/auth/google/start` → `/api/auth/google/callback` — Google OAuth (gated by `auth_google`)
- `GET /api/auth/github/start` → `/api/auth/github/callback` — GitHub OAuth (gated by `auth_github`)

When a flag is disabled (env var `false` or no DB override), the corresponding routes return 404. Toggle flags via `PATCH /api/admin/feature-overrides/:flag` (super_admin only) or via env vars (`FEATURE_AUTH_PASSWORD`, `FEATURE_AUTH_GOOGLE`, `FEATURE_AUTH_GITHUB`).

### Login (email + password)
```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@flow.local","password":"Admin1234!"}'
```
Sets an httpOnly `sf_token` cookie (7-day TTL) on success.  
Response: `{ "data": { "id": 1, "email": "...", "display_name": "Administrator", "role": "super_admin" } }`  
Returns 404 when `auth_password` is disabled.

### Login (Google OAuth)
1. Browser navigates to `GET /api/auth/google/start`. The server generates a random CSRF token, sets it as the short-lived `sf_oauth_state` cookie, and 302-redirects to Google's consent page.
2. Google redirects back to `GET /api/auth/google/callback?code=…&state=…`. The server validates the state cookie, exchanges the code for an access token, fetches the user profile (`sub`, `email`, `email_verified`, `name`), upserts the local user via `user_identities`, sets the `sf_token` cookie, and 302-redirects to `/`.

Configure the Google OAuth Client redirect URI as `<OAUTH_REDIRECT_BASE_URL>/api/auth/google/callback` (default `http://localhost:3000/api/auth/google/callback`).

### Login (GitHub OAuth)
Same flow as Google. Profile is fetched from `https://api.github.com/user` plus `https://api.github.com/user/emails` (the primary verified email is used). Configure the GitHub OAuth App callback URL as `<OAUTH_REDIRECT_BASE_URL>/api/auth/github/callback`.

### OAuth error redirects
On failure, the callback redirects to `/login?error=<reason>` so the LoginPage can surface a toast. Reasons:

| `error` | Meaning |
|---|---|
| `oauth_state_mismatch` | The `sf_oauth_state` cookie was missing/expired or didn't match the `state` query param (possible CSRF / >5 min delay) |
| `email_not_verified` | The provider returned an unverified email; SlateFlow refuses to auto-create or auto-link |
| `oauth_failed` | Code exchange or profile lookup failed (provider error, network, or invalid response) |
| `oauth_misconfigured` | Defense-in-depth: `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` missing at click time. Normally unreachable — the corresponding flag now resolves to `false` when credentials are missing, so the button is hidden and the route 404s instead |
| `account_inactive` | Linked account is soft-deleted or `is_active = 0` |

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
Returns matching active non-deleted users with fields: `id`, `display_name`, `email`, `role`. Limit 20.  
Used by the Add Member modal (project admins can search for users to add to their project; super admins are excluded from results). Role field allows clients to filter out super admins or apply other business logic.
```json
{
  "data": [
    { "id": 2, "display_name": "Alice Smith", "email": "alice@example.com", "role": "global_reader" },
    { "id": 3, "display_name": "Alice Johnson", "email": "alice.j@example.com", "role": "global_reader" }
  ]
}
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

**Role assignment rules:**
- `super_admin` can assign any role (`project_admin`, `contributor`, `reader`) to any project
- `project_admin` can only assign `contributor` or `reader` within their own project(s); cannot assign or modify `project_admin` role
- `project_admin` cannot change their own role and cannot remove themselves from a project

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
Returns `409` if the user already has access — use `PATCH` to update their role.  
Returns `403` if the caller is not `super_admin` and attempts to assign `project_admin` role (only super_admins can assign project admin).

### Update role
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/projects/1/access/2 \
  -H 'Content-Type: application/json' \
  -d '{"role":"reader"}'
```
Returns `403` if:
- Caller attempts to change their own role ("cannot change your own role")
- Caller is not `super_admin` and attempts to assign `project_admin` role (only super_admins can assign project admin)

### Revoke access
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/projects/1/access/2
```
Returns `403` if:
- Caller attempts to remove themselves ("cannot remove yourself from the project")
- Caller is not `super_admin` and attempts to remove a `project_admin` (only super_admins can remove project admins)

Returns `404` if the access entry does not exist.

> **UI:** The Project Admin Panel at `/projects/:id/admin` (accessible to `project_admin` and `super_admin`) exposes all four endpoints above through a user-friendly interface:
> - **Members table:** Editable roles and remove buttons (with restrictions noted above: project_admins can't change their own role, can't manage other project_admins, can't remove themselves)
> - **Add Member modal:** Search field that excludes super_admins and users already in the project; role selector (project_admin option disabled for non-super_admins)
> 
> See [client/src/pages/ProjectAdminPage.tsx](../client/src/pages/ProjectAdminPage.tsx).

---

## Epic Access

Epic-scoped roles (`epic_admin`, `contributor`, `reader`) gate read/write on a single epic and its child features and stories. Layered on top of the global + project roles — an epic role grants narrower permissions when the user is a `global_reader` and has no project-level role.

> **Default Epic exception:** every project's Default Epic (`is_default = 1`) auto-grants `contributor` to every authenticated user. Non-default epics require an explicit access entry.

`super_admin` has implicit access to every epic and is the only role that can grant `epic_admin`.

### List access entries for an epic
```bash
curl -b cookies.txt http://localhost:3000/api/epics/12/access
```
Caller must have `canManageUsers` on the epic (super_admin or `epic_admin`).

### Grant epic access
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/epics/12/access \
  -H 'Content-Type: application/json' \
  -d '{"user_id":3,"role":"contributor"}'
```
`role` is one of `epic_admin`, `contributor`, `reader`. `epic_admin` requires the caller to be `super_admin`. Returns `409` if the user already has an entry — use `PATCH` to change the role.

### Update role
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/epics/12/access/3 \
  -H 'Content-Type: application/json' \
  -d '{"role":"reader"}'
```

### Revoke access
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/epics/12/access/3
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

SlateFlow uses a 6-level hierarchy modelled:

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

### Search stories (typeahead)
```bash
curl -b cookies.txt 'http://localhost:3000/api/projects/1/stories/search?q=login'
```
Returns up to 20 cards whose `title` matches `LIKE %q%` within the project. Empty array when `q` is shorter than 2 characters. Used by the "Add dependency" picker in `CardModal`.

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

## Story Dependencies

Story-to-story `blocks` / `blocked_by` graph backed by the `story_dependencies` table.

### List dependencies for a story
```bash
curl -b cookies.txt http://localhost:3000/api/cards/1/dependencies
```
Response:
```json
{
  "data": {
    "blocks":     [{ "dep_id": 7, "id": 14, "title": "Cleanup task", "priority": "p2", ... }],
    "blocked_by": [{ "dep_id": 5, "id": 9,  "title": "API contract",  "priority": "p1", ... }]
  }
}
```

### Add dependency
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/cards/1/dependencies \
  -H 'Content-Type: application/json' \
  -d '{"target_id":9,"type":"blocked_by"}'
```
`type` is `blocks` (story 1 blocks the target) or `blocked_by` (story 1 is blocked by the target). `target_id === id` returns `400`. Duplicate edge returns `409`.

### Remove dependency
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/dependencies/7
```
The path takes the dependency-row `id`, not a card id.

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

## Roadmap

```bash
curl -b cookies.txt http://localhost:3000/api/projects/1/roadmap
```
Returns the project's epics with `start_date`, `end_date`, `status`, `priority`, `feature_count`, `story_count`, and a nested `features` array (each with its own dates, `story_count`, `done_story_count`). Used by `RoadmapPage` to render the Gantt timeline.

For non-`super_admin` callers, only the Default Epic (`is_default = 1`) and epics with an explicit `epic_access` row for that user are returned.

---

## Reports

### Velocity (story points per sprint)
```bash
curl -b cookies.txt http://localhost:3000/api/projects/1/velocity
```
Returns one row per non-default sprint:
```json
{ "sprint_id": 2, "sprint_name": "Sprint 1", "status": "completed",
  "start_date": "...", "end_date": "...",
  "total_points": 21, "completed_points": 18,
  "total_stories": 8, "completed_stories": 6 }
```
"Completed" means the story is in the lane flagged `is_done_col = 1`.

### Cycle time per lane
```bash
curl -b cookies.txt http://localhost:3000/api/projects/1/cycle-time
```
Returns one row per swim lane: `{ lane_id, lane_name, avg_days, sample_size }`. `avg_days` is the mean number of days a card spent in the lane before moving on, computed from `activity_log` create/move events. `null` when no card has yet exited the lane.

### Capacity (per assignee, for one sprint)
```bash
curl -b cookies.txt 'http://localhost:3000/api/projects/1/capacity?sprint_id=2'
```
`sprint_id` is required. Returns one row per assignee in the sprint: `{ assignee, story_count, story_points }`, ordered by points DESC. Stories without an assignee are bucketed as `"Unassigned"`.

### AI token usage (per day)
```bash
curl -b cookies.txt 'http://localhost:3000/api/projects/1/ai-usage?days=30'
```
Gated by the `ai` and `ai_usage_reporting` feature flags (404 if either is off). `days` defaults to 30. Returns one row per day with usage, oldest first:
```json
{ "date": "2026-06-15", "input_tokens": 4200, "output_tokens": 1100 }
```
Sourced from the `ai_usage` table, populated by every AI provider call (both `complete()` and streaming `stream()` calls) via `logUsage()`.

### CSV export
```bash
# All non-default epics + features + stories in the project (default)
curl -b cookies.txt -o backlog.csv \
  'http://localhost:3000/api/projects/1/export/csv?type=backlog'

# Only stories from one sprint
curl -b cookies.txt -o sprint.csv \
  'http://localhost:3000/api/projects/1/export/csv?type=sprint&sprint_id=2'

# Same as backlog (full hierarchy)
curl -b cookies.txt -o full.csv \
  'http://localhost:3000/api/projects/1/export/csv?type=full'
```
`type` is `backlog` (default), `sprint`, or `full`. Returns `text/csv` with a `Content-Disposition` attachment header. Columns: `ID, Type, Title, Sprint, Epic, Feature, Assignee, Priority, Story Points, Status, Created`.

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
Returns one entry per known flag with `env_enabled` (read from env var), `can_toggle` (false when env explicitly forces `false`), `db_override` (nullable runtime override), `resolved` (effective value), and `configured` (OAuth-only — whether `OAUTH_<PROVIDER>_CLIENT_ID` and `_SECRET` are both set; `null` for non-OAuth flags).
```json
{
  "data": [
    { "flag": "ai", "env_enabled": true, "can_toggle": true, "db_override": null, "resolved": true, "configured": null },
    { "flag": "auth_github", "env_enabled": false, "can_toggle": true, "db_override": true, "resolved": false, "configured": false }
  ],
  "error": null
}
```
When `configured` is `false`, the OAuth flag resolves to `false` even if the env or DB override turns it on — populate `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` in `.env` and restart the server.

### Toggle a feature at runtime
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/admin/feature-overrides/ai \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}'
```
Applies a DB override. The env var remains the hard ceiling — a DB override of `true` has no effect when `FEATURE_AI=false`. Returns the full updated flag list (same shape as GET).

---

## AI (requires `FEATURE_AI=true`)

All AI routes return `404` when the master `ai` feature flag is disabled, regardless of auth. The endpoint groups further below (digests, writing assist, planning assist, project chat) are **additionally** gated by a per-group flag — `ai_ceremony_digests`, `ai_writing_assist`, `ai_planning_assist`, `ai_project_chat` (env vars `FEATURE_AI_CEREMONY_DIGESTS` etc., overridable in Admin → Settings). Both the master flag **and** the group flag must resolve to `true`, otherwise the route returns `404`.

All `/api/ai/*` routes are rate-limited to **30 requests per minute per user**; beyond that they return `429` with `{ "data": null, "error": "too many requests" }`.

### Summarize a story card
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/cards/1/summarize
```
Fetches the card's title and description, passes them to the configured AI provider, and returns a one-paragraph summary.
```json
{ "data": { "summary": "This card tracks…" }, "error": null }
```

### Parse natural language input into work item
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/parse-item \
  -H "Content-Type: application/json" \
  -d '{
    "input": "High-priority story for alice: fix authentication overhaul",
    "context": { "projectId": 1, "allowedTypes": ["story", "task", "epic", "feature"] }
  }'
```
Parses a natural-language work item request and returns a structured result with an inferred type and extracted fields. The server scopes its AI system prompt to only return types in `allowedTypes`; unrecognized or ambiguous requests return `type: "unknown"` with a reason.

Request:
- `input` (string, 1–1000 chars, required): the user's work item description
- `context` (object, optional):
  - `projectId` (number): context for the request (used when type is epic, feature, story, task, sprint, or calendar)
  - `epicId` (number): for nested creation context
  - `laneId` (number): default lane for a story
  - `allowedTypes` (array of `"epic"|"feature"|"story"|"task"|"project"|"sprint"|"calendar"`, optional): scope the parser to only these types

Response (`200`):
```json
{
  "data": {
    "type": "story",
    "payload": {
      "title": "Fix authentication overhaul",
      "description": "Backend authentication layer needs a complete refactor to support modern OAuth flows.",
      "priority": "high",
      "assignee": "alice",
      "estimate": null
    }
  },
  "error": null
}
```

Possible `type` values and payload shapes:
- `"epic"` / `"feature"`: `{ title, description, priority, assignee }`
- `"story"`: `{ title, description, priority, assignee, estimate }`
- `"task"`: `{ title, description, assignee }`
- `"project"`: `{ name, description }`
- `"sprint"`: `{ name, goal, start_date (YYYY-MM-DD), end_date }`
- `"calendar"`: `{ title, description, start_date (YYYY-MM-DD), end_date }`
- `"unknown"`: `{ reason }`

The client displays the parsed result in an editable preview card before confirming creation.

### Ceremony Digests (group flag `ai_ceremony_digests`)

Digests are markdown summaries generated by the AI provider and persisted in the `ai_digests` table. `GET` endpoints return the latest saved digest **without** calling the AI provider; `POST` endpoints generate a fresh one and save it.

#### Get latest sprint-health digest
```bash
curl -b cookies.txt http://localhost:3000/api/ai/sprints/12/digest
```
Returns the most recently saved sprint-health digest for the sprint. No AI call is made. Both fields are `null` when no digest has been generated yet.
```json
{ "data": { "digest": "## Sprint Health\n\nThe sprint is 60% elapsed…", "generated_at": "2026-06-10T09:30:00.000Z" }, "error": null }
```
Errors: `400` invalid sprint id · `404` sprint not found.

#### Generate a sprint-health digest
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/sprints/12/digest
```
Collects sprint metrics server-side (point totals, per-lane cycle time, per-assignee capacity vs. assigned points, stalled cards idle ≥ 3 days) and asks the AI provider for a markdown sprint-health digest. The result is persisted to `ai_digests` and returned:
```json
{ "data": { "digest": "## Sprint Health\n\n…", "generated_at": "2026-06-11T08:00:00.000Z" }, "error": null }
```
Errors: `400` invalid sprint id · `404` sprint not found · `409` default sprint (`cannot generate a digest for the default sprint`) · `500` AI provider error.

#### Get latest standup digest
```bash
curl -b cookies.txt http://localhost:3000/api/ai/projects/1/standup-digest
```
Same response shape as the sprint digest `GET` (`digest` / `generated_at`, both `null` if never generated). Errors: `400` invalid project id · `404` project not found.

#### Generate a standup digest
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/projects/1/standup-digest \
  -H 'Content-Type: application/json' \
  -d '{ "hours": 24, "stale_days": 2 }'
```
Request (all fields optional; an empty body is fine):
- `hours` (integer, 1–168, default `24`): activity window — how far back to look at activity log entries and comments
- `stale_days` (integer, 1–30, default `2`): idle threshold for flagging stalled cards

Builds a markdown digest of the last *N* hours of card activity and comments, stalled cards, and over-capacity assignees in the active sprint, then persists it. Response shape is the same `{ digest, generated_at }` as above.

Errors: `400` invalid project id · `404` project not found · `422` validation error (e.g. `hours` out of range) · `500` AI provider error.

#### Synthesize a retrospective
> Also requires `FEATURE_RETROSPECTIVE` — the route 404s when either `ai_ceremony_digests` or `retrospective` is off.
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/retrospectives/4/synthesize
```
Clusters the retro's items into themes, suggests action items, and reviews the previous sprint's action items for follow-through (using this sprint's notes as evidence). `item_ids` are validated server-side — only ids of real items on this retrospective survive.
```json
{
  "data": {
    "themes": [
      { "title": "CI reliability", "category": "to_improve", "item_ids": [17, 21] }
    ],
    "suggested_actions": [
      { "body": "Add retry logic to the flaky integration suite" }
    ],
    "previous_actions_review": [
      { "body": "Speed up code review turnaround", "status": "partially", "evidence": "Two notes praise faster reviews, one still flags delays" }
    ]
  },
  "error": null
}
```
- `themes[].category`: `"went_well"` | `"to_improve"`
- `previous_actions_review[].status`: `"addressed"` | `"partially"` | `"not_addressed"` | `"unknown"`

Errors: `400` invalid retrospective id, or retrospective has no items to synthesize · `404` retrospective not found · `500` AI provider error.

### Writing Assist (group flag `ai_writing_assist`)

Both endpoints require epic-level read access on the card (via its feature's epic); otherwise `403`.

#### Generate acceptance criteria
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/cards/42/generate-acceptance-criteria
```
Generates Given/When/Then acceptance criteria from the card's title and description.
```json
{
  "data": {
    "criteria": [
      { "given": "a logged-in user on the board", "when": "they drag a card to the Done lane", "then": "the card's status updates and the burndown reflects it" }
    ]
  },
  "error": null
}
```
Errors: `400` invalid card id · `403` no epic read access · `404` card not found · `500` AI provider error / unparseable response.

#### Summarize a card's comment thread
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/cards/42/summarize-comments
```
Summarizes the card's most recent 50 comments (read oldest-first) into a short summary plus extracted decisions and open questions.
```json
{
  "data": {
    "summary": "The thread converged on using optimistic UI updates…",
    "decisions": ["Use optimistic updates with rollback on SSE conflict"],
    "open_questions": ["Who owns the migration for the new index?"]
  },
  "error": null
}
```
Errors: `400` invalid card id, or the card has fewer than 5 comments (`thread too short to summarize`) · `403` no epic read access · `404` card not found · `500` AI provider error.

### Planning Assist (group flag `ai_planning_assist`)

The card-scoped endpoints require epic-level read access on the card; otherwise `403`. All AI output referencing cards or users is validated server-side against real rows — hallucinated ids are dropped.

#### Suggest an assignee for a card
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/cards/42/suggest-assignee
```
Considers project members' skills, current sprint load vs. capacity, and vacations during the active sprint, and returns up to 3 ranked suggestions. Suggestions are validated against real project members (canonical display name is substituted server-side).
```json
{
  "data": {
    "suggestions": [
      { "user_id": 5, "assignee": "Alice Johnson", "confidence": "high", "reason": "Auth/SQL skills match; 3 pts under capacity" }
    ]
  },
  "error": null
}
```
- `confidence`: `"high"` | `"medium"` | `"low"`

Errors: `400` invalid card id, card has no resolvable project, or project has no members · `403` no epic read access · `404` card not found · `500` AI provider error / no valid suggestions.

#### Suggest a story-point estimate for a card
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/cards/42/suggest-estimate
```
Estimates the card against up to 30 recently completed, estimated stories from the same project, using the project's observed point scale (falls back to `1, 2, 3, 5, 8, 13`). `comparables` are validated against real completed cards (max 3; title and points come from the DB, not the model).
```json
{
  "data": {
    "points": 5,
    "confidence": "medium",
    "rationale": "Similar scope to the two API-refactor stories, both 5 pts",
    "comparables": [
      { "card_id": 31, "title": "Refactor auth middleware", "points": 5 }
    ]
  },
  "error": null
}
```
Errors: `400` invalid card id or card has no resolvable project · `403` no epic read access · `404` card not found · `500` AI provider error.

#### Plan a sprint from the backlog
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/projects/1/plan-sprint \
  -H 'Content-Type: application/json' \
  -d '{ "sprint_id": 12 }'
```
Request: `sprint_id` (positive integer, required) — must be a sprint of this project in `planned` status.

Proposes a sprint scope from the backlog (up to 50 cards) considering average velocity over the last 5 completed sprints, member capacity, vacations in the sprint window, and card dependencies. `proposed[].card_id` values are validated against the real backlog (titles/points come from the DB; duplicates dropped).
```json
{
  "data": {
    "recommended_points": 21,
    "rationale": "Average velocity is 23 pts; two members are partially on vacation",
    "proposed": [
      { "card_id": 88, "title": "Bulk edit for labels", "points": 5, "reason": "High priority, unblocks #91" }
    ],
    "risks": ["#91 depends on #88 — sequence them early"]
  },
  "error": null
}
```
Errors: `400` invalid project id, or backlog is empty · `404` project or sprint not found · `409` sprint is the default sprint, or sprint is not in `planned` status · `422` body validation error · `500` AI provider error / no valid proposals.

#### Groom the backlog
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/ai/projects/1/groom-backlog
```
Analyzes up to 60 backlog cards for likely duplicates, vague descriptions, and a suggested priority order. `stale` is computed deterministically server-side (cards idle ≥ 30 days), not by the model. All card ids in `duplicates`, `vague`, and `priority_order` are validated against the real backlog.
```json
{
  "data": {
    "duplicates": [
      { "card_ids": [12, 47], "reason": "Both describe export-to-CSV for reports" }
    ],
    "vague": [
      { "card_id": 53, "issue": "No acceptance criteria or scope", "suggested_description": "As a project admin, I want…" }
    ],
    "priority_order": [88, 12, 53],
    "stale": [
      { "card_id": 9, "title": "Dark mode", "last_activity_days": 92 }
    ],
    "notes": "Backlog is healthy overall; consider closing the stale items."
  },
  "error": null
}
```
Errors: `400` invalid project id, or backlog is empty · `404` project not found · `500` AI provider error.

### Project Chat (group flag `ai_project_chat`)

#### Chat with project context (streaming)

> **This endpoint streams `text/event-stream` and does NOT use the standard `{ data, error }` envelope.** It is the only AI endpoint that departs from the envelope. Pre-stream failures (invalid id, missing project, validation) still return the normal JSON envelope with the codes below; once streaming starts, errors arrive as an SSE `error` event instead.

```bash
curl -b cookies.txt -N -X POST http://localhost:3000/api/ai/projects/1/chat \
  -H 'Content-Type: application/json' \
  -d '{ "messages": [ { "role": "user", "content": "What is at risk in the current sprint?" } ] }'
```
Request:
- `messages` (array, 1–20 items, required): conversation history
  - `role`: `"user"` | `"assistant"` — a client-supplied `"system"` role is **rejected** with `422` (the server owns the system prompt)
  - `content` (string, 1–4000 chars)
  - The **last** message must have `role: "user"`. Only the most recent 12 messages are sent to the model.

The reply is grounded in an RBAC-filtered project context bundle — the response only reflects epics and cards the requesting user can read.

Response (`200`, `Content-Type: text/event-stream`) — SSE events:

| Event | Data | Meaning |
|---|---|---|
| `token` | `{"text": "..."}` | One model token chunk; concatenate `text` values in order (JSON-encoded so newlines survive SSE framing) |
| `done` | `{}` | Stream finished successfully |
| `error` | `{"message": "..."}` | AI provider failed mid-stream; terminal |

```
event: token
data: {"text":"The sprint is "}

event: token
data: {"text":"at risk because…"}

event: done
data: {}
```

Errors (JSON envelope, before the stream starts): `400` invalid project id or unparseable body · `404` project not found · `422` validation error (empty/oversized messages, more than 20 items, disallowed role, last message not from the user).

---

## Retrospectives

> All endpoints are gated by `FEATURE_RETROSPECTIVE`. When the flag is off they return `404`.

Retrospectives are per-sprint. Each retro has three fixed categories: `went_well`, `to_improve`, `action`. The retro is auto-created on first read for a sprint.

### Get retrospective for a sprint
```bash
curl -b cookies.txt http://localhost:3000/api/sprints/12/retrospective
```
```json
{
  "data": {
    "retrospective": { "id": 4, "sprint_id": 12, "created_at": "...", "updated_at": "..." },
    "items": [
      { "id": 17, "retrospective_id": 4, "category": "went_well", "body": "Fast deploy", "position": 0, "author_id": 3, "created_at": "...", "updated_at": "..." }
    ]
  },
  "error": null
}
```

### Add an item
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/retrospectives/4/items \
  -H 'Content-Type: application/json' \
  -d '{ "category": "to_improve", "body": "Flaky CI" }'
```
Requires `canWrite` on the parent project.

### Update an item
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/retrospective-items/17 \
  -H 'Content-Type: application/json' \
  -d '{ "body": "Fast deploy (kudos to release crew)", "category": "went_well", "position": 0 }'
```
All fields optional; supplying `category` or `position` moves the note within / across columns.

### Delete an item
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/retrospective-items/17
```

### Reorder a column
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/retrospectives/4/reorder \
  -H 'Content-Type: application/json' \
  -d '{ "category": "went_well", "item_ids": [22, 17, 19] }'
```
All `item_ids` must belong to the retrospective AND the given category. Server returns the full reordered list.

---

## Calendar

> All endpoints are gated by `FEATURE_CALENDAR`. When the flag is off they return `404`. Holiday admin endpoints additionally require `super_admin`.

The calendar surfaces existing scheduled work (sprints, epics with dates, features with dates) alongside three user-managed entry kinds:

| `kind` | Scope | Who can manage |
|---|---|---|
| `holiday` | Global (no project) | super_admin |
| `event` | Project-scoped | `canWrite` on project (project_admin / contributor / super_admin) |
| `vacation` | User-owned | self, plus any project_admin or super_admin |

### Get the calendar for a project + date range
```bash
curl -b cookies.txt 'http://localhost:3000/api/projects/1/calendar?from=2026-05-01&to=2026-05-31'
```
Returns every item that overlaps the requested range:
```json
{
  "data": {
    "sprints": [{ "id": 12, "name": "Sprint 12", "start_date": "2026-05-05", "end_date": "2026-05-19", "status": "active" }],
    "epics":   [{ "id": 8, "title": "Auth", "start_date": "2026-04-15", "end_date": "2026-06-10", "status": "active", "priority": "p1" }],
    "features":[{ "id": 14, "title": "SSO", "start_date": "2026-05-02", "end_date": "2026-05-22", "status": "active", "priority": "p2", "epic_id": 8 }],
    "holidays":[{ "id": 1,  "title": "Memorial Day", "start_date": "2026-05-25", "end_date": "2026-05-25", "color": null, "description": null, "created_by": 1, "created_at": "..." }],
    "events":  [{ "id": 22, "project_id": 1, "title": "Demo day", "start_date": "2026-05-15", "end_date": "2026-05-15", "color": null, "description": null, "created_by": 3, "created_at": "..." }],
    "vacations":[{ "id": 31, "user_id": 4, "title": "Alex on vacation", "start_date": "2026-05-12", "end_date": "2026-05-16", "color": null, "description": null, "created_by": 4, "created_at": "...", "user_display_name": "Alex Chen", "user_email": "alex@example.com" }]
  },
  "error": null
}
```
Epics are filtered by `epic_access` for non-super-admins; default epics are always visible.

### Create a project event
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/projects/1/calendar/events \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Demo day", "start_date": "2026-05-15", "end_date": "2026-05-15", "description": "Stakeholder demo", "color": "#d97706" }'
```

### Update an event
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/calendar/events/22 \
  -H 'Content-Type: application/json' \
  -d '{ "end_date": "2026-05-16" }'
```

### Delete an event
```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/calendar/events/22
```

### Create a vacation
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/vacations \
  -H 'Content-Type: application/json' \
  -d '{ "start_date": "2026-05-12", "end_date": "2026-05-16" }'
```
`user_id` defaults to the caller. To create a vacation for someone else, super_admin or any project_admin can pass `"user_id": 4` in the body. `title` defaults to `"<display_name> on vacation"`.

### Update / delete a vacation
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/vacations/31 \
  -H 'Content-Type: application/json' \
  -d '{ "end_date": "2026-05-17" }'
curl -b cookies.txt -X DELETE http://localhost:3000/api/vacations/31
```
Owner OR project_admin / super_admin only.

### Create a global holiday (super_admin)
```bash
curl -b cookies.txt -X POST http://localhost:3000/api/admin/holidays \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Memorial Day", "start_date": "2026-05-25", "end_date": "2026-05-25" }'
```

### Update / delete a holiday (super_admin)
```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/admin/holidays/1 \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Memorial Day (US)" }'
curl -b cookies.txt -X DELETE http://localhost:3000/api/admin/holidays/1
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
