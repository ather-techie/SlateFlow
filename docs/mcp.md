# SlateFlow MCP Server

SlateFlow ships an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server so an AI assistant like Claude can query and manage your project data directly. This guide walks through the setup end to end, using Claude as the example client.

> The `/mcp` transport, RBAC, and all 29 tools are fully implemented. Calendar tools (`get_calendar`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event`) additionally require `FEATURE_CALENDAR=true`.

## 1. Enable the flags you need

MCP access is split into five independent flags so you can grant exactly the level of access you want:

`FEATURE_READ_MCP` · `FEATURE_CREATE_MCP` · `FEATURE_UPDATE_MCP` · `FEATURE_DELETE_MCP` · `FEATURE_REPORT_MCP`

Set the ones you want to `true` in `.env` (see the [env var table in CLAUDE.md](../CLAUDE.md) for details), or have a `super_admin` toggle them at runtime from **Admin → Feature Flags** without a restart.

## 2. Generate a personal access token

Each user authenticates to MCP with their own named token (there's no dedicated UI for this yet, so create one via the API while logged in):

```bash
curl -X POST http://localhost:3000/api/mcp/tokens \
  -H "Content-Type: application/json" \
  -b "sf_token=<your session cookie>" \
  -d '{"name": "My Claude Desktop"}'
```

Response (`data` field, wrapped in SlateFlow's standard envelope):

```json
{
  "id": 1,
  "token": "sf_mcp_<32-hex-chars>",
  "name": "My Claude Desktop",
  "created_at": "2026-07-04T00:00:00.000Z",
  "message": "Token created. This is the only time it will be displayed. Store it safely."
}
```

**The raw token is shown once** — copy it immediately. `GET /api/mcp/tokens` lists your tokens afterward (name and timestamps only, no raw value); `DELETE /api/mcp/tokens/:id` revokes one.

## 3. Point Claude at the server

**Claude Code** — add an entry to a project's `.mcp.json` (same file/format this repo already uses for its own `playwright` and `github` MCP servers, see [.mcp.json](../.mcp.json)):

```json
{
  "mcpServers": {
    "slateflow": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer sf_mcp_<your-token>"
      }
    }
  }
}
```

**Claude Desktop** — add the same shape to `claude_desktop_config.json` under `mcpServers`.

For a Docker or production deployment, swap the `url` for your public origin (e.g. `https://slateflow.example.com/mcp`). Keep the raw token out of source control — use a local, untracked config file or substitute it from an environment variable.

## What you can do with it

29 tools across five independently-gated categories. Everything below respects the calling user's RBAC (project/epic access) — an MCP token can never do more than the user it belongs to could do in the UI, and card/sprint/test-case writes are checked against project and epic access even more strictly than the equivalent REST endpoints.

### Read (`read_mcp`)

| Tool | What it does |
|---|---|
| `list_projects` | List every project the user has access to |
| `list_sprints` | List a project's sprints (excludes the system Default Sprint) |
| `list_epics` | List a project's epics (excludes the system Default Epic) |
| `list_features` | List a project's features, optionally filtered to one epic |
| `search_cards` | Search story cards by title within a project (top 20 matches) |
| `get_card` | Full card detail — labels, comments, activity log, and tasks |
| `list_test_suites` | List a project's test suites |
| `list_test_cases` | List a card's test cases with pass/fail/blocked/skipped/untested counts |
| `get_test_case` | Full test case detail including its complete run history |
| `get_calendar` | Sprints, epics, features, holidays, events, and vacations in a date range *(also needs `FEATURE_CALENDAR`)* |

### Create (`create_mcp`)

| Tool | What it does |
|---|---|
| `create_card` | Create a story card in a swim lane (auto-assigns the Default Sprint/Feature if omitted) |
| `create_sprint` | Create a new sprint in a project |
| `create_test_case` | Create a test case on a story card, optionally in a test suite |
| `record_test_run` | Log a pass/fail/blocked/skipped result for a test case |
| `create_calendar_event` | Create a project calendar event *(also needs `FEATURE_CALENDAR`)* |

### Update (`update_mcp`)

| Tool | What it does |
|---|---|
| `update_card` | Edit a card's title, description, priority, points, assignee, sprint, feature, or due date |
| `move_card` | Move a card to a different swim lane/position (auto-closes linked GitHub issues if the target lane is "done") |
| `update_sprint` | Edit a sprint's name, dates, goal, or status |
| `update_test_case` | Edit a test case's title, description, status, priority, or type |
| `update_calendar_event` | Edit a calendar event's title, description, dates, or color *(also needs `FEATURE_CALENDAR`)* |

### Delete (`delete_mcp`)

| Tool | What it does |
|---|---|
| `delete_card` | Delete a story card |
| `delete_sprint` | Delete a sprint — cards in it are unassigned from any sprint, not moved to the Default Sprint. Refuses to delete the Default Sprint |
| `delete_test_case` | Delete a test case |
| `delete_calendar_event` | Delete a calendar event *(also needs `FEATURE_CALENDAR`)* |

### Reports (`report_mcp`)

| Tool | What it does |
|---|---|
| `get_velocity_report` | Completed vs. total story points/stories per sprint |
| `get_cycle_time_report` | Average days spent in each swim lane |
| `get_capacity_report` | Per-assignee story count, points, and configured capacity for a sprint |
| `get_dashboard_stats` | Global counts — projects, active sprints, open cards, test case pass/fail/untested |
| `get_dashboard_projects` | Per-project summary — lanes, card counts, active sprint, test stats |

In practice this means an AI assistant connected via MCP can, in one conversation: spin up new story cards and sprints for a project, triage and re-prioritize the backlog, move cards across the board as work progresses, write and record test cases against a story, and pull velocity/cycle-time/capacity numbers for a retro — all scoped to what that user is allowed to touch.
