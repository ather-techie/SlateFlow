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

import { db } from '../../db/index.js'
import { isEnabled } from '../../lib/featureFlags.js'
import { getProvider } from '../../lib/ai.js'
import { canReadFeatureEpic } from '../../lib/epicAccess.js'
import writing from './writing'

const USER = { id: 2, role: 'global_reader', email: 'u@test.com', display_name: 'User' }

function makeApp(user = USER) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', writing)
  return app
}

function mockProvider(completion: string) {
  vi.mocked(getProvider).mockResolvedValue({
    complete: vi.fn().mockResolvedValue(completion),
    stream: vi.fn(),
  })
}

const CARD = { id: 5, title: 'Login page', description: 'Build it', feature_id: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEnabled).mockResolvedValue(true)
  vi.mocked(canReadFeatureEpic).mockResolvedValue(true)
})

describe('generate-acceptance-criteria', () => {
  it('404s when the flag is off', async () => {
    vi.mocked(isEnabled).mockResolvedValue(false)
    const res = await makeApp().request('/ai/cards/5/generate-acceptance-criteria', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('403s when the user cannot read the card epic', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(CARD)
    vi.mocked(canReadFeatureEpic).mockResolvedValue(false)
    const res = await makeApp().request('/ai/cards/5/generate-acceptance-criteria', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('returns validated criteria and drops malformed items', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(CARD)
    mockProvider(JSON.stringify([
      { given: 'a logged-out user', when: 'they submit valid credentials', then: 'they land on the dashboard' },
      { given: 'missing when/then' },
    ]))
    const res = await makeApp().request('/ai/cards/5/generate-acceptance-criteria', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.criteria).toHaveLength(1)
    expect(json.data.criteria[0].then).toContain('dashboard')
  })

  it('500s when every item is invalid', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(CARD)
    mockProvider('[{"nope": true}]')
    const res = await makeApp().request('/ai/cards/5/generate-acceptance-criteria', { method: 'POST' })
    expect(res.status).toBe(500)
  })
})

describe('summarize-comments', () => {
  it('400s when the thread is too short', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(CARD)
    vi.mocked(db.all).mockResolvedValueOnce([
      { author: 'A', body: 'one', created_at: '2026-06-01' },
      { author: 'B', body: 'two', created_at: '2026-06-02' },
    ])
    const res = await makeApp().request('/ai/cards/5/summarize-comments', { method: 'POST' })
    expect(res.status).toBe(400)
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('summarizes a long thread', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(CARD)
    vi.mocked(db.all).mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, i) => ({ author: 'Ana', body: `comment ${i}`, created_at: `2026-06-0${i + 1}` }))
    )
    mockProvider(JSON.stringify({
      summary: 'The team agreed on the API shape.',
      decisions: ['Use REST'],
      open_questions: ['Auth provider?'],
    }))
    const res = await makeApp().request('/ai/cards/5/summarize-comments', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.summary).toContain('API shape')
    expect(json.data.decisions).toEqual(['Use REST'])
    expect(json.data.open_questions).toEqual(['Auth provider?'])
  })

  it('500s on unparseable model output', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(CARD)
    vi.mocked(db.all).mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({ author: 'A', body: `c${i}`, created_at: '2026-06-01' }))
    )
    mockProvider('not json')
    const res = await makeApp().request('/ai/cards/5/summarize-comments', { method: 'POST' })
    expect(res.status).toBe(500)
  })
})
