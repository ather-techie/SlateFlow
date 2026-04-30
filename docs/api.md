# Liteboard REST API

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
  -d '{"name":"My Project","description":"Optional description"}'
```

### Get project
```bash
curl http://localhost:3000/api/projects/1
```

### Delete project
```bash
curl -X DELETE http://localhost:3000/api/projects/1
```

---

## Columns

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
# rename
curl -X PATCH http://localhost:3000/api/columns/2 \
  -H 'Content-Type: application/json' \
  -d '{"name":"In Review"}'

# reorder (0-indexed)
curl -X PATCH http://localhost:3000/api/columns/2 \
  -H 'Content-Type: application/json' \
  -d '{"position":0}'
```

### Delete column
```bash
curl -X DELETE http://localhost:3000/api/columns/2
```

---

## Cards

### List cards in a column
```bash
curl http://localhost:3000/api/columns/1/cards
```
Cards are ordered by `position` ascending.

### Create card
```bash
curl -X POST http://localhost:3000/api/columns/1/cards \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Fix login bug",
    "description": "Users can not log in with SSO.",
    "priority": "p0",
    "story_points": 3,
    "assignee": "alice"
  }'
```
Optional fields: `description`, `priority` (`p0`–`p3`, default `p2`), `story_points`, `assignee`, `sprint_id`.

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

### Move card (change column / reorder)
```bash
curl -X PATCH http://localhost:3000/api/cards/1/move \
  -H 'Content-Type: application/json' \
  -d '{"column_id":2,"position":0}'
```
`position` is optional (defaults to end of target column). Logs an `activity_log` entry.

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

## Error codes

| Status | Meaning                  |
|--------|--------------------------|
| 400    | Bad request / invalid ID |
| 404    | Resource not found       |
| 422    | Validation error (zod)   |
| 500    | Server error             |
