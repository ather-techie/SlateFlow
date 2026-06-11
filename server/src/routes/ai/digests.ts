import { Hono } from 'hono'
import { z } from 'zod'
import { ok, err, parseId, zodErr } from '../../lib/response.js'
import { requireFeature } from '../../middleware/requireRole.js'
import { getProvider } from '../../lib/ai.js'
import { db } from '../../db/index.js'
import { getSprintPointTotals, getProjectCycleTime, getSprintCapacity } from '../../lib/reportData.js'
import { getStalledCards, truncate } from '../../lib/aiContext.js'
import { parseAiJson } from '../../lib/aiJson.js'
import {
  SPRINT_DIGEST_SYSTEM, SPRINT_DIGEST_USER_TEMPLATE,
  STANDUP_DIGEST_SYSTEM, STANDUP_DIGEST_USER_TEMPLATE,
  RETRO_SYNTHESIZE_SYSTEM, RETRO_SYNTHESIZE_USER_TEMPLATE,
  interpolate,
} from '../../lib/prompts.js'

const digests = new Hono()

interface SprintRow {
  id: number
  project_id: number
  name: string
  goal: string | null
  status: string
  start_date: string | null
  end_date: string | null
  is_default: number
}

interface DigestRow {
  content: string
  created_at: string
}

function elapsedPct(start: string | null, end: string | null): string {
  if (!start || !end) return 'unknown'
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 'unknown'
  const pct = Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100)
  return `${Math.min(100, Math.max(0, pct))}%`
}

async function latestDigest(kind: 'sprint_health' | 'standup', projectId: number, sprintId: number | null): Promise<DigestRow | undefined> {
  if (sprintId) {
    return db.get<DigestRow>(
      `SELECT content, created_at FROM ai_digests
       WHERE kind = ? AND project_id = ? AND sprint_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      kind, projectId, sprintId,
    )
  }
  return db.get<DigestRow>(
    `SELECT content, created_at FROM ai_digests
     WHERE kind = ? AND project_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    kind, projectId,
  )
}

digests.get('/ai/sprints/:id/digest', requireFeature('ai_ceremony_digests'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid sprint id', 400)

  const sprint = await db.get<SprintRow>('SELECT id, project_id FROM sprints WHERE id = ?', id)
  if (!sprint) return err(c, 'sprint not found', 404)

  const row = await latestDigest('sprint_health', sprint.project_id, id)
  return ok(c, { digest: row?.content ?? null, generated_at: row?.created_at ?? null })
})

digests.post('/ai/sprints/:id/digest', requireFeature('ai_ceremony_digests'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid sprint id', 400)

  const sprint = await db.get<SprintRow>(
    'SELECT id, project_id, name, goal, status, start_date, end_date, is_default FROM sprints WHERE id = ?',
    id
  )
  if (!sprint) return err(c, 'sprint not found', 404)
  if (sprint.is_default) return err(c, 'cannot generate a digest for the default sprint', 409)

  const [totals, cycle, capacity, stalled] = await Promise.all([
    getSprintPointTotals(id),
    getProjectCycleTime(sprint.project_id),
    getSprintCapacity(sprint.project_id, id),
    getStalledCards(sprint.project_id, id, 3),
  ])

  const capacityBlock = capacity.map(r =>
    `- ${r.assignee}: ${r.story_points} pts assigned${r.capacity != null ? ` / ${r.capacity} capacity` : ''}${r.skills.length ? ` (skills: ${r.skills.join(', ')})` : ''}`
  ).join('\n') || 'none'

  const cycleBlock = cycle.filter(l => l.avg_days != null).map(l =>
    `- ${l.lane_name}: ${l.avg_days} days avg (${l.sample_size} samples)`
  ).join('\n') || 'no data yet'

  const stalledBlock = stalled.map(s =>
    `- #${s.id} "${truncate(s.title, 80)}" in ${s.lane_name}, idle ${s.idle_days}d${s.assignee ? `, assigned to ${s.assignee}` : ''}`
  ).join('\n') || 'none'

  const prompt = interpolate(SPRINT_DIGEST_USER_TEMPLATE, {
    sprint_name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    start_date: sprint.start_date,
    end_date: sprint.end_date,
    elapsed_pct: elapsedPct(sprint.start_date, sprint.end_date),
    completed_points: String(totals.completed_points),
    total_points: String(totals.total_points),
    completed_stories: String(totals.completed_stories),
    total_stories: String(totals.total_stories),
    capacity_block: capacityBlock,
    cycle_block: cycleBlock,
    stalled_block: stalledBlock,
  })

  try {
    const provider = await getProvider()
    const digest = await provider.complete(prompt, {
      systemPrompt: SPRINT_DIGEST_SYSTEM,
      maxTokens: 1024,
    })

    const user = c.get('user')
    await db.run(
      `INSERT INTO ai_digests (kind, project_id, sprint_id, content, created_by) VALUES (?, ?, ?, ?, ?)`,
      'sprint_health', sprint.project_id, id, digest, user.id,
    )

    return ok(c, { digest, generated_at: new Date().toISOString() })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

const standupBodySchema = z.object({
  hours: z.number().int().min(1).max(168).default(24),
  stale_days: z.number().int().min(1).max(30).default(2),
})

digests.get('/ai/projects/:id/standup-digest', requireFeature('ai_ceremony_digests'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid project id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const row = await latestDigest('standup', id, null)
  return ok(c, { digest: row?.content ?? null, generated_at: row?.created_at ?? null })
})

digests.post('/ai/projects/:id/standup-digest', requireFeature('ai_ceremony_digests'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid project id', 400)

  const project = await db.get<{ id: number; name: string }>('SELECT id, name FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const raw = await c.req.json().catch(() => ({}))
  const parsed = standupBodySchema.safeParse(raw ?? {})
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)
  const { hours, stale_days } = parsed.data

  const window = `-${hours} hours`

  const [activity, comments, stalled, activeSprint] = await Promise.all([
    db.all<{ created_at: string; action: string; card_id: number; title: string; display_name: string | null }>(
      `SELECT al.created_at, al.action, c.id as card_id, c.title, u.display_name
       FROM activity_log al
       JOIN cards c ON c.id = al.card_id
       JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       LEFT JOIN users u ON u.id = al.user_id
       WHERE sl.project_id = ? AND al.created_at >= datetime('now', ?)
       ORDER BY al.created_at DESC
       LIMIT 100`,
      id, window,
    ),
    db.all<{ created_at: string; author: string; body: string; card_id: number; title: string }>(
      `SELECT cm.created_at, cm.author, cm.body, c.id as card_id, c.title
       FROM comments cm
       JOIN cards c ON c.id = cm.card_id
       JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE sl.project_id = ? AND cm.created_at >= datetime('now', ?)
       ORDER BY cm.created_at DESC
       LIMIT 50`,
      id, window,
    ),
    getStalledCards(id, null, stale_days),
    db.get<{ id: number }>(
      `SELECT id FROM sprints WHERE project_id = ? AND status = 'active' AND is_default = 0 ORDER BY start_date DESC LIMIT 1`,
      id,
    ),
  ])

  let overloadBlock = 'none'
  if (activeSprint) {
    const capacity = await getSprintCapacity(id, activeSprint.id)
    const over = capacity.filter(r => r.capacity != null && r.story_points > r.capacity)
    if (over.length > 0) {
      overloadBlock = over.map(r => `- ${r.assignee}: ${r.story_points} pts assigned vs ${r.capacity} capacity`).join('\n')
    }
  }

  const activityBlock = activity.map(a =>
    `- ${a.created_at} ${a.display_name ?? 'someone'} ${a.action} #${a.card_id} "${truncate(a.title, 60)}"`
  ).join('\n') || 'no activity in this window'

  const commentsBlock = comments.map(cm =>
    `- ${cm.created_at} ${cm.author} on #${cm.card_id} "${truncate(cm.title, 40)}": ${truncate(cm.body, 120)}`
  ).join('\n') || 'no comments in this window'

  const stalledBlock = stalled.map(s =>
    `- #${s.id} "${truncate(s.title, 80)}" in ${s.lane_name}, idle ${s.idle_days}d${s.assignee ? `, assigned to ${s.assignee}` : ''}`
  ).join('\n') || 'none'

  const prompt = interpolate(STANDUP_DIGEST_USER_TEMPLATE, {
    hours: String(hours),
    stale_days: String(stale_days),
    project_name: project.name,
    activity_block: activityBlock,
    comments_block: commentsBlock,
    stalled_block: stalledBlock,
    overload_block: overloadBlock,
  })

  try {
    const provider = await getProvider()
    const digest = await provider.complete(prompt, {
      systemPrompt: STANDUP_DIGEST_SYSTEM,
      maxTokens: 1024,
    })

    const user = c.get('user')
    await db.run(
      `INSERT INTO ai_digests (kind, project_id, sprint_id, content, created_by) VALUES (?, ?, ?, ?, ?)`,
      'standup', id, null, digest, user.id,
    )

    return ok(c, { digest, generated_at: new Date().toISOString() })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

const retroSynthesisSchema = z.object({
  themes: z.array(z.object({
    title: z.string().min(1),
    category: z.enum(['went_well', 'to_improve']).catch('to_improve'),
    item_ids: z.array(z.number()).catch([]),
  })).catch([]),
  suggested_actions: z.array(z.object({ body: z.string().min(1) })).catch([]),
  previous_actions_review: z.array(z.object({
    body: z.string().min(1),
    status: z.enum(['addressed', 'partially', 'not_addressed', 'unknown']).catch('unknown'),
    evidence: z.string().catch(''),
  })).catch([]),
})

digests.post('/ai/retrospectives/:id/synthesize', requireFeature('ai_ceremony_digests'), requireFeature('retrospective'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid retrospective id', 400)

  const retro = await db.get<{ id: number; sprint_id: number; project_id: number; start_date: string | null }>(
    `SELECT r.id, r.sprint_id, s.project_id, s.start_date
     FROM retrospectives r JOIN sprints s ON s.id = r.sprint_id
     WHERE r.id = ?`,
    id,
  )
  if (!retro) return err(c, 'retrospective not found', 404)

  const items = await db.all<{ id: number; category: string; body: string }>(
    'SELECT id, category, body FROM retrospective_items WHERE retrospective_id = ? ORDER BY category, position',
    id,
  )
  if (items.length === 0) return err(c, 'retrospective has no items to synthesize', 400)

  // Action items from the previous sprint's retro, so the model can judge follow-through.
  const prevSprint = retro.start_date
    ? await db.get<{ id: number }>(
        `SELECT id FROM sprints WHERE project_id = ? AND is_default = 0 AND start_date < ? AND id != ?
         ORDER BY start_date DESC LIMIT 1`,
        retro.project_id, retro.start_date, retro.sprint_id,
      )
    : undefined
  const prevActions = prevSprint
    ? await db.all<{ body: string }>(
        `SELECT ri.body FROM retrospective_items ri
         JOIN retrospectives r2 ON r2.id = ri.retrospective_id
         WHERE r2.sprint_id = ? AND ri.category = 'action'
         ORDER BY ri.position`,
        prevSprint.id,
      )
    : []

  const itemsBlock = items.map(i => `- id ${i.id} [${i.category}] ${truncate(i.body, 300)}`).join('\n')
  const prevActionsBlock = prevActions.map(a => `- ${truncate(a.body, 300)}`).join('\n') || 'none recorded'

  const prompt = interpolate(RETRO_SYNTHESIZE_USER_TEMPLATE, {
    items_block: itemsBlock,
    previous_actions_block: prevActionsBlock,
  })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: RETRO_SYNTHESIZE_SYSTEM,
      maxTokens: 2048,
    })

    const json = parseAiJson<unknown>(response, 'object')
    if (!json) return err(c, 'AI returned unparseable response', 500)

    const parsed = retroSynthesisSchema.safeParse(json)
    if (!parsed.success) return err(c, 'AI returned an unexpected response shape', 500)

    const knownIds = new Set(items.map(i => i.id))
    const themes = parsed.data.themes.map(t => ({
      ...t,
      item_ids: t.item_ids.filter(itemId => knownIds.has(itemId)),
    }))

    return ok(c, {
      themes,
      suggested_actions: parsed.data.suggested_actions,
      previous_actions_review: parsed.data.previous_actions_review,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

export default digests
