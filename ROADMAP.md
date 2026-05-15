# SlateFlow Roadmap

A community-driven roadmap for SlateFlow — the lightweight, self-hostable agile board.

---

## ✅ Current State (v0.x)

- Kanban board with drag-and-drop (swim lanes, cards)
- Sprint management with burndown charts
- Backlog with full CRUD
- Lane presets (Scrum, Kanban, custom)
- Dashboard with project stats and activity feed
- Activity log (create, update, move events)
- Roadmap / Gantt-style timeline view
- Story dependencies (blocks / blocked by)
- Capacity planning (story points per assignee)
- Velocity chart & cycle time reporting
- CSV export
- Labels & threaded comments
- AI card summarisation (Claude, Gemini, OpenAI, Azure OpenAI, Ollama)
- Self-hosted via Docker + SQLite

---

## 🚀 Phase 1 — Foundation & Security
> Target: v1.0

### Authentication & Multi-User
- [x] User registration and login (email/password)
- [x] OAuth support (GitHub, Google) — feature-flagged per provider; ready for SSO via the `user_identities` table
- [x] Role-based permissions per project (project_admin / contributor / reader) — Project Admin Panel at `/projects/:id/admin`
- [ ] Team / organization support for shared instances
- [ ] User profile and avatar management

### Core UX Improvements
- [ ] Card priority levels (High / Medium / Low) with color indicators
- [ ] Due dates with overdue highlighting
- [ ] Subtasks / inline checklists on cards
- [ ] Card templates for recurring task types (bug, feature, chore)
- [ ] @mentions in comments with in-app notifications
- [ ] Dark mode

### Technical
- [ ] OpenAPI / Swagger documentation for the REST API
- [ ] Health check endpoint (`/health`) for container orchestration
- [ ] Backup and restore CLI for SQLite database

---

## 🔗 Phase 2 — Integrations
> Target: v1.5

### Version Control
- [ ] GitHub integration — link pull requests and commits to cards
- [ ] GitLab integration — mirror GitHub feature set
- [ ] Auto-move cards when PR is merged (e.g. move to Done)

### Notifications & Webhooks
- [ ] Webhook support — push card events to external services
- [ ] Slack integration — sprint summaries and card move notifications
- [ ] Discord integration
- [ ] Email notifications for mentions, assignments, and due dates

### Calendar & Scheduling
- [ ] iCal / Google Calendar export for sprint dates
- [ ] Recurring card support

---

## 🤖 Phase 3 — AI Enhancements
> Target: v2.0

- [ ] **AI sprint planning** — suggest backlog items to pull into the next sprint based on velocity history
- [ ] **Auto-generate subtasks** from a card title or description
- [ ] **Smart labels** — AI suggests tags based on card content
- [ ] **Risk detection** — flag cards likely to be blocked or delayed based on patterns
- [ ] **Sprint retrospective summaries** — AI-generated recap of completed sprints
- [ ] **Natural language card creation** — create cards by typing plain English commands

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

---

## 💡 Ideas Backlog (Under Consideration)

- Time tracking — log hours per card vs. estimates
- Cumulative Flow Diagram (CFD)
- Sprint health indicators (on-track / at-risk)
- Custom fields on cards (dropdowns, numbers, dates)
- Public project boards (read-only shareable links)
- Import from Jira / Trello / Linear
- Audit log for enterprise compliance

---

## 🤝 Contributing

Have an idea or want to help implement something on this roadmap?
Check out [CONTRIBUTING.md](./CONTRIBUTING.md) and open an issue or pull request!

---

*Last updated: May 2026*
