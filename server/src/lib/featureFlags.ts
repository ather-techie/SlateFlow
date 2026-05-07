import { db } from '../db/index.js'

export type FeatureFlag = 'ai'

const KNOWN_FLAGS: FeatureFlag[] = ['ai']

interface OverrideRow {
  enabled: number
}

async function isEnabled(flag: FeatureFlag): Promise<boolean> {
  const envKey = `FEATURE_${flag.toUpperCase()}`
  if (process.env[envKey] !== 'true') return false
  const row = await db.get<OverrideRow>(
    'SELECT enabled FROM feature_overrides WHERE flag = ?',
    flag
  )
  if (row !== undefined) return row.enabled === 1
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
