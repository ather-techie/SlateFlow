import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('../lib/featureFlags.js', () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
}))

import { db } from '../db/index.js'
import { isEnabled } from '../lib/featureFlags.js'
import cardLinks from './cardLinks'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', cardLinks)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── GET /cards/:id/links ────────────────────────────────────────────────────

describe('GET /cards/:id/links', () => {
  it('returns 404 when both github and gitlab integrations are disabled', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    const res = await makeApp().request('/cards/1/links')
    expect(res.status).toBe(404)
  })

  it('returns 400 for non-numeric card id', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    const res = await makeApp().request('/cards/abc/links')
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/links')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 200 with empty array when no links exist', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/cards/1/links')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with github links when github integration enabled', async () => {
    const mockLinks = [
      {
        id: 1,
        card_id: 1,
        provider: 'github',
        type: 'pr',
        repo_url: 'https://github.com/owner/repo',
        number: 123,
        sha: null,
        state: 'open',
        created_by: 1,
      },
    ]
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockLinks)

    const res = await makeApp().request('/cards/1/links')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].provider).toBe('github')
  })

  it('returns 200 with gitlab links when gitlab integration enabled', async () => {
    const mockLinks = [
      {
        id: 2,
        card_id: 1,
        provider: 'gitlab',
        type: 'mr',
        repo_url: 'https://gitlab.com/owner/repo',
        number: 456,
        sha: null,
        state: 'merged',
        created_by: 1,
      },
    ]
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockLinks)

    const res = await makeApp().request('/cards/1/links')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].provider).toBe('gitlab')
  })

  it('filters links by enabled providers', async () => {
    vi.mocked(isEnabled).mockResolvedValueOnce(true)
    vi.mocked(isEnabled).mockResolvedValueOnce(false)
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])

    await makeApp().request('/cards/1/links')
    expect(vi.mocked(db.all)).toHaveBeenCalledWith(
      expect.stringContaining('provider IN'),
      1,
      'github'
    )
  })
})
