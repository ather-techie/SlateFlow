import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: () => Promise<unknown>) => async () => fn()),
  },
}))

// Mock hashPassword so tests don't run actual bcrypt (cost 12 ≈ 300ms)
vi.mock('../lib/auth.js', () => ({
  hashPassword: vi.fn().mockReturnValue('$2b$12$hashed'),
  verifyPassword: vi.fn().mockReturnValue(true),
  signToken: vi.fn().mockResolvedValue('mock-token'),
  verifyToken: vi.fn().mockResolvedValue(null),
}))

import { db } from '../db/index.js'
import users from './users'

const ADMIN  = { id: 1, role: 'super_admin',  email: 'admin@test.com', display_name: 'Admin',  is_active: 1 }
const READER = { id: 2, role: 'global_reader', email: 'user@test.com',  display_name: 'User',   is_active: 1 }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', users)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
})

// ─── GET /users/search ────────────────────────────────────────────────────────

describe('GET /users/search', () => {
  it('returns 200 for global_reader (search is not super_admin-only)', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp(READER).request('/users/search?q=alice')
    // Should NOT return 403 — search is open to any authenticated user
    expect(res.status).toBe(200)
  })

  it('returns 200 with matching users list', async () => {
    const results = [
      { id: 3, display_name: 'Alice', email: 'alice@test.com', role: 'global_reader' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(results)
    const res = await makeApp(READER).request('/users/search?q=alice')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(results)
    expect(body.error).toBeNull()
  })

  it('returns 200 with empty array when no matches', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/users/search?q=zzznomatch')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('uses empty string when ?q= is absent', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    const res = await makeApp().request('/users/search')
    expect(res.status).toBe(200)
    // Should pass %% to LIKE to match everyone
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[1]).toBe('%%') // LIKE %% matches all
  })

  it('enforces LIMIT 20 in query', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    await makeApp().request('/users/search?q=test')
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[0]).toContain('LIMIT 20')
  })

  it('escapes LIKE wildcards in search query', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    await makeApp().request('/users/search?q=%25_evil')
    const allCall = vi.mocked(db.all).mock.calls[0]
    const pattern = allCall[1] // First arg after SQL is the pattern
    // %25_ should be escaped to \\%\\_
    expect(pattern).toBe('%\\%\\_evil%')
  })
})

// ─── GET /users ───────────────────────────────────────────────────────────────

describe('GET /users', () => {
  it('returns 403 when user is not super_admin', async () => {
    const res = await makeApp(READER).request('/users')
    expect(res.status).toBe(403)
  })

  it('returns 200 with user list for super_admin', async () => {
    const mockUsers = [
      { id: 1, email: 'admin@test.com', display_name: 'Admin', role: 'super_admin',
        is_active: 1, created_at: '2024-01-01', skills: '[]', country: null, state: null, city: null,
        home_country: null, home_state: null, home_city: null, timezone: null, job_title: null,
        department: null, phone: null, gender: null, reporting_manager_id: null, reporting_manager_name: null },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ total: 1 }) // COUNT query
    vi.mocked(db.all).mockResolvedValueOnce(mockUsers)
    const res = await makeApp(ADMIN).request('/users')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].skills).toEqual([]) // parseSkills converts '[]' to []
    expect(body.data.total).toBe(1)
    expect(body.data.limit).toBe(50) // default limit
    expect(body.data.offset).toBe(0)  // default offset
  })

  it('deserializes JSON skills string to array', async () => {
    const mockUsers = [{
      id: 1, email: 'a@b.com', display_name: 'A', role: 'global_reader',
      is_active: 1, created_at: '2024-01-01', skills: '["TypeScript","React"]', country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null, timezone: null, job_title: null,
      department: null, phone: null, gender: null,
      reporting_manager_id: null, reporting_manager_name: null,
    }]
    vi.mocked(db.get).mockResolvedValueOnce({ total: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockUsers)
    const res = await makeApp().request('/users')
    const body = await res.json()
    expect(body.data.items[0].skills).toEqual(['TypeScript', 'React'])
  })

  it('falls back to empty array for malformed skills JSON', async () => {
    const mockUsers = [{
      id: 1, email: 'a@b.com', display_name: 'A', role: 'global_reader',
      is_active: 1, created_at: '2024-01-01', skills: 'not-valid-json', country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null, timezone: null, job_title: null,
      department: null, phone: null, gender: null,
      reporting_manager_id: null, reporting_manager_name: null,
    }]
    vi.mocked(db.get).mockResolvedValueOnce({ total: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockUsers)
    const res = await makeApp().request('/users')
    const body = await res.json()
    expect(body.data.items[0].skills).toEqual([])
  })

  it('builds reporting_manager object when reporting_manager_id is set', async () => {
    const mockUsers = [{
      id: 2, email: 'u@b.com', display_name: 'User', role: 'global_reader',
      is_active: 1, created_at: '2024-01-01', skills: '[]', country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null, timezone: null, job_title: null,
      department: null, phone: null, gender: null,
      reporting_manager_id: 1, reporting_manager_name: 'Admin',
    }]
    vi.mocked(db.get).mockResolvedValueOnce({ total: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockUsers)
    const res = await makeApp().request('/users')
    const body = await res.json()
    expect(body.data.items[0].reporting_manager).toEqual({ id: 1, display_name: 'Admin' })
  })

  it('respects limit and offset query params', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ total: 100 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    await makeApp().request('/users?limit=10&offset=20')
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[0]).toContain('LIMIT')
    expect(allCall[0]).toContain('OFFSET')
    // Verify the values were passed as parameters
    expect(allCall).toContain(10) // limit
    expect(allCall).toContain(20) // offset
  })
})

// ─── POST /users ──────────────────────────────────────────────────────────────

describe('POST /users', () => {
  const post = (body: unknown, user = ADMIN) =>
    makeApp(user).request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const validBody = {
    email: 'new@test.com',
    display_name: 'New User',
    password: 'Password123!',
  }

  it('returns 403 when user is not super_admin', async () => {
    const res = await post(validBody, READER)
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid request body (email missing)', async () => {
    const res = await post({ display_name: 'No Email', password: 'pass1234' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for password shorter than 8 characters', async () => {
    const res = await post({ email: 'x@y.com', display_name: 'X', password: 'short' })
    expect(res.status).toBe(400)
  })

  it('returns 409 when email already exists (case-insensitive)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 99 }) // email in use
    const res = await post(validBody)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('email already in use')
  })

  it('returns 201 with created user and parsed skills array', async () => {
    const newUser = {
      id: 10, email: 'new@test.com', display_name: 'New User', role: 'global_reader',
      is_active: 1, created_at: '2024-01-01', skills: '["JS"]',
      country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null,
      timezone: null, job_title: null, department: null, phone: null, gender: null,
      reporting_manager_id: null,
    }
    vi.mocked(db.get)
      .mockResolvedValueOnce(undefined)  // no existing email
      .mockResolvedValueOnce(newUser)    // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 10, changes: 1 })

    const res = await post({ ...validBody, skills: ['JS'] })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.email).toBe('new@test.com')
    expect(body.data.skills).toEqual(['JS'])
  })

  it('stores skills as JSON string in db.run', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 1, skills: '[]', reporting_manager_id: null })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })

    await post({ ...validBody, skills: ['TypeScript', 'Node'] })
    const runCall = vi.mocked(db.run).mock.calls[0]
    // skills param should be a JSON string, not an array
    const skillsArg = runCall.find(a => a === '["TypeScript","Node"]')
    expect(skillsArg).toBeDefined()
  })
})

// ─── PATCH /users/:id ─────────────────────────────────────────────────────────

describe('PATCH /users/:id', () => {
  const patch = (id: string | number, body: unknown, user = ADMIN) =>
    makeApp(user).request(`/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 403 when user is not super_admin', async () => {
    const res = await patch(2, { display_name: 'X' }, READER)
    expect(res.status).toBe(403)
  })

  it('returns 404 for invalid (non-positive) id', async () => {
    // parseId returns null for "0", which maps to 404 in users.ts
    const res = await patch(0, { display_name: 'X' })
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid request body', async () => {
    const res = await patch(1, { role: 'god' }) // invalid role value
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty body (nothing to update)', async () => {
    const res = await patch(1, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('nothing to update')
  })

  it('returns 409 when demoting the last super_admin to global_reader', async () => {
    // COUNT of super_admins excluding this id = 0 → last one
    vi.mocked(db.get).mockResolvedValueOnce({ n: 0 })
    const res = await patch(1, { role: 'global_reader' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('last super admin')
  })

  it('allows demotion when there are other super_admins', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ n: 1 })   // 1 other super_admin exists
      .mockResolvedValueOnce({           // updated user row
        id: 1, email: 'admin@test.com', display_name: 'Admin',
        role: 'global_reader', is_active: 1, skills: '[]',
        reporting_manager_id: null,
      })

    const res = await patch(1, { role: 'global_reader' })
    expect(res.status).toBe(200)
  })

  it('returns 200 with updated user after display_name change', async () => {
    const updated = {
      id: 2, email: 'u@b.com', display_name: 'Renamed', role: 'global_reader',
      is_active: 1, created_at: '2024-01-01', skills: '[]', reporting_manager_id: null,
    }
    vi.mocked(db.get).mockResolvedValueOnce(updated)

    const res = await patch(2, { display_name: 'Renamed' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.display_name).toBe('Renamed')
  })
})

// ─── GET /users/:id/project-access ───────────────────────────────────────────

describe('GET /users/:id/project-access', () => {
  it('returns 403 when user is not super_admin', async () => {
    const res = await makeApp(READER).request('/users/1/project-access')
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-positive id', async () => {
    const res = await makeApp().request('/users/0/project-access')
    expect(res.status).toBe(404)
  })

  it('returns 200 with project access rows', async () => {
    const rows = [
      { project_id: 1, project_name: 'Alpha', role: 'contributor' },
      { project_id: 2, project_name: 'Beta',  role: null },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(rows)
    const res = await makeApp().request('/users/1/project-access')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(rows)
  })
})

// ─── DELETE /users/:id ────────────────────────────────────────────────────────

describe('DELETE /users/:id', () => {
  it('returns 403 when caller is not super_admin', async () => {
    const res = await makeApp(READER).request('/users/3', { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-positive id', async () => {
    const res = await makeApp().request('/users/0', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 409 when admin tries to delete their own account', async () => {
    // ADMIN.id = 1, deleting /users/1
    const res = await makeApp(ADMIN).request('/users/1', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('own account')
  })

  it('returns 404 when target user not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp(ADMIN).request('/users/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('user not found')
  })

  it('returns 409 when deleting the last super_admin', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ role: 'super_admin' })  // target is super_admin
      .mockResolvedValueOnce({ n: 1 })                  // only 1 super_admin total

    const res = await makeApp(ADMIN).request('/users/3', { method: 'DELETE' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('last super admin')
  })

  it('returns 200 with { id } after successful soft-delete', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ role: 'global_reader' })  // target is not super_admin

    const res = await makeApp(ADMIN).request('/users/5', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 5 })
    expect(body.error).toBeNull()
  })

  it('performs soft-delete (sets deleted_at + is_active=0, not hard DELETE)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ role: 'global_reader' })

    await makeApp(ADMIN).request('/users/5', { method: 'DELETE' })
    const runCall = vi.mocked(db.run).mock.calls[0]
    expect(runCall[0]).toContain('SET deleted_at')
    expect(runCall[0]).toContain('is_active = 0')
    expect(runCall[0]).not.toContain('DELETE FROM') // NOT a hard delete
  })
})
