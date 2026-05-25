import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { canWrite } from '../lib/projectAccess.js'
import { isEnabled } from '../lib/featureFlags.js'

const cardLinks = new Hono()

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive provider, type, repo_url, number|sha from a raw URL string. */
function parseUrl(rawUrl: string): {
  provider: 'github' | 'gitlab'
  type: 'pr' | 'mr' | 'commit' | 'issue'
  repo_url: string
  number: number | null
  sha: string | null
} | null {
  try {
    const u = new URL(rawUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    // GitHub: github.com/:owner/:repo/pull/:number
    //         github.com/:owner/:repo/commit/:sha
    if (u.hostname === 'github.com') {
      if (parts[2] === 'pull' && parts[3]) {
        return {
          provider: 'github',
          type: 'pr',
          repo_url: `https://github.com/${parts[0]}/${parts[1]}`,
          number: parseInt(parts[3], 10),
          sha: null,
        }
      }
      if (parts[2] === 'commit' && parts[3]) {
        return {
          provider: 'github',
          type: 'commit',
          repo_url: `https://github.com/${parts[0]}/${parts[1]}`,
          number: null,
          sha: parts[3],
        }
      }
      if (parts[2] === 'issues' && parts[3]) {
        return {
          provider: 'github',
          type: 'issue',
          repo_url: `https://github.com/${parts[0]}/${parts[1]}`,
          number: parseInt(parts[3], 10),
          sha: null,
        }
      }
    }
    // GitLab: gitlab.com/:owner/:repo/-/merge_requests/:number
    //         gitlab.com/:owner/:repo/-/commit/:sha (or /commits/:sha)
    if (u.hostname === 'gitlab.com' || u.hostname.includes('gitlab')) {
      const mrIdx = parts.indexOf('merge_requests')
      if (mrIdx !== -1 && parts[mrIdx + 1]) {
        const repoOwner = parts.slice(0, mrIdx - 1).join('/')
        return {
          provider: 'gitlab',
          type: 'mr',
          repo_url: `${u.origin}/${repoOwner}`,
          number: parseInt(parts[mrIdx + 1], 10),
          sha: null,
        }
      }
      const commitIdx =
        parts.indexOf('commit') !== -1 ? parts.indexOf('commit') : parts.indexOf('commits')
      if (commitIdx !== -1 && parts[commitIdx + 1]) {
        const repoOwner = parts.slice(0, commitIdx - 1).join('/')
        return {
          provider: 'gitlab',
          type: 'commit',
          repo_url: `${u.origin}/${repoOwner}`,
          number: null,
          sha: parts[commitIdx + 1],
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Optionally fetch a title from GitHub API (when GITHUB_TOKEN is set). */
async function fetchGitHubTitle(parsed: ReturnType<typeof parseUrl>): Promise<string> {
  const token = process.env.GITHUB_TOKEN
  if (!token || !parsed) return ''
  try {
    const repoPath = parsed.repo_url.replace('https://github.com/', '')
    const apiUrl =
      parsed.type === 'pr'
        ? `https://api.github.com/repos/${repoPath}/pulls/${parsed.number}`
        : parsed.type === 'issue'
          ? `https://api.github.com/repos/${repoPath}/issues/${parsed.number}`
          : `https://api.github.com/repos/${repoPath}/commits/${parsed.sha}`
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'slateflow',
      },
    })
    if (!res.ok) return ''
    const json = (await res.json()) as {
      title?: string
      commit?: { message?: string }
    }
    return json.title ?? json.commit?.message?.split('\n')[0] ?? ''
  } catch {
    return ''
  }
}

/** Optionally fetch a title from GitLab API (when GITLAB_TOKEN is set). */
async function fetchGitLabTitle(parsed: ReturnType<typeof parseUrl>): Promise<string> {
  const token = process.env.GITLAB_TOKEN
  if (!token || !parsed) return ''
  try {
    const projectPath = encodeURIComponent(parsed.repo_url.replace(/^https?:\/\/[^/]+\//, ''))
    const origin = new URL(parsed.repo_url).origin
    const apiUrl =
      parsed.type === 'mr'
        ? `${origin}/api/v4/projects/${projectPath}/merge_requests/${parsed.number}`
        : `${origin}/api/v4/projects/${projectPath}/repository/commits/${parsed.sha}`
    const res = await fetch(apiUrl, {
      headers: { 'PRIVATE-TOKEN': token },
    })
    if (!res.ok) return ''
    const json = (await res.json()) as { title?: string; message?: string }
    return json.title ?? json.message?.split('\n')[0] ?? ''
  } catch {
    return ''
  }
}

/** Close linked GitHub issues when a card moves to done. Called non-blocking from cards.ts. */
export async function closeGitHubIssues(cardId: number): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return
  if (!(await isEnabled('github_integration'))) return

  const issues = await db.all<{ number: number; repo_url: string; id: number }>(
    `SELECT id, number, repo_url FROM card_links
     WHERE card_id = ? AND provider = 'github' AND type = 'issue' AND state = 'open'`,
    cardId,
  )
  for (const issue of issues) {
    const repoPath = issue.repo_url.replace('https://github.com/', '')
    try {
      const res = await fetch(`https://api.github.com/repos/${repoPath}/issues/${issue.number}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'slateflow',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed' }),
      })
      if (res.ok) {
        await db.run(
          `UPDATE card_links SET state = 'closed' WHERE id = ?`,
          issue.id,
        )
      }
    } catch { /* non-fatal — log silently */ }
  }
}

// ── GET /cards/:id/links ──────────────────────────────────────────────────────

cardLinks.get('/cards/:id/links', async (c) => {
  // Require at least one integration flag to be on
  const ghOn = await isEnabled('github_integration')
  const glOn = await isEnabled('gitlab_integration')
  if (!ghOn && !glOn) return err(c, 'not found', 404)

  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get<{ id: number }>('SELECT id FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  // Filter returned rows by which flags are enabled
  const providerFilter: string[] = []
  if (ghOn) providerFilter.push('github')
  if (glOn) providerFilter.push('gitlab')
  const placeholders = providerFilter.map(() => '?').join(', ')

  const links = await db.all(
    `SELECT * FROM card_links WHERE card_id = ? AND provider IN (${placeholders}) ORDER BY created_at DESC`,
    id,
    ...providerFilter,
  )
  return ok(c, links)
})

// ── POST /cards/:id/links ─────────────────────────────────────────────────────

const AddLinkSchema = z.object({ url: z.string().url() })

cardLinks.post('/cards/:id/links', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  // Look up the card's project for access checks
  const card = await db.get<{ id: number; swim_lane_id: number | null }>(
    'SELECT id, swim_lane_id FROM cards WHERE id = ?',
    id,
  )
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return err(c, 'invalid JSON')
  }
  const parsed = AddLinkSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const urlParsed = parseUrl(parsed.data.url)
  if (!urlParsed)
    return err(
      c,
      'URL is not a recognized GitHub PR/issue/commit or GitLab MR/commit link',
      422,
    )

  // Gate by the correct flag
  const ghOn = await isEnabled('github_integration')
  const glOn = await isEnabled('gitlab_integration')
  if (urlParsed.provider === 'github' && !ghOn) return err(c, 'not found', 404)
  if (urlParsed.provider === 'gitlab' && !glOn) return err(c, 'not found', 404)

  // Access check — contributor or above required
  const user = c.get('user')
  const lane = card.swim_lane_id
    ? await db.get<{ project_id: number }>(
        'SELECT project_id FROM swim_lanes WHERE id = ?',
        card.swim_lane_id,
      )
    : null
  if (lane) {
    const allowed = await canWrite(user.id, lane.project_id, user.role)
    if (!allowed) return err(c, 'forbidden', 403)
  }

  // Optionally fetch title from provider API
  const title =
    urlParsed.provider === 'github'
      ? await fetchGitHubTitle(urlParsed)
      : await fetchGitLabTitle(urlParsed)

  const { lastID } = await db.run(
    `INSERT INTO card_links (card_id, provider, type, repo_url, number, sha, title, url, state, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id,
    urlParsed.provider,
    urlParsed.type,
    urlParsed.repo_url,
    urlParsed.number,
    urlParsed.sha,
    title,
    parsed.data.url,
    user.id,
  )

  const link = await db.get('SELECT * FROM card_links WHERE id = ?', lastID)
  return ok(c, link, 201)
})

// ── DELETE /cards/:id/links/:linkId ──────────────────────────────────────────

cardLinks.delete('/cards/:id/links/:linkId', async (c) => {
  const ghOn = await isEnabled('github_integration')
  const glOn = await isEnabled('gitlab_integration')
  if (!ghOn && !glOn) return err(c, 'not found', 404)

  const cardId = parseId(c.req.param('id'))
  const linkId = parseId(c.req.param('linkId'))
  if (!cardId || !linkId) return err(c, 'invalid id', 400)

  const link = await db.get<{ id: number; card_id: number; provider: string }>(
    'SELECT id, card_id, provider FROM card_links WHERE id = ? AND card_id = ?',
    linkId,
    cardId,
  )
  if (!link) return err(c, 'link not found', 404)

  if (link.provider === 'github' && !ghOn) return err(c, 'not found', 404)
  if (link.provider === 'gitlab' && !glOn) return err(c, 'not found', 404)

  const user = c.get('user')
  const card = await db.get<{ swim_lane_id: number | null }>(
    'SELECT swim_lane_id FROM cards WHERE id = ?',
    cardId,
  )
  const lane = card?.swim_lane_id
    ? await db.get<{ project_id: number }>(
        'SELECT project_id FROM swim_lanes WHERE id = ?',
        card.swim_lane_id,
      )
    : null
  if (lane) {
    const allowed = await canWrite(user.id, lane.project_id, user.role)
    if (!allowed) return err(c, 'forbidden', 403)
  }

  await db.run('DELETE FROM card_links WHERE id = ?', linkId)
  return ok(c, { id: linkId })
})

export default cardLinks
