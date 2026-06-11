import { Hono } from 'hono'
import { z } from 'zod'
import { ok, err, parseId, zodErr } from '../../lib/response.js'
import { requireFeature } from '../../middleware/requireRole.js'
import { getProvider } from '../../lib/ai.js'
import { parseAiJson } from '../../lib/aiJson.js'
import { canReadFeatureEpic } from '../../lib/epicAccess.js'
import { db } from '../../db/index.js'
import { getSprintCapacity } from '../../lib/reportData.js'
import { getBacklogCards, getProjectMembers, getVacationsInRange, truncate } from '../../lib/aiContext.js'
import {
  SUGGEST_ASSIGNEE_SYSTEM, SUGGEST_ASSIGNEE_USER_TEMPLATE,
  PLAN_SPRINT_SYSTEM, PLAN_SPRINT_USER_TEMPLATE,
  SUGGEST_ESTIMATE_SYSTEM_TEMPLATE, SUGGEST_ESTIMATE_USER_TEMPLATE,
  GROOM_BACKLOG_SYSTEM, GROOM_BACKLOG_USER_TEMPLATE,
  interpolate,
} from '../../lib/prompts.js'

const planning = new Hono()

interface CardRow {
  id: number
  title: string
  description: string
  priority: string
  story_points: number | null
  feature_id: number | null
  swim_lane_id: number | null
  sprint_id: number | null
}

/** Resolve the project a card belongs to via its lane, falling back to its sprint. */
async function getCardProjectId(card: CardRow): Promise<number | null> {
  if (card.swim_lane_id) {
    const lane = await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', card.swim_lane_id)
    if (lane) return lane.project_id
  }
  if (card.sprint_id) {
    const sprint = await db.get<{ project_id: number }>('SELECT project_id FROM sprints WHERE id = ?', card.sprint_id)
    if (sprint) return sprint.project_id
  }
  return null
}

const assigneeSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    user_id: z.number(),
    assignee: z.string().catch(''),
    confidence: z.enum(['high', 'medium', 'low']).catch('medium'),
    reason: z.string().catch(''),
  })).catch([]),
})

planning.post('/ai/cards/:id/suggest-assignee', requireFeature('ai_planning_assist'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid card id', 400)

  const card = await db.get<CardRow>(
    'SELECT id, title, description, priority, story_points, feature_id, swim_lane_id, sprint_id FROM cards WHERE id = ?',
    id
  )
  if (!card) return err(c, 'card not found', 404)

  const user = c.get('user')
  if (!(await canReadFeatureEpic(user.id, card.feature_id, user.role))) {
    return err(c, 'forbidden', 403)
  }

  const projectId = await getCardProjectId(card)
  if (!projectId) return err(c, 'card has no resolvable project', 400)

  const members = await getProjectMembers(projectId)
  if (members.length === 0) return err(c, 'project has no members to suggest from', 400)

  const activeSprint = await db.get<{ id: number; start_date: string | null; end_date: string | null }>(
    `SELECT id, start_date, end_date FROM sprints WHERE project_id = ? AND status = 'active' AND is_default = 0 ORDER BY start_date DESC LIMIT 1`,
    projectId,
  )

  const loadByName = new Map<string, number>()
  if (activeSprint) {
    for (const row of await getSprintCapacity(projectId, activeSprint.id)) {
      loadByName.set(row.assignee, row.story_points)
    }
  }

  const memberIds = new Set(members.map(m => m.user_id))
  let vacationsBlock = 'none'
  if (activeSprint?.start_date && activeSprint?.end_date) {
    const vacations = (await getVacationsInRange(activeSprint.start_date, activeSprint.end_date))
      .filter(v => v.user_id !== null && memberIds.has(v.user_id))
    if (vacations.length > 0) {
      vacationsBlock = vacations.map(v => `- ${v.display_name}: ${v.start_date} to ${v.end_date}`).join('\n')
    }
  }

  const membersBlock = members.map(m =>
    `- user_id ${m.user_id}: ${m.display_name}, skills [${m.skills.join(', ') || 'none listed'}], assigned ${loadByName.get(m.display_name) ?? 0} pts, capacity ${m.capacity ?? 'unset'}`
  ).join('\n')

  const prompt = interpolate(SUGGEST_ASSIGNEE_USER_TEMPLATE, {
    title: card.title,
    description: truncate(card.description, 600),
    points: card.story_points != null ? String(card.story_points) : 'unestimated',
    priority: card.priority,
    members_block: membersBlock,
    vacations_block: vacationsBlock,
  })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: SUGGEST_ASSIGNEE_SYSTEM,
      maxTokens: 512,
    })

    const json = parseAiJson<unknown>(response, 'object')
    if (!json) return err(c, 'AI returned unparseable response', 500)

    const parsed = assigneeSuggestionsSchema.safeParse(json)
    if (!parsed.success) return err(c, 'AI returned an unexpected response shape', 500)

    const memberById = new Map(members.map(m => [m.user_id, m]))
    // Anti-hallucination: only real members survive, with their canonical name.
    const suggestions = parsed.data.suggestions
      .filter(s => memberById.has(s.user_id))
      .map(s => ({ ...s, assignee: memberById.get(s.user_id)!.display_name }))
      .slice(0, 3)
    if (suggestions.length === 0) return err(c, 'AI returned no valid suggestions', 500)

    return ok(c, { suggestions })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

const planSprintBodySchema = z.object({
  sprint_id: z.number().int().positive(),
})

const sprintPlanSchema = z.object({
  recommended_points: z.number().catch(0),
  rationale: z.string().catch(''),
  proposed: z.array(z.object({
    card_id: z.number(),
    title: z.string().catch(''),
    points: z.number().nullable().catch(null),
    reason: z.string().catch(''),
  })).catch([]),
  risks: z.array(z.string()).catch([]),
})

planning.post('/ai/projects/:id/plan-sprint', requireFeature('ai_planning_assist'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid project id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const raw = await c.req.json().catch(() => null)
  const parsedBody = planSprintBodySchema.safeParse(raw)
  if (!parsedBody.success) return err(c, zodErr(parsedBody.error.issues), 422)

  const sprint = await db.get<{ id: number; name: string; goal: string | null; status: string; start_date: string | null; end_date: string | null; is_default: number }>(
    'SELECT id, name, goal, status, start_date, end_date, is_default FROM sprints WHERE id = ? AND project_id = ?',
    parsedBody.data.sprint_id, id,
  )
  if (!sprint) return err(c, 'sprint not found', 404)
  if (sprint.is_default) return err(c, 'cannot plan the default sprint', 409)
  if (sprint.status !== 'planned') return err(c, 'sprint must be in planned status', 409)

  const backlog = await getBacklogCards(id, 50)
  if (backlog.length === 0) return err(c, 'backlog is empty — nothing to plan', 400)

  const avgRow = await db.get<{ avg_pts: number | null }>(
    `SELECT AVG(velocity_completed_points) as avg_pts FROM (
       SELECT velocity_completed_points FROM sprints
       WHERE project_id = ? AND status = 'completed' AND is_default = 0
       ORDER BY start_date DESC LIMIT 5
     )`,
    id,
  )
  const avgVelocity = avgRow?.avg_pts != null ? String(Math.round(avgRow.avg_pts)) : 'no completed sprints yet'

  const members = await getProjectMembers(id)
  const memberIds = new Set(members.map(m => m.user_id))
  const vacByUser = new Map<number, string[]>()
  if (sprint.start_date && sprint.end_date) {
    for (const v of await getVacationsInRange(sprint.start_date, sprint.end_date)) {
      if (v.user_id === null || !memberIds.has(v.user_id)) continue
      const list = vacByUser.get(v.user_id) ?? []
      list.push(`${v.start_date} to ${v.end_date}`)
      vacByUser.set(v.user_id, list)
    }
  }
  const membersBlock = members.map(m =>
    `- ${m.display_name}: capacity ${m.capacity ?? 'unset'}${vacByUser.has(m.user_id) ? `, on vacation ${vacByUser.get(m.user_id)!.join('; ')}` : ''}`
  ).join('\n') || 'no members recorded'

  const backlogIds = backlog.map(b => b.id)
  const placeholders = backlogIds.map(() => '?').join(',')
  const deps = await db.all<{ blocker_id: number; blocked_id: number }>(
    `SELECT blocker_id, blocked_id FROM story_dependencies
     WHERE blocker_id IN (${placeholders}) AND blocked_id IN (${placeholders})`,
    ...backlogIds, ...backlogIds,
  )
  const depsBlock = deps.map(d => `- #${d.blocker_id} -> #${d.blocked_id}`).join('\n') || 'none'

  const backlogBlock = backlog.map(b =>
    `- card_id ${b.id}: "${truncate(b.title, 80)}", ${b.story_points ?? 'unestimated'} pts, ${b.priority}, ${truncate(b.description, 150)}`
  ).join('\n')

  const prompt = interpolate(PLAN_SPRINT_USER_TEMPLATE, {
    sprint_name: sprint.name,
    start_date: sprint.start_date ?? 'unset',
    end_date: sprint.end_date ?? 'unset',
    goal: sprint.goal,
    avg_velocity: avgVelocity,
    members_block: membersBlock,
    backlog_block: backlogBlock,
    dependencies_block: depsBlock,
  })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: PLAN_SPRINT_SYSTEM,
      maxTokens: 4096,
    })

    const json = parseAiJson<unknown>(response, 'object')
    if (!json) return err(c, 'AI returned unparseable response', 500)

    const parsed = sprintPlanSchema.safeParse(json)
    if (!parsed.success) return err(c, 'AI returned an unexpected response shape', 500)

    const byId = new Map(backlog.map(b => [b.id, b]))
    const seen = new Set<number>()
    const proposed = parsed.data.proposed
      .filter(p => byId.has(p.card_id) && !seen.has(p.card_id) && seen.add(p.card_id))
      .map(p => ({
        ...p,
        title: byId.get(p.card_id)!.title,
        points: byId.get(p.card_id)!.story_points,
      }))
    if (proposed.length === 0) return err(c, 'AI proposed no valid backlog stories', 500)

    return ok(c, {
      recommended_points: parsed.data.recommended_points,
      rationale: parsed.data.rationale,
      proposed,
      risks: parsed.data.risks,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

const estimateSchema = z.object({
  points: z.number(),
  confidence: z.enum(['high', 'medium', 'low']).catch('medium'),
  rationale: z.string().catch(''),
  comparables: z.array(z.object({
    card_id: z.number(),
    title: z.string().catch(''),
    points: z.number().catch(0),
  })).catch([]),
})

planning.post('/ai/cards/:id/suggest-estimate', requireFeature('ai_planning_assist'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid card id', 400)

  const card = await db.get<CardRow>(
    'SELECT id, title, description, priority, story_points, feature_id, swim_lane_id, sprint_id FROM cards WHERE id = ?',
    id
  )
  if (!card) return err(c, 'card not found', 404)

  const user = c.get('user')
  if (!(await canReadFeatureEpic(user.id, card.feature_id, user.role))) {
    return err(c, 'forbidden', 403)
  }

  const projectId = await getCardProjectId(card)
  if (!projectId) return err(c, 'card has no resolvable project', 400)

  const completed = await db.all<{ id: number; title: string; story_points: number; days_to_complete: number }>(
    `SELECT c.id, c.title, c.story_points,
            CAST(julianday(c.updated_at) - julianday(c.created_at) AS INTEGER) as days_to_complete
     FROM cards c
     JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     WHERE sl.project_id = ? AND sl.is_done_col = 1 AND c.story_points IS NOT NULL AND c.id != ?
     ORDER BY c.updated_at DESC
     LIMIT 30`,
    projectId, id,
  )

  const scaleRows = await db.all<{ story_points: number }>(
    `SELECT DISTINCT c.story_points FROM cards c
     LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN sprints s ON s.id = c.sprint_id
     WHERE (sl.project_id = ? OR s.project_id = ?) AND c.story_points IS NOT NULL
     ORDER BY c.story_points`,
    projectId, projectId,
  )
  const scale = scaleRows.length > 0 ? scaleRows.map(r => r.story_points).join(', ') : '1, 2, 3, 5, 8, 13'

  const comparablesBlock = completed.map(cc =>
    `- card_id ${cc.id}: "${truncate(cc.title, 80)}", ${cc.story_points} pts, ~${cc.days_to_complete}d`
  ).join('\n') || 'no completed estimated stories yet'

  const prompt = interpolate(SUGGEST_ESTIMATE_USER_TEMPLATE, {
    title: card.title,
    description: truncate(card.description, 600),
    comparables_block: comparablesBlock,
  })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: interpolate(SUGGEST_ESTIMATE_SYSTEM_TEMPLATE, { scale }),
      maxTokens: 1024,
    })

    const json = parseAiJson<unknown>(response, 'object')
    if (!json) return err(c, 'AI returned unparseable response', 500)

    const parsed = estimateSchema.safeParse(json)
    if (!parsed.success) return err(c, 'AI returned an unexpected response shape', 500)

    const byId = new Map(completed.map(cc => [cc.id, cc]))
    const comparables = parsed.data.comparables
      .filter(comp => byId.has(comp.card_id))
      .map(comp => ({
        card_id: comp.card_id,
        title: byId.get(comp.card_id)!.title,
        points: byId.get(comp.card_id)!.story_points,
      }))
      .slice(0, 3)

    return ok(c, { ...parsed.data, comparables })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

const groomSchema = z.object({
  duplicates: z.array(z.object({
    card_ids: z.array(z.number()),
    reason: z.string().catch(''),
  })).catch([]),
  vague: z.array(z.object({
    card_id: z.number(),
    issue: z.string().catch(''),
    suggested_description: z.string().catch(''),
  })).catch([]),
  priority_order: z.array(z.number()).catch([]),
  notes: z.string().catch(''),
})

const STALE_BACKLOG_DAYS = 30

planning.post('/ai/projects/:id/groom-backlog', requireFeature('ai_planning_assist'), async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid project id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', id)
  if (!project) return err(c, 'project not found', 404)

  const backlog = await getBacklogCards(id, 60)
  if (backlog.length === 0) return err(c, 'backlog is empty — nothing to groom', 400)

  const backlogBlock = backlog.map(b => {
    const ageDays = Math.max(0, Math.round((Date.now() - new Date(b.created_at.includes('Z') ? b.created_at : b.created_at + 'Z').getTime()) / 86_400_000))
    return `- card_id ${b.id}: "${truncate(b.title, 80)}", ${b.priority}, ${b.story_points ?? 'unestimated'} pts, age ${ageDays}d, idle ${b.last_activity_days}d, ${b.description || '(no description)'}`
  }).join('\n')

  const prompt = interpolate(GROOM_BACKLOG_USER_TEMPLATE, { backlog_block: backlogBlock })

  try {
    const provider = await getProvider()
    const response = await provider.complete(prompt, {
      systemPrompt: GROOM_BACKLOG_SYSTEM,
      maxTokens: 4096,
    })

    const json = parseAiJson<unknown>(response, 'object')
    if (!json) return err(c, 'AI returned unparseable response', 500)

    const parsed = groomSchema.safeParse(json)
    if (!parsed.success) return err(c, 'AI returned an unexpected response shape', 500)

    const knownIds = new Set(backlog.map(b => b.id))
    const duplicates = parsed.data.duplicates
      .map(d => ({ ...d, card_ids: d.card_ids.filter(cardId => knownIds.has(cardId)) }))
      .filter(d => d.card_ids.length >= 2)
    const vague = parsed.data.vague.filter(v => knownIds.has(v.card_id))
    const orderSeen = new Set<number>()
    const priority_order = parsed.data.priority_order
      .filter(cardId => knownIds.has(cardId) && !orderSeen.has(cardId) && orderSeen.add(cardId))

    // Staleness is deterministic SQL, not a model judgment.
    const stale = backlog
      .filter(b => b.last_activity_days >= STALE_BACKLOG_DAYS)
      .map(b => ({ card_id: b.id, title: b.title, last_activity_days: b.last_activity_days }))

    return ok(c, { duplicates, vague, priority_order, stale, notes: parsed.data.notes })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI provider error'
    return err(c, message, 500)
  }
})

export default planning
