import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../api'
import { useAuthStore } from '../store/authStore'
import type { User } from '../types'
import ProjectAccessModal from '../components/ProjectAccessModal'

type Tab = 'users'

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'global_reader' | 'super_admin'>('global_reader')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await api.users.create({ email, display_name: displayName, password, role } as Parameters<typeof api.users.create>[0])
      onCreated(user)
      toast.success(`User ${displayName} created`)
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Create User</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Display name</label>
            <input type="text" required value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Password (min 8 chars)</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7a10.05 10.05 0 011.875.175M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.364-4.364l-14.728 14.728" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as 'global_reader' | 'super_admin')} className={inputCls}>
              <option value="global_reader">Global Reader</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 text-sm text-slate-400 py-2 hover:text-slate-200">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2">
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [projectAccessTarget, setProjectAccessTarget] = useState<User | null>(null)
  const currentUser = useAuthStore(s => s.user)

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleActive(user: User) {
    try {
      const updated = await api.users.update(user.id, { is_active: !user.is_active })
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
      toast.success(updated.is_active ? 'User activated' : 'User deactivated')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user')
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Soft-delete ${user.display_name}? They will no longer be able to log in, but their history is preserved.`)) return
    try {
      await api.users.delete(user.id)
      setUsers(prev => prev.filter(u => u.id !== user.id))
      toast.success(`${user.display_name} deleted`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  async function handleRoleChange(user: User, role: 'global_reader' | 'super_admin') {
    try {
      const updated = await api.users.update(user.id, { role })
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
      toast.success('Role updated')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg px-4 py-2">
          + New user
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name / Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map(user => (
              <tr key={user.id} className="bg-slate-900 hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <p className="text-slate-100 font-medium">{user.display_name}</p>
                  <p className="text-slate-500 text-xs">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  {user.id === currentUser?.id ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                      {user.role === 'super_admin' ? 'Super Admin' : 'Global Reader'}
                    </span>
                  ) : (
                    <select
                      value={user.role}
                      onChange={e => handleRoleChange(user, e.target.value as 'global_reader' | 'super_admin')}
                      className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="global_reader">Global Reader</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${user.is_active ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  {user.id !== currentUser?.id && (
                    <>
                      <button
                        onClick={() => setProjectAccessTarget(user)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-700"
                        title="Manage project access"
                      >
                        Project Access
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-700"
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-slate-700"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={user => setUsers(prev => [user, ...prev])}
        />
      )}

      {projectAccessTarget && (
        <ProjectAccessModal
          user={projectAccessTarget}
          onClose={() => setProjectAccessTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate()
  const { user, isSuperAdmin } = useAuthStore()
  const [activeTab] = useState<Tab>('users')

  // Redirect non-super_admin users
  useEffect(() => {
    if (user && !isSuperAdmin()) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, isSuperAdmin, navigate])

  if (!user || !isSuperAdmin()) return null

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button onClick={() => navigate(-1)} className="text-sm text-slate-400 hover:text-slate-200 mb-3">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-slate-100">Admin Panel</h1>
          <p className="text-slate-400 text-sm mt-1">Manage users and organization settings</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 mb-6">
          <button className="px-4 py-2.5 text-sm font-medium border-b-2 border-indigo-500 text-indigo-400">
            Users
          </button>
        </div>

        {activeTab === 'users' && <UsersTab />}
      </div>
    </div>
  )
}
