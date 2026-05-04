# CLAassistant Setup Guide

This guide walks you through integrating the CLAassistant bot with your GitHub repository to automate CLA signing enforcement.

---

## Overview

**CLAassistant** is a third-party service that:
- Automatically checks PR authors against a CLA registry
- Posts a comment on PRs with a signing link (if not signed)
- Provides a status check that can be required before merge
- Stores signatures securely with immutable audit trail
- Works with GitHub Pull Requests natively

**Benefits:**
- ✅ Zero maintenance — no custom code required
- ✅ Contributor-friendly — simple 2-minute signing process
- ✅ Immutable audit trail — signatures recorded in PR comments
- ✅ Optional branch protection — can enforce hard requirement to sign

---

## Prerequisites

- GitHub repository with admin/maintainer access
- No GitHub App installation required initially (can authorize on first login)

---

## Step 1: Create CLAassistant Account

1. Go to **[claassistant.io](https://claassistant.io)**
2. Click **"Sign in with GitHub"**
3. Authorize the CLAassistant GitHub App to access your profile
   - Permissions: Read public profile, access repositories (for linking)
4. You'll be redirected to the CLAassistant dashboard

---

## Step 2: Link Your GitHub Repository

1. In the CLAassistant dashboard, click **"New Project"** or **"Add Repository"**
2. Select the SlateFlow repository from the dropdown
   - If not listed, click "Refresh" to sync your repos
   - You must have admin access to the repository
3. Click **"Link"** or **"Next"**

---

## Step 3: Upload CLA Document

1. In the project settings, navigate to **"CLA Document"** or **"Agreement"**
2. Choose upload method:
   - **Option A: Direct Paste** — Copy the full text from [CLA.md](../CLA.md) and paste into the text editor
   - **Option B: Upload File** — If available, upload the `CLA.md` file directly
   - **Option C: URL** — If CLA.md is publicly hosted, link the URL

3. **Paste the CLA text:**
   ```
   # SlateFlow Individual Contributor License Agreement
   
   [Full text from CLA.md starting at line 1]
   ...
   ```

4. Click **"Save"** or **"Confirm"**

---

## Step 4: Configure CLAassistant Settings

1. In project settings, look for **"Settings"** or **"Configuration"** section
2. Configure these options:

   | Setting | Value | Notes |
   |---------|-------|-------|
   | **CLA Type** | Individual | We only use Individual CLA (not Corporate) |
   | **Require Email** | Yes | Contributor must provide valid email |
   | **Allow GitHub OAuth** | Yes (optional) | Simplifies sign-in if contributors want it |
   | **Whitelist Mode** | Off (initially) | Enable later if whitelisting maintainers |
   | **Allow PR to proceed** | No | CLA check must pass before merge consideration |
   | **Signature retention** | Unlimited | Keep signatures indefinitely for audit trail |

3. Click **"Save Settings"**

---

## Step 5: Authorize CLAassistant GitHub App

1. Back in the project settings, look for **"GitHub Integration"** or **"Authorize App"**
2. Click **"Install GitHub App"** or **"Authorize"**
3. You'll be redirected to GitHub's authorization page
4. Select the SlateFlow repository to grant CLAassistant access
5. Click **"Install"** or **"Authorize"**
6. CLAassistant will be redirected back to confirm success

---

## Step 6: Enable Repository Check (Optional but Recommended)

To make the CLA check a hard requirement before merge, configure GitHub branch protection:

1. Go to your GitHub repository
2. Navigate to **Settings → Branches → Branch protection rules**
3. Click **"Add rule"** (if none exist) or edit the existing rule for `main`
4. Under **"Require status checks to pass before merging"**:
   - Search for `"CLAassistant"` and select it
   - Checkmark it as required
5. Scroll down and click **"Create"** or **"Update"**

**Result:** PRs cannot be merged without ✅ "CLA Signed" status.

---

## Step 7: Test the Workflow

### Test as a New Contributor

1. Create a test branch in your local repo:
   ```bash
   git checkout -b test/cla-check
   git commit --allow-empty -m "test: CLA bot integration"
   git push origin test/cla-check
   ```

2. Open a **Draft Pull Request** on GitHub from `test/cla-check` → `main`
   - Title: "Test: CLA Bot Integration"
   - Description: "This is a test PR to verify CLAassistant bot integration"
   - Mark as Draft (don't request review yet)

3. Wait a few seconds for CLAassistant bot to post a comment
   - You should see a comment like: ❌ "CLA Not Signed — Please sign the CLA to proceed"
   - The comment includes a link: "Sign CLA"

4. Click the **"Sign CLA"** link
   - A modal or new tab opens with the CLA signing form
   - Fill in: Full Name, Email, optionally GitHub OAuth
   - Click **"Sign"**

5. Return to the GitHub PR
   - Refresh the page
   - CLAassistant bot should post an update: ✅ "CLA Signed"
   - The PR status check should now show green

6. Clean up:
   ```bash
   git push origin --delete test/cla-check  # delete remote branch
   git branch -D test/cla-check              # delete local branch
   ```

### Verify Branch Protection

1. Try to merge the test PR directly (without re-opening or changing status)
2. You should see: "Branch protection rule" blocks merge until CLA check passes
3. Try merging after CLA signature is confirmed (✅ status)
4. Merge should succeed

---

## Step 8: Configure Whitelist (Optional)

If you want core maintainers to skip CLA signing for rapid iteration:

1. In CLAassistant project settings, find **"Whitelisted Users"** or **"Exemptions"**
2. Add GitHub usernames of maintainers (e.g., `@your-github-handle`, `@coauthor1`)
3. These users' PRs will skip CLA check automatically (status will show ✅ without signing)
4. Click **"Save"**

---

## Step 9: Notify Contributors

Once CLAassistant is live, inform your contributor community:

1. **Update README.md** — Add a line: "All contributions require a signed CLA (see [CONTRIBUTING.md](CONTRIBUTING.md) and [CLA.md](CLA.md))"
2. **Announce in Discussions or Issues** — Post a pinned issue explaining the new CLA requirement
3. **Existing PRs** — Comment on open PRs to let contributors know they'll need to sign before merge
4. **Welcome guide** — Reference [CLA_FAQ.md](docs/CLA_FAQ.md) in your onboarding docs

---

## Troubleshooting

### Bot Doesn't Comment on PR

**Possible causes:**
- CLAassistant GitHub App not authorized for the repository
- Bot is experiencing downtime
- PR was created before bot authorization

**Fix:**
1. Check CLAassistant dashboard — verify repository is linked and active
2. Re-authorize the app: GitHub Settings → Integrations → CLAassistant → Re-authorize
3. Close and reopen the PR (or mention @CLAssistant in a comment to trigger re-check)

### Status Check Not Appearing

**Possible causes:**
- Branch protection rule not configured
- Status check named differently

**Fix:**
1. In GitHub repo settings, verify branch protection rule includes CLAassistant status check
2. In CLAassistant, verify GitHub App is authorized

### Whitelist Not Working

**Possible causes:**
- GitHub username misspelled
- Whitelist setting not saved
- User not signed in with the whitelisted GitHub account when creating PR

**Fix:**
1. Verify usernames in CLAassistant whitelist (double-check spelling)
2. Whitelist user must create/push PR with the whitelisted account (if they use multiple accounts, it won't work)

### Signature Lost / Not Recognized

**Possible causes:**
- User signed with different email than their GitHub-associated email
- Account linking issue

**Fix:**
1. User can re-sign the CLA with their GitHub-associated email
2. CLAassistant will recognize the new signature on the next PR

---

## References

- **CLAassistant Official Docs:** https://claassistant.io/docs
- **SlateFlow CLA:** [CLA.md](../CLA.md)
- **CLA FAQ:** [docs/CLA_FAQ.md](../docs/CLA_FAQ.md)
- **GitHub Branch Protection Docs:** https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches

---

## Support

- **CLAassistant Support:** Support email or chat at [claassistant.io](https://claassistant.io)
- **SlateFlow Maintainers:** File an issue or discussion in the SlateFlow repo

---

**Last updated:** May 2026
