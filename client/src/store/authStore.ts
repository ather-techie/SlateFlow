import { create } from 'zustand'
import type { AuthUser } from '../types'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
  isSuperAdmin: () => boolean
  canReadProject: (projectId: number) => boolean
  canWriteProject: (projectId: number) => boolean
  canManageProject: (projectId: number) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  logout: () => set({ user: null, loading: false }),

  isSuperAdmin: () => get().user?.role === 'super_admin',

  canReadProject: (_projectId: number) => {
    const u = get().user
    if (!u) return false
    return true // super_admin and global_reader can read all projects
  },

  canWriteProject: (projectId: number) => {
    const u = get().user
    if (!u) return false
    if (u.role === 'super_admin') return true
    const row = u.project_access.find(a => a.project_id === projectId)
    return row?.role === 'project_admin' || row?.role === 'contributor'
  },

  canManageProject: (projectId: number) => {
    const u = get().user
    if (!u) return false
    if (u.role === 'super_admin') return true
    return u.project_access.some(a => a.project_id === projectId && a.role === 'project_admin')
  },
}))
