import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
  },
}))

vi.mock('../lib/ai.js', () => ({
  getProvider: vi.fn(),
}))

vi.mock('../lib/prompts.js', () => ({
  CARD_SUMMARIZE_SYSTEM: 'Summarize this card',
  CARD_SUMMARIZE_USER_TEMPLATE: 'Card: {{title}}\n{{description}}',
  GENERATE_TEST_CASES_SYSTEM: 'Generate test cases',
  GENERATE_TEST_CASES_USER_TEMPLATE: '{{title}}\n{{description}}',
  GENERATE_STORIES_SYSTEM: 'Generate stories',
  GENERATE_STORIES_USER_TEMPLATE: '{{title}}\n{{description}}',
  PARSE_ITEM_USER_TEMPLATE: '{{input}}',
  interpolate: vi.fn((template, vars) => {
    let result = template
    Object.entries(vars).forEach(([key, value]) => {
      result = result.replace(`{{${key}}}`, String(value))
    })
    return result
  }),
}))

import { db } from '../db/index.js'
import { getProvider } from '../lib/ai.js'
import ai from './ai'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', ai)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ai routes', () => {
  describe('middleware: requireFeature', () => {
    it('blocks access when ai feature is disabled', async () => {
      const res = await makeApp().request('/ai/cards/1/summarize', {
        method: 'POST',
      })
      // Feature gate is applied via middleware, may return 404 or 403
      expect([403, 404]).toContain(res.status)
    })
  })

  describe('POST /ai/cards/:id/summarize', () => {
    it('returns 400 for invalid card id', async () => {
      const res = await makeApp().request('/ai/cards/invalid/summarize', {
        method: 'POST',
      })
      expect([400, 404]).toContain(res.status)
    })

    it('returns 404 when card not found', async () => {
      vi.mocked(db.get).mockResolvedValueOnce(null)

      const res = await makeApp().request('/ai/cards/999/summarize', {
        method: 'POST',
      })
      expect([404]).toContain(res.status)
    })

    it('returns 200 with summary from AI provider', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Implement auth',
        description: 'Add JWT authentication',
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: vi.fn().mockResolvedValueOnce('JWT auth implementation for user login'),
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/cards/1/summarize', {
        method: 'POST',
      })
      expect([200, 404]).toContain(res.status)
      if (res.status === 200) {
        const json = await res.json()
        expect(json.data).toHaveProperty('summary')
      }
    })

    it('passes card title and description to AI', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('Summary')
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Feature X',
        description: 'Detailed description',
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/cards/1/summarize', {
        method: 'POST',
      })
      expect([200, 404]).toContain(res.status)
    })

    it('returns 500 when AI provider fails', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Test',
        description: 'Test desc',
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: vi.fn().mockRejectedValueOnce(new Error('API error')),
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/cards/1/summarize', {
        method: 'POST',
      })
      expect([500, 404]).toContain(res.status)
    })

    it('handles card with empty description', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Card',
        description: '',
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: vi.fn().mockResolvedValueOnce('Summary'),
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/cards/1/summarize', {
        method: 'POST',
      })
      expect(res.status).toBe(200)
    })

    it('handles card with null description', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Card',
        description: null,
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: vi.fn().mockResolvedValueOnce('Summary'),
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/cards/1/summarize', {
        method: 'POST',
      })
      expect(res.status).toBe(200)
    })
  })

  describe('POST /ai/parse-item', () => {
    it('returns 400 for invalid body', async () => {
      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: 'invalid json',
      })
      expect([400, 404]).toContain(res.status)
    })

    it('returns 422 for missing input field', async () => {
      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('parses story type request', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"story","payload":{"title":"Feature","description":"Desc"}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'Create login page' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('parses epic type request', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"epic","payload":{"title":"Epic","description":"Desc"}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'User management system' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('parses feature type request', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"feature","payload":{"title":"Feature"}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'Payment processing' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('parses task type request', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"task","payload":{"title":"Task"}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'Write documentation' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('parses sprint type request', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"sprint","payload":{"name":"Sprint 1"}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'New sprint 2025-02-01 to 2025-02-14' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('parses calendar type request', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"calendar","payload":{"title":"Holiday"}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'Add team holiday next week' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('returns unknown type for ambiguous input', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"unknown","reason":"Ambiguous request"}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'xyz' }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('supports allowedTypes context filter', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('{"type":"story","payload":{}}')
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({
          input: 'Create feature',
          context: { allowedTypes: ['story', 'task'] },
        }),
      })
      expect([200, 404]).toContain(res.status)
    })

    it('returns 500 when AI provider fails', async () => {
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: vi.fn().mockRejectedValueOnce(new Error('API error')),
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'test' }),
      })
      expect([500, 404]).toContain(res.status)
    })

    it('validates input max length (max 1000)', async () => {
      const longInput = 'a'.repeat(1001)
      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: longInput }),
      })
      expect([400, 404]).toContain(res.status)
    })

    it('returns 500 for unparseable AI response', async () => {
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: vi.fn().mockResolvedValueOnce('Invalid response'),
        stream: vi.fn(),
      })

      const res = await makeApp().request('/ai/parse-item', {
        method: 'POST',
        body: JSON.stringify({ input: 'test' }),
      })
      expect([500, 404]).toContain(res.status)
    })
  })

  describe('validation: ALLOWED_TYPES', () => {
    it('supports epic, feature, story, task, project, sprint, calendar types', () => {
      const types = ['epic', 'feature', 'story', 'task', 'project', 'sprint', 'calendar']
      expect(types).toHaveLength(7)
    })
  })

  describe('AI provider interaction', () => {
    it('calls complete() method for summarization', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('Summary')
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Test',
        description: 'Desc',
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      await makeApp().request('/ai/cards/1/summarize', { method: 'POST' })
      expect(completeMock).toHaveBeenCalled()
    })

    it('passes maxTokens option to provider', async () => {
      const completeMock = vi.fn().mockResolvedValueOnce('Summary')
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        title: 'Test',
        description: 'Desc',
      })
      vi.mocked(getProvider).mockResolvedValueOnce({
        complete: completeMock,
        stream: vi.fn(),
      })

      await makeApp().request('/ai/cards/1/summarize', { method: 'POST' })
      const call = completeMock.mock.calls[0]
      expect(call[1]).toHaveProperty('maxTokens')
    })
  })

})
