import { create } from 'zustand'

export interface AuthUser {
  id: number
  email: string
  display_name: string
  role: 'super_admin' | 'global_reader'
  email_notifications?: boolean
  country?: string | null
  state?: string | null
  city?: string | null
  home_country?: string | null
  home_state?: string | null
  home_city?: string | null
  timezone?: string | null
  job_title?: string | null
  department?: string | null
  phone?: string | null
  gender?: string | null
  reporting_manager_id?: number | null
  reporting_manager?: { id: number; display_name: string } | null
  project_access: { project_id: number; role: 'project_admin' | 'contributor' | 'reader' }[]
}

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
