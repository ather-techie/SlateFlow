import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'

const roadmap = new Hono()

roadmap.get('/projects/:id/roadmap', async (c) => {
  const user = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  let epics
  if (user.role === 'super_admin') {
    epics = await db.all(
      `SELECT e.id, e.title, e.status, e.priority, e.start_date, e.end_date, e.is_default, e.position,
        (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id AND f.is_default = 0) AS feature_count,
        (SELECT COUNT(*) FROM cards s JOIN features f ON f.id = s.feature_id WHERE f.epic_id = e.id AND f.is_default = 0) AS story_count
       FROM epics e
       WHERE e.project_id = ? AND e.is_default = 0
       ORDER BY e.position, e.id`,
      projectId,
    )
  } else {
    epics = await db.all(
      `SELECT e.id, e.title, e.status, e.priority, e.start_date, e.end_date, e.is_default, e.position,
        (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id AND f.is_default = 0) AS feature_count,
        (SELECT COUNT(*) FROM cards s JOIN features f ON f.id = s.feature_id WHERE f.epic_id = e.id AND f.is_default = 0) AS story_count
       FROM epics e
       WHERE e.project_id = ? AND e.is_default = 0
         AND EXISTS (
           SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?
         )
       ORDER BY e.position, e.id`,
      projectId, user.id,
    )
  }

  const epicIds = (epics as { id: number }[]).map(e => e.id)
  if (epicIds.length === 0) return ok(c, [])

  const features = await db.all<Record<string, unknown>>(
    `SELECT f.id, f.epic_id, f.title, f.status, f.priority, f.start_date, f.end_date, f.is_default, f.position,
      (SELECT COUNT(*) FROM cards s WHERE s.feature_id = f.id) AS story_count,
      (SELECT COUNT(*) FROM cards s
         JOIN swim_lanes sl ON sl.id = s.swim_lane_id
         WHERE s.feature_id = f.id AND sl.is_done_col = 1) AS done_story_count
     FROM features f
     WHERE f.is_default = 0 AND f.epic_id IN (${epicIds.map(() => '?').join(',')})
     ORDER BY f.position, f.id`,
    ...epicIds,
  )

  const featuresByEpic: Record<number, Record<string, unknown>[]> = {}
  for (const f of features) {
    const eid = f.epic_id as number
    if (!featuresByEpic[eid]) featuresByEpic[eid] = []
    featuresByEpic[eid].push(f)
  }

  const result = (epics as Record<string, unknown>[]).map(e => ({
    ...e,
    features: featuresByEpic[e.id as number] ?? [],
  }))

  return ok(c, result)
})

export default roadmap
