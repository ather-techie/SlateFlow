import { describe, it, expect, beforeEach, vi } from 'vitest'
import { canRead, canWrite, canManageUsers } from './projectAccess'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
  },
}))

import { db } from '../db/index.js'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('canRead', () => {
  it('returns true with no arguments', () => {
    const result = canRead()
    expect(result).toBe(true)
  })

  it('returns true consistently', () => {
    expect(canRead()).toBe(true)
    expect(canRead()).toBe(true)
    expect(canRead()).toBe(true)
  })

  it('never queries the database', () => {
    canRead()
    expect(vi.mocked(db.get)).not.toHaveBeenCalled()
  })
})

describe('canWrite', () => {
  describe('super_admin role', () => {
    it('returns true for super_admin without DB query', async () => {
      const result = await canWrite(1, 1, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })

    it('super_admin bypasses all checks even with no DB row', async () => {
      vi.mocked(db.get).mockResolvedValue(undefined)
      const result = await canWrite(999, 999, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })
  })

  describe('project_admin role', () => {
    it('returns true when user has project_admin role', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })
      const result = await canWrite(1, 1, 'global_reader')
      expect(result).toBe(true)
    })

    it('queries DB with correct parameters', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })
      await canWrite(123, 456, 'global_reader')
      expect(vi.mocked(db.get)).toHaveBeenCalledWith(
        'SELECT role FROM project_access WHERE user_id = ? AND project_id = ?',
        123,
        456
      )
    })
  })

  describe('contributor role', () => {
    it('returns true when user has contributor role', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'contributor' })
      const result = await canWrite(1, 1, 'global_reader')
      expect(result).toBe(true)
    })
  })

  describe('reader role', () => {
    it('returns false when user has reader role only', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'reader' })
      const result = await canWrite(1, 1, 'global_reader')
      expect(result).toBe(false)
    })
  })

  describe('no DB row', () => {
    it('returns false when no DB row exists', async () => {
      vi.mocked(db.get).mockResolvedValue(undefined)
      const result = await canWrite(1, 1, 'global_reader')
      expect(result).toBe(false)
    })

    it('returns false when DB returns null', async () => {
      vi.mocked(db.get).mockResolvedValue(null)
      const result = await canWrite(1, 1, 'global_reader')
      expect(result).toBe(false)
    })
  })

  describe('role evaluation', () => {
    it('allows both project_admin and contributor', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'project_admin' })
      const adminResult = await canWrite(1, 1, 'global_reader')
      expect(adminResult).toBe(true)

      vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })
      const contributorResult = await canWrite(2, 2, 'global_reader')
      expect(contributorResult).toBe(true)
    })

    it('rejects reader role and missing role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'reader' })
      const readerResult = await canWrite(1, 1, 'global_reader')
      expect(readerResult).toBe(false)

      vi.mocked(db.get).mockResolvedValueOnce(undefined)
      const noRoleResult = await canWrite(2, 2, 'global_reader')
      expect(noRoleResult).toBe(false)
    })
  })

  describe('global role parameter', () => {
    it('accepts global_reader as userGlobalRole', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'contributor' })
      const result = await canWrite(1, 1, 'global_reader')
      expect(result).toBe(true)
    })

    it('only super_admin bypasses DB check', async () => {
      vi.mocked(db.get).mockResolvedValue(undefined)

      // non-super_admin role should query DB
      await canWrite(1, 1, 'global_reader')
      expect(vi.mocked(db.get)).toHaveBeenCalled()

      vi.resetAllMocks()

      // super_admin should not query DB
      await canWrite(1, 1, 'super_admin')
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })
  })
})

describe('canManageUsers', () => {
  describe('super_admin role', () => {
    it('returns true for super_admin without DB query', async () => {
      const result = await canManageUsers(1, 1, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })

    it('super_admin bypasses all checks', async () => {
      vi.mocked(db.get).mockResolvedValue(undefined)
      const result = await canManageUsers(999, 999, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })
  })

  describe('project_admin role', () => {
    it('returns true when user has project_admin role', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })
      const result = await canManageUsers(1, 1, 'global_reader')
      expect(result).toBe(true)
    })

    it('queries DB with correct parameters', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })
      await canManageUsers(789, 654, 'global_reader')
      expect(vi.mocked(db.get)).toHaveBeenCalledWith(
        'SELECT role FROM project_access WHERE user_id = ? AND project_id = ?',
        789,
        654
      )
    })
  })

  describe('contributor role', () => {
    it('returns false when user has contributor role', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'contributor' })
      const result = await canManageUsers(1, 1, 'global_reader')
      expect(result).toBe(false)
    })
  })

  describe('reader role', () => {
    it('returns false when user has reader role', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'reader' })
      const result = await canManageUsers(1, 1, 'global_reader')
      expect(result).toBe(false)
    })
  })

  describe('no DB row', () => {
    it('returns false when no DB row exists', async () => {
      vi.mocked(db.get).mockResolvedValue(undefined)
      const result = await canManageUsers(1, 1, 'global_reader')
      expect(result).toBe(false)
    })

    it('returns false when DB returns null', async () => {
      vi.mocked(db.get).mockResolvedValue(null)
      const result = await canManageUsers(1, 1, 'global_reader')
      expect(result).toBe(false)
    })
  })

  describe('role strictness', () => {
    it('only allows project_admin (not contributor or reader)', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'project_admin' })
      const adminResult = await canManageUsers(1, 1, 'global_reader')
      expect(adminResult).toBe(true)

      vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })
      const contributorResult = await canManageUsers(2, 2, 'global_reader')
      expect(contributorResult).toBe(false)

      vi.mocked(db.get).mockResolvedValueOnce({ role: 'reader' })
      const readerResult = await canManageUsers(3, 3, 'global_reader')
      expect(readerResult).toBe(false)
    })
  })

  describe('parameter variations', () => {
    it('handles different userId and projectId combinations', async () => {
      vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })

      await canManageUsers(1, 100, 'global_reader')
      expect(vi.mocked(db.get)).toHaveBeenCalledWith(
        expect.any(String),
        1,
        100
      )

      vi.resetAllMocks()
      vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })

      await canManageUsers(999, 1, 'global_reader')
      expect(vi.mocked(db.get)).toHaveBeenCalledWith(
        expect.any(String),
        999,
        1
      )
    })
  })
})

describe('cross-function behavior', () => {
  it('canWrite and canManageUsers both query DB when not super_admin', async () => {
    vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })

    await canWrite(1, 1, 'global_reader')
    expect(vi.mocked(db.get)).toHaveBeenCalledTimes(1)

    vi.resetAllMocks()
    vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })

    await canManageUsers(1, 1, 'global_reader')
    expect(vi.mocked(db.get)).toHaveBeenCalledTimes(1)
  })

  it('project_admin passes both canWrite and canManageUsers checks', async () => {
    vi.mocked(db.get).mockResolvedValue({ role: 'project_admin' })

    const writeResult = await canWrite(1, 1, 'global_reader')
    const manageResult = await canManageUsers(1, 1, 'global_reader')

    expect(writeResult).toBe(true)
    expect(manageResult).toBe(true)
  })

  it('contributor passes canWrite but fails canManageUsers', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })
    const writeResult = await canWrite(1, 1, 'global_reader')
    expect(writeResult).toBe(true)

    vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })
    const manageResult = await canManageUsers(1, 1, 'global_reader')
    expect(manageResult).toBe(false)
  })
})
