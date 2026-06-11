---
name: playwright-board
description: Run deep browser UI tests against the SlateFlow Kanban board using MCP Playwright — covers board load, card CRUD, DnD lane transitions, card modal tabs, task checklists, filters, and lane management.
---

# MCP Playwright Board Testing

You are executing the `/playwright-board` skill. Follow these steps exactly.

This skill runs a sequence of browser-based UI verification flows against the SlateFlow Kanban board using MCP Playwright. It tests board rendering, card creation, drag-and-drop lane transitions, the card modal (all 6 tabs), task checklists, epic/feature/sprint filters, and the ManageLanesModal — the full interactive surface of `/projects/:id/board`.

## Accepted Arguments

```
/playwright-board                    # run all 8 flows (default)
/playwright-board load               # only board load and lane rendering
/playwright-board card-create        # only card creation via AddCardForm
/playwright-board card-dnd           # only drag-and-drop lane transitions
/playwright-board card-modal         # only CardModal (all 6 tabs + @mention)
/playwright-board card-edit          # only card field editing (title, priority, etc.)
/playwright-board card-tasks         # only task checklist (add, check off, delete)
/playwright-board filters            # only epic/feature/sprint filter dropdowns
/playwright-board lanes              # only ManageLanesModal (create, rename, done-toggle, delete)
```

Valid flow tokens: `load`, `card-create`, `card-dnd`, `card-modal`, `card-edit`, `card-tasks`, `filters`, `lanes`

Multiple tokens can be combined: `/playwright-board card-create card-dnd`

If no flows are specified, all 8 run.

---

## Step 1 — Parse and Validate Arguments

Determine which flows to run from the command arguments. Default: all (`load`, `card-create`, `card-dnd`, `card-modal`, `card-edit`, `card-tasks`, `filters`, `lanes`).

---

## Step 2 — Pre-flight Health Check

First, create a unique run folder for this invocation to isolate all artifacts:

```bash
RUN_ID=$(node -e "process.stdout.write(new Date().toISOString().replace(/[:.]/g,'-').slice(0,16))")
RUN_DIR=".playwright-mcp/run-$RUN_ID"
mkdir -p "$RUN_DIR"
echo "Run folder: $RUN_DIR"
```

Store `$RUN_DIR` as a variable for cleanup at the end.

Now run the health check script to confirm both servers are up and detect the frontend port:

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

### Load Flow (if requested)

**Purpose:** Verify the board renders correctly with all swim lanes and cards.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board`
2. `browser_screenshot` — confirm the page loaded (board header, lane columns visible)
3. Verify that at least the default lanes are rendered: "To Do", "In Progress", "Review", "Done" — use `browser_snapshot` to inspect the DOM if labels aren't obvious from screenshot
4. `browser_screenshot` — confirm at least one lane contains a card (seeded data)
5. Confirm the filter bar is visible at the top (Epic, Feature, Sprint dropdowns or similar controls)
6. `browser_screenshot` — confirm the "Manage Lanes" button is visible in the board header

---

### Card Create Flow (if requested)

**Purpose:** Test card creation via AddCardForm in a lane.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board`
2. `browser_screenshot` — confirm board loaded
3. Locate the first lane ("To Do") and find the "Add card" button or collapsed form at the bottom of the lane
4. `browser_click` on the "Add card" button to expand the form
5. `browser_screenshot` — confirm the form expanded (textarea, priority select, assignee input visible)
6. `browser_type` into the card title textarea: `Board test card [timestamp]` (use a timestamp for uniqueness, e.g. the current minute)
7. `browser_click` the priority select and choose `p1` (high)
8. `browser_type` into the assignee field: `admin`
9. `browser_screenshot` — confirm all fields are filled
10. `browser_click` the "Add" / submit button (or press Enter in the textarea)
11. `browser_screenshot` — confirm the new card appears at the bottom of the "To Do" lane with the correct title and priority badge
12. Verify the card shows the assignee name or avatar

---

### Card DnD Flow (if requested)

**Purpose:** Test drag-and-drop card movement between swim lanes.

**Pre-condition:** A card must exist in the first lane. If none exists after the `card-create` flow or from seeded data, create one first using the same steps as Card Create Flow before proceeding.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board` (skip if already on board)
2. `browser_screenshot` — confirm board loaded with cards in at least the first lane
3. Locate a card in the "To Do" lane — note its title for verification after the drag
4. `browser_drag` the card element from the "To Do" lane to the "In Progress" lane using `browser_drag` (drag from card center to destination lane column center)
5. `browser_screenshot` — confirm the card has moved to the "In Progress" lane (card no longer in "To Do", now visible in "In Progress")
6. Verify the card title in the destination lane matches the dragged card
7. `browser_screenshot` — confirm SSE-driven optimistic update: the card should appear in the new lane without a page reload

---

### Card Modal Flow (if requested)

**Purpose:** Test the CardModal — open it, cycle through all 6 tabs, and post an @mention comment.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board` (skip if already on board)
2. `browser_screenshot` — confirm board loaded
3. `browser_click` on any card to open the `CardModal`
4. `browser_screenshot` — confirm the modal is open (card title visible in modal header)
5. Click the **Description** tab — `browser_screenshot` (confirm description editor or placeholder is visible)
6. Click the **Comments** tab — `browser_screenshot` (confirm the comment input is visible)
7. `browser_type` a comment in the comment input: `Review needed @admin please check this`
8. `browser_click` the "Post" / submit button
9. `browser_screenshot` — confirm the comment is saved and the `@admin` mention is highlighted (styled differently from plain text)
10. Click the **Activity** tab — `browser_screenshot` (confirm activity log entries are visible)
11. Click the **Tests** tab — `browser_screenshot` (confirm test cases section renders, even if empty)
12. Click the **Dependencies** tab — `browser_screenshot` (confirm dependency section renders)
13. Click the **Integrations** tab — `browser_screenshot` (confirm integrations section renders, even if showing "no integrations")
14. Close the modal by clicking the X button or pressing Escape
15. `browser_screenshot` — confirm the modal is closed and the board is visible again

---

### Card Edit Flow (if requested)

**Purpose:** Test editing card fields (title, priority, story points, due date, assignee) from inside the CardModal.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board` (skip if already on board)
2. `browser_click` on any card to open the `CardModal`
3. `browser_screenshot` — confirm the modal is open
4. Locate the card title field in the modal header and `browser_click` it to make it editable
5. Select all existing text (Ctrl+A) and `browser_type` a new title: `Edited card title [timestamp]`
6. Press Enter or `browser_click` outside the field to save
7. `browser_screenshot` — confirm the title updated in the modal header
8. Locate the priority selector and `browser_click` it
9. Select a different priority (e.g. `p0` — critical)
10. `browser_screenshot` — confirm the priority badge updated
11. Locate the story points input and `browser_type` a value: `5`
12. `browser_screenshot` — confirm story points saved
13. Locate the assignee field and clear/update it (type `admin` if assignee field is a text input or dropdown)
14. `browser_screenshot` — confirm assignee updated
15. Close the modal and `browser_screenshot` — confirm the card on the board reflects the updated title and priority badge

---

### Card Tasks Flow (if requested)

**Purpose:** Test the task checklist within a card — add, check off, and delete tasks.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board` (skip if already on board)
2. `browser_click` on any card to open the `CardModal`
3. `browser_screenshot` — confirm the modal is open
4. Navigate to or locate the tasks/checklist section within the modal (may be on the main view or a dedicated tab)
5. `browser_click` on "Add task" or the task input area
6. `browser_type` a task title: `Write unit tests`
7. Press Enter or `browser_click` the add/submit button
8. `browser_screenshot` — confirm the task appears in the checklist
9. `browser_type` a second task: `Update documentation`
10. Press Enter or submit
11. `browser_screenshot` — confirm two tasks are now in the checklist
12. `browser_click` the checkbox next to "Write unit tests" to mark it done
13. `browser_screenshot` — confirm the task shows a checked state (strikethrough, checkmark, or different styling)
14. Locate the delete button (trash icon or X) next to "Update documentation" and `browser_click` it
15. `browser_screenshot` — confirm the task was removed from the checklist
16. Verify the task summary badge on the card (e.g. "1/1 tasks") reflects the completed state
17. Close the modal

---

### Filters Flow (if requested)

**Purpose:** Test Epic, Feature, and Sprint filter dropdowns that narrow the visible cards.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board`
2. `browser_screenshot` — confirm board loaded with all cards visible
3. Locate the **Epic** filter dropdown in the board header/filter bar
4. `browser_click` on the Epic dropdown
5. `browser_screenshot` — confirm the epic options list opened
6. Select a specific epic from the list (first non-default option, if any)
7. `browser_screenshot` — confirm the board filtered (fewer or different cards visible, or "no cards" message if that epic has none)
8. `browser_click` the Epic dropdown again and select "All Epics" or clear the filter to reset
9. `browser_screenshot` — confirm all cards are visible again
10. Locate the **Feature** filter dropdown
11. `browser_click` on the Feature dropdown and select a feature
12. `browser_screenshot` — confirm the board filtered by that feature
13. Clear the feature filter
14. Locate the **Sprint** filter dropdown (in the board header)
15. `browser_click` on the Sprint dropdown and select a non-active sprint (if available)
16. `browser_screenshot` — confirm the board updated to show that sprint's cards
17. Clear the sprint filter and `browser_screenshot` — confirm board reset to default view

---

### Lanes Flow (if requested)

**Purpose:** Test the ManageLanesModal — create a new lane, rename it, toggle done-column status, and delete it.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/board`
2. `browser_screenshot` — confirm board loaded
3. Locate the "Manage Lanes" button in the board header and `browser_click` it
4. `browser_screenshot` — confirm the ManageLanesModal opened, showing the existing lanes list (e.g. "To Do", "In Progress", "Review", "Done")
5. Locate the "Add lane" input at the bottom of the modal
6. `browser_type` into the new lane name input: `Staging [timestamp]`
7. `browser_click` the "Add" / submit button
8. `browser_screenshot` — confirm the new lane "Staging [timestamp]" appears in the lanes list
9. Locate the newly created lane row and `browser_click` on the lane name to rename it (inline edit)
10. Select all text (Ctrl+A) and `browser_type`: `Pre-Release [timestamp]`
11. Press Enter or `browser_click` outside the field to save the rename
12. `browser_screenshot` — confirm the lane name updated to "Pre-Release [timestamp]"
13. Locate the "Done column" toggle/badge for the renamed lane and `browser_click` it to mark it as a done column
14. `browser_screenshot` — confirm the done-column indicator changed (badge, color, or label updated)
15. Click the toggle again to revert it back to non-done
16. `browser_screenshot` — confirm the done-column status reverted
17. Locate the delete button (trash icon) next to the lane and `browser_click` it
18. If a confirmation dialog appears, `browser_click` "Confirm" / "Delete"
19. `browser_screenshot` — confirm the lane is removed from the list
20. `browser_click` "Save" or "Apply" to close the modal and persist changes
21. `browser_screenshot` — confirm the board no longer shows the deleted lane column

---

## Step 5 — Generate Report

Compile the results of each flow into a summary table and report:

```
## Board Verification Report

| Flow         | Status    | Notes                                                      |
|--------------|-----------|------------------------------------------------------------|
| load         | ✅ PASS   | All 4 lanes rendered, filter bar visible                   |
| card-create  | ✅ PASS   | Card created with title, p1 priority, and assignee         |
| card-dnd     | ✅ PASS   | Card dragged To Do → In Progress, SSE update confirmed     |
| card-modal   | ✅ PASS   | All 6 tabs rendered, @admin mention comment saved          |
| card-edit    | ✅ PASS   | Title, priority, story points, assignee updated            |
| card-tasks   | ✅ PASS   | Tasks added, checked off, deleted; badge updated           |
| filters      | ✅ PASS   | Epic/Feature/Sprint filters narrowed board cards correctly |
| lanes        | ✅ PASS   | Lane created, renamed, done-toggled, deleted               |
```

For each flow, note:
- **Status:** `✅ PASS`, `❌ FAIL`, or `⏭ SKIPPED`
- **Notes:** Brief description of what was verified or what went wrong (or why it was skipped)

Embed a representative screenshot from each flow for visual confirmation.

---

## Step 6 — Artifact Cleanup

After the report is complete, move all generated files into the run folder:

```bash
mv .playwright-mcp/*.log "$RUN_DIR/" 2>/dev/null || true
mv .playwright-mcp/*.yml "$RUN_DIR/" 2>/dev/null || true
mv .playwright-mcp/*.png "$RUN_DIR/" 2>/dev/null || true
echo "All artifacts saved to $RUN_DIR"
```

This keeps each run's screenshots, logs, and snapshots isolated in its own timestamped subfolder, preventing conflicts between concurrent or sequential runs.

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| Health check fails | Dev server not running | Run `npm run dev` in another terminal |
| Login times out | Login form not found or incorrect selectors | Check that frontend is on `$FRONTEND_PORT` (5173 or 5174) |
| Board doesn't load | No seeded project data | Run `/seed-db` to reset and re-seed the database |
| Card won't drag | DnD not initialised or pointer sensor not firing | Use `browser_drag` from the card's center; ensure the board is scrolled so both source and target are in viewport |
| AddCardForm not visible | Lane has no cards or UI changed | Click anywhere in the lane column first; use `browser_snapshot` to inspect lane DOM structure |
| Modal tabs missing | CardModal structure changed | Use `browser_snapshot` after opening modal to identify current tab selectors |
| Task section not found | Tasks live in a sub-section of the modal | Scroll inside the modal; use `browser_snapshot` to locate the checklist area |
| Filters have no options | No epics/features/sprints in seeded data | Run `/seed-db` to ensure realistic test data is present |
| ManageLanesModal won't save | Lane has cards and can't be deleted | Only attempt to delete the newly created test lane, never a pre-existing lane that might have cards |
| SSE update not reflected | EventSource not connected | Check browser console for EventSource errors; verify `/api/events` is reachable |

---

**Session Notes:**

- All flows share the same browser context (one login establishes the session for all subsequent flows)
- Mutations (cards created, lanes added) persist in the dev database (`server/slateflow.db`) — reset anytime with `/seed-db`
- The `card-dnd` flow depends on cards existing in the first lane; run `card-create` first (or rely on seeded data) if the board is empty
- Screenshots are embedded as base64; in the report, call out any visual anomalies (missing lanes, broken DnD, blank modal tabs, filter dropdown not populating)
- If any flow fails, report the failure clearly and suggest next debugging steps
- **Artifacts:** All screenshots (`*.png`), console logs (`*.log`), and page snapshots (`*.yml`) from this run are automatically moved into `.playwright-mcp/run-<timestamp>/` at the end — concurrent and sequential runs stay isolated
