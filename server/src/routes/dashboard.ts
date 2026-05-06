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

dashboard.get('/dashboard/stats', async (c) => {
  const user = c.get('user')

  const [totalRow, activeRow, openRow, tcTotalRow, tcPassRow, tcFailRow, tcUnRow] = await Promise.all([
    db.get<{ n: number }>('SELECT COUNT(*) as n FROM projects'),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM sprints WHERE status = 'active'"),
    db.get<{ n: number }>(`SELECT COUNT(*) as n FROM cards c
      LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
      WHERE sl.is_done_col IS NULL OR sl.is_done_col = 0`),
    db.get<{ n: number }>('SELECT COUNT(*) as n FROM test_cases'),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM test_cases WHERE status = 'passed'"),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM test_cases WHERE status = 'failed'"),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM test_cases WHERE status = 'untested'"),
  ])

  return ok(c, {
    total_projects:       totalRow?.n ?? 0,
    active_sprints:       activeRow?.n ?? 0,
    open_cards:           openRow?.n ?? 0,
    test_cases_total:     tcTotalRow?.n ?? 0,
    test_cases_passed:    tcPassRow?.n ?? 0,
    test_cases_failed:    tcFailRow?.n ?? 0,
    test_cases_untested:  tcUnRow?.n ?? 0,
    user_role: user.role,
  })
})

dashboard.get('/dashboard/projects', async (c) => {
  const projects = await db.all<ProjectRow>('SELECT * FROM projects ORDER BY created_at DESC')

  const result = await Promise.all(projects.map(async (project) => {
    let lanes = await db.all<LaneRow>(
      `SELECT sl.id, sl.name, sl.color, sl.position, sl.is_done_col,
              COUNT(c.id) as card_count
       FROM swim_lanes sl
       LEFT JOIN cards c ON c.swim_lane_id = sl.id
       WHERE sl.project_id = ?
       GROUP BY sl.id
       ORDER BY sl.position, sl.id`,
      project.id,
    )

    if (lanes.length === 0) {
      lanes = await db.all<LaneRow>(
        `SELECT col.id, col.name, col.color, col.position,
                CASE WHEN col.position = (
                  SELECT MAX(c2.position) FROM columns c2 WHERE c2.project_id = col.project_id
                ) THEN 1 ELSE 0 END as is_done_col,
                COUNT(c.id) as card_count
         FROM columns col
         LEFT JOIN cards c ON c.column_id = col.id
         WHERE col.project_id = ?
         GROUP BY col.id
         ORDER BY col.position, col.id`,
        project.id,
      )
    }

    const total_cards = lanes.reduce((sum, l) => sum + l.card_count, 0)
    const open_cards = lanes.filter(l => !l.is_done_col).reduce((sum, l) => sum + l.card_count, 0)

    const active_sprint = await db.get<SprintRow>(
      "SELECT * FROM sprints WHERE project_id = ? AND status = 'active' LIMIT 1",
      project.id,
    ) ?? null

    const testStats = await db.get<{
      test_cases_total: number; test_cases_passed: number
      test_cases_failed: number; test_cases_untested: number
    }>(
      `SELECT COUNT(*) as test_cases_total,
        SUM(CASE WHEN status = 'passed'   THEN 1 ELSE 0 END) as test_cases_passed,
        SUM(CASE WHEN status = 'failed'   THEN 1 ELSE 0 END) as test_cases_failed,
        SUM(CASE WHEN status = 'untested' THEN 1 ELSE 0 END) as test_cases_untested
       FROM test_cases WHERE project_id = ?`,
      project.id,
    )

    return { ...project, lanes, total_cards, open_cards, active_sprint, ...testStats }
  }))

  return ok(c, result)
})

dashboard.get('/dashboard/activity', async (c) => {
  const rows = await db.all(
    `SELECT al.id, al.card_id, al.action, al.meta, al.created_at,
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
     LIMIT 10`,
  )

  return ok(c, rows)
})

export default dashboard
