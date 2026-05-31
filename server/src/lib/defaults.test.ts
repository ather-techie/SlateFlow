import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    run: vi.fn(),
  },
}))

import { db } from '../db/index.js'
import { resolveDefaultFeature, resolveDefaultSprint, resolveDefaultEpic, seedProjectDefaults } from './defaults'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
})

describe('resolveDefaultFeature', () => {
  it('returns feature id when default feature exists', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 42 })
    const result = await resolveDefaultFeature(10)
    expect(result).toBe(42)
    expect(vi.mocked(db.get)).toHaveBeenCalledWith(
      'SELECT id FROM features WHERE project_id = ? AND is_default = 1 LIMIT 1',
      10,
    )
  })

  it('returns null when default feature does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const result = await resolveDefaultFeature(10)
    expect(result).toBeNull()
  })
})

describe('resolveDefaultSprint', () => {
  it('returns sprint id when default sprint exists', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 55 })
    const result = await resolveDefaultSprint(20)
    expect(result).toBe(55)
    expect(vi.mocked(db.get)).toHaveBeenCalledWith(
      'SELECT id FROM sprints WHERE project_id = ? AND is_default = 1 LIMIT 1',
      20,
    )
  })

  it('returns null when default sprint does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const result = await resolveDefaultSprint(20)
    expect(result).toBeNull()
  })
})

describe('resolveDefaultEpic', () => {
  it('returns epic id when default epic exists', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 77 })
    const result = await resolveDefaultEpic(30)
    expect(result).toBe(77)
    expect(vi.mocked(db.get)).toHaveBeenCalledWith(
      'SELECT id FROM epics WHERE project_id = ? AND is_default = 1 LIMIT 1',
      30,
    )
  })

  it('returns null when default epic does not exist', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const result = await resolveDefaultEpic(30)
    expect(result).toBeNull()
  })
})

describe('seedProjectDefaults', () => {
  it('inserts default epic, feature, and sprint for a new project', async () => {
    vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })

    await seedProjectDefaults(100)

    const runCalls = vi.mocked(db.run).mock.calls
    expect(runCalls.length).toBe(3)

    // First call should be for default epic
    expect(runCalls[0][0]).toContain('INSERT INTO epics')
    expect(runCalls[0][0]).toContain('is_default')
    expect(runCalls[0][1]).toBe(100) // project_id

    // Second call should be for default feature
    expect(runCalls[1][0]).toContain('INSERT INTO features')
    expect(runCalls[1][0]).toContain('is_default')
    expect(runCalls[1][1]).toBe(100) // project_id

    // Third call should be for default sprint
    expect(runCalls[2][0]).toContain('INSERT INTO sprints')
    expect(runCalls[2][0]).toContain('is_default')
    expect(runCalls[2][1]).toBe(100) // project_id
  })

  it('uses correct lastID values for foreign key references', async () => {
    // Mock sequence: epic inserts with id 1, feature with id 2, sprint with id 3
    vi.mocked(db.run)
      .mockResolvedValueOnce({ lastID: 1, changes: 1 }) // epic
      .mockResolvedValueOnce({ lastID: 2, changes: 1 }) // feature
      .mockResolvedValueOnce({ lastID: 3, changes: 1 }) // sprint

    await seedProjectDefaults(100)

    const runCalls = vi.mocked(db.run).mock.calls
    const featureCall = runCalls[1]

    // Feature should reference the project and epic that was just inserted
    expect(featureCall[1]).toBe(100) // project_id
    expect(featureCall[2]).toBe(1) // epic_id from previous insert
  })
})
