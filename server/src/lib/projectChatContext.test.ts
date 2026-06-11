import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
  },
}))

vi.mock('./reportData.js', () => ({
  getSprintPointTotals: vi.fn().mockResolvedValue({
    total_points: 10, completed_points: 5, total_stories: 4, completed_stories: 2,
  }),
}))

import { db } from '../db/index.js'
import { buildProjectChatContext, READABLE_CARD_SQL } from './projectChatContext'

beforeEach(() => {
  vi.mocked(db.get).mockReset()
  vi.mocked(db.all).mockReset()
  vi.mocked(db.get).mockResolvedValue(undefined)
  vi.mocked(db.all).mockResolvedValue([])
})

describe('buildProjectChatContext', () => {
  it('returns null when the project does not exist', async () => {
    vi.mocked(db.get).mockResolvedValue(undefined)
    const result = await buildProjectChatContext(2, 'global_reader', 999)
    expect(result).toBeNull()
  })

  it('assembles all sections for an existing project', async () => {
    vi.mocked(db.get).mockResolvedValue({ id: 1, name: 'Apollo', description: 'Moon shot' })
    const result = await buildProjectChatContext(2, 'global_reader', 1)
    expect(result).toContain('## Project')
    expect(result).toContain('Apollo')
    expect(result).toContain('## Sprints')
    expect(result).toContain('## Active stories')
    expect(result).toContain('## Blockers')
    expect(result).toContain('## Recently completed')
    expect(result).toContain('## Team capacity')
    expect(result).toContain('## Recent activity')
  })

  it('embeds the readable-epics predicate and user id for non-super-admins', async () => {
    vi.mocked(db.get).mockResolvedValue({ id: 1, name: 'Apollo', description: null })
    await buildProjectChatContext(42, 'global_reader', 1)

    // Every cards query must carry the epic_access filter with the user id.
    const cardQueries = vi.mocked(db.all).mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM cards c')
    )
    expect(cardQueries.length).toBeGreaterThan(0)
    for (const call of cardQueries) {
      expect(call[0]).toContain('epic_access')
      expect(call.slice(1)).toContain(42)
    }
  })

  it('skips the filter for super_admin', async () => {
    vi.mocked(db.get).mockResolvedValue({ id: 1, name: 'Apollo', description: null })
    await buildProjectChatContext(1, 'super_admin', 1)

    const cardQueries = vi.mocked(db.all).mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM cards c JOIN swim_lanes') || (typeof sql === 'string' && sql.includes('is_done_col = 0'))
    )
    for (const call of cardQueries) {
      expect(call[0]).not.toContain('epic_access')
    }
  })

  it('truncates oversized contexts', async () => {
    vi.mocked(db.get).mockResolvedValue({ id: 1, name: 'Apollo', description: null })
    vi.mocked(db.all).mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: i, title: 'x'.repeat(900), lane: 'Doing', story_points: 3,
        assignee: 'Dev', priority: 'p2', due_date: null,
        name: 'x'.repeat(900), is_done_col: 0,
        created_at: '2026-01-01', action: 'update', card_id: i, display_name: 'Dev',
        blocker_id: i, blocked_id: i + 1, blocked_title: 'x'.repeat(900),
        updated_at: '2026-01-01', capacity: 5, assigned: 3,
        status: 'active', priority2: null, start_date: null, end_date: null,
        goal: null, velocity_completed_points: 0, velocity_total_points: 0,
        epic_title: null,
      })) as never
    )
    const result = await buildProjectChatContext(2, 'global_reader', 1)
    expect(result!.length).toBeLessThanOrEqual(24_000 + '\n…[truncated]'.length)
    expect(result).toContain('…[truncated]')
  })

  it('exports a predicate that references epic_access', () => {
    expect(READABLE_CARD_SQL).toContain('epic_access')
    expect(READABLE_CARD_SQL).toContain('c.feature_id')
  })
})
