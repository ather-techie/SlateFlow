import { db } from './../db/index.js'
import { getSprintPointTotals } from './reportData.js'
import { truncate } from './aiContext.js'

/**
 * Builds the RAG context bundle for the project chat. Every query that
 * touches cards/features/epics embeds the readable-epics predicate (same
 * semantics as routes/epics.ts) so the bundle never contains data the
 * requesting user cannot read — even aggregates are computed over the
 * filtered set.
 */

const MAX_CONTEXT_CHARS = 24_000

/**
 * SQL predicate restricting a cards alias `c` to cards the user can read
 * (takes one `?` param: the user id). Cards without a feature link (or
 * features without an epic) fall back to readable — Default Epic semantics.
 */
export const READABLE_CARD_SQL = `(c.feature_id IS NULL OR EXISTS (
    SELECT 1 FROM features f LEFT JOIN epics e ON e.id = f.epic_id
    WHERE f.id = c.feature_id
      AND (f.epic_id IS NULL OR e.is_default = 1 OR EXISTS (
        SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?
      ))
  ))`

function cardFilter(role: string, userId: number): { sql: string; params: number[] } {
  if (role === 'super_admin') return { sql: '1=1', params: [] }
  return { sql: READABLE_CARD_SQL, params: [userId] }
}

function epicFilter(role: string, userId: number): { sql: string; params: number[] } {
  if (role === 'super_admin') return { sql: '1=1', params: [] }
  return {
    sql: `(e.is_default = 1 OR EXISTS (SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?))`,
    params: [userId],
  }
}

async function headerSection(projectId: number): Promise<string | null> {
  const project = await db.get<{ id: number; name: string; description: string | null }>(
    'SELECT id, name, description FROM projects WHERE id = ?', projectId,
  )
  if (!project) return null

  const lanes = await db.all<{ name: string; is_done_col: number }>(
    'SELECT name, is_done_col FROM swim_lanes WHERE project_id = ? ORDER BY position', projectId,
  )
  const laneList = lanes.map(l => l.is_done_col ? `${l.name} (done lane)` : l.name).join(', ')

  return [
    `## Project`,
    `Name: ${project.name}`,
    project.description ? `Description: ${truncate(project.description, 300)}` : '',
    `Lanes: ${laneList || 'none'}`,
  ].filter(Boolean).join('\n')
}

async function sprintsSection(projectId: number): Promise<string> {
  const sprints = await db.all<{ id: number; name: string; goal: string | null; status: string; start_date: string | null; end_date: string | null; velocity_completed_points: number; velocity_total_points: number }>(
    `SELECT id, name, goal, status, start_date, end_date, velocity_completed_points, velocity_total_points
     FROM sprints WHERE project_id = ? AND is_default = 0 AND status IN ('active', 'completed', 'planned')
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, start_date DESC
     LIMIT 5`,
    projectId,
  )
  if (sprints.length === 0) return '## Sprints\nnone'

  const lines: string[] = ['## Sprints']
  for (const s of sprints.slice(0, 4)) {
    if (s.status === 'completed') {
      lines.push(`- ${s.name} [completed] ${s.start_date ?? '?'}..${s.end_date ?? '?'}: ${s.velocity_completed_points}/${s.velocity_total_points} pts done${s.goal ? ` — goal: ${truncate(s.goal, 100)}` : ''}`)
    } else {
      const totals = await getSprintPointTotals(s.id)
      lines.push(`- ${s.name} [${s.status}] ${s.start_date ?? '?'}..${s.end_date ?? '?'}: ${totals.completed_points}/${totals.total_points} pts done, ${totals.completed_stories}/${totals.total_stories} stories${s.goal ? ` — goal: ${truncate(s.goal, 100)}` : ''}`)
    }
  }
  return lines.join('\n')
}

async function epicsSection(projectId: number, userId: number, role: string): Promise<string> {
  const ef = epicFilter(role, userId)
  const epics = await db.all<{ id: number; title: string; status: string | null; priority: string | null; start_date: string | null; end_date: string | null }>(
    `SELECT e.id, e.title, e.status, e.priority, e.start_date, e.end_date
     FROM epics e
     WHERE e.project_id = ? AND e.is_default = 0 AND ${ef.sql}
     ORDER BY e.position LIMIT 20`,
    projectId, ...ef.params,
  )

  const features = await db.all<{ id: number; title: string; status: string | null; priority: string | null; epic_title: string | null }>(
    `SELECT f.id, f.title, f.status, f.priority, e.title as epic_title
     FROM features f
     LEFT JOIN epics e ON e.id = f.epic_id
     WHERE f.project_id = ? AND f.is_default = 0
       AND (f.epic_id IS NULL OR (e.is_default = 1 OR ${role === 'super_admin' ? '1=1' : 'EXISTS (SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?)'}))
     ORDER BY f.position LIMIT 30`,
    ...(role === 'super_admin' ? [projectId] : [projectId, userId]),
  )

  const lines: string[] = ['## Epics & features']
  if (epics.length === 0 && features.length === 0) return '## Epics & features\nnone'
  for (const e of epics) {
    lines.push(`- epic "${truncate(e.title, 80)}" [${e.status ?? '?'}, ${e.priority ?? '?'}] ${e.start_date ?? '?'}..${e.end_date ?? '?'}`)
  }
  for (const f of features) {
    lines.push(`- feature "${truncate(f.title, 80)}" [${f.status ?? '?'}, ${f.priority ?? '?'}]${f.epic_title ? ` in epic "${truncate(f.epic_title, 50)}"` : ''}`)
  }
  return lines.join('\n')
}

async function activeCardsSection(projectId: number, userId: number, role: string): Promise<string> {
  const cf = cardFilter(role, userId)
  const cards = await db.all<{ id: number; title: string; lane: string; story_points: number | null; assignee: string | null; priority: string; due_date: string | null }>(
    `SELECT c.id, c.title, sl.name as lane, c.story_points,
            COALESCE(u.display_name, c.assignee) as assignee, c.priority, c.due_date
     FROM cards c
     JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN users u ON u.id = c.assignee_id
     WHERE sl.project_id = ? AND sl.is_done_col = 0 AND ${cf.sql}
     ORDER BY c.priority, c.updated_at DESC
     LIMIT 50`,
    projectId, ...cf.params,
  )
  if (cards.length === 0) return '## Active stories\nnone'
  const lines = cards.map(card =>
    `- #${card.id} "${truncate(card.title, 80)}" [${card.lane}] ${card.story_points ?? '?'} pts, ${card.priority}${card.assignee ? `, ${card.assignee}` : ', unassigned'}${card.due_date ? `, due ${card.due_date}` : ''}`
  )
  return ['## Active stories (not done)', ...lines].join('\n')
}

async function blockersSection(projectId: number, userId: number, role: string): Promise<string> {
  const cf = cardFilter(role, userId)
  const cf2 = cardFilter(role, userId)
  const deps = await db.all<{ blocker_id: number; blocked_id: number; blocked_title: string }>(
    `SELECT sd.blocker_id, sd.blocked_id, c2.title as blocked_title
     FROM story_dependencies sd
     JOIN cards c ON c.id = sd.blocker_id
     JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     JOIN cards c2 ON c2.id = sd.blocked_id
     WHERE sl.project_id = ? AND ${cf.sql}
       AND ${cf2.sql.replace(/c\.feature_id/g, 'c2.feature_id')}
     LIMIT 20`,
    projectId, ...cf.params, ...cf2.params,
  )
  if (deps.length === 0) return '## Blockers\nnone'
  const lines = deps.map(d => `- #${d.blocker_id} blocks #${d.blocked_id} "${truncate(d.blocked_title, 80)}"`)
  return ['## Blockers', ...lines].join('\n')
}

async function recentlyDoneSection(projectId: number, userId: number, role: string): Promise<string> {
  const cf = cardFilter(role, userId)
  const cards = await db.all<{ id: number; title: string; story_points: number | null; assignee: string | null; updated_at: string }>(
    `SELECT c.id, c.title, c.story_points, COALESCE(u.display_name, c.assignee) as assignee, c.updated_at
     FROM cards c
     JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN users u ON u.id = c.assignee_id
     WHERE sl.project_id = ? AND sl.is_done_col = 1
       AND c.updated_at >= datetime('now', '-14 days') AND ${cf.sql}
     ORDER BY c.updated_at DESC
     LIMIT 20`,
    projectId, ...cf.params,
  )
  if (cards.length === 0) return '## Recently completed (14 days)\nnone'
  const lines = cards.map(card =>
    `- #${card.id} "${truncate(card.title, 80)}" ${card.story_points ?? '?'} pts${card.assignee ? `, ${card.assignee}` : ''} (${card.updated_at})`
  )
  return ['## Recently completed (14 days)', ...lines].join('\n')
}

async function capacitySection(projectId: number, userId: number, role: string): Promise<string> {
  const cf = cardFilter(role, userId)
  // Assigned points computed over the SAME filtered card set so totals can't
  // leak the existence of cards in hidden epics.
  const rows = await db.all<{ display_name: string; capacity: number | null; assigned: number }>(
    `SELECT u.display_name, pa.capacity,
            COALESCE((
              SELECT SUM(c.story_points) FROM cards c
              JOIN swim_lanes sl ON sl.id = c.swim_lane_id
              WHERE sl.project_id = ? AND sl.is_done_col = 0 AND c.assignee_id = u.id AND ${cf.sql}
            ), 0) as assigned
     FROM project_access pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL
     ORDER BY u.display_name
     LIMIT 30`,
    projectId, ...cf.params, projectId,
  )
  if (rows.length === 0) return '## Team capacity\nno members recorded'
  const lines = rows.map(r => `- ${r.display_name}: ${r.assigned} pts in flight, capacity ${r.capacity ?? 'unset'}`)
  return ['## Team capacity', ...lines].join('\n')
}

async function recentActivitySection(projectId: number, userId: number, role: string): Promise<string> {
  const cf = cardFilter(role, userId)
  const rows = await db.all<{ created_at: string; action: string; card_id: number; title: string; display_name: string | null }>(
    `SELECT al.created_at, al.action, c.id as card_id, c.title, u.display_name
     FROM activity_log al
     JOIN cards c ON c.id = al.card_id
     JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN users u ON u.id = al.user_id
     WHERE sl.project_id = ? AND ${cf.sql}
     ORDER BY al.created_at DESC
     LIMIT 30`,
    projectId, ...cf.params,
  )
  if (rows.length === 0) return '## Recent activity\nnone'
  const lines = rows.map(r =>
    `- ${r.created_at} ${r.display_name ?? 'someone'} ${r.action} #${r.card_id} "${truncate(r.title, 60)}"`
  )
  return ['## Recent activity', ...lines].join('\n')
}

export async function buildProjectChatContext(userId: number, role: string, projectId: number): Promise<string | null> {
  const header = await headerSection(projectId)
  if (header === null) return null

  const sections = await Promise.all([
    sprintsSection(projectId),
    epicsSection(projectId, userId, role),
    activeCardsSection(projectId, userId, role),
    blockersSection(projectId, userId, role),
    recentlyDoneSection(projectId, userId, role),
    capacitySection(projectId, userId, role),
    recentActivitySection(projectId, userId, role),
  ])

  let context = [header, ...sections].join('\n\n')
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS) + '\n…[truncated]'
  }
  return context
}
