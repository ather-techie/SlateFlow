import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

import { db } from '../db/index.js'
import notifications from './notifications'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', notifications)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── GET /notifications ───────────────────────────────────────────────────────

describe('GET /notifications', () => {
  it('returns 200 with empty array when user has no notifications', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp(USER).request('/notifications')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with all notifications for user (default)', async () => {
    const mockNotifs = [
      { id: 1, type: 'mention', entity_type: 'comment', entity_id: 5, message: 'Admin mentioned you', is_read: 0, created_at: '2024-01-01' },
      { id: 2, type: 'assignment', entity_type: 'card', entity_id: 10, message: 'Assigned to you', is_read: 1, created_at: '2024-01-02' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockNotifs)
    const res = await makeApp(USER).request('/notifications')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockNotifs)
  })

  it('returns notifications ordered by created_at DESC', async () => {
    const mockNotifs = [
      { id: 2, type: 'mention', entity_type: 'comment', entity_id: 5, message: 'Recent mention', is_read: 0, created_at: '2024-01-02' },
      { id: 1, type: 'assignment', entity_type: 'card', entity_id: 10, message: 'Old assignment', is_read: 0, created_at: '2024-01-01' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockNotifs)
    const res = await makeApp(USER).request('/notifications')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].created_at).toBe('2024-01-02')
  })

  it('limits results to 50 notifications', async () => {
    const mockNotifs = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      type: 'mention',
      entity_type: 'comment',
      entity_id: i + 1,
      message: `Notification ${i + 1}`,
      is_read: 0,
      created_at: '2024-01-01',
    }))
    vi.mocked(db.all).mockResolvedValueOnce(mockNotifs)
    const res = await makeApp(USER).request('/notifications')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBe(50)
  })

  it('filters to unread only when unread_only=1 query param is set', async () => {
    const mockNotifs = [
      { id: 1, type: 'mention', entity_type: 'comment', entity_id: 5, message: 'Unread mention', is_read: 0, created_at: '2024-01-01' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockNotifs)
    const res = await makeApp(USER).request('/notifications?unread_only=1')
    expect(res.status).toBe(200)
    expect(vi.mocked(db.all)).toHaveBeenCalledWith(
      expect.stringContaining('AND is_read = 0'),
      2 // user.id
    )
  })

  it('includes both read and unread when unread_only is not set', async () => {
    const mockNotifs = [
      { id: 1, type: 'mention', entity_type: 'comment', entity_id: 5, message: 'Unread mention', is_read: 0, created_at: '2024-01-01' },
      { id: 2, type: 'assignment', entity_type: 'card', entity_id: 10, message: 'Read assignment', is_read: 1, created_at: '2024-01-02' },
    ]
    vi.mocked(db.all).mockResolvedValueOnce(mockNotifs)
    const res = await makeApp(USER).request('/notifications')
    expect(res.status).toBe(200)
    expect(vi.mocked(db.all)).toHaveBeenCalledWith(
      expect.not.stringContaining('AND is_read = 0'),
      2
    )
  })

  it('does not filter to unread when unread_only is 0', async () => {
    const mockNotifs = []
    vi.mocked(db.all).mockResolvedValueOnce(mockNotifs)
    await makeApp(USER).request('/notifications?unread_only=0')
    expect(vi.mocked(db.all)).toHaveBeenCalledWith(
      expect.not.stringContaining('AND is_read = 0'),
      2
    )
  })
})

// ─── PATCH /notifications/read-all ─────────────────────────────────────────────

describe('PATCH /notifications/read-all', () => {
  it('returns 200 with count of marked read', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 5 })
    const res = await makeApp(USER).request('/notifications/read-all', { method: 'PATCH' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.count).toBe(5)
  })

  it('returns 200 with count 0 when no unread notifications', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 0 })
    const res = await makeApp(USER).request('/notifications/read-all', { method: 'PATCH' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.count).toBe(0)
  })

  it('calls db.run with correct UPDATE statement', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 3 })
    await makeApp(USER).request('/notifications/read-all', { method: 'PATCH' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      2 // user.id
    )
  })

  it('only marks current users notifications as read', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 2 })
    await makeApp(USER).request('/notifications/read-all', { method: 'PATCH' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.anything(),
      2 // USER.id, not ADMIN.id
    )
  })
})

// ─── PATCH /notifications/:id/read ────────────────────────────────────────────

describe('PATCH /notifications/:id/read', () => {
  it('returns 400 for non-numeric notification id', async () => {
    const res = await makeApp(USER).request('/notifications/abc/read', { method: 'PATCH' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when notification not found', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 0 })
    const res = await makeApp(USER).request('/notifications/99/read', { method: 'PATCH' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('notification not found')
  })

  it('returns 404 when notification belongs to different user', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 0 })
    const res = await makeApp(USER).request('/notifications/5/read', { method: 'PATCH' })
    expect(res.status).toBe(404)
  })

  it('returns 200 when notification is marked as read', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    const res = await makeApp(USER).request('/notifications/1/read', { method: 'PATCH' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(1)
  })

  it('calls db.run with correct UPDATE statement', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    await makeApp(USER).request('/notifications/5/read', { method: 'PATCH' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      5,
      2 // user.id
    )
  })

  it('only marks own notifications as read', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    await makeApp(USER).request('/notifications/1/read', { method: 'PATCH' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.anything(),
      1,
      2 // USER.id, not ADMIN.id
    )
  })

  it('works correctly for admin reading notifications', async () => {
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    await makeApp(ADMIN).request('/notifications/10/read', { method: 'PATCH' })
    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.anything(),
      10,
      1 // ADMIN.id
    )
  })
})
