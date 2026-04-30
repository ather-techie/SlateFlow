import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok } from '../lib/response.js'

const dashboard = new Hono()

interface ProjectRow {
  id: number
  name: string
  description: string
  color: string
  created_at: string
}

interface LaneRow {
  id: number
  name: string
  color: string
  position: number
  is_done_col: number
  card_count: number
}

interface SprintRow {
  id: number
  project_id: number
  name: string
  goal: string
  start_date: string
  end_date: string
  status: string
}

// GET /dashboard/stats — aggregate counts across all projects
dashboard.get('/dashboard/stats', (c) => {
  const total_projects = (db.prepare('SELECT COUNT(*) as n FROM projects').get() as { n: number }).n
  const active_sprints = (db.prepare("SELECT COUNT(*) as n FROM sprints WHERE status = 'active'").get() as { n: number }).n
  // Cards in non-done swim_lanes count as open; legacy column cards (no swim_lane_id) also count as open
  const open_cards = (db.prepare(`
    SELECT COUNT(*) as n FROM cards c
    LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
    WHERE sl.is_done_col IS NULL OR sl.is_done_col = 0
  `).get() as { n: number }).n

  return ok(c, { total_projects, active_sprints, open_cards })
})

// GET /dashboard/projects — all projects with lane card counts and active sprint
dashboard.get('/dashboard/projects', (c) => {
  const projects = db.prepare(
    'SELECT * FROM projects ORDER BY created_at DESC',
  ).all() as ProjectRow[]

  const swimLanesStmt = db.prepare(`
    SELECT sl.id, sl.name, sl.color, sl.position, sl.is_done_col,
           COUNT(c.id) as card_count
    FROM swim_lanes sl
    LEFT JOIN cards c ON c.swim_lane_id = sl.id
    WHERE sl.project_id = ?
    GROUP BY sl.id
    ORDER BY sl.position, sl.id
  `)

  // For legacy projects using the columns table; treat last position as done
  const columnsStmt = db.prepare(`
    SELECT col.id, col.name, col.color, col.position,
           CASE WHEN col.position = (
             SELECT MAX(c2.position) FROM columns c2 WHERE c2.project_id = col.project_id
           ) THEN 1 ELSE 0 END as is_done_col,
           COUNT(c.id) as card_count
    FROM columns col
    LEFT JOIN cards c ON c.column_id = col.id
    WHERE col.project_id = ?
    GROUP BY col.id
    ORDER BY col.position, col.id
  `)

  const sprintStmt = db.prepare(
    "SELECT * FROM sprints WHERE project_id = ? AND status = 'active' LIMIT 1",
  )

  const result = projects.map(project => {
    let lanes = swimLanesStmt.all(project.id) as LaneRow[]
    if (lanes.length === 0) {
      lanes = columnsStmt.all(project.id) as LaneRow[]
    }

    const total_cards = lanes.reduce((sum, l) => sum + l.card_count, 0)
    const open_cards = lanes
      .filter(l => !l.is_done_col)
      .reduce((sum, l) => sum + l.card_count, 0)

    const active_sprint = (sprintStmt.get(project.id) as SprintRow | undefined) ?? null

    return { ...project, lanes, total_cards, open_cards, active_sprint }
  })

  return ok(c, result)
})

// GET /dashboard/activity — last 10 activity items across all projects
dashboard.get('/dashboard/activity', (c) => {
  const rows = db.prepare(`
    SELECT al.id, al.card_id, al.action, al.meta, al.created_at,
           c.title as card_title,
           COALESCE(sl.project_id, col.project_id) as project_id,
           p.name as project_name
    FROM activity_log al
    JOIN cards c ON c.id = al.card_id
    LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
    LEFT JOIN columns col ON col.id = c.column_id
    LEFT JOIN projects p ON p.id = COALESCE(sl.project_id, col.project_id)
    WHERE p.id IS NOT NULL
    ORDER BY al.created_at DESC
    LIMIT 10
  `).all()

  return ok(c, rows)
})

export default dashboard
