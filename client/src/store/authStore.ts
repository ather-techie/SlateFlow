import { create } from 'zustand'

export interface AuthUser {
  id: number
  email: string
  display_name: string
  role: 'super_admin' | 'member'
  epic_access: { epic_id: number; role: 'epic_admin' | 'contributor' | 'reader' }[]
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
  isSuperAdmin: () => boolean
  canReadEpic: (epicId: number) => boolean
  canWriteEpic: (epicId: number) => boolean
  canManageEpic: (epicId: number) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  logout: () => set({ user: null, loading: false }),

  isSuperAdmin: () => get().user?.role === 'super_admin',

  canReadEpic: (epicId: number) => {
    const u = get().user
    if (!u) return false
    if (u.role === 'super_admin') return true
    return u.epic_access.some(a => a.epic_id === epicId)
  },

  canWriteEpic: (epicId: number) => {
    const u = get().user
    if (!u) return false
    if (u.role === 'super_admin') return true
    const row = u.epic_access.find(a => a.epic_id === epicId)
    return row?.role === 'epic_admin' || row?.role === 'contributor'
  },

  canManageEpic: (epicId: number) => {
    const u = get().user
    if (!u) return false
    if (u.role === 'super_admin') return true
    return u.epic_access.some(a => a.epic_id === epicId && a.role === 'epic_admin')
  },
}))
