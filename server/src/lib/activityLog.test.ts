import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: {
    run: vi.fn(),
  },
}))

import { db } from '../db/index.js'
import { logActivity } from './activityLog'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
})

describe('logActivity', () => {
  it('inserts activity log row with correct parameters', async () => {
    await logActivity(123, 'create', { swim_lane_id: 5 }, 1)

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'INSERT INTO activity_log (card_id, action, meta, user_id) VALUES (?, ?, ?, ?)',
      123,
      'create',
      JSON.stringify({ swim_lane_id: 5 }),
      1,
    )
  })

  it('handles field_changed action with metadata', async () => {
    const meta = { field: 'priority', from: 'p2', to: 'p1' }
    await logActivity(456, 'field_changed', meta, 2)

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'INSERT INTO activity_log (card_id, action, meta, user_id) VALUES (?, ?, ?, ?)',
      456,
      'field_changed',
      JSON.stringify(meta),
      2,
    )
  })

  it('handles move action with lane and position info', async () => {
    const meta = { from_lane_id: 1, to_lane_id: 3, position: 5 }
    await logActivity(789, 'move', meta, 3)

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.any(String),
      789,
      'move',
      JSON.stringify(meta),
      3,
    )
  })

  it('defaults userId to null when not provided', async () => {
    await logActivity(111, 'comment_added', { author: 'Admin' })

    const calls = vi.mocked(db.run).mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[lastCall.length - 1]).toBeNull()
  })

  it('handles test_run action with status info', async () => {
    const meta = { title: 'Login flow', status: 'passed', run_by: 'Admin' }
    await logActivity(222, 'test_run', meta, 4)

    expect(vi.mocked(db.run)).toHaveBeenCalled()
    const params = vi.mocked(db.run).mock.calls[0]
    expect(params[1]).toBe(222)
    expect(params[2]).toBe('test_run')
  })

  it('correctly serializes complex meta objects to JSON', async () => {
    const complexMeta = {
      from_lane_id: null,
      to_lane_id: 2,
      position: 10,
      reason: 'moved to in-progress',
    }
    await logActivity(333, 'move', complexMeta, 5)

    const calls = vi.mocked(db.run).mock.calls
    const metaParam = calls[0][3]
    expect(JSON.parse(metaParam as string)).toEqual(complexMeta)
  })
})
