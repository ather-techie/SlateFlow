import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'

const reports = new Hono()

reports.get('/projects/:id/velocity', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const sprints = await db.all<{
    id: number; name: string; status: string; start_date: string; end_date: string;
    velocity_completed_points: number; velocity_total_points: number;
    velocity_completed_stories: number; velocity_total_stories: number;
  }>(
    `SELECT id, name, status, start_date, end_date,
            velocity_completed_points, velocity_total_points,
            velocity_completed_stories, velocity_total_stories
     FROM sprints
     WHERE project_id = ? AND is_default = 0
     ORDER BY start_date, id`,
    projectId,
  )

  const result = await Promise.all(sprints.map(async (sprint) => {
    // For completed sprints, use snapshots; for active/planned, calculate live
    if (sprint.status === 'completed') {
      return {
        sprint_id:          sprint.id,
        sprint_name:        sprint.name,
        status:             sprint.status,
        start_date:         sprint.start_date,
        end_date:           sprint.end_date,
        total_points:       sprint.velocity_total_points,
        completed_points:   sprint.velocity_completed_points,
        total_stories:      sprint.velocity_total_stories,
        completed_stories:  sprint.velocity_completed_stories,
      }
    }

    const [totalPts, completedPts, totalStories, completedStories] = await Promise.all([
      db.get<{ pts: number }>(`SELECT COALESCE(SUM(story_points), 0) as pts FROM cards WHERE sprint_id = ?`, sprint.id),
      db.get<{ pts: number }>(`SELECT COALESCE(SUM(c.story_points), 0) as pts
        FROM cards c JOIN swim_lanes sl ON sl.id = c.swim_lane_id
        WHERE c.sprint_id = ? AND sl.is_done_col = 1`, sprint.id),
      db.get<{ n: number }>(`SELECT COUNT(*) as n FROM cards WHERE sprint_id = ?`, sprint.id),
      db.get<{ n: number }>(`SELECT COUNT(*) as n FROM cards c
        JOIN swim_lanes sl ON sl.id = c.swim_lane_id
        WHERE c.sprint_id = ? AND sl.is_done_col = 1`, sprint.id),
    ])

    return {
      sprint_id:          sprint.id,
      sprint_name:        sprint.name,
      status:             sprint.status,
      start_date:         sprint.start_date,
      end_date:           sprint.end_date,
      total_points:       totalPts?.pts ?? 0,
      completed_points:   completedPts?.pts ?? 0,
      total_stories:      totalStories?.n ?? 0,
      completed_stories:  completedStories?.n ?? 0,
    }
  }))

  return ok(c, result)
})

reports.get('/projects/:id/cycle-time', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const lanes = await db.all<{ id: number; name: string }>(
    'SELECT id, name FROM swim_lanes WHERE project_id = ? ORDER BY position',
    projectId,
  )

  if (lanes.length === 0) return ok(c, [])

  const [moves, creates] = await Promise.all([
    db.all<{ card_id: number; meta: string; created_at: string }>(
      `SELECT al.card_id, al.meta, al.created_at
       FROM activity_log al
       JOIN cards c ON c.id = al.card_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE al.action = 'move'
         AND (sl.project_id = ? OR c.swim_lane_id IS NULL)
         AND (
           SELECT sl2.project_id FROM swim_lanes sl2
           WHERE sl2.id = JSON_EXTRACT(al.meta, '$.to_lane_id')
         ) = ?
       ORDER BY al.card_id, al.created_at`,
      projectId, projectId,
    ),
    db.all<{ card_id: number; meta: string; created_at: string }>(
      `SELECT al.card_id, al.meta, al.created_at
       FROM activity_log al
       JOIN cards c ON c.id = al.card_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE al.action = 'create'
         AND JSON_EXTRACT(al.meta, '$.swim_lane_id') IS NOT NULL
         AND (
           SELECT sl2.project_id FROM swim_lanes sl2
           WHERE sl2.id = JSON_EXTRACT(al.meta, '$.swim_lane_id')
         ) = ?
       ORDER BY al.card_id, al.created_at`,
      projectId,
    ),
  ])

  const durationsByLane: Record<number, number[]> = {}
  const cardEvents: Record<number, { lane_id: number; entered_at: string }[]> = {}

  for (const ev of creates) {
    try {
      const meta = JSON.parse(ev.meta) as { swim_lane_id?: number }
      if (!meta.swim_lane_id) continue
      if (!cardEvents[ev.card_id]) cardEvents[ev.card_id] = []
      cardEvents[ev.card_id].push({ lane_id: meta.swim_lane_id, entered_at: ev.created_at })
    } catch { /* ignore malformed */ }
  }

  for (const mv of moves) {
    try {
      const meta = JSON.parse(mv.meta) as { to_lane_id?: number }
      if (!meta.to_lane_id) continue
      if (!cardEvents[mv.card_id]) cardEvents[mv.card_id] = []
      cardEvents[mv.card_id].push({ lane_id: meta.to_lane_id, entered_at: mv.created_at })
    } catch { /* ignore malformed */ }
  }

  for (const [, events] of Object.entries(cardEvents)) {
    events.sort((a, b) => a.entered_at.localeCompare(b.entered_at))
    for (let i = 0; i < events.length - 1; i++) {
      const laneId = events[i].lane_id
      const enterMs = new Date(events[i].entered_at.includes('Z') ? events[i].entered_at : events[i].entered_at + 'Z').getTime()
      const exitMs  = new Date(events[i + 1].entered_at.includes('Z') ? events[i + 1].entered_at : events[i + 1].entered_at + 'Z').getTime()
      const days = (exitMs - enterMs) / (1000 * 60 * 60 * 24)
      if (days >= 0) {
        if (!durationsByLane[laneId]) durationsByLane[laneId] = []
        durationsByLane[laneId].push(days)
      }
    }
  }

  const result = lanes.map(lane => {
    const durations = durationsByLane[lane.id] ?? []
    const avg_days = durations.length > 0
      ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10
      : null
    return { lane_id: lane.id, lane_name: lane.name, avg_days, sample_size: durations.length }
  })

  return ok(c, result)
})

reports.get('/projects/:id/capacity', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const sprintIdRaw = c.req.query('sprint_id')
  const sprintId = sprintIdRaw ? parseInt(sprintIdRaw, 10) : null

  if (!sprintId || !Number.isFinite(sprintId)) return err(c, 'sprint_id is required', 400)

  const sprint = await db.get('SELECT id FROM sprints WHERE id = ? AND project_id = ?', sprintId, projectId)
  if (!sprint) return err(c, 'sprint not found', 404)

  const rows = await db.all<{ assignee: string; story_count: number; story_points: number; capacity: number | null; skills: string }>(
    `SELECT COALESCE(u.display_name, c.assignee, 'Unassigned') as assignee,
            COUNT(*) as story_count,
            COALESCE(SUM(c.story_points), 0) as story_points,
            pa.capacity,
            pa.skills
     FROM cards c
     LEFT JOIN users u ON u.id = c.assignee_id
     LEFT JOIN project_access pa ON pa.user_id = c.assignee_id AND pa.project_id = ?
     WHERE c.sprint_id = ?
     GROUP BY COALESCE(u.display_name, c.assignee, 'Unassigned'), pa.capacity, pa.skills
     ORDER BY story_points DESC, story_count DESC`,
    projectId, sprintId,
  )

  // Parse skills JSON in response
  const result = rows.map(row => ({
    ...row,
    skills: (() => {
      try { return JSON.parse(row.skills ?? '[]') } catch { return [] }
    })(),
  }))

  return ok(c, result)
})

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return ''
  let s = String(val)

  // Prevent CSV formula injection by prefixing dangerous characters
  if (s[0] === '=' || s[0] === '+' || s[0] === '-' || s[0] === '@') {
    s = "'" + s
  }

  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',')
}

reports.get('/projects/:id/export/csv', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get<{ id: number; name: string }>('SELECT id, name FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const type = c.req.query('type') ?? 'backlog'
  const sprintIdRaw = c.req.query('sprint_id')
  const sprintId = sprintIdRaw ? parseInt(sprintIdRaw, 10) : null

  const header = ['ID', 'Type', 'Title', 'Sprint', 'Epic', 'Feature', 'Assignee', 'Priority', 'Story Points', 'Status', 'Created']
  const rows: string[] = [toCsvRow(header)]

  if (type === 'backlog' || type === 'full') {
    const epics = await db.all<{ id: number; title: string; status: string; assignee: string | null; priority: string; created_at: string }>(
      `SELECT e.id, e.title, e.status, e.assignee, e.priority, e.created_at
       FROM epics e WHERE e.project_id = ? AND e.is_default = 0`,
      projectId,
    )
    for (const e of epics) {
      rows.push(toCsvRow([e.id, 'Epic', e.title, '', '', '', e.assignee ?? '', e.priority, '', e.status, e.created_at]))
    }

    const feats = await db.all<{ id: number; title: string; status: string; assignee: string | null; priority: string; created_at: string; epic_title: string | null }>(
      `SELECT f.id, f.title, f.status, f.assignee, f.priority, f.created_at,
              e.title as epic_title
       FROM features f
       LEFT JOIN epics e ON e.id = f.epic_id
       WHERE f.project_id = ? AND f.is_default = 0`,
      projectId,
    )
    for (const f of feats) {
      rows.push(toCsvRow([f.id, 'Feature', f.title, '', f.epic_title ?? '', '', f.assignee ?? '', f.priority, '', f.status, f.created_at]))
    }
  }

  let stories
  if (type === 'sprint' && sprintId) {
    stories = await db.all(
      `SELECT c.id, c.title, c.assignee, c.priority, c.story_points, c.created_at,
              s.name as sprint_name, e.title as epic_title, f.title as feature_title,
              sl.name as lane_name
       FROM cards c
       LEFT JOIN sprints s ON s.id = c.sprint_id
       LEFT JOIN features f ON f.id = c.feature_id
       LEFT JOIN epics e ON e.id = f.epic_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE c.sprint_id = ?`,
      sprintId,
    )
  } else {
    stories = await db.all(
      `SELECT c.id, c.title, c.assignee, c.priority, c.story_points, c.created_at,
              s.name as sprint_name, e.title as epic_title, f.title as feature_title,
              sl.name as lane_name
       FROM cards c
       LEFT JOIN sprints s ON s.id = c.sprint_id
       LEFT JOIN features f ON f.id = c.feature_id
       LEFT JOIN epics e ON e.id = f.epic_id
       LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
       WHERE sl.project_id = ? OR (c.swim_lane_id IS NULL AND s.project_id = ?)`,
      projectId, projectId,
    )
  }

  for (const c2 of stories as Record<string, unknown>[]) {
    rows.push(toCsvRow([
      c2.id, 'Story', c2.title,
      c2.sprint_name ?? '', c2.epic_title ?? '', c2.feature_title ?? '',
      c2.assignee ?? '', c2.priority, c2.story_points ?? '', c2.lane_name ?? '',
      c2.created_at,
    ]))
  }

  const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const filename = `slateflow_${safeName}_${type}.csv`

  return new Response(rows.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})

export default reports
