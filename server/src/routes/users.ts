import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { hashPassword } from '../lib/auth.js'
import { requireSuperAdmin } from '../middleware/requireRole.js'

const users = new Hono()

function parseSkills(s: string | null | undefined): string[] {
  try { return JSON.parse(s ?? '[]') } catch { return [] }
}

users.get('/users/search', async (c) => {
  const q = c.req.query('q') ?? ''
  const rows = await db.all(
    `SELECT id, display_name, email, role FROM users
     WHERE deleted_at IS NULL AND is_active = 1
       AND (display_name LIKE ? OR email LIKE ?)
     ORDER BY display_name LIMIT 20`,
    `%${q}%`, `%${q}%`,
  )
  return ok(c, rows)
})

users.use('/users', requireSuperAdmin)
users.use('/users/:id', requireSuperAdmin)
users.use('/users/:id/project-access', requireSuperAdmin)

users.get('/users', async (c) => {
  const rows = await db.all<{
    id: number
    email: string
    display_name: string
    role: string
    is_active: number
    created_at: string
    skills: string
    country: string | null
    state: string | null
    city: string | null
    home_country: string | null
    home_state: string | null
    home_city: string | null
    timezone: string | null
    job_title: string | null
    department: string | null
    phone: string | null
    gender: string | null
    reporting_manager_id: number | null
    reporting_manager_name: string | null
  }>(
    `SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.created_at, u.skills,
            u.country, u.state, u.city, u.home_country, u.home_state, u.home_city,
            u.timezone, u.job_title, u.department, u.phone, u.gender, u.reporting_manager_id,
            mgr.display_name AS reporting_manager_name
     FROM users u
     LEFT JOIN users mgr ON u.reporting_manager_id = mgr.id AND mgr.deleted_at IS NULL
     WHERE u.deleted_at IS NULL
     ORDER BY u.created_at DESC`,
  )
  return ok(c, rows.map(r => ({
    ...r,
    skills: parseSkills(r.skills),
    reporting_manager: r.reporting_manager_id ? { id: r.reporting_manager_id, display_name: r.reporting_manager_name } : null,
  })))
})

users.post('/users', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    email:                z.string().email(),
    display_name:         z.string().min(1),
    password:             z.string().min(8),
    role:                 z.enum(['super_admin', 'global_reader']).default('global_reader'),
    skills:               z.array(z.string().min(1).max(100)).max(50).default([]),
    country:              z.string().max(100).optional().nullable(),
    state:                z.string().max(100).optional().nullable(),
    city:                 z.string().max(100).optional().nullable(),
    home_country:         z.string().max(100).optional().nullable(),
    home_state:           z.string().max(100).optional().nullable(),
    home_city:            z.string().max(100).optional().nullable(),
    timezone:             z.string().max(100).optional().nullable(),
    job_title:            z.string().max(200).optional().nullable(),
    department:           z.string().max(200).optional().nullable(),
    phone:                z.string().max(50).optional().nullable(),
    gender:               z.string().max(100).optional().nullable(),
    reporting_manager_id: z.number().int().positive().optional().nullable(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { email, display_name, password, role, skills, country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id } = parsed.data

  const exists = await db.get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', email)
  if (exists) return err(c, 'email already in use', 409)

  const hash = hashPassword(password)
  const { lastID } = await db.run(
    `INSERT INTO users (email, display_name, password_hash, role, skills, country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    email, display_name, hash, role, JSON.stringify(skills), country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id,
  )

  const user = await db.get<{
    id: number
    email: string
    display_name: string
    role: string
    is_active: number
    created_at: string
    skills: string
    country: string | null
    state: string | null
    city: string | null
    home_country: string | null
    home_state: string | null
    home_city: string | null
    timezone: string | null
    job_title: string | null
    department: string | null
    phone: string | null
    gender: string | null
    reporting_manager_id: number | null
  }>(
    `SELECT id, email, display_name, role, is_active, created_at, skills, country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id FROM users WHERE id = ?`,
    lastID,
  )
  return ok(c, { ...user, skills: parseSkills(user?.skills) }, 201)
})

users.patch('/users/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)

  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    display_name:         z.string().min(1).optional(),
    role:                 z.enum(['super_admin', 'global_reader']).optional(),
    is_active:            z.boolean().optional(),
    new_password:         z.string().min(8).optional(),
    skills:               z.array(z.string().min(1).max(100)).max(50).optional(),
    country:              z.string().max(100).optional().nullable(),
    state:                z.string().max(100).optional().nullable(),
    city:                 z.string().max(100).optional().nullable(),
    home_country:         z.string().max(100).optional().nullable(),
    home_state:           z.string().max(100).optional().nullable(),
    home_city:            z.string().max(100).optional().nullable(),
    timezone:             z.string().max(100).optional().nullable(),
    job_title:            z.string().max(200).optional().nullable(),
    department:           z.string().max(200).optional().nullable(),
    phone:                z.string().max(50).optional().nullable(),
    gender:               z.string().max(100).optional().nullable(),
    reporting_manager_id: z.number().int().positive().optional().nullable(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { display_name, role, is_active, new_password, skills, country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id } = parsed.data

  if (role === 'global_reader') {
    const row = await db.get<{ n: number }>(
      "SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL AND id != ?",
      id,
    )
    if ((row?.n ?? 0) === 0) return err(c, 'cannot demote the last super admin', 409)
  }

  const updates: string[] = []
  const params: (string | number | boolean | null)[] = []

  if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name) }
  if (role !== undefined)         { updates.push('role = ?');         params.push(role) }
  if (is_active !== undefined)    { updates.push('is_active = ?');    params.push(is_active ? 1 : 0) }
  if (new_password !== undefined) { updates.push('password_hash = ?'); params.push(hashPassword(new_password)) }
  if (skills !== undefined)       { updates.push('skills = ?');       params.push(JSON.stringify(skills)) }
  if (country !== undefined) { updates.push('country = ?'); params.push(country) }
  if (state !== undefined) { updates.push('state = ?'); params.push(state) }
  if (city !== undefined) { updates.push('city = ?'); params.push(city) }
  if (home_country !== undefined) { updates.push('home_country = ?'); params.push(home_country) }
  if (home_state !== undefined) { updates.push('home_state = ?'); params.push(home_state) }
  if (home_city !== undefined) { updates.push('home_city = ?'); params.push(home_city) }
  if (timezone !== undefined) { updates.push('timezone = ?'); params.push(timezone) }
  if (job_title !== undefined) { updates.push('job_title = ?'); params.push(job_title) }
  if (department !== undefined) { updates.push('department = ?'); params.push(department) }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone) }
  if (gender !== undefined) { updates.push('gender = ?'); params.push(gender) }
  if (reporting_manager_id !== undefined) { updates.push('reporting_manager_id = ?'); params.push(reporting_manager_id) }

  if (updates.length === 0) return err(c, 'nothing to update')

  updates.push("updated_at = datetime('now')")
  params.push(id)
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`, ...params)

  const user = await db.get<{
    id: number
    email: string
    display_name: string
    role: string
    is_active: number
    created_at: string
    skills: string
    country: string | null
    state: string | null
    city: string | null
    home_country: string | null
    home_state: string | null
    home_city: string | null
    timezone: string | null
    job_title: string | null
    department: string | null
    phone: string | null
    gender: string | null
    reporting_manager_id: number | null
  }>(
    `SELECT id, email, display_name, role, is_active, created_at, skills, country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id FROM users WHERE id = ?`,
    id,
  )
  return ok(c, { ...user, skills: parseSkills(user?.skills) })
})

users.get('/users/:id/project-access', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)

  const rows = await db.all<{ project_id: number; project_name: string; role: string | null }>(
    `SELECT p.id AS project_id, p.name AS project_name, pa.role
     FROM projects p
     LEFT JOIN project_access pa ON pa.project_id = p.id AND pa.user_id = ?
     ORDER BY p.name`,
    id,
  )

  return ok(c, rows)
})

users.delete('/users/:id', async (c) => {
  const caller = c.get('user')
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 404)
  if (id === caller.id) return err(c, 'cannot delete your own account', 409)

  const target = await db.get<{ role: string }>('SELECT role FROM users WHERE id = ? AND deleted_at IS NULL', id)
  if (!target) return err(c, 'user not found', 404)
  if (target.role === 'super_admin') {
    const row = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL")
    if ((row?.n ?? 0) <= 1) return err(c, 'cannot delete the last super admin', 409)
  }

  await db.run("UPDATE users SET deleted_at = datetime('now'), is_active = 0 WHERE id = ?", id)
  return ok(c, { id })
})

export default users
