import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../../db/index.js', () => ({
  db: { get: vi.fn(), all: vi.fn(), run: vi.fn() },
}))

vi.mock('../../lib/featureFlags.js', () => ({
  isEnabled: vi.fn(),
}))

vi.mock('../../lib/ai.js', () => ({
  getProvider: vi.fn(),
}))

vi.mock('../../lib/reportData.js', () => ({
  getSprintPointTotals: vi.fn(),
  getProjectCycleTime: vi.fn(),
  getSprintCapacity: vi.fn(),
}))

vi.mock('../../lib/aiContext.js', () => ({
  getStalledCards: vi.fn(),
  truncate: (s: string | null | undefined, max: number) => {
    if (!s) return ''
    return s.length > max ? s.slice(0, max) + '…' : s
  },
}))

import { db } from '../../db/index.js'
import { isEnabled } from '../../lib/featureFlags.js'
import { getProvider } from '../../lib/ai.js'
import { getSprintPointTotals, getProjectCycleTime, getSprintCapacity } from '../../lib/reportData.js'
import { getStalledCards } from '../../lib/aiContext.js'
import digests from './digests'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', digests)
  return app
}

function mockProvider(completion: string) {
  vi.mocked(getProvider).mockResolvedValue({
    complete: vi.fn().mockResolvedValue(completion),
    stream: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEnabled).mockResolvedValue(true)
  vi.mocked(getSprintPointTotals).mockResolvedValue({ total_points: 20, completed_points: 8, total_stories: 6, completed_stories: 2 })
  vi.mocked(getProjectCycleTime).mockResolvedValue([{ lane_id: 1, lane_name: 'Doing', avg_days: 2.5, sample_size: 4 }])
  vi.mocked(getSprintCapacity).mockResolvedValue([{ assignee: 'Ana', story_count: 3, story_points: 8, capacity: 10, skills: ['react'] }])
  vi.mocked(getStalledCards).mockResolvedValue([{ id: 7, title: 'Stuck card', assignee: 'Ana', lane_name: 'Doing', idle_days: 4 }])
})

describe('sprint digest', () => {
  it('404s when the feature flag is off', async () => {
    vi.mocked(isEnabled).mockResolvedValue(false)
    const res = await makeApp().request('/ai/sprints/1/digest', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid sprint id', async () => {
    const res = await makeApp().request('/ai/sprints/abc/digest', { method: 'POST' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the sprint does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/ai/sprints/99/digest', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('returns 409 for the default sprint', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, project_id: 1, name: 'Default', is_default: 1 })
    const res = await makeApp().request('/ai/sprints/1/digest', { method: 'POST' })
    expect(res.status).toBe(409)
  })

  it('generates, persists, and returns the digest', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 3, project_id: 1, name: 'Sprint 3', goal: 'Ship it', status: 'active',
      start_date: '2026-06-01', end_date: '2026-06-14', is_default: 0,
    })
    mockProvider('**Status**: on track')

    const res = await makeApp().request('/ai/sprints/3/digest', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.digest).toBe('**Status**: on track')
    expect(json.data.generated_at).toBeTruthy()

    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_digests'),
      'sprint_health', 1, 3, '**Status**: on track', ADMIN.id,
    )
  })

  it('returns 500 with the provider error message on failure', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 3, project_id: 1, name: 'S', goal: null, status: 'active', start_date: null, end_date: null, is_default: 0 })
    vi.mocked(getProvider).mockResolvedValue({
      complete: vi.fn().mockRejectedValue(new Error('provider down')),
      stream: vi.fn(),
    })
    const res = await makeApp().request('/ai/sprints/3/digest', { method: 'POST' })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('provider down')
  })

  it('GET returns the latest saved digest without calling the provider', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 3, project_id: 1 }) // sprint lookup
      .mockResolvedValueOnce({ content: 'saved digest', created_at: '2026-06-10 09:00:00' })
    const res = await makeApp().request('/ai/sprints/3/digest')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.digest).toBe('saved digest')
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('GET returns nulls when no digest is saved yet', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 3, project_id: 1 })
      .mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/ai/sprints/3/digest')
    const json = await res.json()
    expect(json.data).toEqual({ digest: null, generated_at: null })
  })
})

describe('standup digest', () => {
  it('returns 404 when the project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/ai/projects/9/standup-digest', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect(res.status).toBe(404)
  })

  it('rejects an out-of-range hours value', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, name: 'Apollo' })
    const res = await makeApp().request('/ai/projects/1/standup-digest', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hours: 0 }),
    })
    expect(res.status).toBe(422)
  })

  it('generates and persists a standup digest', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, name: 'Apollo' }) // project
      .mockResolvedValueOnce({ id: 3 }) // active sprint
    vi.mocked(db.all)
      .mockResolvedValueOnce([{ created_at: '2026-06-11 08:00:00', action: 'move', card_id: 5, title: 'Card', display_name: 'Ana' }]) // activity
      .mockResolvedValueOnce([]) // comments
    mockProvider('**What moved**\n- #5')

    const res = await makeApp().request('/ai/projects/1/standup-digest', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.digest).toContain('What moved')
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_digests'),
      'standup', 1, null, '**What moved**\n- #5', ADMIN.id,
    )
  })
})

describe('retro synthesize', () => {
  it('404s when the retrospective does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/ai/retrospectives/9/synthesize', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('400s when the retro has no items', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 9, sprint_id: 3, project_id: 1, start_date: '2026-06-01' })
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/ai/retrospectives/9/synthesize', { method: 'POST' })
    expect(res.status).toBe(400)
  })

  it('synthesizes and filters hallucinated item ids', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 9, sprint_id: 3, project_id: 1, start_date: '2026-06-01' }) // retro
      .mockResolvedValueOnce({ id: 2 }) // previous sprint
    vi.mocked(db.all)
      .mockResolvedValueOnce([
        { id: 1, category: 'went_well', body: 'shipped early' },
        { id: 2, category: 'to_improve', body: 'too many meetings' },
      ]) // items
      .mockResolvedValueOnce([{ body: 'Reduce WIP' }]) // previous actions
    mockProvider(JSON.stringify({
      themes: [{ title: 'Meetings overload', category: 'to_improve', item_ids: [2, 999] }],
      suggested_actions: [{ body: 'Cancel standing syncs' }],
      previous_actions_review: [{ body: 'Reduce WIP', status: 'partially', evidence: 'still 8 cards in flight' }],
    }))

    const res = await makeApp().request('/ai/retrospectives/9/synthesize', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.themes[0].item_ids).toEqual([2])
    expect(json.data.suggested_actions).toHaveLength(1)
    expect(json.data.previous_actions_review[0].status).toBe('partially')
  })

  it('500s when the model returns unparseable output', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 9, sprint_id: 3, project_id: 1, start_date: null })
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1, category: 'went_well', body: 'x' }])
    mockProvider('I cannot help with that.')
    const res = await makeApp().request('/ai/retrospectives/9/synthesize', { method: 'POST' })
    expect(res.status).toBe(500)
  })
})
