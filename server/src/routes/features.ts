import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { canWrite } from '../lib/epicAccess.js'

const features = new Hono()

const CreateSchema = z.object({
  title:       z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().default(''),
  epic_id:     z.number().int().positive().nullable().optional(),
  priority:    z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  status:      z.enum(['new', 'active', 'resolved', 'closed']).optional().default('new'),
  assignee:    z.string().max(200).nullable().optional(),
})

const UpdateSchema = z.object({
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  epic_id:     z.number().int().positive().nullable().optional(),
  priority:    z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  status:      z.enum(['new', 'active', 'resolved', 'closed']).optional(),
  assignee:    z.string().max(200).nullable().optional(),
  start_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

const FEATURE_WITH_COUNTS = `
  SELECT f.*,
    (SELECT COUNT(*) FROM cards s WHERE s.feature_id = f.id) AS story_count,
    (SELECT COUNT(*) FROM cards s
       JOIN swim_lanes sl ON sl.id = s.swim_lane_id
       WHERE s.feature_id = f.id AND sl.is_done_col = 1) AS done_story_count
  FROM features f
`

// ── list features for a project ─────────────────────────────────────────────
features.get('/projects/:id/features', (c) => {
  const user = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  const epicIdRaw = c.req.query('epic_id')
  const epicId = epicIdRaw ? parseInt(epicIdRaw, 10) : null

  let rows
  if (user.role === 'super_admin') {
    if (epicId && Number.isFinite(epicId) && epicId > 0) {
      rows = db.prepare(`${FEATURE_WITH_COUNTS} WHERE f.project_id = ? AND f.epic_id = ? ORDER BY f.position, f.id`).all(projectId, epicId)
    } else {
      rows = db.prepare(`${FEATURE_WITH_COUNTS} WHERE f.project_id = ? ORDER BY f.position, f.id`).all(projectId)
    }
  } else {
    // Only features whose parent epic is accessible (Default Epic or has epic_access row)
    const accessFilter = `(e.is_default = 1 OR EXISTS (SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?))`
    if (epicId && Number.isFinite(epicId) && epicId > 0) {
      rows = db.prepare(`
        ${FEATURE_WITH_COUNTS}
        JOIN epics e ON e.id = f.epic_id
        WHERE f.project_id = ? AND f.epic_id = ? AND ${accessFilter}
        ORDER BY f.position, f.id
      `).all(projectId, epicId, user.id)
    } else {
      rows = db.prepare(`
        ${FEATURE_WITH_COUNTS}
        JOIN epics e ON e.id = f.epic_id
        WHERE f.project_id = ? AND ${accessFilter}
        ORDER BY f.position, f.id
      `).all(projectId, user.id)
    }
  }

  return ok(c, rows)
})

// ── create feature ──────────────────────────────────────────────────────────
features.post('/projects/:id/features', async (c) => {
  const user = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, epic_id, priority, status, assignee } = parsed.data

  let resolvedEpicId: number | null = epic_id ?? null
  if (!resolvedEpicId) {
    const def = db.prepare('SELECT id FROM epics WHERE project_id = ? AND is_default = 1 LIMIT 1')
      .get(projectId) as { id: number } | undefined
    if (def) resolvedEpicId = def.id
  } else {
    const exists = db.prepare('SELECT id FROM epics WHERE id = ? AND project_id = ?').get(resolvedEpicId, projectId)
    if (!exists) return err(c, 'epic not found in this project', 404)
  }

  // Check write access on the target epic
  if (resolvedEpicId && !canWrite(user.id, resolvedEpicId, user.role)) return err(c, 'forbidden', 403)

  const maxPos = (
    db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM features WHERE project_id = ?')
      .get(projectId) as { m: number }
  ).m

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO features (project_id, epic_id, title, description, priority, status, assignee, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, resolvedEpicId, title, description, priority, status, assignee ?? null, maxPos + 1)

  const row = db.prepare(`${FEATURE_WITH_COUNTS} WHERE f.id = ?`).get(lastInsertRowid)
  return ok(c, row, 201)
})

// ── get single feature ──────────────────────────────────────────────────────
features.get('/features/:id', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const row = db.prepare(`${FEATURE_WITH_COUNTS} WHERE f.id = ?`).get(id)
  if (!row) return err(c, 'feature not found', 404)
  return ok(c, row)
})

// ── update feature ──────────────────────────────────────────────────────────
features.patch('/features/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = db.prepare('SELECT id, project_id, epic_id FROM features WHERE id = ?').get(id) as { id: number; project_id: number; epic_id: number | null } | undefined
  if (!existing) return err(c, 'feature not found', 404)
  if (existing.epic_id && !canWrite(user.id, existing.epic_id, user.role)) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data

  if (fields.epic_id) {
    const epic = db.prepare('SELECT id FROM epics WHERE id = ? AND project_id = ?').get(fields.epic_id, existing.project_id)
    if (!epic) return err(c, 'epic not found in this project', 404)
  }

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const allowed = ['title', 'description', 'epic_id', 'priority', 'status', 'assignee', 'start_date', 'end_date'] as const
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`)
      vals.push(fields[key] ?? null)
    }
  }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  db.prepare(`UPDATE features SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  return ok(c, db.prepare(`${FEATURE_WITH_COUNTS} WHERE f.id = ?`).get(id))
})

// ── list stories for a feature ──────────────────────────────────────────────
features.get('/features/:id/stories', (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const feature = db.prepare('SELECT id FROM features WHERE id = ?').get(id)
  if (!feature) return err(c, 'feature not found', 404)

  const rows = db.prepare('SELECT * FROM cards WHERE feature_id = ? ORDER BY position, id').all(id)
  return ok(c, rows)
})

// ── delete feature ──────────────────────────────────────────────────────────
features.delete('/features/:id', (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const feature = db.prepare('SELECT id, is_default, epic_id FROM features WHERE id = ?').get(id) as { id: number; is_default: number; epic_id: number | null } | undefined
  if (!feature) return err(c, 'feature not found', 404)
  if (feature.is_default) return err(c, 'cannot delete the default feature', 409)
  if (feature.epic_id && !canWrite(user.id, feature.epic_id, user.role)) return err(c, 'forbidden', 403)

  db.prepare('DELETE FROM features WHERE id = ?').run(id)
  return ok(c, { id })
})

export default features
