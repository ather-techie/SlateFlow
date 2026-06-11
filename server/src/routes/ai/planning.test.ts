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

vi.mock('../../lib/epicAccess.js', () => ({
  canReadFeatureEpic: vi.fn(),
}))

vi.mock('../../lib/reportData.js', () => ({
  getSprintCapacity: vi.fn(),
}))

vi.mock('../../lib/aiContext.js', () => ({
  getBacklogCards: vi.fn(),
  getProjectMembers: vi.fn(),
  getVacationsInRange: vi.fn(),
  truncate: (s: string | null | undefined, max: number) => {
    if (!s) return ''
    return s.length > max ? s.slice(0, max) + '…' : s
  },
}))

import { db } from '../../db/index.js'
import { isEnabled } from '../../lib/featureFlags.js'
import { getProvider } from '../../lib/ai.js'
import { canReadFeatureEpic } from '../../lib/epicAccess.js'
import { getSprintCapacity } from '../../lib/reportData.js'
import { getBacklogCards, getProjectMembers, getVacationsInRange } from '../../lib/aiContext.js'
import planning from './planning'

const USER = { id: 2, role: 'global_reader', email: 'u@test.com', display_name: 'User' }

function makeApp(user = USER) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', planning)
  return app
}

function mockProvider(completion: string) {
  vi.mocked(getProvider).mockResolvedValue({
    complete: vi.fn().mockResolvedValue(completion),
    stream: vi.fn(),
  })
}

const CARD = {
  id: 5, title: 'Login page', description: 'Build it', priority: 'p1',
  story_points: null, feature_id: 3, swim_lane_id: 9, sprint_id: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEnabled).mockResolvedValue(true)
  vi.mocked(canReadFeatureEpic).mockResolvedValue(true)
  vi.mocked(getSprintCapacity).mockResolvedValue([])
  vi.mocked(getVacationsInRange).mockResolvedValue([])
  vi.mocked(getProjectMembers).mockResolvedValue([
    { user_id: 7, display_name: 'Ana', role: 'contributor', skills: ['react'], capacity: 10 },
  ])
})

describe('suggest-assignee', () => {
  it('400s when the project has no members', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce(CARD)
      .mockResolvedValueOnce({ project_id: 1 }) // lane lookup
    vi.mocked(getProjectMembers).mockResolvedValue([])
    const res = await makeApp().request('/ai/cards/5/suggest-assignee', { method: 'POST' })
    expect(res.status).toBe(400)
  })

  it('drops hallucinated members and canonicalizes names', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce(CARD)
      .mockResolvedValueOnce({ project_id: 1 }) // lane lookup
      .mockResolvedValueOnce({ id: 3, start_date: '2026-06-01', end_date: '2026-06-14' }) // active sprint
    mockProvider(JSON.stringify({
      suggestions: [
        { user_id: 7, assignee: 'Anna Banana', confidence: 'high', reason: 'react skills match' },
        { user_id: 999, assignee: 'Ghost', confidence: 'high', reason: 'does not exist' },
      ],
    }))

    const res = await makeApp().request('/ai/cards/5/suggest-assignee', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.suggestions).toHaveLength(1)
    expect(json.data.suggestions[0].assignee).toBe('Ana')
    expect(json.data.suggestions[0].user_id).toBe(7)
  })

  it('500s when no valid suggestions survive', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce(CARD)
      .mockResolvedValueOnce({ project_id: 1 })
      .mockResolvedValueOnce(undefined) // no active sprint
    mockProvider('{"suggestions":[{"user_id":999,"assignee":"Ghost","confidence":"low","reason":"x"}]}')
    const res = await makeApp().request('/ai/cards/5/suggest-assignee', { method: 'POST' })
    expect(res.status).toBe(500)
  })
})

describe('plan-sprint', () => {
  const PLANNED_SPRINT = { id: 4, name: 'Sprint 4', goal: 'Ship', status: 'planned', start_date: '2026-06-15', end_date: '2026-06-28', is_default: 0 }
  const BACKLOG = [
    { id: 11, title: 'Story A', description: 'a', priority: 'p1', story_points: 3, created_at: '2026-05-01', last_activity_days: 2 },
    { id: 12, title: 'Story B', description: 'b', priority: 'p2', story_points: 5, created_at: '2026-05-02', last_activity_days: 9 },
  ]

  it('409s when the sprint is not in planned status', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 }) // project
      .mockResolvedValueOnce({ ...PLANNED_SPRINT, status: 'active' })
    const res = await makeApp().request('/ai/projects/1/plan-sprint', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sprint_id: 4 }),
    })
    expect(res.status).toBe(409)
  })

  it('400s when the backlog is empty', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(PLANNED_SPRINT)
    vi.mocked(getBacklogCards).mockResolvedValue([])
    const res = await makeApp().request('/ai/projects/1/plan-sprint', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sprint_id: 4 }),
    })
    expect(res.status).toBe(400)
  })

  it('plans a sprint and filters non-backlog card ids', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1 }) // project
      .mockResolvedValueOnce(PLANNED_SPRINT) // sprint
      .mockResolvedValueOnce({ avg_pts: 12 }) // avg velocity
    vi.mocked(getBacklogCards).mockResolvedValue(BACKLOG)
    vi.mocked(db.all).mockResolvedValueOnce([]) // dependencies
    mockProvider(JSON.stringify({
      recommended_points: 10,
      rationale: 'Velocity-based.',
      proposed: [
        { card_id: 11, title: 'whatever', points: 99, reason: 'high priority' },
        { card_id: 777, title: 'hallucinated', points: 1, reason: 'nope' },
      ],
      risks: ['Ana is out two days'],
    }))

    const res = await makeApp().request('/ai/projects/1/plan-sprint', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sprint_id: 4 }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.proposed).toHaveLength(1)
    expect(json.data.proposed[0].card_id).toBe(11)
    // Title and points come from the DB row, not the model.
    expect(json.data.proposed[0].title).toBe('Story A')
    expect(json.data.proposed[0].points).toBe(3)
    expect(json.data.recommended_points).toBe(10)
  })
})

describe('suggest-estimate', () => {
  it('suggests an estimate with validated comparables', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce(CARD)
      .mockResolvedValueOnce({ project_id: 1 }) // lane lookup
    vi.mocked(db.all)
      .mockResolvedValueOnce([{ id: 21, title: 'Old story', story_points: 5, days_to_complete: 4 }]) // completed
      .mockResolvedValueOnce([{ story_points: 3 }, { story_points: 5 }]) // scale
    mockProvider(JSON.stringify({
      points: 5,
      confidence: 'medium',
      rationale: 'Similar to the old story.',
      comparables: [
        { card_id: 21, title: 'x', points: 1 },
        { card_id: 888, title: 'ghost', points: 13 },
      ],
    }))

    const res = await makeApp().request('/ai/cards/5/suggest-estimate', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.points).toBe(5)
    expect(json.data.comparables).toHaveLength(1)
    expect(json.data.comparables[0]).toEqual({ card_id: 21, title: 'Old story', points: 5 })
  })
})

describe('groom-backlog', () => {
  it('grooms, validates ids, and merges deterministic staleness', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 }) // project
    vi.mocked(getBacklogCards).mockResolvedValue([
      { id: 11, title: 'Story A', description: 'a', priority: 'p1', story_points: 3, created_at: '2026-05-01 00:00:00', last_activity_days: 2 },
      { id: 12, title: 'Story B', description: '', priority: 'p2', story_points: null, created_at: '2026-01-02 00:00:00', last_activity_days: 45 },
    ])
    mockProvider(JSON.stringify({
      duplicates: [
        { card_ids: [11, 12], reason: 'same login work' },
        { card_ids: [11, 999], reason: 'one id hallucinated' },
      ],
      vague: [
        { card_id: 12, issue: 'no description', suggested_description: 'As a user…' },
        { card_id: 555, issue: 'ghost', suggested_description: 'x' },
      ],
      priority_order: [12, 11, 12, 999],
      notes: 'Backlog needs attention.',
    }))

    const res = await makeApp().request('/ai/projects/1/groom-backlog', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.duplicates).toHaveLength(1)
    expect(json.data.vague).toHaveLength(1)
    expect(json.data.priority_order).toEqual([12, 11])
    expect(json.data.stale).toEqual([{ card_id: 12, title: 'Story B', last_activity_days: 45 }])
  })
})
