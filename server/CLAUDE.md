# server/CLAUDE.md

Scoped guidance for Claude Code when editing under `server/`. For repo-wide context (RBAC roles, env vars, AI providers), see [../CLAUDE.md](../CLAUDE.md). For the REST API contract, see [../docs/api.md](../docs/api.md).

## Stack

- **Hono 4.5** on Node.js via `@hono/node-server`, listening on `:3000`
- **TypeScript** compiled with `tsc` into `server/dist/` for production
- **sqlite3** (callback API, promisified in [src/db/index.ts](src/db/index.ts)) with WAL mode + foreign keys ON; SQLite file at `DATABASE_PATH`
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

## MCP Server

`/mcp` (mounted before `requireAuth` in `index.ts` — see [routes/mcp.ts](src/routes/mcp.ts)) exposes 29 tools over the Model Context Protocol via `@modelcontextprotocol/sdk`, authenticated by per-user Bearer tokens issued through `POST /api/mcp/tokens` ([routes/mcpTokens.ts](src/routes/mcpTokens.ts)). Tool schemas, RBAC, and all 29 implementations live in [lib/mcpServer.ts](src/lib/mcpServer.ts).

**Transport:** `WebStandardStreamableHTTPServerTransport` (from `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`) in **stateless mode** (`sessionIdGenerator: undefined`) — not the Node-flavored `StreamableHTTPServerTransport` (wants raw req/res) and not the deprecated `SSEServerTransport`. Every `POST /mcp` request constructs a fresh `Server` + transport pair and calls `transport.handleRequest(c.req.raw)`, returning the `Response` straight to Hono. This is intentional, not a placeholder: MCP tool calls here are independent, per-call RBAC-checked operations with no session lifecycle to manage, and the SDK itself throws if a stateless transport is reused across requests. `GET /mcp` returns 405 (no server-initiated stream in stateless mode); `DELETE /mcp` returns 204 (no session to tear down).

**`enableJsonResponse: true` is required**, not optional — the route closes the transport/server in a `finally` block immediately after `handleRequest()` resolves. Without `enableJsonResponse`, the transport defaults to returning a live SSE stream whose body hasn't finished flushing when that `finally` fires, so the client hangs waiting for a response that never arrives. With it, `handleRequest()`'s promise only resolves once the JSON-RPC response is fully computed, so it's safe to close synchronously afterward.

**User threading:** `createMcpServer(user: McpUser)` takes the authenticated user (set by `validateMcpToken`, which selects `id, email, role, display_name` from `users`) and closes over it when registering the `CallToolRequestSchema` handler, so `callTool` always receives the real caller — never construct `createMcpServer()` without a real user.

**RBAC — stricter than REST by design:** MCP write tools (`create_card`, `update_card`, `move_card`, `delete_card`, `create_test_case`, `update_test_case`, `delete_test_case`, `record_test_run`, `create_sprint`, `update_sprint`, `delete_sprint`) enforce `canWrite`/epic-`canWrite` checks that their equivalent REST routes today do **not** have. This is intentional: MCP calls are typically issued by an LLM agent rather than a human clicking through UI affordances that already implicitly scope access, so the extra explicit gate is deliberate defense-in-depth for this entry point. Do not "fix" this by removing the check to match REST parity — if REST routes later gain the same checks, keep both, don't delete the MCP-side one.

**Default-item filtering diverges from REST:** `list_epics` / `list_features` MCP tools filter out `is_default = 1` rows even though the REST list routes (`epics.ts`, `features.ts`) return them. This matches the "Default Items Visibility" convention (see root CLAUDE.md) and the tools' documented contracts — REST list endpoints stay as-is; do not change them to match.

**`get_card` includes `tasks`:** unlike REST's `GET /cards/:id`, the MCP `get_card` tool additionally returns a `tasks` array (`SELECT * FROM tasks WHERE story_id = ? ORDER BY position, id`). This is a deliberate MCP-only enrichment for agent consumers that want full task-level detail in one call.

**Feature flags:** `read_mcp` / `create_mcp` / `update_mcp` / `delete_mcp` / `report_mcp` gate the five tool buckets (see root CLAUDE.md's feature-flags table). The four calendar tools (`get_calendar`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event`) require **both** their bucket flag and `calendar` — checked centrally in `callTool()`'s dispatcher via a `CALENDAR_TOOLS` set, not duplicated per-handler.

**Adding a new tool:** define its `Tool` schema in the `tools` array, add a zod schema to `TOOL_SCHEMAS` if it takes input, add its name to `TOOL_FLAG_BUCKET`, write the handler function in the matching section of `mcpServer.ts`, register it in `handlers`, and reuse existing route/lib logic verbatim — never duplicate SQL that already exists in `routes/*.ts` or `lib/*.ts`.

## API surface

| File | Exposed paths |
|---|---|
| `routes/auth.ts` | `POST /auth/login` (gated by `auth_password`), `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me` (supports `email_notifications` boolean preference), `GET /auth/google/start` + `/callback` (gated by `auth_google`), `GET /auth/github/start` + `/callback` (gated by `auth_github`). OAuth flow: server-side authorization-code, CSRF-protected via short-lived `sf_oauth_state` cookie, identity stored in `user_identities` |
| `routes/config.ts` | `GET /config` (public) |
| `routes/projects.ts` | CRUD on `/projects` and `/projects/:id`; `PATCH /projects/:id` enforces `canWrite` (contributor or above); auto-creates Default Epic/Feature/Sprint; DELETE→409 for Default Project |
| `routes/lanes.ts` | CRUD on `/projects/:id/lanes` and `/lanes/:id`; bulk `POST /projects/:id/lanes/reorder` |
| `routes/presets.ts` | `GET /lane-presets` |
| `routes/cards.ts` | `/lanes/:id/cards`, `/columns/:id/cards`, `/cards/:id`, `/cards/:id/move`, `/cards/:id/tasks`, `/cards/:id/tasks/reorder`, `/projects/:id/tasks`, `/projects/:id/stories/search?q=`; PATCH supports `due_date` field; assignment changes emit `notification` + email if enabled |
| `routes/sprints.ts` | CRUD + `/sprints/:id/complete`, `/sprints/:id/cards`, `/projects/:id/backlog`; DELETE→409 for Default Sprint |
| `routes/epics.ts` | CRUD; list returns `feature_count` + `story_count` + `is_default` |
| `routes/features.ts` | CRUD; list supports `?epic_id=`; auto-assigns Default Epic if `epic_id` omitted; `GET /features/:id/stories` |
| `routes/columns.ts` | Legacy CRUD (retained for backward compatibility) |
| `routes/comments.ts` | CRUD on card comments; emits `notification` for `@mention` + sends email if `email_notifications` flag enabled and user has opted in |
| `routes/labels.ts` | Project labels + attach/detach on stories |
| `routes/activity.ts` | `GET /cards/:id/activity`, `GET /projects/:id/activity` |
| `routes/dashboard.ts` | `GET /dashboard/stats`, `/dashboard/projects`, `/dashboard/activity` |
| `routes/testcases.ts` | Test suites + cases + runs; bulk status + reorder |
| `routes/dependencies.ts` | `GET/POST /cards/:id/dependencies`, `DELETE /dependencies/:id` (story blocks/blocked-by graph) |
| `routes/roadmap.ts` | `GET /projects/:id/roadmap` (epics + nested features with date ranges) |
| `routes/reports.ts` | `GET /projects/:id/velocity`, `/cycle-time`, `/capacity?sprint_id=`, `/ai-usage?days=` (flags `ai` + `ai_usage_reporting`), `/export/csv?type=&sprint_id=` |
| `routes/users.ts` | Super Admin: CRUD + soft-delete + `/users/search?q=` |
| `routes/projectAccess.ts` | Grant/revoke/update project-scoped roles; POST enforces super_admin-only for `project_admin` assignment; PATCH blocks users from changing own role; DELETE blocks removal of project_admins by non-super_admins and self-removal |
| `routes/epicAccess.ts` | `GET/POST /epics/:id/access`, `PATCH/DELETE /epics/:epicId/access/:userId` (epic-level RBAC) |
| `routes/notifications.ts` | List + mark-read |
| `routes/sse.ts` | `GET /events` (EventSource stream) |
| `routes/adminSettings.ts` | Super Admin: `GET/PATCH/DELETE /admin/feature-overrides[/:flag]` |
| `routes/ai.ts` | Aggregator for all AI routes; applies `requireFeature('ai')` + `aiRateLimiter` to `/ai/*` and mounts the four sub-routers below. Own routes: `POST /ai/cards/:id/summarize`, `POST /ai/parse-item`, `POST /ai/cards/:id/generate-test-cases` (flag `auto_test_case_generation_ai`), `POST /ai/features/:id/generate-stories` (flag `auto_story_generation_ai`). Card/feature routes enforce epic read access via `canReadFeatureEpic` |
| `routes/ai/digests.ts` | Flag `ai_ceremony_digests`: `GET/POST /ai/sprints/:id/digest` (sprint health digest, persisted in `ai_digests`), `GET/POST /ai/projects/:id/standup-digest` (persisted), `POST /ai/retrospectives/:id/synthesize` (also requires `retrospective`) |
| `routes/ai/writing.ts` | Flag `ai_writing_assist`: `POST /ai/cards/:id/generate-acceptance-criteria`, `POST /ai/cards/:id/summarize-comments` (400 below 5 comments) |
| `routes/ai/planning.ts` | Flag `ai_planning_assist`: `POST /ai/cards/:id/suggest-assignee`, `POST /ai/cards/:id/suggest-estimate`, `POST /ai/projects/:id/plan-sprint` (409 unless sprint is `planned`), `POST /ai/projects/:id/groom-backlog`. All model output ids/names validated against the DB before returning |
| `routes/ai/chat.ts` | Flag `ai_project_chat`: `POST /ai/projects/:id/chat` — **streaming SSE response** (`token`/`done`/`error` events), NOT the `{data,error}` envelope. Grounded in the RBAC-filtered bundle from `lib/projectChatContext.ts` |
| `routes/retrospectives.ts` | `GET /sprints/:id/retrospective` (auto-creates), `POST/PATCH/DELETE` on `/retrospectives/:id/items` and `/retrospective-items/:id`, `POST /retrospectives/:id/reorder` (gated by `FEATURE_RETROSPECTIVE`) |
| `routes/calendar.ts` | `GET /projects/:id/calendar?from=&to=` (sprints/epics/features/holidays/events/vacations); event CRUD on `/projects/:id/calendar/events` + `/calendar/events/:id`; vacation CRUD on `/vacations[/:id]`; super-admin holiday CRUD on `/admin/holidays[/:id]` with filtering via `GET /admin/holidays?country=&state_province=` (all gated by `FEATURE_CALENDAR`) |
| `routes/cardLinks.ts` | `GET /cards/:id/links`, `POST /cards/:id/links`, `DELETE /cards/:id/links/:linkId` (authenticated; gated by `github_integration`/`gitlab_integration` per provider) |
| `routes/webhooks.ts` | `POST /webhooks/github` (public; HMAC-SHA256 signature verification), `POST /webhooks/gitlab` (public; token header verification) — consume merged PR/MR events and auto-move linked cards to done lane |
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
| `users` | id | `email` UNIQUE, `role` (super_admin/global_reader), `password_hash`, `is_active`, `deleted_at` (soft), `email_notifications` (opt-out, DEFAULT 1), `skills` (JSON array, DEFAULT '[]') |
| `user_identities` | id | `user_id` FK → users, `provider` (password/google/github), `provider_user_id`; UNIQUE (`provider`, `provider_user_id`) AND (`user_id`, `provider`) — one user may link multiple providers |
| `project_access` | id | (`user_id`, `project_id`) UNIQUE, `role` (project_admin/contributor/reader), `skills` (JSON array, DEFAULT '[]'), `capacity` (nullable INTEGER, story points per sprint) |
| `epic_access` | id | (`user_id`, `epic_id`) UNIQUE, `role` (epic_admin/contributor/reader) |
| `epics` | id | `project_id` FK, `is_default`, `position`, `start_date`, `end_date`, `priority`, `status`, `assignee` |
| `features` | id | `project_id` + `epic_id` FK, `is_default`, `position`, dates, priority, status |
| `sprints` | id | `project_id` FK, `is_default`, status (planned/active/completed), goal, start/end, `velocity_completed_points` (snapshot INT, DEFAULT 0), `velocity_total_points`, `velocity_completed_stories`, `velocity_total_stories` |
| `swim_lanes` | id | `project_id` FK, `position`, `is_done_col` (0/1), `color` |
| `columns` | id | Legacy; retained |
| `cards` (Stories) | id | FKs: `swim_lane_id` (primary), `column_id` (legacy), `sprint_id`, `feature_id`; `priority`, `story_points`, `assignee`, `due_date`, `due_reminder_sent_at` |
| `tasks` | id | `story_id` FK → cards, status (to-do/in-progress/done), `due_date`, `due_reminder_sent_at`, CASCADE |
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
| `card_links` | id | `card_id` FK → cards (CASCADE), `provider` (github/gitlab), `type` (pr/mr/commit/issue), `repo_url`, `number` (nullable), `sha` (nullable), `state` (open/closed/merged), `merged_at`, `created_by` FK → users; moving a card to a done lane auto-closes linked GitHub issues via GitHub API if `GITHUB_TOKEN` is set |
| `lane_presets` | id | `lanes` JSON |
| `retrospectives` | id | `sprint_id` UNIQUE FK → sprints (one retro per sprint, cascade) |
| `retrospective_items` | id | `retrospective_id` FK + `category` (went_well/to_improve/action) + `body` + `position` + `author_id` |
| `calendar_entries` | id | `kind` (holiday/event/vacation), nullable `project_id` (events only) and `user_id` (vacations only), `start_date`, `end_date`, `color`, `country` (nullable, for holidays), `state_province` (nullable, for holidays), `created_by` |
| `ai_digests` | id | `kind` (sprint_health/standup), `project_id` FK (CASCADE), nullable `sprint_id` FK (CASCADE), `content` (markdown), `created_by` FK → users; latest row per (kind, project, sprint) is what GET digest endpoints return |
| `ai_usage` | id | nullable `project_id` FK (CASCADE), nullable `user_id` FK (SET NULL), `provider`, nullable `model`, `endpoint`, `input_tokens`, `output_tokens`; one row per AI provider call, written by `logUsage()`; aggregated by `GET /projects/:id/ai-usage` |

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

Event types currently emitted: `card:created`, `card:updated`, `card:moved`, `card:deleted`, `epic:updated`, `notification` (per-user), `retro:item:created`, `retro:item:updated`, `retro:item:deleted`, `calendar:entry:created`, `calendar:entry:updated`, `calendar:entry:deleted`. The two latter groups carry `projectId: number | null` (calendar entries are global for holidays/vacations).

When mutating a board entity, **emit AFTER the DB commit, not before**, so a failed insert never produces a phantom event. Pattern: `await db.run(...)` then `eventBus.emit(...)` then `return ok(c, ...)`.

## OAuth providers

[lib/oauth/](src/lib/oauth/) holds one module per provider, each conforming to the `OAuthProvider` interface in [lib/oauth/types.ts](src/lib/oauth/types.ts):

```ts
interface OAuthProvider {
  name: 'google' | 'github'
  buildAuthUrl(state: string): string
  exchangeCode(code: string): Promise<OAuthProfile>
  isConfigured(): boolean
}
```

Each provider uses native `fetch` (no `googleapis`/`octokit`/passport). Add a new provider by creating a new module and registering it in the `PROVIDERS` map and route table at the bottom of [routes/auth.ts](src/routes/auth.ts). The `state` cookie name (`sf_oauth_state`), TTL (5 min), and the user-upsert logic in `findOrCreateUser` are shared across providers — reuse them.

`isConfigured()` is a synchronous check that both `OAUTH_<PROVIDER>_CLIENT_ID` and `_CLIENT_SECRET` are set. `featureFlags.isEnabled()` consults it for `auth_google` / `auth_github`, so a flag with missing credentials resolves to false (button hidden, route 404s) even when the env or DB override turns it on. The `oauth_misconfigured` catch in [routes/auth.ts](src/routes/auth.ts) is now a defense-in-depth safety net.

Env vars come from the repo-root `.env` file via [loadEnv.ts](src/loadEnv.ts), which is imported first in [index.ts](src/index.ts).

## AI providers

[lib/ai.ts](src/lib/ai.ts) exposes `getProvider()` — a lazy singleton that dynamically imports the right module based on `AI_PROVIDER`:

| `AI_PROVIDER` | Implementation | Default model |
|---|---|---|
| `claude` | `lib/providers/anthropic.ts` | `claude-sonnet-4-6` |
| `gemini` | `lib/providers/gemini.ts` | `gemini-2.0-flash` |
| `openai` | `lib/providers/openaicompat.ts` | `gpt-4o` |
| `azure` | `lib/providers/openaicompat.ts` | `gpt-4o` (set `AI_BASE_URL` to full deployment URL) |
| `ollama` | `lib/providers/openaicompat.ts` | `llama3` |

Every streaming provider parses SSE via [lib/sseLines.ts](src/lib/sseLines.ts). When adding a new provider, conform to the `AIProvider` interface (`complete` + `stream`) and reuse `sseLines`. Providers must also: issue every request via `fetchWithRetry(url, init, COMPLETE_TIMEOUT_MS | STREAM_TIMEOUT_MS)` instead of raw `fetch` (it retries transient network errors and 429/500/502/503/504 responses with exponential backoff honoring `Retry-After`, and creates a fresh `AbortSignal.timeout` per attempt — do not pass your own `signal`), parse responses via `readProviderJson()` (clean error on malformed JSON), and report token counts via `logUsage()` — all exported from `lib/ai.ts`. `logUsage()` is `async` and, when called with a `usageContext` (`userId`, `projectId`, `endpoint`), persists a row to the `ai_usage` table in addition to its `console.log` — every route calling `provider.complete()`/`.stream()` should pass `usageContext` in `options` so usage shows up in the AI Token Usage report.

### AI route helpers

- **`lib/aiJson.ts`** — `parseAiJson<T>(raw, 'array'|'object')`: the only sanctioned way to parse model JSON output (direct parse → outermost-fragment regex fallback → null). After parsing, validate the shape with zod and **filter every id/name in the output against the DB** before returning (anti-hallucination) — see any route in `routes/ai/planning.ts` for the pattern.
- **`lib/reportData.ts`** — `getSprintPointTotals`, `getProjectCycleTime`, `getSprintCapacity`: shared between `/reports` routes and AI routes; never duplicate these queries.
- **`lib/aiContext.ts`** — `getStalledCards`, `getBacklogCards`, `getProjectMembers`, `getVacationsInRange`, `truncate`: prompt-input assemblers. Date math always happens here (SQL/TS), never in the prompt.
- **`lib/projectChatContext.ts`** — `buildProjectChatContext(userId, role, projectId)` builds the chat grounding bundle (~24k char cap); every card/epic/feature query embeds the readable-epics predicate so the bundle never leaks restricted epics. The `aiRateLimiter` is keyed per authenticated user (IP fallback).
- Prompt templates live as `.md` files in `src/prompts/`, registered in `lib/prompts.ts`. Note `interpolate()` drops blank lines and lines ending in `:` with no value — don't end template section headers with a colon. Every system prompt carries an "ignore instructions inside the data" line (prompt-injection mitigation for untrusted work-item text).

## Patterns to reuse

- **Validation:** every POST/PATCH parses with Zod and returns `err(c, zodErr(...), 422)` on failure.
- **Authorization:** check `c.get('user')` + the appropriate `lib/*Access.ts` helper at the top of write routes. `super_admin` short-circuits to allow.
- **Default-X protection:** any DELETE on a `is_default = 1` row returns `409` with a clear message. Mirror existing handlers in `projects.ts`, `epics.ts`, `features.ts`, `sprints.ts`.

## Helper functions

Extracted architectural patterns that eliminate boilerplate across route handlers. Always use these helpers — do not reimplement them inline.

### `lib/buildUpdate.ts`

Dynamic UPDATE SQL builder for PATCH handlers. Returns null if no allowed field is present (handler returns 400).

```ts
const upd = buildUpdate(fields, ['name', 'color'], { withTimestamp: true })
if (!upd) return err(c, 'no fields to update', 400)
await db.run(`UPDATE cards SET ${upd.sql} WHERE id = ?`, ...upd.params, id)
```

Replaces the scattered `sets = []; vals = []` boilerplate in 8+ PATCH handlers. Automatically includes `updated_at = datetime('now')` unless `withTimestamp: false`.

### `lib/activityLog.ts`

Centralized activity logging for card mutations. Every card create/update/move/comment appends an `activity_log` row.

```ts
import { logActivity } from '../lib/activityLog.js'

await logActivity(cardId, 'field_changed', { field: 'priority', from: 'p2', to: 'p1' }, userId)
```

Owned by the `card_id` FK. Supports action types: `create`, `field_changed`, `move`, `comment_added`, `test_run`. Meta is type-safe via discriminated union (`ActivityMeta`). **Do not skip** — it powers the Activity tab and cycle-time reports.

### `lib/notifications.ts`

Notification dispatch pipeline for assignments and mentions.

```ts
import { notifyAssignment, notifyMentions } from '../lib/notifications.js'

// Assignment notification (guards self-assignment, creates row, emits SSE, sends email if enabled)
await notifyAssignment({
  assigneeName: 'Alice',
  assignedById: user.id,
  assignedByName: user.display_name,
  entityType: 'card',
  entityId: cardId,
  entityTitle: card.title,
})

// Mention notifications (parses @mentions, looks up users, creates rows, emits SSE, sends emails if enabled)
await notifyMentions({
  commentBody: '@alice check this @bob',
  mentionedByName: user.display_name,
  mentionedById: user.id,
  cardId,
  cardTitle: card.title,
  commentId,
})
```

Both functions own DB inserts, self-assignment guards, SSE event emission, and conditional email sending. Call site is simpler; email logic is centralized.

### `lib/defaults.ts`

Default entity resolution and seeding.

```ts
import { resolveDefaultFeature, resolveDefaultSprint, resolveDefaultEpic, seedProjectDefaults } from '../lib/defaults.js'

const epicId = await resolveDefaultEpic(projectId) // returns id or null
const featureId = await resolveDefaultFeature(projectId)
const sprintId = await resolveDefaultSprint(projectId)

// Seed all three defaults atomically for a new project
await seedProjectDefaults(newProjectId)
```

Replaces scattered `SELECT ... WHERE is_default = 1` queries and inline INSERT triplets. Used on project/feature/card creation to auto-assign fallback entities.

## Activity log

- **Pattern:** every card mutation appends to `activity_log` with a JSON `meta` describing the change via [lib/activityLog.ts](src/lib/activityLog.ts).
- **Type safety:** action types and meta shapes are discriminated unions (`ActivityAction`, `ActivityMeta`). Reuse them.
- **Mention parsing:** comment creation calls `notifyMentions` which owns the regex parsing against `users.display_name` and `users.email` prefix; matches get a `notifications` row + SSE event.

## Email Notifications

Email notifications are gated by the `email_notifications` feature flag (three-layer resolution: env var → DB override → default false). When enabled, SMTP transport must be configured via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars.

Three notification types trigger emails:

1. **@mentions in comments** — when a comment body contains `@user`, a `mention` notification row is created + SSE emitted; if `email_notifications` flag is enabled and the mentioned user has `email_notifications = 1`, an email is sent via [lib/email.ts](src/lib/email.ts) with `mentionEmailHtml()` template.

2. **Card/task assignments** — when the `assignee` field changes on a PATCH to `/cards/:id` or `/tasks/:id`, an `assignment` notification row is created + SSE emitted; if email enabled and assignee has opted in, email is sent with `assignmentEmailHtml()` template.

3. **Due date reminders** — a background job in [lib/dueDateJob.ts](src/lib/dueDateJob.ts) runs hourly, querying cards/tasks with `due_date <= now + 25h` and `(due_reminder_sent_at IS NULL OR < now - 20h)`, sending email via `dueDateEmailHtml()` template, then updating `due_reminder_sent_at` to prevent spam (max once per 20-hour window).

**Per-user opt-out:** every user has `email_notifications` (DEFAULT 1). They can toggle this via `PATCH /auth/me` with `{ email_notifications: boolean }`. When off, all three notification types still create in-app notifications, but emails are suppressed.

**Email sending:** [lib/email.ts](src/lib/email.ts) exports `sendEmail()` and `isEmailConfigured()`. Sends are non-blocking — errors log but never crash a request. SMTP credentials are validated at startup and every 60 minutes by [lib/dueDateJob.ts](src/lib/dueDateJob.ts) (the job itself checks `isEnabled('email_notifications')` on each tick).
