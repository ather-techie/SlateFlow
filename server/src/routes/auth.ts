import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { db } from '../db/index.js'
import { ok, err } from '../lib/response.js'
import { signToken, verifyToken, hashPassword, verifyPassword } from '../lib/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireFeature } from '../middleware/requireRole.js'
import { loginRateLimiter } from '../middleware/rateLimiter.js'
import { google } from '../lib/oauth/google.js'
import { github } from '../lib/oauth/github.js'
import type { OAuthProvider, OAuthProfile } from '../lib/oauth/types.js'

const auth = new Hono()

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 7 * 24 * 3600,
  secure: process.env.NODE_ENV === 'production',
}

const STATE_COOKIE = 'sf_oauth_state'
const STATE_COOKIE_OPTS = {
  ...COOKIE_OPTS,
  maxAge: 5 * 60,
}

const PROVIDERS: Record<'google' | 'github', OAuthProvider> = { google, github }

auth.post('/auth/login', requireFeature('auth_password'), loginRateLimiter, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return err(c, 'email and password are required')

  const user = await db.get<{
    id: number; email: string; display_name: string; role: string
    password_hash: string; is_active: number; deleted_at: string | null
  }>(
    'SELECT id, email, display_name, role, password_hash, is_active, deleted_at FROM users WHERE email = ? COLLATE NOCASE',
    parsed.data.email,
  )

  if (!user || user.deleted_at || !user.is_active) return err(c, 'invalid credentials', 401)
  if (!verifyPassword(parsed.data.password, user.password_hash)) return err(c, 'invalid credentials', 401)

  const token = await signToken({ sub: user.id, email: user.email, role: user.role })
  setCookie(c, 'sf_token', token, COOKIE_OPTS)

  return ok(c, { id: user.id, email: user.email, display_name: user.display_name, role: user.role })
})

auth.post('/auth/logout', (c) => {
  deleteCookie(c, 'sf_token', { path: '/' })
  return ok(c, { ok: true })
})

auth.get('/auth/me', requireAuth, async (c) => {
  const user = c.get('user')
  const projectAccess = await db.all<{ project_id: number; role: string }>(
    'SELECT project_id, role FROM project_access WHERE user_id = ?',
    user.id,
  )
  const userRow = await db.get<{
    email_notifications: number
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
    `SELECT email_notifications, country, state, city, home_country, home_state, home_city,
            timezone, job_title, department, phone, gender, reporting_manager_id
     FROM users WHERE id = ?`,
    user.id,
  )

  let reporting_manager = null
  if (userRow?.reporting_manager_id) {
    const manager = await db.get<{ id: number; display_name: string }>(
      'SELECT id, display_name FROM users WHERE id = ? AND deleted_at IS NULL',
      userRow.reporting_manager_id,
    )
    reporting_manager = manager || null
  }

  return ok(c, {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    email_notifications: userRow?.email_notifications === 1,
    country: userRow?.country ?? null,
    state: userRow?.state ?? null,
    city: userRow?.city ?? null,
    home_country: userRow?.home_country ?? null,
    home_state: userRow?.home_state ?? null,
    home_city: userRow?.home_city ?? null,
    timezone: userRow?.timezone ?? null,
    job_title: userRow?.job_title ?? null,
    department: userRow?.department ?? null,
    phone: userRow?.phone ?? null,
    gender: userRow?.gender ?? null,
    reporting_manager_id: userRow?.reporting_manager_id ?? null,
    reporting_manager,
    project_access: projectAccess,
  })
})

auth.patch('/auth/me', requireAuth, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    display_name: z.string().min(1).optional(),
    current_password: z.string().optional(),
    new_password: z.string().min(8).optional(),
    email_notifications: z.boolean().optional(),
    country: z.string().max(100).optional().nullable(),
    state: z.string().max(100).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    home_country: z.string().max(100).optional().nullable(),
    home_state: z.string().max(100).optional().nullable(),
    home_city: z.string().max(100).optional().nullable(),
    timezone: z.string().max(100).optional().nullable(),
    job_title: z.string().max(200).optional().nullable(),
    department: z.string().max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    gender: z.string().max(100).optional().nullable(),
    reporting_manager_id: z.number().int().positive().optional().nullable(),
  }).safeParse(body)
  if (!parsed.success) return err(c, 'invalid request body')

  const { display_name, current_password, new_password, email_notifications, country, state, city, home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id } = parsed.data

  if (new_password) {
    if (!current_password) return err(c, 'current_password is required to set a new password')
    const row = await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id)
    if (!row || !verifyPassword(current_password, row.password_hash)) return err(c, 'current password is incorrect', 401)
  }

  const updates: string[] = []
  const params: (string | number | boolean | null)[] = []

  if (display_name) { updates.push('display_name = ?'); params.push(display_name) }
  if (new_password)  { updates.push('password_hash = ?'); params.push(hashPassword(new_password)) }
  if (email_notifications !== undefined) { updates.push('email_notifications = ?'); params.push(email_notifications ? 1 : 0) }
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
  params.push(user.id)
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...params)

  const updated = await db.get<{
    id: number
    email: string
    display_name: string
    role: string
    email_notifications: number
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
    `SELECT id, email, display_name, role, email_notifications, country, state, city,
            home_country, home_state, home_city, timezone, job_title, department, phone, gender, reporting_manager_id
     FROM users WHERE id = ?`,
    user.id,
  )

  let reporting_manager = null
  if (updated?.reporting_manager_id) {
    const manager = await db.get<{ id: number; display_name: string }>(
      'SELECT id, display_name FROM users WHERE id = ? AND deleted_at IS NULL',
      updated.reporting_manager_id,
    )
    reporting_manager = manager || null
  }

  return ok(c, {
    ...updated,
    email_notifications: updated?.email_notifications === 1,
    reporting_manager,
  })
})

// ── OAuth (Google + GitHub) ───────────────────────────────────────────────────

function postLoginRedirectUrl(): string {
  const base = process.env.OAUTH_FRONTEND_URL?.trim()
  if (!base) return '/'
  return base.replace(/\/$/, '') + '/'
}

function startHandler(provider: OAuthProvider) {
  return async (c: Context) => {
    const state = randomBytes(16).toString('hex')
    setCookie(c, STATE_COOKIE, `${provider.name}:${state}`, STATE_COOKIE_OPTS)
    try {
      return c.redirect(provider.buildAuthUrl(state))
    } catch (e) {
      console.error(`[oauth/${provider.name}] start failed`, e)
      return c.redirect('/login?error=oauth_misconfigured')
    }
  }
}

async function findOrCreateUser(profile: OAuthProfile, provider: OAuthProvider['name']): Promise<{ id: number; email: string; role: string } | { error: string }> {
  // 1. existing identity
  const linked = await db.get<{ user_id: number }>(
    'SELECT user_id FROM user_identities WHERE provider = ? AND provider_user_id = ?',
    provider, profile.providerUserId,
  )
  if (linked) {
    const u = await db.get<{ id: number; email: string; role: string; is_active: number; deleted_at: string | null }>(
      'SELECT id, email, role, is_active, deleted_at FROM users WHERE id = ?',
      linked.user_id,
    )
    if (!u || u.deleted_at || !u.is_active) return { error: 'account_inactive' }
    return { id: u.id, email: u.email, role: u.role }
  }

  // 2. existing user by email — auto-link only if provider verified the email
  const byEmail = await db.get<{ id: number; email: string; role: string; is_active: number; deleted_at: string | null }>(
    'SELECT id, email, role, is_active, deleted_at FROM users WHERE email = ? COLLATE NOCASE',
    profile.email,
  )
  if (byEmail) {
    if (byEmail.deleted_at || !byEmail.is_active) return { error: 'account_inactive' }
    if (!profile.emailVerified) return { error: 'email_not_verified' }
    await db.run(
      'INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES (?, ?, ?)',
      byEmail.id, provider, profile.providerUserId,
    )
    return { id: byEmail.id, email: byEmail.email, role: byEmail.role }
  }

  // 3. brand-new user — create with a locked random password_hash
  if (!profile.emailVerified) return { error: 'email_not_verified' }
  const lockedHash = hashPassword(randomBytes(32).toString('hex'))
  const create = db.transaction(async () => {
    const { lastID } = await db.run(
      'INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
      profile.email, profile.displayName, lockedHash, 'global_reader',
    )
    await db.run(
      'INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES (?, ?, ?)',
      lastID, provider, profile.providerUserId,
    )
    return lastID
  })
  const newId = await create()
  return { id: newId, email: profile.email, role: 'global_reader' }
}

function callbackHandler(provider: OAuthProvider) {
  return async (c: Context) => {
    const code = c.req.query('code')
    const stateParam = c.req.query('state')
    const stateCookie = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/' })

    if (!code || !stateParam) return c.redirect('/login?error=oauth_failed')
    if (!stateCookie || stateCookie !== `${provider.name}:${stateParam}`) {
      return c.redirect('/login?error=oauth_state_mismatch')
    }

    let profile: OAuthProfile
    try {
      profile = await provider.exchangeCode(code)
    } catch (e) {
      console.error(`[oauth/${provider.name}] exchange failed`, e)
      return c.redirect('/login?error=oauth_failed')
    }

    let result: { id: number; email: string; role: string } | { error: string }
    try {
      result = await findOrCreateUser(profile, provider.name)
    } catch (e) {
      console.error(`[oauth/${provider.name}] user upsert failed`, e)
      return c.redirect('/login?error=oauth_failed')
    }

    if ('error' in result) return c.redirect(`/login?error=${encodeURIComponent(result.error)}`)

    const token = await signToken({ sub: result.id, email: result.email, role: result.role })
    setCookie(c, 'sf_token', token, COOKIE_OPTS)
    return c.redirect(postLoginRedirectUrl())
  }
}

auth.get('/auth/google/start',    requireFeature('auth_google'),  startHandler(PROVIDERS.google))
auth.get('/auth/google/callback', requireFeature('auth_google'),  callbackHandler(PROVIDERS.google))
auth.get('/auth/github/start',    requireFeature('auth_github'),  startHandler(PROVIDERS.github))
auth.get('/auth/github/callback', requireFeature('auth_github'),  callbackHandler(PROVIDERS.github))

export default auth
