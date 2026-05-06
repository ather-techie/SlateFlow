import { db } from '../db/index.js'

type ProjectRole = 'project_admin' | 'contributor' | 'reader'

async function getUserProjectRole(userId: number, projectId: number): Promise<ProjectRole | null> {
  const row = await db.get<{ role: ProjectRole }>(
    'SELECT role FROM project_access WHERE user_id = ? AND project_id = ?',
    userId, projectId,
  )
  return row?.role ?? null
}

export function canRead(): boolean {
  return true // all authenticated users can read all projects
}

export async function canWrite(userId: number, projectId: number, userGlobalRole: string): Promise<boolean> {
  if (userGlobalRole === 'super_admin') return true
  const role = await getUserProjectRole(userId, projectId)
  return role === 'project_admin' || role === 'contributor'
}

export async function canManageUsers(userId: number, projectId: number, userGlobalRole: string): Promise<boolean> {
  if (userGlobalRole === 'super_admin') return true
  const role = await getUserProjectRole(userId, projectId)
  return role === 'project_admin'
}
