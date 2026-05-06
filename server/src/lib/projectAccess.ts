import { db } from '../db/index.js'

type ProjectRole = 'project_admin' | 'contributor' | 'reader'

function getUserProjectRole(userId: number, projectId: number): ProjectRole | null {
  const row = db.prepare(
    'SELECT role FROM project_access WHERE user_id = ? AND project_id = ?'
  ).get(userId, projectId) as { role: ProjectRole } | undefined
  return row?.role ?? null
}

export function canRead(): boolean {
  return true // all authenticated users can read all projects
}

export function canWrite(userId: number, projectId: number, userGlobalRole: string): boolean {
  if (userGlobalRole === 'super_admin') return true
  const role = getUserProjectRole(userId, projectId)
  return role === 'project_admin' || role === 'contributor'
}

export function canManageUsers(userId: number, projectId: number, userGlobalRole: string): boolean {
  if (userGlobalRole === 'super_admin') return true
  const role = getUserProjectRole(userId, projectId)
  return role === 'project_admin'
}
