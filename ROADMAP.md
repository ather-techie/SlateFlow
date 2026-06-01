# SlateFlow Roadmap

A community-driven roadmap for SlateFlow — the lightweight, self-hostable agile board.

---

## ✅ Current State (v0.x)

- Kanban board with drag-and-drop (swim lanes, cards)
- Sprint management with burndown charts & velocity snapshots
- Backlog with full CRUD
- Lane presets (Scrum, Kanban, custom)
- Dashboard with project stats and activity feed
- Activity log (create, update, move events)
- Roadmap / Gantt-style timeline view
- Story dependencies (blocks / blocked by)
- Capacity planning (story points per assignee) with committed capacity vs. actual display
- User skills (app-level and project-level)
- Velocity chart & cycle time reporting with average velocity
- CSV export
- Labels & threaded comments
- AI card summarisation (Claude, Gemini, OpenAI, Azure OpenAI, Ollama)
- AI story generation from features with preview + selective creation (feature-flagged)
- Self-hosted via Docker + SQLite
- Multi-user RBAC (super_admin / global_reader / project_admin / contributor / reader) + Project Admin Panel
- Epic-level access control with contributor auto-grant for Default Epic
- GitHub & GitLab integration (PR / commit links, webhook events — feature-flagged)
- Per-sprint Retrospective Board (feature-flagged)
- Calendar surface with events, vacations, and holidays (feature-flagged) — holidays support country/state tagging and filtering
- @mention notifications + real-time board updates via SSE
- Email notifications for mentions, assignments, and due date reminders (SMTP-based, per-user opt-out)
- AI natural-language work item creation (parse across board, backlog, sprints, calendar)
- Due dates on cards and tasks with background reminders

---

## 🚀 Phase 1 — Foundation & Security
> Target: v1.0

### Authentication & Multi-User
- [x] User registration and login (email/password)
- [x] OAuth support (GitHub, Google) — feature-flagged per provider; ready for SSO via the `user_identities` table
- [x] Role-based permissions per project (project_admin / contributor / reader) — Project Admin Panel at `/projects/:id/admin`
- [ ] Team / organization support for shared instances
- [x] User profile management (location, work info, reporting manager) — avatar management pending

### Core UX Improvements
- [x] Card priority levels (Critical / High / Medium / Low) with color indicators
- [x] Due dates with overdue highlighting
- [ ] Subtasks / inline checklists on cards
- [ ] Card templates for recurring task types (bug, feature, chore)
- [x] @mentions in comments with in-app notifications
- [ ] Dark mode
- [x] User profile management (location, work info, reporting manager)

### Technical
- [x] Real-time board sync via SSE (card create/update/move/delete events)
- [ ] In-app feedback module — floating widget for users to submit bug reports, feature requests, and comments; admin panel view with status tracking
- [ ] Personal API tokens — programmatic access for scripts and integrations
- [ ] Two-factor authentication (TOTP)
- [ ] WIP limits per swim lane (Kanban throughput enforcement)
- [x] OpenAPI / Swagger documentation for the REST API
- [x] Health check endpoint (`/health`) for container orchestration
- [x] Unit test suite — comprehensive tests for client components, hooks, and stores (Vitest + jsdom + React Testing Library)
- [ ] Backup and restore CLI for SQLite database

---

## 🔗 Phase 2 — Integrations
> Target: v1.5

### Version Control
- [x] GitHub integration — link pull requests, issues, and commits to cards (feature-flagged); auto-close issues when cards move to done; auto-move cards when PR/MR is merged (feature-flagged)
- [x] GitLab integration — mirror GitHub feature set (feature-flagged)

### Notifications & Webhooks
- [ ] Webhook support — push card events to external services
- [ ] LDAP / SAML SSO — enterprise identity provider support
- [ ] Zapier / n8n / Make webhook templates — no-code automation triggers
- [ ] Per-user notification preferences (granular opt-in/out per event type)
- [ ] Slack integration — sprint summaries and card move notifications
- [ ] Discord integration
- [x] Email notifications for mentions, assignments, and due dates

### Calendar & Scheduling
- [ ] iCal / Google Calendar export for sprint dates
- [ ] Recurring card support

---

## 🤖 Phase 3 — AI Enhancements
> Target: v2.0

- [x] **Natural language card creation** — create cards by typing plain English commands (parse across board, epics, sprints, calendar)
- [x] **AI story generation from features** — generates 3–7 user story outlines from a feature's title and description with preview + selective creation (feature-flagged)
- [ ] **AI sprint planning** — suggest backlog items to pull into the next sprint based on velocity history
- [ ] **Auto-generate subtasks** from a card title or description
- [ ] **Smart labels** — AI suggests tags based on card content
- [ ] **Risk detection** — flag cards likely to be blocked or delayed based on patterns
- [ ] **AI-generated sprint retrospective summaries** — AI-generated recap of completed sprints
- [ ] **Duplicate detection** — warn when a new card looks like an existing one
- [x] **MCP server** — expose SlateFlow as a Model Context Protocol (MCP) server so AI assistants (Claude, Cursor, Copilot, etc.) can read and manage cards, sprints, epics, projects, test cases, and reports directly via standardized tools; gated by five independent flags (`read_mcp`, `create_mcp`, `update_mcp`, `delete_mcp`, `report_mcp`); auth via per-user tokens

---

## 🏗️ Phase 4 — Scale & Ops
> Target: v2.5

### Database & Performance
- [ ] PostgreSQL support as an alternative to SQLite
- [ ] Pagination and virtual scrolling for large backlogs
- [ ] Search across all cards, projects, and comments

### Deployment & DevX
- [ ] Hosted live demo / sandbox environment
- [ ] One-click deploy buttons (Railway, Render, Fly.io)
- [ ] Kubernetes Helm chart
- [ ] Multi-instance / horizontal scaling support

### Mobile & Accessibility
- [ ] PWA support — installable, offline-capable
- [ ] Keyboard shortcuts for power users
- [ ] Full WCAG 2.1 AA accessibility compliance
- [ ] Responsive mobile layout improvements

### Collaboration & Power-user
- [x] Card attachments (file uploads, images, screenshots)
- [ ] Bulk operations — bulk move, assign, label, or delete cards
- [ ] Dependency graph visualization — interactive view of blocks/blocked-by links
- [ ] Board view customization — card density, visible fields, group-by options

---

## 💡 Ideas Backlog (Under Consideration)

- Time tracking — log hours per card vs. estimates
- Cumulative Flow Diagram (CFD)
- Sprint health indicators (on-track / at-risk)
- Custom fields on cards (dropdowns, numbers, dates)
- Public project boards (read-only shareable links)
- Import from Jira / Trello / Linear
- Audit log for enterprise compliance
- Guest / external collaborator access (time-limited, read-only project tokens)
- Sprint templates — save a sprint's lane structure and defaults for reuse
- Card staleness indicators — highlight cards with no activity in N days
- SCIM provisioning for automated user lifecycle management
- Multi-region / multi-tenant hosted offering

---

## 🤝 Contributing

Have an idea or want to help implement something on this roadmap?
Check out [CONTRIBUTING.md](./CONTRIBUTING.md) and open an issue or pull request!

---

*Last updated: May 31, 2026* — Unit test suite (Vitest) and component refactor completed
