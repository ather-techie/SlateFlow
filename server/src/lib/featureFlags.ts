import { db } from '../db/index.js'
import { google } from './oauth/google.js'
import { github } from './oauth/github.js'

export type FeatureFlag =
  | 'ai'
  | 'auto_test_case_generation_ai'
  | 'auto_story_generation_ai'
  | 'retrospective'
  | 'calendar'
  | 'auth_password'
  | 'auth_google'
  | 'auth_github'
  | 'github_integration'
  | 'gitlab_integration'
  | 'email_notifications'
  | 'card_attachments'

const KNOWN_FLAGS: FeatureFlag[] = [
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
]

interface OverrideRow {
  enabled: number
}

async function isEnabled(flag: FeatureFlag): Promise<boolean> {
  const envKey = `FEATURE_${flag.toUpperCase()}`
  const envVal = process.env[envKey]
  if (envVal === 'false') return false
  const row = await db.get<OverrideRow>(
    'SELECT enabled FROM feature_overrides WHERE flag = ?',
    flag
  )
  const flagOn = row !== undefined ? row.enabled === 1 : envVal === 'true'
  if (!flagOn) return false

  if (flag === 'auth_google' && !google.isConfigured()) return false
  if (flag === 'auth_github' && !github.isConfigured()) return false

  return true
}

async function getAllFlags(): Promise<Record<FeatureFlag, boolean>> {
  const result = {} as Record<FeatureFlag, boolean>
  await Promise.all(KNOWN_FLAGS.map(async (flag) => {
    result[flag] = await isEnabled(flag)
  }))
  return result
}

async function setFlag(flag: FeatureFlag, enabled: boolean, userId: number): Promise<void> {
  await db.run(
    `INSERT INTO feature_overrides (flag, enabled, updated_by, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(flag) DO UPDATE SET
       enabled    = excluded.enabled,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    flag,
    enabled ? 1 : 0,
    userId
  )
}

export { isEnabled, getAllFlags, setFlag }
