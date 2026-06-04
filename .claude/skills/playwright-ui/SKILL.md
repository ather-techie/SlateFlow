---
name: playwright-ui
description: Run interactive browser UI tests against the running SlateFlow dev server using MCP Playwright.
---

# MCP Playwright UI Testing

You are executing the `/playwright-ui` skill. Follow these steps exactly.

This skill runs a sequence of browser-based UI verification flows against the running SlateFlow dev server using MCP Playwright. It tests critical user journeys: login, Kanban board DnD, card modals, sprints, admin flags, auth guards, and the roadmap.

## Accepted Arguments

```
/playwright-ui              # run all 7 flows (default)
/playwright-ui login        # only login
/playwright-ui board modal  # only board and modal flows
/playwright-ui guard        # only auth guard
/playwright-ui sprint flags roadmap
```

Valid flow tokens: `login`, `board`, `modal`, `sprint`, `flags`, `guard`, `roadmap`

If no flows are specified, all 7 run.

---

## Step 1 — Parse and Validate Arguments

Determine which flows to run from the command arguments. Default: all (`login`, `board`, `modal`, `sprint`, `flags`, `guard`, `roadmap`).

---

## Step 2 — Pre-flight Health Check

Run the health check script to confirm both servers are up and detect the frontend port:

```bash
node .claude/skills/playwright-ui/check-servers.mjs
```

Parse the output to extract `FRONTEND_PORT=<port>` (either 5173 or 5174) and store it in a variable for use in all subsequent steps.

If the script exits non-zero, stop here and tell the user to run `npm run dev` first.

---

## Step 3 — Login Flow (Always Runs First)

**Purpose:** Establish session (`sf_token` httpOnly cookie) in the browser context for all subsequent flows.

Use the MCP Playwright tools:

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/login`
2. `browser_screenshot` — confirm the login form is visible (email + password fields, sign-in button)
3. `browser_type` into the email field: `admin@flow.local`
4. `browser_type` into the password field: `Admin1234!`
5. `browser_click` on the "Sign in" / submit button
6. `browser_wait_for_url` to not contain `/login` (should redirect to `/dashboard` or similar)
7. `browser_screenshot` — confirm the dashboard page rendered

If login fails, stop here and report the failure. Otherwise, continue to the requested flows below.

---

## Step 4 — Run Requested Flows

**Board Flow** (if requested):
1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board`
2. `browser_screenshot` — confirm swim lanes (To Do, In Progress, Review, Done) are visible
3. `browser_click` the "Add Card" button (or icon) in the first lane
4. `browser_type` a card title (e.g., "Test card created by MCP")
5. `browser_click` the "Create" / submit button
6. `browser_screenshot` — confirm the card appears in the lane
7. `browser_drag_and_drop` the card to the next lane (e.g., To Do → In Progress)
8. `browser_screenshot` — confirm the card is now in the destination lane (visual + SSE real-time update)

**Modal Flow** (if requested):
1. `browser_click` any card on the board to open the `CardModal`
2. `browser_screenshot` — confirm the modal is open and shows the card title
3. Click the "Description" tab — `browser_screenshot`
4. Click the "Comments" tab — `browser_screenshot`
5. In the Comments tab, `browser_type` a comment text with `@admin` mention (e.g., "This is a @admin mention test")
6. `browser_click` the submit/send button
7. `browser_screenshot` — confirm the comment is saved and the `@admin` mention is highlighted
8. Click the "Activity" tab — `browser_screenshot`
9. Click the "Tests" tab — `browser_screenshot`
10. Click the "Dependencies" tab — `browser_screenshot`
11. Click the "Integrations" tab — `browser_screenshot`
12. Close the modal by clicking the X or pressing Escape

**Sprint Flow** (if requested):
1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/sprints`
2. `browser_screenshot` — confirm the sprints list is visible
3. Click the "New Sprint" button
4. `browser_type` sprint name (e.g., "Test Sprint MCP")
5. `browser_type` start and end dates (or use date pickers)
6. `browser_click` the "Create" button
7. `browser_screenshot` — confirm the sprint appears in the list with "Planned" status
8. `browser_click` the "Activate" button on the new sprint
9. `browser_screenshot` — confirm the status badge changes to "Active"
10. `browser_screenshot` — confirm the burndown chart is visible
11. `browser_click` the "Complete Sprint" button
12. `browser_screenshot` — confirm the status badge changes to "Completed"

**Flags Flow** (if requested):
1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/admin`
2. `browser_screenshot` — confirm the admin panel loaded
3. Click the "Settings" tab
4. `browser_screenshot` — confirm feature flags are visible (toggle switches)
5. `browser_click` a feature flag toggle (e.g., "Calendar" flag)
6. `browser_screenshot` — confirm the toggle state changed visually
7. `browser_navigate` to `http://localhost:$FRONTEND_PORT/dashboard`
8. `browser_screenshot` — confirm the sidebar now shows or hides the Calendar nav link based on the flag state

**Guard Flow** (if requested):
1. Create a fresh browser context or clear cookies: `browser_evaluate('document.cookie = ""')` to simulate an unauthenticated user
2. `browser_navigate` to `http://localhost:$FRONTEND_PORT/dashboard`
3. `browser_screenshot` — confirm the browser redirects to `/login` (the `<ProtectedRoute>` guard should redirect)

**Roadmap Flow** (if requested):
1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/roadmap`
2. `browser_screenshot` — confirm the Gantt-style timeline is visible (epic/feature rows with date bars)
3. `browser_click` on a date bar (to open the date editor popover)
4. `browser_screenshot` — confirm the popover appeared and is editable

---

## Step 5 — Generate Report

Compile the results of each flow into a summary table and report:

```
## UI Verification Report

| Flow | Status | Notes |
|------|--------|-------|
| login | ✅ PASS | Dashboard loaded, sf_token cookie established |
| board | ✅ PASS | Card created, DnD to next lane confirmed |
| modal | ✅ PASS | All 6 tabs rendered, @mention comment saved |
| sprint | ✅ PASS | Sprint lifecycle: planned → active → completed |
| flags | ✅ PASS | Calendar flag toggled, sidebar nav updated |
| guard | ✅ PASS | Unauthenticated access redirected to /login |
| roadmap | ✅ PASS | Gantt bars rendered, date editor popover works |
```

For each flow, note:
- **Status:** `✅ PASS` or `❌ FAIL`
- **Notes:** Brief description of what was verified or what went wrong

## Screenshots

Embed a representative screenshot from each flow. Use `browser_screenshot` to capture the visual state after each major action.

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| Health check fails | Dev server not running | Run `npm run dev` in another terminal |
| Login times out | Login form not found or incorrect selectors | Check that frontend is on `$FRONTEND_PORT` (5173 or 5174) and the login page loads |
| Card won't drag | DnD not working or selector incorrect | Use `browser_drag_and_drop` from card element to lane target |
| Modal tabs click fails | Tab selector changed in code | Use `browser_get_element_by` or retry with updated selectors |
| Sprint create fails | Form fields have changed | Verify the sprint creation form structure in the UI |
| Auth guard doesn't redirect | ProtectedRoute not working | Check browser console for errors; verify the redirect URL |
| Roadmap bars don't render | Gantt component not rendering | Check browser console for recharts errors |

---

**Session Notes:**

- All flows share the same browser context (one login establishes the session for all subsequent flows)
- Mutations (cards created, flags toggled) persist in the dev database (`server/slateflow.db`) — reset anytime with `/seed-db`
- Screenshots are embedded as base64; in the report, call out any visual anomalies (blank tabs, missing elements, layout breaks)
- If any flow fails, report the failure clearly and suggest next debugging steps
