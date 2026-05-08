# server/CLAUDE.md

Scoped guidance for Claude Code when editing under `server/`. For repo-wide context (RBAC roles, env vars, AI providers), see [../CLAUDE.md](../CLAUDE.md). For the REST API contract, see [../docs/api.md](../docs/api.md).

## Stack

- **Hono 4.5** on Node.js via `@hono/node-server`, listening on `:3000`
- **TypeScript** compiled with `tsc` into `server/dist/` for production
- **better-sqlite3** with WAL mode + foreign keys ON; SQLite file at `DATABASE_PATH`
- **Zod** for every request body / query validation
- **JWT** in httpOnly `sf_token` cookie (7-day expiry, `Lax`, `Secure` in production)
- **bcrypt** for password hashes
- Native `fetch` for AI providers (no vendor SDKs)

## Response envelope

Every handler returns `{ data, error }` via the helpers in [src/lib/response.ts](src/lib/response.ts):

```ts
ok(c, payload)           // 200 + { data: payload, error: null }
ok(c, payload, 201)      // explicit status
err(c, 'message')        // default 400 + { data: null, error: 'message' }
err(c, 'forbidden', 403) // explicit status
zodErr(parsed.error.issues) // formatter for 422 validation errors
parseId(c.req.param('id')) // returns number | null (null = invalid)
```

**Do not** return `c.json(...)` directly — always go through `ok` / `err` so the envelope stays consistent.

## Route registration

Mount order in [src/index.ts](src/index.ts) is load-bearing:

1. `app.use(logger())` and CORS for `http://localhost:5173` (credentials).
2. **Public** routes registered BEFORE `requireAuth`: `/api/auth/*`, `/api/config`, `/api/health`.
3. `app.use('/api/*', requireAuth)` — every subsequent route is authenticated.
4. All resource routes mounted under `/api`.
5. `requireSuperAdmin` is applied per-route inside `routes/users.ts` and `routes/adminSettings.ts` (no global mount).
6. `requireFeature('ai')` is applied per-route inside `routes/ai.ts`; missing/false env hard-blocks the routes (404).

When adding a new public route, register it BEFORE the `requireAuth` line. Otherwise it will silently 401.

## API surface

| File | Exposed paths |
|---|---|
| `routes/auth.ts` | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me` |
| `routes/config.ts` | `GET /config` (public) |
| `routes/projects.ts` | CRUD on `/projects` and `/projects/:id`; auto-creates Default Epic/Feature/Sprint; DELETE→409 for Default Project |
| `routes/lanes.ts` | CRUD on `/projects/:id/lanes` and `/lanes/:id`; bulk `POST /projects/:id/lanes/reorder` |
| `routes/presets.ts` | `GET /lane-presets` |
| `routes/cards.ts` | `/lanes/:id/cards`, `/columns/:id/cards`, `/cards/:id`, `/cards/:id/move`, `/cards/:id/tasks`, `/cards/:id/tasks/reorder`, `/projects/:id/tasks`, `/projects/:id/stories/search?q=` |
| `routes/sprints.ts` | CRUD + `/sprints/:id/complete`, `/sprints/:id/cards`, `/projects/:id/backlog`; DELETE→409 for Default Sprint |
| `routes/epics.ts` | CRUD; list returns `feature_count` + `story_count` + `is_default` |
| `routes/features.ts` | CRUD; list supports `?epic_id=`; auto-assigns Default Epic if `epic_id` omitted; `GET /features/:id/stories` |
| `routes/columns.ts` | Legacy CRUD (retained for backward compatibility) |
| `routes/comments.ts` | CRUD on card comments; emits `notification` for `@mention` |
| `routes/labels.ts` | Project labels + attach/detach on stories |
| `routes/activity.ts` | `GET /cards/:id/activity`, `GET /projects/:id/activity` |
| `routes/dashboard.ts` | `GET /dashboard/stats`, `/dashboard/projects`, `/dashboard/activity` |
| `routes/testcases.ts` | Test suites + cases + runs; bulk status + reorder |
| `routes/dependencies.ts` | `GET/POST /cards/:id/dependencies`, `DELETE /dependencies/:id` (story blocks/blocked-by graph) |
| `routes/roadmap.ts` | `GET /projects/:id/roadmap` (epics + nested features with date ranges) |
| `routes/reports.ts` | `GET /projects/:id/velocity`, `/cycle-time`, `/capacity?sprint_id=`, `/export/csv?type=&sprint_id=` |
| `routes/users.ts` | Super Admin: CRUD + soft-delete + `/users/search?q=` |
| `routes/projectAccess.ts` | Grant/revoke/update project-scoped roles |
| `routes/epicAccess.ts` | `GET/POST /epics/:id/access`, `PATCH/DELETE /epics/:epicId/access/:userId` (epic-level RBAC) |
| `routes/notifications.ts` | List + mark-read |
| `routes/sse.ts` | `GET /events` (EventSource stream) |
| `routes/adminSettings.ts` | Super Admin: `GET/PATCH/DELETE /admin/feature-overrides[/:flag]` |
| `routes/ai.ts` | `POST /ai/cards/:id/summarize` (gated by `FEATURE_AI`) |
| `lib/openapi.ts` | `GET /api/openapi.json` (test-case OpenAPI subset) |

Full request/response shapes + curl examples live in [../docs/api.md](../docs/api.md). Keep that file synced when adding endpoints.

## RBAC helpers

- [lib/projectAccess.ts](src/lib/projectAccess.ts) — `canRead(userId, projectId)` (always true for authenticated users), `canWrite(userId, projectId, globalRole)`, `canManageUsers(userId, projectId, globalRole)`. `super_admin` bypasses all checks.
- [lib/epicAccess.ts](src/lib/epicAccess.ts) — same surface but for epics. `getUserEpicRole` returns `'contributor'` for the **Default Epic** regardless of `epic_access` rows.

Always use these helpers — never query `project_access` / `epic_access` directly inside route handlers.

## Database

Single SQLite file at `DATABASE_PATH` (default `./slateflow.db`). Schema lives in [src/db/schema.sql](src/db/schema.sql). The DB is initialized once on module load by [src/db/index.ts](src/db/index.ts), which also runs the seed + backfill steps (default project / epic / feature / sprint, demo data on a fresh DB, role migration `'member' → 'global_reader'`, lane preset seed, admin user seed).

### Tables (cheat sheet)

| Table | PK | Notable cols / FKs |
|---|---|---|
| `projects` | id | `is_default` (0/1), `color` |
| `users` | id | `email` UNIQUE, `role` (super_admin/global_reader), `password_hash`, `is_active`, `deleted_at` (soft) |
| `project_access` | id | (`user_id`, `project_id`) UNIQUE, `role` (project_admin/contributor/reader) |
| `epic_access` | id | (`user_id`, `epic_id`) UNIQUE, `role` (epic_admin/contributor/reader) |
| `epics` | id | `project_id` FK, `is_default`, `position`, `start_date`, `end_date`, `priority`, `status`, `assignee` |
| `features` | id | `project_id` + `epic_id` FK, `is_default`, `position`, dates, priority, status |
| `sprints` | id | `project_id` FK, `is_default`, status (planned/active/completed), goal, start/end |
| `swim_lanes` | id | `project_id` FK, `position`, `is_done_col` (0/1), `color` |
| `columns` | id | Legacy; retained |
| `cards` (Stories) | id | FKs: `swim_lane_id` (primary), `column_id` (legacy), `sprint_id`, `feature_id`; `priority`, `story_points`, `assignee` |
| `tasks` | id | `story_id` FK → cards, status (to-do/in-progress/done), CASCADE |
| `card_labels` | (card_id, label_id) | join |
| `labels` | id | `project_id` FK, color |
| `comments` | id | `card_id` + `author_id` FKs |
| `activity_log` | id | `card_id` + `user_id` FKs, `action` (create/update/move), `meta` JSON |
| `test_suites` | id | `project_id` FK |
| `test_cases` | id | `suite_id` + `card_id` + `project_id` FKs, `status`, `priority`, `test_type` |
| `test_runs` | id | `test_case_id` + `card_id` FKs, `status` (passed/failed/blocked/skipped) |
| `story_dependencies` | id | (`blocker_id`, `blocked_id`) UNIQUE; both FKs to cards |
| `notifications` | id | `user_id` FK, `type`, `entity_type`, `entity_id`, `is_read`, `message` |
| `feature_overrides` | flag | `enabled` (0/1), `updated_by`, `updated_at` |
| `lane_presets` | id | `lanes` JSON |

Indexes: `notifications(user_id, is_read, created_at DESC)`, `epic_access(user_id, epic_id)`, `project_access(user_id, project_id)`, `story_dependencies(blocker_id, blocked_id)`.

### Migrations

Schema changes go in `schema.sql`. Anything additive on an existing column (e.g., `cards.feature_id`) uses the **try/catch ALTER TABLE** pattern in [src/db/index.ts](src/db/index.ts) so existing dev DBs don't break:

```ts
try { db.exec('ALTER TABLE cards ADD COLUMN feature_id INTEGER REFERENCES features(id)') }
catch (e) { /* column already exists — ignore */ }
```

If you add a new "Default X" concept, also add a backfill step that creates the default for existing rows. Test against a pre-existing dev DB before merging.

## Real-time (SSE)

[lib/eventBus.ts](src/lib/eventBus.ts) is a process-local `EventEmitter`. Route handlers call `eventBus.emit('card:moved', payload)` after a successful mutation. [routes/sse.ts](src/routes/sse.ts) is the only subscriber — it forwards every emitted event onto the `EventSource` stream, plus a `ping` every 25s.

When mutating a board entity, **emit AFTER the DB commit, not before**, so a failed insert never produces a phantom event. Pattern: `await db.run(...)` then `eventBus.emit(...)` then `return ok(c, ...)`.

## AI providers

[lib/ai.ts](src/lib/ai.ts) exposes `getProvider()` — a lazy singleton that dynamically imports the right module based on `AI_PROVIDER`:

| `AI_PROVIDER` | Implementation | Default model |
|---|---|---|
| `claude` | `lib/providers/anthropic.ts` | `claude-sonnet-4-6` |
| `gemini` | `lib/providers/gemini.ts` | `gemini-2.0-flash` |
| `openai` | `lib/providers/openaicompat.ts` | `gpt-4o` |
| `azure` | `lib/providers/openaicompat.ts` | `gpt-4o` (set `AI_BASE_URL` to full deployment URL) |
| `ollama` | `lib/providers/openaicompat.ts` | `llama3` |

Every streaming provider parses SSE via [lib/sseLines.ts](src/lib/sseLines.ts). When adding a new provider, conform to the `AIProvider` interface (`complete` + `stream`) and reuse `sseLines`.

## Patterns to reuse

- **Validation:** every POST/PATCH parses with Zod and returns `err(c, zodErr(...), 422)` on failure.
- **Authorization:** check `c.get('user')` + the appropriate `lib/*Access.ts` helper at the top of write routes. `super_admin` short-circuits to allow.
- **Default-X protection:** any DELETE on a `is_default = 1` row returns `409` with a clear message. Mirror existing handlers in `projects.ts`, `epics.ts`, `features.ts`, `sprints.ts`.
- **Activity log:** every card mutation appends to `activity_log` with a JSON `meta` describing the change. Don't skip this — it powers the Activity tab and cycle-time reports.
- **Mention parsing:** comment creation runs `body.match(/@([\w.-]+)/g)` and resolves matches against `users.display_name` (lowercased, space-stripped) and `users.email` prefix; matches get a `notifications` row + SSE event.
