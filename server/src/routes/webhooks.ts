import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '../db/index.js'
import { ok, err } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { isEnabled } from '../lib/featureFlags.js'

const webhooks = new Hono()

// ── Shared: move card to done lane ────────────────────────────────────────────

async function moveCardToDone(cardId: number): Promise<void> {
  const card = await db.get<{ id: number; swim_lane_id: number | null }>(
    'SELECT id, swim_lane_id FROM cards WHERE id = ?',
    cardId,
  )
  if (!card) return

  // Resolve the project for this card
  const lane = card.swim_lane_id
    ? await db.get<{ project_id: number; is_done_col: number }>(
        'SELECT project_id, is_done_col FROM swim_lanes WHERE id = ?',
        card.swim_lane_id,
      )
    : null
  if (!lane) return

  // Already in done lane — nothing to do
  if (lane.is_done_col === 1) return

  // Find the done lane for this project
  const doneLane = await db.get<{ id: number }>(
    'SELECT id FROM swim_lanes WHERE project_id = ? AND is_done_col = 1 LIMIT 1',
    lane.project_id,
  )
  if (!doneLane) return

  // Calculate the position at end of done lane
  const maxPos = await db.get<{ m: number }>(
    'SELECT COALESCE(MAX(position), -1) AS m FROM cards WHERE swim_lane_id = ?',
    doneLane.id,
  )
  const newPos = (maxPos?.m ?? -1) + 1

  await db.run(
    "UPDATE cards SET swim_lane_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?",
    doneLane.id,
    newPos,
    cardId,
  )
  await db.run(
    "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'move', ?)",
    cardId,
    JSON.stringify({
      from_lane_id: card.swim_lane_id,
      to_lane_id: doneLane.id,
      reason: 'pr_merged',
    }),
  )

  const movedCard = await db.get('SELECT * FROM cards WHERE id = ?', cardId)
  emitBoardEvent({ type: 'card:moved', projectId: lane.project_id, data: movedCard })
}

// ── Shared: find linked cards and update link state ───────────────────────────

async function processLinksMerged(
  provider: 'github' | 'gitlab',
  repoUrl: string,
  prNumber: number,
  mergedAt: string,
): Promise<void> {
  const links = await db.all<{ id: number; card_id: number }>(
    "SELECT id, card_id FROM card_links WHERE provider = ? AND repo_url = ? AND number = ? AND state != 'merged'",
    provider,
    repoUrl,
    prNumber,
  )
  for (const link of links) {
    await db.run(
      "UPDATE card_links SET state = 'merged', merged_at = ? WHERE id = ?",
      mergedAt,
      link.id,
    )
    await moveCardToDone(link.card_id)
  }
}

// ── POST /webhooks/github ─────────────────────────────────────────────────────

webhooks.post('/webhooks/github', async (c) => {
  if (!(await isEnabled('github_integration'))) return err(c, 'not found', 404)

  // Read raw body for HMAC verification (must be done before any .json() call)
  const rawBody = await c.req.text()

  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (secret) {
    const sig = c.req.header('x-hub-signature-256') ?? ''
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    // Constant-time comparison to prevent timing attacks
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return err(c, 'invalid signature', 401)
    }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return err(c, 'invalid JSON', 400)
  }

  const event = c.req.header('x-github-event')

  // Handle pull_request events where action = 'closed' and merged = true
  if (event === 'pull_request') {
    const pr = payload as {
      action?: string
      pull_request?: {
        number?: number
        merged?: boolean
        merged_at?: string | null
        base?: { repo?: { html_url?: string } }
        title?: string
        html_url?: string
      }
    }
    if (
      pr.action === 'closed' &&
      pr.pull_request?.merged === true &&
      pr.pull_request?.number &&
      pr.pull_request?.base?.repo?.html_url
    ) {
      const repoUrl = pr.pull_request.base.repo.html_url
      const prNumber = pr.pull_request.number
      const mergedAt = pr.pull_request.merged_at ?? new Date().toISOString()
      await processLinksMerged('github', repoUrl, prNumber, mergedAt)
    }
  }

  // Handle issues events where action = 'closed'
  if (event === 'issues') {
    const issue = payload as {
      action?: string
      issue?: { number?: number }
      repository?: { html_url?: string }
    }
    if (issue.action === 'closed' && issue.issue?.number && issue.repository?.html_url) {
      const repoUrl = issue.repository.html_url
      const issueNumber = issue.issue.number
      await db.run(
        `UPDATE card_links SET state = 'closed'
         WHERE provider = 'github' AND type = 'issue' AND repo_url = ? AND number = ? AND state = 'open'`,
        repoUrl, issueNumber,
      )
    }
  }

  return ok(c, { received: true })
})

// ── POST /webhooks/gitlab ─────────────────────────────────────────────────────

webhooks.post('/webhooks/gitlab', async (c) => {
  if (!(await isEnabled('gitlab_integration'))) return err(c, 'not found', 404)

  const secret = process.env.GITLAB_WEBHOOK_SECRET
  if (secret) {
    const token = c.req.header('x-gitlab-token') ?? ''
    if (token !== secret) return err(c, 'invalid token', 401)
  }

  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return err(c, 'invalid JSON', 400)
  }

  const event = c.req.header('x-gitlab-event')

  // Handle "Merge Request Hook" where object_attributes.state = 'merged'
  if (event === 'Merge Request Hook') {
    const mr = payload as {
      object_attributes?: {
        state?: string
        iid?: number
        merged_at?: string | null
        url?: string
      }
      project?: { web_url?: string }
    }
    if (
      mr.object_attributes?.state === 'merged' &&
      mr.object_attributes?.iid &&
      mr.project?.web_url
    ) {
      const repoUrl = mr.project.web_url
      const mrNumber = mr.object_attributes.iid
      const mergedAt = mr.object_attributes.merged_at ?? new Date().toISOString()
      await processLinksMerged('gitlab', repoUrl, mrNumber, mergedAt)
    }
  }

  return ok(c, { received: true })
})

export default webhooks
