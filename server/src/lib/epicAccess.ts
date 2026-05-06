import { db } from '../db/index.js'

export type EpicRole = 'epic_admin' | 'contributor' | 'reader'

async function isDefaultEpic(epicId: number): Promise<boolean> {
  const row = await db.get<{ is_default: number }>('SELECT is_default FROM epics WHERE id = ?', epicId)
  return row?.is_default === 1
}

export async function getUserEpicRole(userId: number, epicId: number): Promise<EpicRole | null> {
  if (await isDefaultEpic(epicId)) return 'contributor'
  const row = await db.get<{ role: EpicRole }>(
    'SELECT role FROM epic_access WHERE user_id = ? AND epic_id = ?',
    userId, epicId,
  )
  return row?.role ?? null
}

export async function canRead(userId: number, epicId: number, userGlobalRole: string): Promise<boolean> {
  if (userGlobalRole === 'super_admin') return true
  return (await getUserEpicRole(userId, epicId)) !== null
}

export async function canWrite(userId: number, epicId: number, userGlobalRole: string): Promise<boolean> {
  if (userGlobalRole === 'super_admin') return true
  const role = await getUserEpicRole(userId, epicId)
  return role === 'epic_admin' || role === 'contributor'
}

export async function canManageUsers(userId: number, epicId: number, userGlobalRole: string): Promise<boolean> {
  if (userGlobalRole === 'super_admin') return true
  const role = await getUserEpicRole(userId, epicId)
  return role === 'epic_admin'
}
