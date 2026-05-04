import { db } from '../db/index.js'

export type EpicRole = 'epic_admin' | 'contributor' | 'reader'

function isDefaultEpic(epicId: number): boolean {
  const row = db.prepare('SELECT is_default FROM epics WHERE id = ?').get(epicId) as { is_default: number } | undefined
  return row?.is_default === 1
}

export function getUserEpicRole(userId: number, epicId: number): EpicRole | null {
  // All users automatically have contributor access to the Default Epic
  if (isDefaultEpic(epicId)) return 'contributor'
  const row = db.prepare(
    'SELECT role FROM epic_access WHERE user_id = ? AND epic_id = ?'
  ).get(userId, epicId) as { role: EpicRole } | undefined
  return row?.role ?? null
}

export function canRead(userId: number, epicId: number, userGlobalRole: string): boolean {
  if (userGlobalRole === 'super_admin') return true
  return getUserEpicRole(userId, epicId) !== null
}

export function canWrite(userId: number, epicId: number, userGlobalRole: string): boolean {
  if (userGlobalRole === 'super_admin') return true
  const role = getUserEpicRole(userId, epicId)
  return role === 'epic_admin' || role === 'contributor'
}

export function canManageUsers(userId: number, epicId: number, userGlobalRole: string): boolean {
  if (userGlobalRole === 'super_admin') return true
  const role = getUserEpicRole(userId, epicId)
  return role === 'epic_admin'
}
