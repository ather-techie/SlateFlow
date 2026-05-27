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

vi.mock('../lib/eventBus.js', () => ({
  emitBoardEvent: vi.fn(),
}))

vi.mock('../lib/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  assignmentEmailHtml: vi.fn().mockReturnValue('<html>assignment</html>'),
  isEmailConfigured: vi.fn().mockReturnValue(false),
}))

vi.mock('../lib/featureFlags.js', () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
}))

vi.mock('./cardLinks.js', () => ({
  closeGitHubIssues: vi.fn(),
}))

import { db } from '../db/index.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { isEnabled } from '../lib/featureFlags.js'
import { closeGitHubIssues } from './cardLinks.js'
import cards from './cards'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', cards)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(isEnabled).mockResolvedValue(false)
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

// ─── GET /lanes/:id/cards ─────────────────────────────────────────────────────

describe('GET /lanes/:id/cards', () => {
  it('returns 400 for non-numeric lane id', async () => {
    const res = await makeApp().request('/lanes/abc/cards')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('returns 404 when lane not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/lanes/99/cards')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('lane not found')
  })

  it('returns 200 with cards in lane', async () => {
    const mockCards = [
      { id: 1, title: 'Story A', swim_lane_id: 2 },
      { id: 2, title: 'Story B', swim_lane_id: 2 },
    ]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
    vi.mocked(db.all).mockResolvedValueOnce(mockCards)

    const res = await makeApp().request('/lanes/2/cards')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockCards)
    expect(body.error).toBeNull()
  })
})

// ─── POST /lanes/:id/cards ────────────────────────────────────────────────────

describe('POST /lanes/:id/cards', () => {
  const post = (laneId: string | number, body: unknown) =>
    makeApp().request(`/lanes/${laneId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric lane id', async () => {
    const res = await post('abc', { title: 'Story' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when lane not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await post(99, { title: 'Story' })
    expect(res.status).toBe(404)
  })

  it('returns 422 for empty title string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1 })
    const res = await post(1, { title: '' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('title is required')
  })

  it('returns 422 for invalid priority value', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1 })
    const res = await post(1, { title: 'S', priority: 'urgent' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created card', async () => {
    const newCard = { id: 5, title: 'Story A', swim_lane_id: 1, priority: 'p2' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 10 })   // lane found
      .mockResolvedValueOnce(undefined)                    // no default feature
      .mockResolvedValueOnce(undefined)                    // no default sprint
      .mockResolvedValueOnce({ m: -1 })                    // max position
      .mockResolvedValueOnce(newCard)                      // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValue({ lastID: 5, changes: 1 })

    const res = await post(1, { title: 'Story A' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(newCard)
  })

  it('emits card:created board event after creating card', async () => {
    const newCard = { id: 3, title: 'New Story' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 10 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ m: -1 })
      .mockResolvedValueOnce(newCard)
    vi.mocked(db.run).mockResolvedValue({ lastID: 3, changes: 1 })

    await post(1, { title: 'New Story' })
    expect(emitBoardEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card:created', projectId: 10 }),
    )
  })

  it('creates card_labels rows inside transaction when label_ids provided', async () => {
    const newCard = { id: 6, title: 'Labeled' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 10 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ m: 0 })
      .mockResolvedValueOnce(newCard)
    vi.mocked(db.run).mockResolvedValue({ lastID: 6, changes: 1 })

    await post(1, { title: 'Labeled', label_ids: [3, 7] })
    // transaction called for card insert + label inserts + activity log
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)
    const runCalls = vi.mocked(db.run).mock.calls
    const labelCalls = runCalls.filter(c =>
      typeof c[0] === 'string' && (c[0] as string).includes('card_labels')
    )
    expect(labelCalls.length).toBe(2) // one per label_id
  })
})

// ─── GET /columns/:id/cards ───────────────────────────────────────────────────

describe('GET /columns/:id/cards (legacy)', () => {
  it('returns 400 for non-numeric column id', async () => {
    const res = await makeApp().request('/columns/abc/cards')
    expect(res.status).toBe(400)
  })

  it('returns 404 when column not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/columns/99/cards')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('column not found')
  })

  it('returns 200 with cards for column', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 2 })
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1, column_id: 2 }])
    const res = await makeApp().request('/columns/2/cards')
    expect(res.status).toBe(200)
  })
})

// ─── GET /cards/:id ───────────────────────────────────────────────────────────

describe('GET /cards/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/cards/abc')
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('card not found')
  })

  it('returns 200 with card including labels, comments, and activity', async () => {
    const card = { id: 1, title: 'Story A', swim_lane_id: 2 }
    const labels = [{ id: 1, name: 'Bug', color: '#ef4444' }]
    const comments = [{ id: 1, body: 'Hello', card_id: 1 }]
    const activity = [{ id: 1, action: 'create', card_id: 1 }]

    vi.mocked(db.get).mockResolvedValueOnce(card)
    vi.mocked(db.all)
      .mockResolvedValueOnce(labels)    // labels
      .mockResolvedValueOnce(comments)  // comments
      .mockResolvedValueOnce(activity)  // activity

    const res = await makeApp().request('/cards/1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ id: 1, title: 'Story A' })
    expect(body.data.labels).toEqual(labels)
    expect(body.data.comments).toEqual(comments)
    expect(body.data.activity).toEqual(activity)
  })
})

// ─── PATCH /cards/:id ────────────────────────────────────────────────────────

describe('PATCH /cards/:id', () => {
  const patch = (id: string | number, body: unknown) =>
    makeApp().request(`/cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric id', async () => {
    const res = await patch('abc', { title: 'X' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patch(99, { title: 'X' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when body has no updatable fields', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Story' })
    const res = await patch(1, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('no fields to update')
  })

  it('returns 422 for invalid priority', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'S' })
    const res = await patch(1, { priority: 'ASAP' })
    expect(res.status).toBe(422)
  })

  it('returns 200 with updated card after title change', async () => {
    const existing = { id: 1, title: 'Old', swim_lane_id: 2 }
    const updated  = { id: 1, title: 'New', swim_lane_id: 2 }
    vi.mocked(db.get)
      .mockResolvedValueOnce(existing)   // existing card
      .mockResolvedValueOnce(updated)    // after UPDATE
      .mockResolvedValueOnce({ project_id: 5 }) // lane lookup for SSE

    const res = await patch(1, { title: 'New' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })

  it('emits card:updated SSE event after update when swim_lane_id is set', async () => {
    const updated = { id: 1, title: 'New', swim_lane_id: 3 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, title: 'Old', swim_lane_id: 3 })
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce({ project_id: 7 })

    await patch(1, { title: 'New' })
    expect(emitBoardEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card:updated', projectId: 7 }),
    )
  })

  it('creates assignment notification when assignee changes', async () => {
    const existing = { id: 1, title: 'Story', swim_lane_id: 2, assignee: null }
    const updated  = { id: 1, title: 'Story', swim_lane_id: 2, assignee: 'Bob' }
    vi.mocked(db.get)
      .mockResolvedValueOnce(existing)                  // existing card
      // assignee user lookup happens BEFORE updated-card SELECT (see route order)
      .mockResolvedValueOnce({ id: 3, email: 'bob@test.com', email_notifications: 0 })
      .mockResolvedValueOnce(updated)                   // updated card (SELECT after UPDATE)
      .mockResolvedValueOnce({ project_id: 5 })         // lane lookup for SSE

    await patch(1, { assignee: 'Bob' })

    // Notification insert
    const notifCall = vi.mocked(db.run).mock.calls.find(c =>
      typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO notifications')
    )
    expect(notifCall).toBeDefined()
  })

  it('does NOT send email if email_notifications feature flag is off', async () => {
    const { sendEmail } = await import('../lib/email.js')
    const existing = { id: 1, title: 'S', swim_lane_id: 2, assignee: null }
    const updated  = { id: 1, title: 'S', swim_lane_id: 2, assignee: 'Bob' }
    vi.mocked(db.get)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce({ project_id: 1 })
      .mockResolvedValueOnce({ id: 3, email: 'bob@test.com', email_notifications: 1 })
    vi.mocked(isEnabled).mockResolvedValue(false) // flag off

    await patch(1, { assignee: 'Bob' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

// ─── DELETE /cards/:id ────────────────────────────────────────────────────────

describe('DELETE /cards/:id', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/cards/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 200 with { id } and emits card:deleted event', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 4, swim_lane_id: 2 })    // card found
      .mockResolvedValueOnce({ project_id: 5 })              // lane lookup for SSE

    const res = await makeApp().request('/cards/4', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: 4 })

    expect(emitBoardEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card:deleted', projectId: 5 }),
    )
  })

  it('does not emit SSE if card has no swim_lane_id', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 4, swim_lane_id: null })

    await makeApp().request('/cards/4', { method: 'DELETE' })
    expect(emitBoardEvent).not.toHaveBeenCalled()
  })
})

// ─── PATCH /cards/:id/move ────────────────────────────────────────────────────

describe('PATCH /cards/:id/move', () => {
  const move = (id: string | number, body: unknown) =>
    makeApp().request(`/cards/${id}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 400 for non-numeric id', async () => {
    const res = await move('abc', { lane_id: 1 })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await move(99, { lane_id: 1 })
    expect(res.status).toBe(404)
  })

  it('returns 422 when lane_id is missing', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
    const res = await move(1, {})
    expect(res.status).toBe(422)
  })

  it('returns 404 when target lane not found', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1, column_id: null })  // card
      .mockResolvedValueOnce(undefined)                                      // lane not found

    const res = await move(1, { lane_id: 99 })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('lane not found')
  })

  it('returns 200 and emits card:moved event after valid move', async () => {
    const movedCard = { id: 1, swim_lane_id: 3, position: 0 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1, column_id: null })  // card
      .mockResolvedValueOnce({ id: 3 })                                     // target lane exists
      .mockResolvedValueOnce(movedCard)                                     // card after move
      .mockResolvedValueOnce({ project_id: 5, is_done_col: 0 })            // lane for SSE
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 2 }, { id: 4 }])       // siblings

    const res = await move(1, { lane_id: 3, position: 0 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(movedCard)

    expect(emitBoardEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card:moved', projectId: 5 }),
    )
  })

  it('calls closeGitHubIssues when moved to a done lane', async () => {
    const movedCard = { id: 1, swim_lane_id: 3 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 2, column_id: null })
      .mockResolvedValueOnce({ id: 3 })
      .mockResolvedValueOnce(movedCard)
      .mockResolvedValueOnce({ project_id: 5, is_done_col: 1 }) // done col!
    vi.mocked(db.all).mockResolvedValueOnce([])

    await move(1, { lane_id: 3 })
    expect(closeGitHubIssues).toHaveBeenCalledWith(1)
  })

  it('does NOT call closeGitHubIssues when moved to a non-done lane', async () => {
    const movedCard = { id: 1, swim_lane_id: 2 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1, column_id: null })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce(movedCard)
      .mockResolvedValueOnce({ project_id: 5, is_done_col: 0 }) // NOT done col
    vi.mocked(db.all).mockResolvedValueOnce([])

    await move(1, { lane_id: 2 })
    expect(closeGitHubIssues).not.toHaveBeenCalled()
  })
})

// ─── GET /cards/:id/tasks ────────────────────────────────────────────────────

describe('GET /cards/:id/tasks', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await makeApp().request('/cards/abc/tasks')
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/tasks')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('story not found')
  })

  it('returns 200 with tasks for card', async () => {
    const tasks = [{ id: 1, title: 'Task A', story_id: 5, status: 'to-do' }]
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5 })
    vi.mocked(db.all).mockResolvedValueOnce(tasks)

    const res = await makeApp().request('/cards/5/tasks')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(tasks)
  })
})

// ─── POST /cards/:id/tasks ───────────────────────────────────────────────────

describe('POST /cards/:id/tasks', () => {
  const postTask = (cardId: number, body: unknown) =>
    makeApp().request(`/cards/${cardId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await postTask(99, { title: 'Task' })
    expect(res.status).toBe(404)
  })

  it('returns 422 for empty title string (triggers custom min message)', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await postTask(1, { title: '' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('title is required')
  })

  it('returns 422 for invalid status value', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 })
    const res = await postTask(1, { title: 'T', status: 'waiting' })
    expect(res.status).toBe(422)
  })

  it('returns 201 with created task', async () => {
    const task = { id: 3, title: 'Task', story_id: 1, status: 'to-do', position: 0 }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })      // card found
      .mockResolvedValueOnce({ m: -1 })       // max position
      .mockResolvedValueOnce(task)            // SELECT after INSERT
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 3, changes: 1 })

    const res = await postTask(1, { title: 'Task' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(task)
  })
})

// ─── PATCH /tasks/:id ────────────────────────────────────────────────────────

describe('PATCH /tasks/:id', () => {
  const patchTask = (id: number, body: unknown) =>
    makeApp().request(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('returns 404 when task not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await patchTask(99, { title: 'X' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('task not found')
  })

  it('returns 400 when no updatable fields', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, title: 'Task', status: 'to-do' })
    const res = await patchTask(1, {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('no fields to update')
  })

  it('returns 200 with updated task', async () => {
    const updated = { id: 1, title: 'Done', status: 'done' }
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, title: 'Task', status: 'to-do', assignee: null })
      .mockResolvedValueOnce(updated)

    const res = await patchTask(1, { status: 'done' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(updated)
  })
})

// ─── GET /projects/:id/stories/search ────────────────────────────────────────

describe('GET /projects/:id/stories/search', () => {
  it('returns 400 for non-numeric project id', async () => {
    const res = await makeApp().request('/projects/abc/stories/search?q=test')
    expect(res.status).toBe(400)
  })

  it('returns empty array without DB call when query < 2 chars', async () => {
    const res = await makeApp().request('/projects/1/stories/search?q=a')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
    expect(vi.mocked(db.all)).not.toHaveBeenCalled()
  })

  it('returns empty array when q is absent', async () => {
    const res = await makeApp().request('/projects/1/stories/search')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('queries DB and returns matching stories when q >= 2 chars', async () => {
    const results = [{ id: 1, title: 'Login page', priority: 'p1' }]
    vi.mocked(db.all).mockResolvedValueOnce(results)

    const res = await makeApp().request('/projects/1/stories/search?q=lo')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(results)
    expect(vi.mocked(db.all)).toHaveBeenCalledTimes(1)
  })
})
