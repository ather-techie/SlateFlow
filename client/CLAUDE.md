# client/CLAUDE.md

Scoped guidance for Claude Code when editing under `client/`. For repo-wide context (RBAC roles, env vars, AI providers), see [../CLAUDE.md](../CLAUDE.md). For the REST API contract, see [../docs/api.md](../docs/api.md).

## Stack

- **Vite 5 + React 18 + TypeScript** (entry: [src/main.tsx](src/main.tsx) → `App.tsx`)
- **Tailwind CSS v3** via PostCSS — no CSS-in-JS
- **react-router-dom v7** — `BrowserRouter` in `App.tsx`
- **Zustand** for global state (no Redux, no Context)
- **axios + native fetch** — codebase is mid-migration; see *API clients* below
- **@dnd-kit/core + @dnd-kit/sortable** with `PointerSensor` for card and lane DnD
- **recharts** — `LineChart` for burndown (SprintsPage), bar/line for ReportsPage
- **react-hot-toast** — universal toast surface

## Routes (App.tsx)

`<ProtectedRoute>` wraps every route except `/login`; it redirects to `/login` when `authStore.user` is null. `<Layout>` is applied to project-scoped pages only (Dashboard + project subpages); ProjectSetupPage and AdminPage render outside Layout.

| Path | Component | Layout |
|---|---|---|
| `/login` | `LoginPage` | — (public) |
| `/` | `RootRedirect` (inline) | Layout |
| `/projects/new` | `ProjectSetupPage` | — |
| `/admin` | `AdminPage` | — |
| `/dashboard` | `DashboardPage` | Layout |
| `/projects/:id/board` | `BoardPage` | Layout |
| `/projects/:id/backlog` | `BacklogPage` | Layout |
| `/projects/:id/epics` | `EpicsPage` | Layout |
| `/projects/:id/sprints` | `SprintsPage` | Layout |
| `/projects/:id/tests` | `TestSuitePage` | Layout |
| `/projects/:id/roadmap` | `RoadmapPage` | Layout |
| `/projects/:id/reports` | `ReportsPage` | Layout |
| `/projects/:id/retrospective` | `RetrospectivePage` (gated by `retrospective` flag) | Layout |
| `/projects/:id/calendar` | `CalendarPage` (gated by `calendar` flag) | Layout |
| `*` | `NotFoundPage` | — |

## Pages

| File | Purpose |
|---|---|
| `LoginPage` | Renders Google / GitHub / email-password sign-in, each gated by its `auth_*` flag. OAuth buttons full-page-navigate to `/api/auth/<provider>/start`; the password form posts to `/api/auth/login` and then calls `/api/auth/me`. Surfaces `?error=…` query params (e.g. `email_not_verified`) as toasts and strips them from the URL |
| `DashboardPage` | All-projects overview — stats, active sprints, recent activity, project create/edit/delete |
| `ProjectSetupPage` | Project creation wizard; lane preset chooser or custom-lane builder with live DnD preview |
| `BoardPage` | Kanban board (lanes + cards) with @dnd-kit DnD; Epic/Feature/Sprint filter dropdowns; ManageLanesModal; opens `CardModal` on card click |
| `BacklogPage` | Re-exports from `components/`; type-filter tabs (All / Epics / Features / Stories / Tasks) + collapsible hierarchy in "All" |
| `EpicsPage` | Drill-down tree: Epic → Feature → Story → Task with inline create/edit/delete |
| `SprintsPage` | Re-exports from `components/`; sprint list with progress bars + recharts burndown; activate/complete |
| `TestSuitePage` | 3-pane: suite navigator / test case table with bulk actions / detail panel; CSV export |
| `RoadmapPage` | Gantt-style timeline; epic rows with collapsible feature sub-rows; date editor popover |
| `ReportsPage` | Velocity chart, cycle-time chart, capacity per assignee, CSV export buttons (backlog/sprint/full) |
| `AdminPage` | Super-admin only; **Users**, **Holidays** (global, gated by `calendar` flag), and **Settings** (feature flag toggles) tabs |
| `RetrospectivePage` | Per-sprint retro with three fixed columns (Went well / To improve / Action items) and `@dnd-kit` reorder. Gated by `retrospective` flag |
| `CalendarPage` | Month view of sprints, epics, features + holidays/events/vacations. Prev/next/today nav; `+` on a day or button to add an entry. Gated by `calendar` flag |
| `NotFoundPage` | 404 fallback |

## Components

- `Layout` — sidebar + outlet; renders unread notification bell (clears on click) and failed-test badge driven by SSE
- `Header` — dark blue top bar; project name, active-sprint label, project + sprint dropdowns, "live" indicator
- `Board/Card`, `Board/Column`, `Board/AddCardForm` — DnD-aware Kanban primitives in [src/components/Board/](src/components/Board/)
- `Retro/RetroColumn`, `Retro/RetroNote` — DnD-aware retrospective primitives in [src/components/Retro/](src/components/Retro/) (mirror the Board/ pattern with three fixed categories instead of dynamic lanes)
- `Calendar/MonthGrid`, `Calendar/EntryBar`, `Calendar/EntryFormModal` — calendar surface in [src/components/Calendar/](src/components/Calendar/). `EntryFormModal` is reused by `AdminPage`'s Holidays tab via `allowedKinds={['holiday']}`
- `Board/ManageLanesModal` — CRUD lanes (create, rename, recolor, reorder, delete with card-count guard)
- `CardModal` — full story editor; **6 tabs**: Description (with inline Tasks checklist), Comments, Activity, Tests, Dependencies (blocks / blocked-by), Integrations (linked GitHub PRs and GitLab MRs, gated by flags). Right sidebar holds Sprint, Feature, Assignee, Priority, Story Points selectors
- `ProtectedRoute` — auth gate; redirects to `/login` when no session
- `FeatureGate` — `<FeatureGate flag="ai">{children}</FeatureGate>`; renders only when the flag resolves true
- `NLItemInput` — universal natural-language work item creation (gated by `FEATURE_AI`). Props: `allowedTypes` (array of types the parser can return), `context` (projectId/epicId/laneId), `lanes` (for story lane picker), `cards` (for task parent picker), `onCreated` (refresh callback). State machine: idle → input → loading → preview → confirming. Editable fields appear based on inferred type (priority/assignee for epics/features/stories, dates for sprints/calendar, parent selectors as needed). Wrapped in `<FeatureGate flag="ai">` at every mount site: BoardPage, EpicsPage, SprintsPage, CalendarPage, DashboardPage
- `ProjectAccessModal` — per-user table of all projects with role dropdowns; saves inline on change
- `CreateUserModal` (inline in AdminPage) — chains `POST /users` then `POST /projects/:id/access` per assigned project
- `SettingsTab` (inline in AdminPage) — feature flag toggles; toggle is disabled when the env var is `false` (env is the ceiling)

## Stores ([src/store/](src/store/))

| File | Holds |
|---|---|
| `authStore.ts` | `user`, `loading`; helpers `isSuperAdmin()`, `canReadProject(id)`, `canWriteProject(id)`, `canManageProject(id)` |
| `projectStore.ts` | `projects`, `currentProject`; `setCurrentProject`, `fetchProjects()` |
| `boardStore.ts` | `lanes`, `cards`, `testCaseSummary`, `taskSummary`, `linkCount`; mutations: `moveCard`, `addCard`, `updateCard`, `deleteCard`, summary setters, `setLinkCount` |
| `retroStore.ts` | `retroId`, `items`; mutations: `setRetro`, `addItem`, `updateItem`, `removeItem`, `setItems`, `clear` (mutations only apply when the incoming item belongs to the active retro) |
| `featureFlagStore.ts` | `features` (`ai`, `retrospective`, `calendar`, `auth_password`, `auth_google`, `auth_github`, `github_integration`, `gitlab_integration`), `loading`; `setFlags(...)`, `isEnabled(flag)` |

## API clients

Two files exist; the codebase is mid-migration:

- [src/api.ts](src/api.ts) — fetch-based, flat function exports. Most existing pages import from `'../api'` which resolves to this file (TS prefers the `.ts` over the `api/` directory).
- [src/api/index.ts](src/api/index.ts) — newer axios namespace (`api.projects.list()`, `api.cards.create()`, …). More complete coverage of new endpoints (roadmap, reports, projectAccess, ai).

**When adding new endpoints:** add to the axios namespace in `api/index.ts`. Don't extend `api.ts` further. If you touch a page that's still on fetch, leave the migration for a separate change unless trivial — do NOT mix axios and fetch in the same component.

**AI methods and types exported from `api/index.ts`:**
- `api.ai.parseItem(data)` — `(input: string, context?: { projectId?, epicId?, laneId?, allowedTypes? }) => Promise<ParsedIntent>` — parses natural-language input into a work item
- `type ParsedIntent = { type, payload } | { type: "unknown", reason }` — discriminated union returned by the `/api/ai/parse-item` endpoint; `type` is one of `"epic"`, `"feature"`, `"story"`, `"task"`, `"project"`, `"sprint"`, `"calendar"`, or `"unknown"`; each type carries different fields in `payload` (e.g., epic/feature/story have priority + assignee, sprint has dates + goal, task has assignee only)
- `type NLAllowedType = "epic" | "feature" | "story" | "task" | "project" | "sprint" | "calendar"` — work item types the parser can infer

**Card Links methods exported from `api/index.ts`:**
- `api.cardLinks.list(cardId)` — fetches all linked PRs/MRs for a card
- `api.cardLinks.add(cardId, { url })` — adds a new link by URL; parses provider/type/number; optionally fetches metadata
- `api.cardLinks.remove(cardId, linkId)` — deletes a link

Vite proxies `/api` → `localhost:3000` in dev (see `vite.config.ts`). Both clients send credentials so the `sf_token` cookie is included.

## Hooks ([src/hooks/](src/hooks/))

- `useBoardEvents(projectId)` — opens an `EventSource` against `/api/events`, dispatches `card:*` and `epic:*` events into `boardStore`, `retro:item:*` into `retroStore`, increments `notification` counts on `Layout`. Use this hook in any new page that needs live board updates. The `CalendarPage` opens its own `EventSource` for `calendar:entry:*` (because it triggers a refetch instead of patching a store).

## Patterns to reuse

- **AI-gated UI:** wrap with `<FeatureGate flag="ai">`; do NOT check `featureFlagStore` directly in JSX.
- **Toasts:** `toast.success(...)`, `toast.error(...)` from react-hot-toast. The `<Toaster />` is mounted once in `App.tsx`.
- **DnD pattern:** see `BoardPage` for the canonical `DndContext` + `useSensor(PointerSensor)` + `SortableContext` setup.
- **Tailwind:** prefer composition with utility classes; avoid `@apply` and custom CSS files. Common patterns: `rounded-md border border-slate-200 bg-white shadow-sm`, indigo (`indigo-600`) is the accent, slate for neutrals.
- **API errors:** the response envelope is `{ data, error }`. The fetch helper in `api.ts` throws on `error` non-null; catch + `toast.error(err.message)`.
