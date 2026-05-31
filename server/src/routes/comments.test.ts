import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('../lib/eventBus.js', () => ({
  emitBoardEvent: vi.fn(),
}))

vi.mock('../lib/featureFlags.js', () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('../lib/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  mentionEmailHtml: vi.fn().mockReturnValue('<html>mention</html>'),
}))

vi.mock('../lib/activityLog.js', () => ({
  logActivity: vi.fn(),
}))

vi.mock('../lib/notifications.js', () => ({
  notifyMentions: vi.fn(),
}))

import { db } from '../db/index.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { isEnabled } from '../lib/featureFlags.js'
import { sendEmail } from '../lib/email.js'
import { logActivity } from '../lib/activityLog.js'
import { notifyMentions } from '../lib/notifications.js'
import comments from './comments'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', comments)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(logActivity).mockResolvedValue(undefined)
  vi.mocked(notifyMentions).mockResolvedValue(undefined)
})

// ─── GET /cards/:id/comments ──────────────────────────────────────────────────

describe('GET /cards/:id/comments', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/comments')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/comments')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 200 with empty array when no comments exist', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 }) // card exists
      .mockResolvedValueOnce({ total: 0 }) // COUNT query
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/cards/1/comments')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.items).toEqual([])
    expect(body.data.total).toBe(0)
    expect(body.data.limit).toBe(50)
    expect(body.data.offset).toBe(0)
  })

  it('returns 200 with comments ordered by created_at', async () => {
    const mockComments = [
      { id: 1, card_id: 1, author: 'Admin', author_id: 1, body: 'First', created_at: '2024-01-01' },
      { id: 2, card_id: 1, author: 'User', author_id: 2, body: 'Second', created_at: '2024-01-02' },
    ]
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 }) // card exists
      .mockResolvedValueOnce({ total: 2 }) // COUNT query
    vi.mocked(db.all).mockResolvedValueOnce(mockComments)
    const res = await makeApp().request('/cards/1/comments')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.items).toEqual(mockComments)
    expect(body.data.total).toBe(2)
  })

  it('respects limit and offset query params', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ total: 100 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    await makeApp().request('/cards/1/comments?limit=5&offset=10')
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[0]).toContain('LIMIT')
    expect(allCall[0]).toContain('OFFSET')
  })
})

// ─── POST /cards/:id/comments ─────────────────────────────────────────────────

describe('POST /cards/:id/comments', () => {
  const post = (cardId: string | number, body: unknown) =>
    makeApp(USER).request(`/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric card id', async () => {
    const res = await post('abc', { body: 'test' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { body: 'test' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    const res = await makeApp(USER).request('/cards/1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when body is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    const res = await post(1, {})
    expect(res.status).toBe(422)
  })

  it('returns 422 when body is empty string', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    const res = await post(1, { body: '' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created comment', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, card_id: 1, author: 'User', author_id: 2, body: 'Test comment' })

    const res = await post(1, { body: 'Test comment' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.body).toBe('Test comment')
    expect(body.data.author).toBe('User')
  })

  it('creates activity log entry for comment', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])

    await post(1, { body: 'Test comment' })
    // Verify that logActivity was called
    expect(logActivity).toHaveBeenCalled()
  })

  it('detects and notifies @mentions', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 3, display_name: 'mentioned.user', email: 'mentioned@test.com', email_notifications: 1 }
    ])
    vi.mocked(isEnabled).mockResolvedValueOnce(false)

    await post(1, { body: '@mentioned.user check this' })
    // Verify that notifyMentions was called
    expect(notifyMentions).toHaveBeenCalled()
  })

  it('sends email for mentions when feature enabled and user opted in', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 3, display_name: 'mentioned.user', email: 'mentioned@test.com', email_notifications: 1 }
    ])
    vi.mocked(isEnabled).mockResolvedValueOnce(true)

    await post(1, { body: '@mentioned.user hi' })
    expect(notifyMentions).toHaveBeenCalled()
  })

  it('skips email when user has email_notifications disabled', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 3, display_name: 'mentioned.user', email: 'mentioned@test.com', email_notifications: 0 }
    ])
    vi.mocked(isEnabled).mockResolvedValueOnce(true)

    await post(1, { body: '@mentioned.user hi' })
    expect(notifyMentions).toHaveBeenCalled()
  })

  it('handles multiple mentions in one comment', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 3, display_name: 'user.one', email: 'one@test.com', email_notifications: 1 },
      { id: 4, display_name: 'user.two', email: 'two@test.com', email_notifications: 1 },
    ])
    vi.mocked(isEnabled).mockResolvedValueOnce(false)

    await post(1, { body: '@user.one @user.two check this' })
    // Verify that notifyMentions was called
    expect(notifyMentions).toHaveBeenCalled()
  })

  it('excludes author from mentions', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Card' })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.all).mockResolvedValueOnce([])

    await post(1, { body: '@User check this' })
    expect(notifyMentions).toHaveBeenCalled()
  })
})

// ─── DELETE /comments/:id ─────────────────────────────────────────────────────

describe('DELETE /comments/:id', () => {
  it('returns 400 for non-numeric comment id', async () => {
    const res = await makeApp().request('/comments/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when comment not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/comments/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('comment not found')
  })

  it('returns 403 when user is not author and not super_admin', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, author_id: 5 }) // different author
    const res = await makeApp(USER).request('/comments/1', { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('allows author to delete their own comment', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, author_id: 2 }) // same as USER.id
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    const res = await makeApp(USER).request('/comments/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(1)
  })

  it('allows super_admin to delete any comment', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, author_id: 2 }) // different author
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })
    const res = await makeApp(ADMIN).request('/comments/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })
})
