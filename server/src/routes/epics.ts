import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { canRead, canWrite } from '../lib/epicAccess.js'

const epics = new Hono()

const CreateSchema = z.object({
  title:       z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().default(''),
  priority:    z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  status:      z.enum(['new', 'active', 'resolved', 'closed']).optional().default('new'),
  assignee:    z.string().max(200).nullable().optional(),
})

const UpdateSchema = z.object({
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  priority:    z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  status:      z.enum(['new', 'active', 'resolved', 'closed']).optional(),
  assignee:    z.string().max(200).nullable().optional(),
})

// ── list epics for a project ────────────────────────────────────────────────
epics.get('/projects/:id/epics', (c) => {
  const user = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let rows
  if (user.role === 'super_admin') {
    rows = db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
        (SELECT COUNT(*) FROM cards s JOIN features f ON f.id = s.feature_id WHERE f.epic_id = e.id) AS story_count
      FROM epics e WHERE e.project_id = ? ORDER BY e.position, e.id
    `).all(projectId)
  } else {
    // Members see epics where they have an explicit grant OR the Default Epic
    rows = db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
        (SELECT COUNT(*) FROM cards s JOIN features f ON f.id = s.feature_id WHERE f.epic_id = e.id) AS story_count
      FROM epics e
      WHERE e.project_id = ?
        AND (e.is_default = 1 OR EXISTS (
          SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?
        ))
      ORDER BY e.position, e.id
    `).all(projectId, user.id)
  }

  return ok(c, rows)
})

// ── create epic ─────────────────────────────────────────────────────────────
epics.post('/projects/:id/epics', async (c) => {
  const user = c.get('user')
  if (user.role !== 'super_admin') return err(c, 'forbidden', 403)

  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return err(c, 'project not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, priority, status, assignee } = parsed.data

  const maxPos = (
    db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM epics WHERE project_id = ?')
      .get(projectId) as { m: number }
  ).m

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO epics (project_id, title, description, priority, status, assignee, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, title, description, priority, status, assignee ?? null, maxPos + 1)

  const row = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
      (SELECT COUNT(*) FROM cards s
         JOIN features f ON f.id = s.feature_id
         WHERE f.epic_id = e.id) AS story_count
    FROM epics e WHERE e.id = ?
  `).get(lastInsertRowid)

  return ok(c, row, 201)
})

// ── get single epic ─────────────────────────────────────────────────────────
epics.get('/epics/:id', (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const row = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
      (SELECT COUNT(*) FROM cards s
         JOIN features f ON f.id = s.feature_id
         WHERE f.epic_id = e.id) AS story_count
    FROM epics e WHERE e.id = ?
  `).get(id)

  if (!row) return err(c, 'epic not found', 404)
  if (!canRead(user.id, id, user.role)) return err(c, 'forbidden', 403)
  return ok(c, row)
})

// ── update epic ─────────────────────────────────────────────────────────────
epics.patch('/epics/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = db.prepare('SELECT id FROM epics WHERE id = ?').get(id)
  if (!existing) return err(c, 'epic not found', 404)
  if (!canWrite(user.id, id, user.role)) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const allowed = ['title', 'description', 'priority', 'status', 'assignee'] as const
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`)
      vals.push(fields[key] ?? null)
    }
  }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  db.prepare(`UPDATE epics SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  const row = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
      (SELECT COUNT(*) FROM cards s
         JOIN features f ON f.id = s.feature_id
         WHERE f.epic_id = e.id) AS story_count
    FROM epics e WHERE e.id = ?
  `).get(id)

  return ok(c, row)
})

// ── delete epic ─────────────────────────────────────────────────────────────
epics.delete('/epics/:id', (c) => {
  const user = c.get('user')
  if (user.role !== 'super_admin') return err(c, 'forbidden', 403)

  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const epic = db.prepare('SELECT id, is_default FROM epics WHERE id = ?').get(id) as { id: number; is_default: number } | undefined
  if (!epic) return err(c, 'epic not found', 404)
  if (epic.is_default) return err(c, 'cannot delete the default epic', 409)

  db.prepare('DELETE FROM epics WHERE id = ?').run(id)
  return ok(c, { id })
})

export default epics
