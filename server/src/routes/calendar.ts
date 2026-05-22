import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { requireFeature, requireSuperAdmin } from '../middleware/requireRole.js'
import { canWrite } from '../lib/projectAccess.js'

const calendar = new Hono()

calendar.use('/projects/:id/calendar', requireFeature('calendar'))
calendar.use('/projects/:id/calendar/*', requireFeature('calendar'))
calendar.use('/calendar/*', requireFeature('calendar'))
calendar.use('/vacations', requireFeature('calendar'))
calendar.use('/vacations/*', requireFeature('calendar'))
calendar.use('/admin/holidays', requireFeature('calendar'))
calendar.use('/admin/holidays/*', requireFeature('calendar'))

// Holiday admin routes also gated by super_admin
calendar.use('/admin/holidays', requireSuperAdmin)
calendar.use('/admin/holidays/*', requireSuperAdmin)

// ── Schemas ──────────────────────────────────────────────────────────────────

const dateRx = /^\d{4}-\d{2}-\d{2}$/
const HexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'color must be a hex value')

const RangeSchema = z.object({
  from: z.string().regex(dateRx, 'from must be YYYY-MM-DD'),
  to:   z.string().regex(dateRx, 'to must be YYYY-MM-DD'),
})

const EntryCreateSchema = z.object({
  title:       z.string().min(1, 'title is required').max(300),
  description: z.string().max(2000).nullable().optional(),
  start_date:  z.string().regex(dateRx, 'start_date must be YYYY-MM-DD'),
  end_date:    z.string().regex(dateRx, 'end_date must be YYYY-MM-DD'),
  color:       HexColor.nullable().optional(),
  country:     z.string().max(100).nullable().optional(),
  state_province: z.string().max(200).nullable().optional(),
})

const VacationCreateSchema = z.object({
  user_id:     z.number().int().positive().optional(),
  title:       z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  start_date:  z.string().regex(dateRx, 'start_date must be YYYY-MM-DD'),
  end_date:    z.string().regex(dateRx, 'end_date must be YYYY-MM-DD'),
  color:       HexColor.nullable().optional(),
})

const EntryUpdateSchema = z.object({
  title:       z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  start_date:  z.string().regex(dateRx).optional(),
  end_date:    z.string().regex(dateRx).optional(),
  color:       HexColor.nullable().optional(),
  country:     z.string().max(100).nullable().optional(),
  state_province: z.string().max(200).nullable().optional(),
})

// ── Types ────────────────────────────────────────────────────────────────────

type EntryRow = {
  id: number
  kind: 'holiday' | 'event' | 'vacation'
  project_id: number | null
  user_id: number | null
  title: string
  description: string | null
  start_date: string
  end_date: string
  color: string | null
  country: string | null
  state_province: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function isProjectAdminAnywhere(userId: number): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) as n FROM project_access WHERE user_id = ? AND role = 'project_admin'",
    userId,
  )
  return (row?.n ?? 0) > 0
}

async function canManageVacationFor(
  callerUserId: number,
  callerGlobalRole: string,
  targetUserId: number,
): Promise<boolean> {
  if (callerGlobalRole === 'super_admin') return true
  if (callerUserId === targetUserId) return true
  return isProjectAdminAnywhere(callerUserId)
}

function endsAfterStart(start: string, end: string): boolean {
  return start <= end
}

// ── Read endpoint ────────────────────────────────────────────────────────────

calendar.get('/projects/:id/calendar', async (c) => {
  const user = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const parsed = RangeSchema.safeParse({
    from: c.req.query('from'),
    to:   c.req.query('to'),
  })
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { from, to } = parsed.data

  // Sprints in range
  const sprints = await db.all(
    `SELECT id, name, start_date, end_date, status
       FROM sprints
      WHERE project_id = ?
        AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    projectId, to, from,
  )

  // Epics in range — filter by epic_access for non-admins
  let epics
  if (user.role === 'super_admin') {
    epics = await db.all(
      `SELECT id, title, start_date, end_date, status, priority
         FROM epics
        WHERE project_id = ?
          AND start_date IS NOT NULL AND end_date IS NOT NULL
          AND start_date <= ? AND end_date >= ?
        ORDER BY start_date`,
      projectId, to, from,
    )
  } else {
    epics = await db.all(
      `SELECT id, title, start_date, end_date, status, priority
         FROM epics e
        WHERE e.project_id = ?
          AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
          AND e.start_date <= ? AND e.end_date >= ?
          AND (e.is_default = 1 OR EXISTS (
            SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?
          ))
        ORDER BY e.start_date`,
      projectId, to, from, user.id,
    )
  }

  // Features in range
  const features = await db.all(
    `SELECT id, title, start_date, end_date, status, priority, epic_id
       FROM features
      WHERE project_id = ?
        AND start_date IS NOT NULL AND end_date IS NOT NULL
        AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    projectId, to, from,
  )

  // Holidays — global, visible to everyone
  const holidays = await db.all(
    `SELECT id, title, description, start_date, end_date, color, created_by, created_at
       FROM calendar_entries
      WHERE kind = 'holiday'
        AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    to, from,
  )

  // Events — project-scoped
  const events = await db.all(
    `SELECT id, project_id, title, description, start_date, end_date, color, created_by, created_at
       FROM calendar_entries
      WHERE kind = 'event' AND project_id = ?
        AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    projectId, to, from,
  )

  // Vacations — global, joined to user display_name
  const vacations = await db.all(
    `SELECT ce.id, ce.user_id, ce.title, ce.description, ce.start_date, ce.end_date,
            ce.color, ce.created_by, ce.created_at,
            u.display_name AS user_display_name, u.email AS user_email
       FROM calendar_entries ce
       LEFT JOIN users u ON u.id = ce.user_id
      WHERE ce.kind = 'vacation'
        AND ce.start_date <= ? AND ce.end_date >= ?
      ORDER BY ce.start_date`,
    to, from,
  )

  return ok(c, { sprints, epics, features, holidays, events, vacations })
})

// ── Holidays (super_admin) ───────────────────────────────────────────────────

calendar.get('/admin/holidays', async (c) => {
  const country        = c.req.query('country')        ?? null
  const state_province = c.req.query('state_province') ?? null
  const clauses = ["kind = 'holiday'"]
  const params: unknown[] = []

  if (country) {
    clauses.push('country = ?')
    params.push(country)
  }
  if (state_province) {
    clauses.push('state_province = ?')
    params.push(state_province)
  }

  const rows = await db.all<EntryRow>(
    `SELECT * FROM calendar_entries WHERE ${clauses.join(' AND ')} ORDER BY start_date`,
    ...params,
  )
  return ok(c, rows)
})

calendar.post('/admin/holidays', async (c) => {
  const user = c.get('user')
  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = EntryCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)
  if (!endsAfterStart(parsed.data.start_date, parsed.data.end_date)) {
    return err(c, 'end_date must be on or after start_date', 422)
  }

  const { title, description, start_date, end_date, color, country, state_province } = parsed.data
  const { lastID } = await db.run(
    `INSERT INTO calendar_entries (kind, title, description, start_date, end_date, color, country, state_province, created_by)
     VALUES ('holiday', ?, ?, ?, ?, ?, ?, ?, ?)`,
    title, description ?? null, start_date, end_date, color ?? null, country ?? null, state_province ?? null, user.id,
  )

  const entry = await db.get<EntryRow>('SELECT * FROM calendar_entries WHERE id = ?', lastID)
  emitBoardEvent({ type: 'calendar:entry:created', projectId: null, data: entry })
  return ok(c, entry, 201)
})

calendar.patch('/admin/holidays/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<EntryRow>(
    "SELECT * FROM calendar_entries WHERE id = ? AND kind = 'holiday'", id,
  )
  if (!existing) return err(c, 'holiday not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = EntryUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const merged = {
    start_date: parsed.data.start_date ?? existing.start_date,
    end_date:   parsed.data.end_date   ?? existing.end_date,
  }
  if (!endsAfterStart(merged.start_date, merged.end_date)) {
    return err(c, 'end_date must be on or after start_date', 422)
  }

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []
  for (const k of ['title', 'description', 'start_date', 'end_date', 'color', 'country', 'state_province'] as const) {
    if (k in parsed.data) {
      sets.push(`${k} = ?`)
      vals.push(parsed.data[k] ?? null)
    }
  }
  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE calendar_entries SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  const entry = await db.get<EntryRow>('SELECT * FROM calendar_entries WHERE id = ?', id)
  emitBoardEvent({ type: 'calendar:entry:updated', projectId: null, data: entry })
  return ok(c, entry)
})

calendar.delete('/admin/holidays/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<EntryRow>(
    "SELECT id FROM calendar_entries WHERE id = ? AND kind = 'holiday'", id,
  )
  if (!existing) return err(c, 'holiday not found', 404)

  await db.run('DELETE FROM calendar_entries WHERE id = ?', id)
  emitBoardEvent({ type: 'calendar:entry:deleted', projectId: null, data: { id, kind: 'holiday' } })
  return ok(c, { id })
})

// ── Events (project-scoped) ──────────────────────────────────────────────────

calendar.post('/projects/:id/calendar/events', async (c) => {
  const user = c.get('user')
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  if (!(await canWrite(user.id, projectId, user.role))) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = EntryCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)
  if (!endsAfterStart(parsed.data.start_date, parsed.data.end_date)) {
    return err(c, 'end_date must be on or after start_date', 422)
  }

  const { title, description, start_date, end_date, color } = parsed.data
  const { lastID } = await db.run(
    `INSERT INTO calendar_entries (kind, project_id, title, description, start_date, end_date, color, created_by)
     VALUES ('event', ?, ?, ?, ?, ?, ?, ?)`,
    projectId, title, description ?? null, start_date, end_date, color ?? null, user.id,
  )

  const entry = await db.get<EntryRow>('SELECT * FROM calendar_entries WHERE id = ?', lastID)
  emitBoardEvent({ type: 'calendar:entry:created', projectId, data: entry })
  return ok(c, entry, 201)
})

calendar.patch('/calendar/events/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<EntryRow>(
    "SELECT * FROM calendar_entries WHERE id = ? AND kind = 'event'", id,
  )
  if (!existing || existing.project_id === null) return err(c, 'event not found', 404)

  if (!(await canWrite(user.id, existing.project_id, user.role))) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = EntryUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const merged = {
    start_date: parsed.data.start_date ?? existing.start_date,
    end_date:   parsed.data.end_date   ?? existing.end_date,
  }
  if (!endsAfterStart(merged.start_date, merged.end_date)) {
    return err(c, 'end_date must be on or after start_date', 422)
  }

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []
  for (const k of ['title', 'description', 'start_date', 'end_date', 'color'] as const) {
    if (k in parsed.data) {
      sets.push(`${k} = ?`)
      vals.push(parsed.data[k] ?? null)
    }
  }
  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE calendar_entries SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  const entry = await db.get<EntryRow>('SELECT * FROM calendar_entries WHERE id = ?', id)
  emitBoardEvent({ type: 'calendar:entry:updated', projectId: existing.project_id, data: entry })
  return ok(c, entry)
})

calendar.delete('/calendar/events/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<EntryRow>(
    "SELECT id, project_id FROM calendar_entries WHERE id = ? AND kind = 'event'", id,
  )
  if (!existing || existing.project_id === null) return err(c, 'event not found', 404)

  if (!(await canWrite(user.id, existing.project_id, user.role))) return err(c, 'forbidden', 403)

  await db.run('DELETE FROM calendar_entries WHERE id = ?', id)
  emitBoardEvent({ type: 'calendar:entry:deleted', projectId: existing.project_id, data: { id, kind: 'event' } })
  return ok(c, { id })
})

// ── Vacations (user-owned) ───────────────────────────────────────────────────

calendar.post('/vacations', async (c) => {
  const user = c.get('user')

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = VacationCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)
  if (!endsAfterStart(parsed.data.start_date, parsed.data.end_date)) {
    return err(c, 'end_date must be on or after start_date', 422)
  }

  const targetUserId = parsed.data.user_id ?? user.id
  if (!(await canManageVacationFor(user.id, user.role, targetUserId))) return err(c, 'forbidden', 403)

  const target = await db.get<{ id: number; display_name: string }>(
    'SELECT id, display_name FROM users WHERE id = ? AND deleted_at IS NULL',
    targetUserId,
  )
  if (!target) return err(c, 'user not found', 404)

  const title = parsed.data.title?.trim() || `${target.display_name} on vacation`
  const { description, start_date, end_date, color } = parsed.data

  const { lastID } = await db.run(
    `INSERT INTO calendar_entries (kind, user_id, title, description, start_date, end_date, color, created_by)
     VALUES ('vacation', ?, ?, ?, ?, ?, ?, ?)`,
    targetUserId, title, description ?? null, start_date, end_date, color ?? null, user.id,
  )

  const entry = await db.get<EntryRow>('SELECT * FROM calendar_entries WHERE id = ?', lastID)
  emitBoardEvent({ type: 'calendar:entry:created', projectId: null, data: entry })
  return ok(c, entry, 201)
})

calendar.patch('/vacations/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<EntryRow>(
    "SELECT * FROM calendar_entries WHERE id = ? AND kind = 'vacation'", id,
  )
  if (!existing || existing.user_id === null) return err(c, 'vacation not found', 404)

  if (!(await canManageVacationFor(user.id, user.role, existing.user_id))) return err(c, 'forbidden', 403)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = EntryUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const merged = {
    start_date: parsed.data.start_date ?? existing.start_date,
    end_date:   parsed.data.end_date   ?? existing.end_date,
  }
  if (!endsAfterStart(merged.start_date, merged.end_date)) {
    return err(c, 'end_date must be on or after start_date', 422)
  }

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []
  for (const k of ['title', 'description', 'start_date', 'end_date', 'color'] as const) {
    if (k in parsed.data) {
      sets.push(`${k} = ?`)
      vals.push(parsed.data[k] ?? null)
    }
  }
  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE calendar_entries SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  const entry = await db.get<EntryRow>('SELECT * FROM calendar_entries WHERE id = ?', id)
  emitBoardEvent({ type: 'calendar:entry:updated', projectId: null, data: entry })
  return ok(c, entry)
})

calendar.delete('/vacations/:id', async (c) => {
  const user = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<EntryRow>(
    "SELECT id, user_id FROM calendar_entries WHERE id = ? AND kind = 'vacation'", id,
  )
  if (!existing || existing.user_id === null) return err(c, 'vacation not found', 404)

  if (!(await canManageVacationFor(user.id, user.role, existing.user_id))) return err(c, 'forbidden', 403)

  await db.run('DELETE FROM calendar_entries WHERE id = ?', id)
  emitBoardEvent({ type: 'calendar:entry:deleted', projectId: null, data: { id, kind: 'vacation' } })
  return ok(c, { id })
})

export default calendar
