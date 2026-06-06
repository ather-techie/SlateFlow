---
name: playwright-admin-panel
description: Run deep browser UI tests against the admin panels (global and project-level) using MCP Playwright.
---

# MCP Playwright Admin Panel Testing

You are executing the `/playwright-admin-panel` skill. Follow these steps exactly.

This skill runs a sequence of browser-based UI verification flows against the SlateFlow admin panels using MCP Playwright. It tests both the global admin surface (`/admin`) and project-level admin surface (`/projects/:id/admin`), covering user management, feature flag toggling, holidays, project members, project settings, and swim lane configuration.

## Accepted Arguments

```
/playwright-admin-panel                    # run all 6 flows (default)
/playwright-admin-panel users              # only global Users tab
/playwright-admin-panel flags              # only Settings/feature-flags tab
/playwright-admin-panel holidays           # only Holidays tab
/playwright-admin-panel project-members    # only Project Admin Members tab
/playwright-admin-panel project-settings   # only Project Admin Settings tab
/playwright-admin-panel project-lanes      # only Project Admin Lanes tab
```

Valid flow tokens: `users`, `flags`, `holidays`, `project-members`, `project-settings`, `project-lanes`

If no flows are specified, all 6 run.

---

## Step 1 — Parse and Validate Arguments

Determine which flows to run from the command arguments. Default: all (`users`, `flags`, `holidays`, `project-members`, `project-settings`, `project-lanes`).

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

### Users Flow (if requested)

**Purpose:** Test global admin user management — create, edit, deactivate, delete.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/admin`
2. `browser_screenshot` — confirm admin panel loaded, Users tab is active
3. `browser_screenshot` — confirm user table has existing rows (e.g., `admin@flow.local` visible)
4. `browser_click` on "Create User", "+ New User", or similar button
5. Fill the user creation form:
   - `browser_type` into email field: `testuser_[timestamp]@example.com` (use timestamp to ensure uniqueness)
   - `browser_type` into display name field: `Test User [timestamp]`
   - `browser_type` into password field: `TestPass123!`
   - `browser_click` on role dropdown and select `global_reader`
6. `browser_click` the "Create" / submit button
7. `browser_screenshot` — confirm the new user appears in the user table
8. Locate the newly created user row and `browser_click` "Edit Skills" link/button
9. `browser_screenshot` — confirm the skills modal opened
10. Close the modal (Escape or X button) — `browser_screenshot`
11. Locate the newly created user row and `browser_click` the role dropdown
12. Select `super_admin` from the dropdown
13. `browser_screenshot` — confirm role changed to `super_admin` in the table
14. Locate the newly created user row and `browser_click` "Deactivate" / toggle button
15. `browser_screenshot` — confirm the user status changed (e.g., badge now shows "Inactive")
16. Locate the newly created user row and `browser_click` "Delete" button
17. If a confirmation dialog appears, `browser_click` "Confirm" / "Yes"
18. `browser_screenshot` — confirm the user is removed from the table

### Flags Flow (if requested)

**Purpose:** Test feature flag toggling and sidebar UI updates.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/admin`
2. `browser_screenshot` — confirm admin panel loaded
3. `browser_click` on the "Settings" tab
4. `browser_screenshot` — confirm feature flag toggles are visible (showing rows like "Calendar", "Retrospective", etc.)
5. Locate the `retrospective` flag row (by label or key)
6. `browser_screenshot` — note its current toggle state (on/off)
7. `browser_click` the toggle button for the `retrospective` flag
8. `browser_screenshot` — confirm the toggle state flipped visually
9. `browser_navigate` to `http://localhost:$FRONTEND_PORT/dashboard`
10. `browser_screenshot` — check the sidebar navigation; if `retrospective` was toggled ON, the "Retrospective" link should appear (or disappear if toggled OFF)
11. `browser_navigate` back to `http://localhost:$FRONTEND_PORT/admin`
12. `browser_click` the "Settings" tab
13. `browser_click` the `retrospective` flag toggle again to revert it to its original state
14. `browser_screenshot` — confirm the toggle is back to original state

### Holidays Flow (if requested)

**Purpose:** Test holiday management (calendar-gated feature).

**Pre-condition check:** This flow only runs if the `calendar` feature flag is enabled. If the flag is disabled, skip this flow with a note: `SKIPPED — calendar feature flag is off`.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/admin`
2. Check if the "Holidays" tab is visible. If not, return early with `SKIPPED — Holidays tab not visible (calendar flag disabled)`.
3. `browser_click` on the "Holidays" tab
4. `browser_screenshot` — confirm the holidays list is visible
5. `browser_click` on "Add Holiday" or "+ New Holiday" button
6. Fill the holiday creation form:
   - `browser_type` into title field: `Test Holiday [timestamp]`
   - `browser_click` on the date picker and select a date (e.g., next week)
   - `browser_click` on country dropdown and select a country (e.g., "United States")
7. `browser_click` "Create" / "Save" button
8. `browser_screenshot` — confirm the new holiday appears in the list
9. Locate the newly created holiday row and `browser_click` "Edit" button
10. `browser_type` into the title field to modify it (append " (edited)") and confirm the field cleared before typing
11. `browser_click` "Save"
12. `browser_screenshot` — confirm the updated title is displayed in the list
13. Locate the edited holiday row and `browser_click` "Delete" button
14. If a confirmation dialog appears, `browser_click` "Confirm" / "Yes"
15. `browser_screenshot` — confirm the holiday is removed from the list

### Project Members Flow (if requested)

**Purpose:** Test project-level admin member management.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/admin`
2. `browser_screenshot` — confirm Project Admin panel loaded with Members tab active
3. `browser_screenshot` — confirm the members table shows existing rows
4. `browser_click` on "Add Member" or "+ Add Member" button
5. A search/select modal should appear. `browser_type` into the search field to find a user (e.g., type "admin" to find admin@flow.local, or pick any available user)
6. `browser_click` on a user from the search results to select it
7. `browser_click` on the role dropdown and select `contributor`
8. `browser_click` "Add" / "Save" button
9. `browser_screenshot` — confirm the new member appears in the members table with role `contributor`
10. Locate the newly added member row and `browser_click` on the role dropdown
11. Select `reader` from the dropdown
12. `browser_screenshot` — confirm the role changed to `reader` in the table
13. Locate the member row and `browser_click` "Remove" button
14. If a confirmation dialog appears, `browser_click` "Confirm" / "Yes"
15. `browser_screenshot` — confirm the member is removed from the table

### Project Settings Flow (if requested)

**Purpose:** Test project metadata editing.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/admin`
2. `browser_click` on the "Settings" tab
3. `browser_screenshot` — confirm the project name and description fields are visible
4. Locate the project name input field and `browser_type` to append " (edited)" to the existing name (use Ctrl+End or Cmd+End to move to end of field, then type)
5. `browser_click` "Save" button
6. `browser_screenshot` — confirm the project name in the page header or breadcrumb updated to show " (edited)"
7. Locate the project description input field and `browser_type` to modify it (e.g., append " — Updated")
8. `browser_click` "Save" button
9. `browser_screenshot` — confirm the description updated
10. Edit the name again to remove " (edited)" and revert to the original
11. `browser_click` "Save"
12. `browser_screenshot` — confirm the name reverted

### Project Lanes Flow (if requested)

**Purpose:** Test swim lane CRUD and done-column configuration.

1. `browser_navigate` to `http://localhost:$FRONTEND_PORT/projects/1/admin`
2. `browser_click` on the "Lanes" tab
3. `browser_screenshot` — confirm the lanes list is visible with existing lanes (e.g., "To Do", "In Progress", "Review", "Done")
4. Scroll to the bottom to find the "Add Lane" input or button
5. `browser_type` into the lane name field: `QA Review [timestamp]`
6. `browser_click` the "Add" / "Create" button
7. `browser_screenshot` — confirm the new lane appears in the lanes list
8. Locate the newly created lane row and `browser_click` on the lane name (or an edit icon) to rename it
9. Select all the text (Ctrl+A / Cmd+A) and `browser_type`: `QA Verification [timestamp]`
10. Press Enter or `browser_click` outside the field to save the rename
11. `browser_screenshot` — confirm the lane name updated
12. Locate the lane row and find the "Done" column toggle (e.g., a badge or toggle button)
13. `browser_click` to toggle the "Done" column status
14. `browser_screenshot` — confirm the badge changed (e.g., from "Normal" to "Done" or vice versa)
15. Locate the lane row and `browser_click` "Delete" button
16. If a confirmation dialog appears, `browser_click` "Confirm" / "Yes"
17. `browser_screenshot` — confirm the lane is removed from the list

---

## Step 5 — Generate Report

Compile the results of each flow into a summary table and report:

```
## Admin Panel Verification Report

| Flow              | Status    | Notes                                        |
|-------------------|-----------|----------------------------------------------|
| users             | ✅ PASS   | Created, role changed, deactivated, deleted  |
| flags             | ✅ PASS   | Retrospective flag toggled; sidebar updated  |
| holidays          | ✅ PASS   | Holiday created, edited, deleted             |
| project-members   | ✅ PASS   | Member added, role changed, removed          |
| project-settings  | ✅ PASS   | Name and description edited and reverted     |
| project-lanes     | ✅ PASS   | Lane created, renamed, done-toggled, deleted |
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
| Login times out | Login form not found or incorrect selectors | Check that frontend is on `$FRONTEND_PORT` (5173 or 5174) and the login page loads |
| Admin panel doesn't load | User is not super_admin or feature flag is off | Verify using the `admin@flow.local` super_admin account |
| User creation fails | Form field selectors changed in code | Use `browser_screenshot` after each field to identify the correct selector |
| Member add dialog doesn't appear | Modal structure changed | Take screenshots after clicking "Add Member" to diagnose |
| Lanes tab not visible | Project structure changed | Verify that `/projects/1/admin` loads and "Lanes" tab is present |
| Feature flag toggle doesn't persist | DB not seeded or API error | Check server logs and re-seed database with `/seed-db` |
| Holidays tab missing | Calendar feature flag is disabled | This is expected; flow will be skipped with a note |

---

**Session Notes:**

- All flows share the same browser context (one login establishes the session for all subsequent flows)
- Mutations (users created, flags toggled, lanes added) persist in the dev database (`server/slateflow.db`) — reset anytime with `/seed-db`
- Screenshots are embedded as base64; in the report, call out any visual anomalies (missing fields, broken buttons, layout breaks)
- If any flow fails, report the failure clearly and suggest next debugging steps
- **Artifacts:** All screenshots (`*.png`), console logs (`*.log`), and page snapshots (`*.yml`) from this run are automatically moved into `.playwright-mcp/run-<timestamp>/` at the end — concurrent and sequential runs stay isolated
