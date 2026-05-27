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

// Mock auth utilities to avoid bcrypt and JWT operations in tests
vi.mock('../lib/auth.js', () => ({
  signToken:      vi.fn().mockResolvedValue('mock-jwt-token'),
  verifyToken:    vi.fn().mockResolvedValue(null),
  hashPassword:   vi.fn().mockReturnValue('$2b$12$hashed'),
  verifyPassword: vi.fn().mockReturnValue(true),
}))

// Mock featureFlags so requireFeature middleware can be controlled per test
vi.mock('../lib/featureFlags.js', () => ({
  isEnabled:    vi.fn().mockResolvedValue(true),
  getAllFlags:  vi.fn().mockResolvedValue({}),
  setFlag:      vi.fn(),
}))

// Mock OAuth providers — avoid real HTTP in tests
vi.mock('../lib/oauth/google.js', () => ({
  google: {
    name: 'google',
    buildAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?state=mock'),
    exchangeCode: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
  },
}))

vi.mock('../lib/oauth/github.js', () => ({
  github: {
    name: 'github',
    buildAuthUrl: vi.fn().mockReturnValue('https://github.com/login/oauth/authorize?state=mock'),
    exchangeCode: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
  },
}))

// Mock requireAuth so /auth/me and /auth/me PATCH work without a real JWT cookie
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: vi.fn(async (c: { set: Function }, next: Function) => {
    c.set('user', { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' })
    return next()
  }),
}))

import { db } from '../db/index.js'
import { signToken, verifyPassword, hashPassword } from '../lib/auth.js'
import { isEnabled } from '../lib/featureFlags.js'
import { google } from '../lib/oauth/google.js'
import { requireAuth } from '../middleware/requireAuth.js'
import auth from './auth'

// Auth routes are mounted directly — no global requireAuth wall needed in test
function makeAuthApp() {
  const app = new Hono()
  // @ts-ignore
  app.route('/', auth)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(signToken).mockResolvedValue('mock-jwt-token')
  vi.mocked(verifyPassword).mockReturnValue(true)
  vi.mocked(hashPassword).mockReturnValue('$2b$12$hashed')
  vi.mocked(isEnabled).mockResolvedValue(true)
  vi.mocked(google.buildAuthUrl).mockReturnValue('https://accounts.google.com/auth?state=mock')
  // vi.resetAllMocks() clears the factory implementation; restore it so
  // GET /auth/me and PATCH /auth/me (which use inline requireAuth) get a user in context
  vi.mocked(requireAuth).mockImplementation(async (c: any, next: any) => {
    c.set('user', { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' })
    return next()
  })
})

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  const login = (body: unknown) =>
    makeAuthApp().request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const validUser = {
    id: 1, email: 'admin@test.com', display_name: 'Admin',
    role: 'super_admin', password_hash: '$2b$12$hashed',
    is_active: 1, deleted_at: null,
  }

  it('returns 404 when auth_password feature is disabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    const res = await login({ email: 'admin@test.com', password: 'Pass123!' })
    expect(res.status).toBe(404)
    const body = await res.json()
    // requireFeature returns { error: 'not found' } regardless of which flag
    expect(body.error).toBe('not found')
  })

  it('returns 400 when email is missing', async () => {
    const res = await login({ password: 'Pass123!' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('email and password are required')
  })

  it('returns 400 when password is missing', async () => {
    const res = await login({ email: 'admin@test.com' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when email format is invalid', async () => {
    const res = await login({ email: 'not-an-email', password: 'Pass123!' })
    expect(res.status).toBe(400)
  })

  it('returns 401 when user does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await login({ email: 'unknown@test.com', password: 'Pass123!' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid credentials')
  })

  it('returns 401 when user is soft-deleted (deleted_at is set)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      ...validUser, deleted_at: '2024-01-01T00:00:00Z',
    })
    const res = await login({ email: 'admin@test.com', password: 'Pass123!' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid credentials')
  })

  it('returns 401 when user account is deactivated (is_active = 0)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ ...validUser, is_active: 0 })
    const res = await login({ email: 'admin@test.com', password: 'Pass123!' })
    expect(res.status).toBe(401)
  })

  it('returns 401 when password is incorrect', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(validUser)
    vi.mocked(verifyPassword).mockReturnValueOnce(false)
    const res = await login({ email: 'admin@test.com', password: 'WrongPass!' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid credentials')
  })

  it('returns 200 with user data and sets sf_token cookie on success', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(validUser)

    const res = await login({ email: 'admin@test.com', password: 'Pass123!' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data).toMatchObject({
      id: 1,
      email: 'admin@test.com',
      role: 'super_admin',
    })
    // Cookie should be set
    const cookie = res.headers.get('Set-Cookie')
    expect(cookie).toContain('sf_token')
  })

  it('calls signToken with correct user payload', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(validUser)
    await login({ email: 'admin@test.com', password: 'Pass123!' })
    expect(signToken).toHaveBeenCalledWith({
      sub: 1,
      email: 'admin@test.com',
      role: 'super_admin',
    })
  })
})

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await makeAuthApp().request('/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ ok: true })
    expect(body.error).toBeNull()
  })

  it('clears the sf_token cookie', async () => {
    const res = await makeAuthApp().request('/auth/logout', { method: 'POST' })
    const cookie = res.headers.get('Set-Cookie') ?? ''
    // Cookie deletion sets Max-Age=0 or expires in the past
    expect(cookie).toContain('sf_token')
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=.*1970/)
  })
})

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('returns 200 with user profile and project access', async () => {
    const userRow = {
      email_notifications: 1, country: 'US', state: 'CA', city: 'SF',
      home_country: null, home_state: null, home_city: null,
      timezone: 'America/Los_Angeles', job_title: 'Engineer',
      department: null, phone: null, gender: null, reporting_manager_id: null,
    }
    const projectAccess = [{ project_id: 1, role: 'contributor' }]

    vi.mocked(db.all).mockResolvedValueOnce(projectAccess)
    vi.mocked(db.get).mockResolvedValueOnce(userRow)

    const res = await makeAuthApp().request('/auth/me')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data).toMatchObject({
      id: 1,
      email: 'admin@test.com',
      role: 'super_admin',
      email_notifications: true, // 1 → true
      country: 'US',
      timezone: 'America/Los_Angeles',
      project_access: projectAccess,
    })
  })

  it('converts email_notifications integer 0 to false', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    vi.mocked(db.get).mockResolvedValueOnce({
      email_notifications: 0, country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null,
      timezone: null, job_title: null, department: null, phone: null,
      gender: null, reporting_manager_id: null,
    })

    const res = await makeAuthApp().request('/auth/me')
    const body = await res.json()
    expect(body.data.email_notifications).toBe(false)
  })

  it('resolves reporting_manager when reporting_manager_id is set', async () => {
    const manager = { id: 5, display_name: 'Manager' }
    vi.mocked(db.all).mockResolvedValueOnce([])
    vi.mocked(db.get)
      .mockResolvedValueOnce({
        email_notifications: 1, country: null, state: null, city: null,
        home_country: null, home_state: null, home_city: null,
        timezone: null, job_title: null, department: null, phone: null,
        gender: null, reporting_manager_id: 5,
      })
      .mockResolvedValueOnce(manager)  // manager lookup

    const res = await makeAuthApp().request('/auth/me')
    const body = await res.json()
    expect(body.data.reporting_manager).toEqual(manager)
  })
})

// ─── PATCH /auth/me ───────────────────────────────────────────────────────────

describe('PATCH /auth/me', () => {
  const patch = (body: unknown) =>
    makeAuthApp().request('/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 when body has no updatable fields', async () => {
    const res = await patch({})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('nothing to update')
  })

  it('returns 400 when new_password is provided without current_password', async () => {
    const res = await patch({ new_password: 'NewPass123!' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('current_password is required')
  })

  it('returns 401 when current_password is wrong', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ password_hash: '$2b$12$old' })
    vi.mocked(verifyPassword).mockReturnValueOnce(false)

    const res = await patch({ current_password: 'Wrong!', new_password: 'New123456!' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toContain('current password is incorrect')
  })

  it('returns 200 and updates display_name', async () => {
    const updated = {
      id: 1, email: 'admin@test.com', display_name: 'Renamed',
      role: 'super_admin', email_notifications: 1,
      country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null,
      timezone: null, job_title: null, department: null, phone: null,
      gender: null, reporting_manager_id: null,
    }
    vi.mocked(db.get).mockResolvedValueOnce(updated)

    const res = await patch({ display_name: 'Renamed' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.display_name).toBe('Renamed')
  })

  it('returns 200 and changes password with valid current_password', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ password_hash: '$2b$12$old' })   // for current_password check
      .mockResolvedValueOnce({                                    // updated user row
        id: 1, email: 'admin@test.com', display_name: 'Admin',
        role: 'super_admin', email_notifications: 1,
        country: null, state: null, city: null,
        home_country: null, home_state: null, home_city: null,
        timezone: null, job_title: null, department: null, phone: null,
        gender: null, reporting_manager_id: null,
      })
    vi.mocked(verifyPassword).mockReturnValueOnce(true)

    const res = await patch({ current_password: 'OldPass!', new_password: 'NewPass123!' })
    expect(res.status).toBe(200)
    // hashPassword called with the new password
    expect(hashPassword).toHaveBeenCalledWith('NewPass123!')
  })

  it('returns 200 when updating email_notifications preference', async () => {
    const updated = {
      id: 1, email: 'admin@test.com', display_name: 'Admin',
      role: 'super_admin', email_notifications: 0,
      country: null, state: null, city: null,
      home_country: null, home_state: null, home_city: null,
      timezone: null, job_title: null, department: null, phone: null,
      gender: null, reporting_manager_id: null,
    }
    vi.mocked(db.get).mockResolvedValueOnce(updated)

    const res = await patch({ email_notifications: false })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.email_notifications).toBe(false)
  })
})

// ─── GET /auth/google/start ───────────────────────────────────────────────────

describe('GET /auth/google/start', () => {
  it('returns 404 when auth_google feature is disabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    const res = await makeAuthApp().request('/auth/google/start')
    expect(res.status).toBe(404)
  })

  it('redirects to Google OAuth URL when feature is enabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    const res = await makeAuthApp().request('/auth/google/start')
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('accounts.google.com')
  })

  it('sets sf_oauth_state cookie with provider prefix', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    const res = await makeAuthApp().request('/auth/google/start')
    const cookie = res.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain('sf_oauth_state')
    // Hono setCookie URL-encodes ':' → '%3A' in cookie values
    expect(cookie).toContain('google%3A')
  })
})

// ─── GET /auth/github/start ───────────────────────────────────────────────────

describe('GET /auth/github/start', () => {
  it('returns 404 when auth_github feature is disabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    const res = await makeAuthApp().request('/auth/github/start')
    expect(res.status).toBe(404)
  })

  it('redirects to GitHub OAuth URL when feature is enabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    const { github } = await import('../lib/oauth/github.js')
    vi.mocked(github.buildAuthUrl).mockReturnValueOnce('https://github.com/login/oauth/authorize?state=mock')

    const res = await makeAuthApp().request('/auth/github/start')
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('github.com')
  })
})

// ─── GET /auth/google/callback ────────────────────────────────────────────────

describe('GET /auth/google/callback', () => {
  it('returns 404 when auth_google feature is disabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    const res = await makeAuthApp().request('/auth/google/callback?code=abc&state=xyz')
    expect(res.status).toBe(404)
  })

  it('redirects to /login?error=oauth_failed when code is missing', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    const res = await makeAuthApp().request('/auth/google/callback?state=xyz')
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('oauth_failed')
  })

  it('redirects to /login?error=oauth_state_mismatch when state cookie does not match', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    // Request includes ?state=wrong_state but there's no matching cookie
    const res = await makeAuthApp().request('/auth/google/callback?code=abc&state=wrong')
    expect(res.status).toBe(302)
    const location = res.headers.get('Location') ?? ''
    expect(location).toContain('oauth_state_mismatch')
  })
})
