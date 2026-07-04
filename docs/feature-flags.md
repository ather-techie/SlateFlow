# SlateFlow Feature Flags

SlateFlow gates every optional and enterprise surface — AI, retrospectives, calendar, integrations, MCP, and more — behind a three-layer flag system, so a self-hosted deployment can enable exactly the functionality it wants.

## How the gate works

```
FEATURE_AI env var          ← hard ceiling; if 'false', /ai routes 404
      ↓
feature_overrides DB row    ← runtime toggle by super_admin
      ↓
resolved flag               → server: requireFeature('ai') middleware
                            → client: featureFlagStore + <FeatureGate flag="ai">
```

- The **env var** is the authoritative ceiling for a self-hosted deployment. If it's `false`, the DB override can never turn the feature back on.
- The **`feature_overrides` DB row** lets a `super_admin` flip a flag at runtime from **Admin → Feature Flags**, no restart required, as long as the env var allows it.
- `GET /api/config` (public) exposes the resolved flags so the client can gate UI without hard-coding anything.
- `PATCH /api/admin/feature-overrides/:flag` (`super_admin` only) toggles the runtime override.

## All 22 flags

| Flag key | Env var | Default | What it gates |
|---|---|---|---|
| `ai` | `FEATURE_AI` | `false` | Enterprise gate — enables all AI endpoints and UI surfaces |
| `auto_test_case_generation_ai` | `FEATURE_AUTO_TEST_CASE_GENERATION_AI` | `false` | Test case generation from user stories (`POST /api/ai/cards/:id/generate-test-cases`) |
| `auto_story_generation_ai` | `FEATURE_AUTO_STORY_GENERATION_AI` | `false` | Story generation from feature title/description (`POST /api/ai/features/:id/generate-stories`) |
| `ai_ceremony_digests` | `FEATURE_AI_CEREMONY_DIGESTS` | `false` | Sprint Health Digest, Daily Standup Digest, and Retrospective Synthesizer |
| `ai_writing_assist` | `FEATURE_AI_WRITING_ASSIST` | `false` | Acceptance Criteria generation and comment-thread summarization |
| `ai_planning_assist` | `FEATURE_AI_PLANNING_ASSIST` | `false` | Assignee/estimate suggestions, sprint planning, and backlog grooming |
| `ai_project_chat` | `FEATURE_AI_PROJECT_CHAT` | `false` | Streaming "Ask Your Project" chat (`POST /api/ai/projects/:id/chat`, SSE response) |
| `ai_usage_reporting` | `FEATURE_AI_USAGE_REPORTING` | `false` | AI Token Usage report on the Reports page (also requires `ai`) |
| `retrospective` | `FEATURE_RETROSPECTIVE` | `false` | Per-sprint Retrospective Board (sidebar nav + `/api/sprints/:id/retrospective` and item endpoints) |
| `calendar` | `FEATURE_CALENDAR` | `false` | Calendar surface (sidebar nav + `/api/projects/:id/calendar` plus event/vacation/holiday CRUD) |
| `auth_password` | `FEATURE_AUTH_PASSWORD` | `true` (seeded on first boot) | Email/password login. Set `false` to require all users to authenticate via OAuth/SSO |
| `auth_google` | `FEATURE_AUTH_GOOGLE` | `false` | Google OAuth login. Requires `OAUTH_GOOGLE_*` |
| `auth_github` | `FEATURE_AUTH_GITHUB` | `false` | GitHub OAuth login. Requires `OAUTH_GITHUB_*` |
| `github_integration` | `FEATURE_GITHUB_INTEGRATION` | `false` | Enterprise gate — GitHub link routes and UI surfaces |
| `gitlab_integration` | `FEATURE_GITLAB_INTEGRATION` | `false` | Enterprise gate — GitLab MR link routes and UI surfaces |
| `email_notifications` | `FEATURE_EMAIL_NOTIFICATIONS` | `false` | Email notifications for mentions, assignments, and due dates. Requires `SMTP_*` |
| `card_attachments` | `FEATURE_CARD_ATTACHMENTS` | `false` | File uploads and attachments on story cards |
| `read_mcp` | `FEATURE_READ_MCP` | `false` | Read-only MCP tools (list/get on work items, tests, calendar) |
| `create_mcp` | `FEATURE_CREATE_MCP` | `false` | MCP create tools (POST operations) |
| `update_mcp` | `FEATURE_UPDATE_MCP` | `false` | MCP update/move tools (PATCH operations) |
| `delete_mcp` | `FEATURE_DELETE_MCP` | `false` | MCP delete tools (safety gate separate from update) |
| `report_mcp` | `FEATURE_REPORT_MCP` | `false` | MCP reporting tools (velocity, cycle time, capacity, dashboard metrics) |

See [docs/mcp.md](mcp.md) for the full MCP setup walkthrough and tool reference.

## Related configuration

Some flags need extra environment variables to actually do anything once enabled:

| Flag(s) | Required config |
|---|---|
| `ai`, `ai_ceremony_digests`, `ai_writing_assist`, `ai_planning_assist`, `ai_project_chat` | `AI_PROVIDER` (`claude` \| `gemini` \| `openai` \| `azure` \| `ollama`), `AI_API_KEY`, optional `AI_MODEL` / `AI_BASE_URL` |
| `auth_google` | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` |
| `auth_github` | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` |
| `auth_google`, `auth_github` | `OAUTH_REDIRECT_BASE_URL` (default `http://localhost:3000`), optional `OAUTH_FRONTEND_URL` for split frontend/API origins |
| `github_integration` | `GITHUB_WEBHOOK_SECRET` (HMAC-SHA256, must match the GitHub webhook config), optional `GITHUB_TOKEN` for private repo metadata |
| `gitlab_integration` | `GITLAB_WEBHOOK_SECRET` (must match the GitLab webhook config), optional `GITLAB_TOKEN` for private repo metadata |
| `email_notifications` | `SMTP_HOST`, `SMTP_PORT` (default `587`), `SMTP_SECURE` (default `false`), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| `card_attachments` | `UPLOADS_DIR` (default `./uploads`, `/data/uploads` in Docker) |

If `auth_google` / `auth_github` is enabled but the matching `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` is unset, the flag resolves to `false` at runtime: the login button is hidden and the route 404s. Super-admins see a "credentials missing" hint next to the toggle in **Admin → Settings**.

## Adding a new flag

Update **all three** of these sync points, then the env-var table above:

1. [server/src/lib/featureFlags.ts](../server/src/lib/featureFlags.ts) — `FeatureFlag` union + exported `KNOWN_FLAGS` ([server/src/routes/adminSettings.ts](../server/src/routes/adminSettings.ts) imports it, no separate list there)
2. [client/src/store/featureFlagStore.ts](../client/src/store/featureFlagStore.ts) — union + `Features` interface + default state (several client test files build full `Features` literals and must gain the new key too)
3. The env var table above and, if the underlying env var name differs from the flag key, [CLAUDE.md](../CLAUDE.md)

If the flag should default to *on*, also seed a `feature_overrides` row on first boot in [server/src/db/index.ts](../server/src/db/index.ts) (see `auth_password`).
