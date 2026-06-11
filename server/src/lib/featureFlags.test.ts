import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isEnabled, getAllFlags, setFlag } from './featureFlags'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('./oauth/google.js', () => ({
  google: {
    isConfigured: vi.fn(),
  },
}))

vi.mock('./oauth/github.js', () => ({
  github: {
    isConfigured: vi.fn(),
  },
}))

import { db } from '../db/index.js'
import { google } from './oauth/google.js'
import { github } from './oauth/github.js'

beforeEach(() => {
  vi.resetAllMocks()
  // Reset ALL FEATURE_* env vars to clean state
  const keys = Object.keys(process.env)
  for (const key of keys) {
    if (key.startsWith('FEATURE_')) {
      delete process.env[key]
    }
  }
})

describe('isEnabled', () => {
  describe('env var hard ceiling', () => {
    it('returns false immediately when env var is "false" (no DB query)', async () => {
      process.env.FEATURE_AI = 'false'
      vi.mocked(db.get).mockResolvedValue(undefined)

      const result = await isEnabled('ai')

      expect(result).toBe(false)
      expect(db.get).not.toHaveBeenCalled()
    })

    it('env var "false" takes precedence over DB override', async () => {
      process.env.FEATURE_AI = 'false'
      vi.mocked(db.get).mockResolvedValue({ enabled: 1 })

      const result = await isEnabled('ai')

      expect(result).toBe(false)
    })
  })

  describe('DB override enabled', () => {
    it('returns true when DB row has enabled=1', async () => {
      delete process.env.FEATURE_AI
      vi.mocked(db.get).mockResolvedValue({ enabled: 1 })
      vi.mocked(google.isConfigured).mockReturnValue(true)
      vi.mocked(github.isConfigured).mockReturnValue(true)

      const result = await isEnabled('ai')

      expect(result).toBe(true)
      expect(db.get).toHaveBeenCalledWith(
        'SELECT enabled FROM feature_overrides WHERE flag = ?',
        'ai'
      )
    })

    it('returns false when DB row has enabled=0', async () => {
      delete process.env.FEATURE_AI
      vi.mocked(db.get).mockResolvedValue({ enabled: 0 })

      const result = await isEnabled('ai')

      expect(result).toBe(false)
    })
  })

  describe('no DB row, fallback to env var', () => {
    it('returns true when no DB row and env var is "true"', async () => {
      process.env.FEATURE_AI = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)
      vi.mocked(google.isConfigured).mockReturnValue(true)
      vi.mocked(github.isConfigured).mockReturnValue(true)

      const result = await isEnabled('ai')

      expect(result).toBe(true)
    })

    it('returns false when no DB row and env var is absent', async () => {
      delete process.env.FEATURE_AI
      vi.mocked(db.get).mockResolvedValue(undefined)

      const result = await isEnabled('ai')

      expect(result).toBe(false)
    })

    it('returns false when no DB row and env var is "false"', async () => {
      process.env.FEATURE_AI = 'false'
      vi.mocked(db.get).mockResolvedValue(undefined)

      const result = await isEnabled('ai')

      expect(result).toBe(false)
    })
  })

  describe('auth_google special gate', () => {
    it('returns false when flag enabled but google.isConfigured()=false', async () => {
      process.env.FEATURE_AUTH_GOOGLE = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)
      vi.mocked(google.isConfigured).mockReturnValue(false)

      const result = await isEnabled('auth_google')

      expect(result).toBe(false)
    })

    it('returns true when flag enabled and google.isConfigured()=true', async () => {
      process.env.FEATURE_AUTH_GOOGLE = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)
      vi.mocked(google.isConfigured).mockReturnValue(true)

      const result = await isEnabled('auth_google')

      expect(result).toBe(true)
    })

    it('DB override enabled but google.isConfigured()=false → false', async () => {
      delete process.env.FEATURE_AUTH_GOOGLE
      vi.mocked(db.get).mockResolvedValue({ enabled: 1 })
      vi.mocked(google.isConfigured).mockReturnValue(false)

      const result = await isEnabled('auth_google')

      expect(result).toBe(false)
    })
  })

  describe('auth_github special gate', () => {
    it('returns false when flag enabled but github.isConfigured()=false', async () => {
      process.env.FEATURE_AUTH_GITHUB = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)
      vi.mocked(github.isConfigured).mockReturnValue(false)

      const result = await isEnabled('auth_github')

      expect(result).toBe(false)
    })

    it('returns true when flag enabled and github.isConfigured()=true', async () => {
      process.env.FEATURE_AUTH_GITHUB = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)
      vi.mocked(github.isConfigured).mockReturnValue(true)

      const result = await isEnabled('auth_github')

      expect(result).toBe(true)
    })
  })

  describe('non-gated flags', () => {
    it('does not call google.isConfigured() for non-auth_google flags', async () => {
      process.env.FEATURE_AI = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)

      await isEnabled('ai')

      expect(google.isConfigured).not.toHaveBeenCalled()
    })

    it('does not call github.isConfigured() for non-auth_github flags', async () => {
      process.env.FEATURE_EMAIL_NOTIFICATIONS = 'true'
      vi.mocked(db.get).mockResolvedValue(undefined)

      await isEnabled('email_notifications')

      expect(github.isConfigured).not.toHaveBeenCalled()
    })
  })

  describe('DB queries', () => {
    it('queries DB with correct flag name (uppercased env var)', async () => {
      process.env.FEATURE_AUTO_TEST_CASE_GENERATION_AI = 'false'
      vi.mocked(db.get).mockResolvedValue(undefined)

      await isEnabled('auto_test_case_generation_ai')

      // Even though env var is false, it should short-circuit and not query DB
      expect(db.get).not.toHaveBeenCalled()
    })

    it('queries DB when env var is not explicitly "false"', async () => {
      delete process.env.FEATURE_AI
      vi.mocked(db.get).mockResolvedValue({ enabled: 1 })

      await isEnabled('ai')

      expect(db.get).toHaveBeenCalledWith(
        'SELECT enabled FROM feature_overrides WHERE flag = ?',
        'ai'
      )
    })
  })
})

describe('getAllFlags', () => {
  it('returns an object with all 21 known flags', async () => {
    const allFlags = [
      'ai',
      'auto_test_case_generation_ai',
      'auto_story_generation_ai',
      'retrospective',
      'calendar',
      'auth_password',
      'auth_google',
      'auth_github',
      'github_integration',
      'gitlab_integration',
      'email_notifications',
      'card_attachments',
      'read_mcp',
      'create_mcp',
      'update_mcp',
      'delete_mcp',
      'report_mcp',
      'ai_ceremony_digests',
      'ai_writing_assist',
      'ai_planning_assist',
      'ai_project_chat',
    ]

    vi.mocked(db.get).mockResolvedValue(undefined)
    vi.mocked(google.isConfigured).mockReturnValue(true)
    vi.mocked(github.isConfigured).mockReturnValue(true)

    const result = await getAllFlags()

    expect(Object.keys(result).sort()).toEqual(allFlags.sort())
  })

  it('returns all flags with false value when no overrides and no env vars', async () => {
    const allFlags = [
      'ai',
      'auto_test_case_generation_ai',
      'auto_story_generation_ai',
      'retrospective',
      'calendar',
      'auth_password',
      'auth_google',
      'auth_github',
      'github_integration',
      'gitlab_integration',
      'email_notifications',
      'card_attachments',
      'read_mcp',
      'create_mcp',
      'update_mcp',
      'delete_mcp',
      'report_mcp',
      'ai_ceremony_digests',
      'ai_writing_assist',
      'ai_planning_assist',
      'ai_project_chat',
    ]

    vi.mocked(db.get).mockResolvedValue(undefined)
    vi.mocked(google.isConfigured).mockReturnValue(false)
    vi.mocked(github.isConfigured).mockReturnValue(false)

    const result = await getAllFlags()

    allFlags.forEach((flag) => {
      expect(result[flag]).toBe(false)
    })
  })

  it('calls isEnabled for each flag in parallel', async () => {
    vi.mocked(db.get).mockResolvedValue(undefined)
    vi.mocked(google.isConfigured).mockReturnValue(false)
    vi.mocked(github.isConfigured).mockReturnValue(false)

    await getAllFlags()

    // DB.get should be called once per flag (21 times)
    // Each call checks the DB, so we expect 21 calls total
    expect(vi.mocked(db.get).mock.calls.length).toBe(21)
  })

  it('returns record with correct flag values mixed true and false', async () => {
    vi.mocked(db.get).mockImplementation((_query, flag) => {
      // Simulate some flags being enabled via DB override
      if (flag === 'ai' || flag === 'email_notifications') {
        return Promise.resolve({ enabled: 1 })
      }
      return Promise.resolve(undefined)
    })

    process.env.FEATURE_AUTH_PASSWORD = 'true'
    vi.mocked(google.isConfigured).mockReturnValue(false)
    vi.mocked(github.isConfigured).mockReturnValue(false)

    const result = await getAllFlags()

    expect(result.ai).toBe(true)
    expect(result.email_notifications).toBe(true)
    expect(result.auth_password).toBe(true)
    expect(result.calendar).toBe(false)
    expect(result.github_integration).toBe(false)
  })
})

describe('setFlag', () => {
  it('calls db.run with correct upsert SQL and parameters', async () => {
    await setFlag('ai', true, 123)

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO feature_overrides'),
      'ai',
      1,
      123
    )
  })

  it('converts enabled=true to 1 and enabled=false to 0', async () => {
    await setFlag('ai', true, 1)
    const trueCall = vi.mocked(db.run).mock.calls[0]
    expect(trueCall[2]).toBe(1)

    vi.resetAllMocks()

    await setFlag('calendar', false, 2)
    const falseCall = vi.mocked(db.run).mock.calls[0]
    expect(falseCall[2]).toBe(0)
  })

  it('passes correct flag name to db.run', async () => {
    await setFlag('email_notifications', true, 456)

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.any(String),
      'email_notifications',
      expect.any(Number),
      expect.any(Number)
    )
  })

  it('passes correct userId to db.run', async () => {
    await setFlag('ai', true, 789)

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      789
    )
  })

  it('includes ON CONFLICT clause for upsert behavior', async () => {
    await setFlag('ai', true, 1)

    const sqlCall = vi.mocked(db.run).mock.calls[0][0]
    expect(sqlCall).toContain('ON CONFLICT(flag)')
    expect(sqlCall).toContain('DO UPDATE SET')
  })

  it('sets updated_at to datetime("now")', async () => {
    await setFlag('ai', true, 1)

    const sqlCall = vi.mocked(db.run).mock.calls[0][0]
    expect(sqlCall).toContain(`datetime('now')`)
  })

  it('works with all known feature flags', async () => {
    const flags = [
      'ai',
      'auto_test_case_generation_ai',
      'auto_story_generation_ai',
      'retrospective',
      'calendar',
      'auth_password',
      'auth_google',
      'auth_github',
      'github_integration',
      'gitlab_integration',
      'email_notifications',
      'card_attachments',
      'read_mcp',
      'create_mcp',
      'update_mcp',
      'delete_mcp',
      'report_mcp',
      'ai_ceremony_digests',
      'ai_writing_assist',
      'ai_planning_assist',
      'ai_project_chat',
    ]

    for (const flag of flags) {
      vi.resetAllMocks()
      await setFlag(flag, true, 1)
      expect(vi.mocked(db.run)).toHaveBeenCalledWith(
        expect.any(String),
        flag,
        expect.any(Number),
        expect.any(Number)
      )
    }
  })
})
