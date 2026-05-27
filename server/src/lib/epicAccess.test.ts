import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getUserEpicRole, canRead, canWrite, canManageUsers } from './epicAccess'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
  },
}))

import { db } from '../db/index.js'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getUserEpicRole', () => {
  describe('default epic', () => {
    it('returns "contributor" for default epic without querying epic_access', async () => {
      // First call to isDefaultEpic queries epics table
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })

      const result = await getUserEpicRole(1, 1)

      expect(result).toBe('contributor')
      // Only one DB call (for epics table, not epic_access)
      expect(vi.mocked(db.get)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(db.get)).toHaveBeenCalledWith(
        'SELECT is_default FROM epics WHERE id = ?',
        1
      )
    })

    it('returns "contributor" consistently for default epic', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })
      const result1 = await getUserEpicRole(1, 1)

      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })
      const result2 = await getUserEpicRole(999, 999)

      expect(result1).toBe('contributor')
      expect(result2).toBe('contributor')
    })

    it('default epic returns "contributor" regardless of userId', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })
      const result = await getUserEpicRole(999, 1)
      expect(result).toBe('contributor')
    })
  })

  describe('non-default epic with epic_access row', () => {
    it('returns epic_admin role when user has epic_admin in epic_access', async () => {
      // First call: epics table
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      // Second call: epic_access table
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'epic_admin' })

      const result = await getUserEpicRole(1, 1)

      expect(result).toBe('epic_admin')
      expect(vi.mocked(db.get)).toHaveBeenCalledTimes(2)
    })

    it('returns contributor role when user has contributor in epic_access', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })

      const result = await getUserEpicRole(1, 1)

      expect(result).toBe('contributor')
    })

    it('returns reader role when user has reader in epic_access', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'reader' })

      const result = await getUserEpicRole(1, 1)

      expect(result).toBe('reader')
    })

    it('queries both epics and epic_access tables', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ is_default: 0 })
        .mockResolvedValueOnce({ role: 'epic_admin' })

      await getUserEpicRole(123, 456)

      expect(vi.mocked(db.get)).toHaveBeenNthCalledWith(
        1,
        'SELECT is_default FROM epics WHERE id = ?',
        456
      )
      expect(vi.mocked(db.get)).toHaveBeenNthCalledWith(
        2,
        'SELECT role FROM epic_access WHERE user_id = ? AND epic_id = ?',
        123,
        456
      )
    })
  })

  describe('non-default epic without epic_access row', () => {
    it('returns null when no epic_access row exists', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce(undefined)

      const result = await getUserEpicRole(1, 1)

      expect(result).toBeNull()
    })

    it('returns null when epic_access returns null', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce(null)

      const result = await getUserEpicRole(1, 1)

      expect(result).toBeNull()
    })
  })
})

describe('canRead', () => {
  describe('super_admin role', () => {
    it('returns true for super_admin without DB query', async () => {
      const result = await canRead(1, 1, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })

    it('super_admin bypasses all role checks', async () => {
      vi.mocked(db.get).mockResolvedValue(undefined)
      const result = await canRead(999, 999, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })
  })

  describe('user with role', () => {
    it('returns true when user has any role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'epic_admin' })

      const result = await canRead(1, 1, 'global_reader')

      expect(result).toBe(true)
    })

    it('returns true for default epic (which grants contributor)', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })

      const result = await canRead(1, 1, 'global_reader')

      expect(result).toBe(true)
    })

    it('returns true for any non-null role (epic_admin, contributor, reader)', async () => {
      const roles = ['epic_admin', 'contributor', 'reader']

      for (const role of roles) {
        vi.resetAllMocks()
        vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
        vi.mocked(db.get).mockResolvedValueOnce({ role })

        const result = await canRead(1, 1, 'global_reader')
        expect(result).toBe(true)
      }
    })
  })

  describe('user without role', () => {
    it('returns false when no epic_access row exists', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce(undefined)

      const result = await canRead(1, 1, 'global_reader')

      expect(result).toBe(false)
    })
  })
})

describe('canWrite', () => {
  describe('super_admin role', () => {
    it('returns true for super_admin without DB query', async () => {
      const result = await canWrite(1, 1, 'super_admin')
      expect(result).toBe(true)
      expect(vi.mocked(db.get)).not.toHaveBeenCalled()
    })
  })

  describe('epic_admin role', () => {
    it('returns true when user has epic_admin role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'epic_admin' })

      const result = await canWrite(1, 1, 'global_reader')

      expect(result).toBe(true)
    })
  })

  describe('contributor role', () => {
    it('returns true when user has contributor role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })

      const result = await canWrite(1, 1, 'global_reader')

      expect(result).toBe(true)
    })

    it('default epic grants contributor access for write', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })

      const result = await canWrite(1, 1, 'global_reader')

      expect(result).toBe(true)
    })
  })

  describe('reader role', () => {
    it('returns false when user has reader role only', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'reader' })

      const result = await canWrite(1, 1, 'global_reader')

      expect(result).toBe(false)
    })
  })

  describe('no role', () => {
    it('returns false when no epic_access row exists', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce(undefined)

      const result = await canWrite(1, 1, 'global_reader')

      expect(result).toBe(false)
    })
  })

  describe('role strictness', () => {
    it('allows epic_admin and contributor but not reader', async () => {
      const allowedRoles = ['epic_admin', 'contributor']
      const deniedRoles = ['reader']

      for (const role of allowedRoles) {
        vi.resetAllMocks()
        vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
        vi.mocked(db.get).mockResolvedValueOnce({ role })
        const result = await canWrite(1, 1, 'global_reader')
        expect(result).toBe(true)
      }

      for (const role of deniedRoles) {
        vi.resetAllMocks()
        vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
        vi.mocked(db.get).mockResolvedValueOnce({ role })
        const result = await canWrite(1, 1, 'global_reader')
        expect(result).toBe(false)
      }
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
  })

  describe('epic_admin role', () => {
    it('returns true when user has epic_admin role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'epic_admin' })

      const result = await canManageUsers(1, 1, 'global_reader')

      expect(result).toBe(true)
    })
  })

  describe('contributor role', () => {
    it('returns false when user has contributor role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })

      const result = await canManageUsers(1, 1, 'global_reader')

      expect(result).toBe(false)
    })

    it('default epic grants contributor but not user management', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })

      const result = await canManageUsers(1, 1, 'global_reader')

      expect(result).toBe(false)
    })
  })

  describe('reader role', () => {
    it('returns false when user has reader role', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'reader' })

      const result = await canManageUsers(1, 1, 'global_reader')

      expect(result).toBe(false)
    })
  })

  describe('no role', () => {
    it('returns false when no epic_access row exists', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce(undefined)

      const result = await canManageUsers(1, 1, 'global_reader')

      expect(result).toBe(false)
    })
  })

  describe('role strictness', () => {
    it('only allows epic_admin (not contributor or reader)', async () => {
      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'epic_admin' })
      const adminResult = await canManageUsers(1, 1, 'global_reader')
      expect(adminResult).toBe(true)

      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'contributor' })
      const contributorResult = await canManageUsers(2, 2, 'global_reader')
      expect(contributorResult).toBe(false)

      vi.mocked(db.get).mockResolvedValueOnce({ is_default: 0 })
      vi.mocked(db.get).mockResolvedValueOnce({ role: 'reader' })
      const readerResult = await canManageUsers(3, 3, 'global_reader')
      expect(readerResult).toBe(false)
    })
  })

  describe('queries', () => {
    it('queries both epics and epic_access tables', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ is_default: 0 })
        .mockResolvedValueOnce({ role: 'epic_admin' })

      await canManageUsers(123, 456, 'global_reader')

      expect(vi.mocked(db.get)).toHaveBeenNthCalledWith(
        1,
        'SELECT is_default FROM epics WHERE id = ?',
        456
      )
      expect(vi.mocked(db.get)).toHaveBeenNthCalledWith(
        2,
        'SELECT role FROM epic_access WHERE user_id = ? AND epic_id = ?',
        123,
        456
      )
    })
  })
})

describe('cross-function behavior', () => {
  it('all functions check getUserEpicRole (which checks default epic first)', async () => {
    // Default epic should grant contributor to all operations
    vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })
    const readResult = await canRead(1, 1, 'global_reader')

    vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })
    const writeResult = await canWrite(1, 1, 'global_reader')

    vi.mocked(db.get).mockResolvedValueOnce({ is_default: 1 })
    const manageResult = await canManageUsers(1, 1, 'global_reader')

    expect(readResult).toBe(true)
    expect(writeResult).toBe(true)
    expect(manageResult).toBe(false) // contributor doesn't allow management
  })

  it('epic_admin passes all three checks', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ is_default: 0 })
      .mockResolvedValueOnce({ role: 'epic_admin' })

    const readResult = await canRead(1, 1, 'global_reader')
    expect(readResult).toBe(true)

    vi.mocked(db.get)
      .mockResolvedValueOnce({ is_default: 0 })
      .mockResolvedValueOnce({ role: 'epic_admin' })

    const writeResult = await canWrite(1, 1, 'global_reader')
    expect(writeResult).toBe(true)

    vi.mocked(db.get)
      .mockResolvedValueOnce({ is_default: 0 })
      .mockResolvedValueOnce({ role: 'epic_admin' })

    const manageResult = await canManageUsers(1, 1, 'global_reader')
    expect(manageResult).toBe(true)
  })

  it('reader can read but not write or manage', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ is_default: 0 })
      .mockResolvedValueOnce({ role: 'reader' })

    const readResult = await canRead(1, 1, 'global_reader')
    expect(readResult).toBe(true)

    vi.mocked(db.get)
      .mockResolvedValueOnce({ is_default: 0 })
      .mockResolvedValueOnce({ role: 'reader' })

    const writeResult = await canWrite(1, 1, 'global_reader')
    expect(writeResult).toBe(false)

    vi.mocked(db.get)
      .mockResolvedValueOnce({ is_default: 0 })
      .mockResolvedValueOnce({ role: 'reader' })

    const manageResult = await canManageUsers(1, 1, 'global_reader')
    expect(manageResult).toBe(false)
  })
})
