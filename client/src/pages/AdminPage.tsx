import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../api'
import { api as newApi } from '../api/index'
import { useAuthStore } from '../store/authStore'
import { useFeatureFlagStore } from '../store/featureFlagStore'
import type { CalendarHoliday, Project, User } from '../types'
import ProjectAccessModal from '../components/ProjectAccessModal'
import EntryFormModal, { type EntryEditing } from '../components/Calendar/EntryFormModal'

type Tab = 'users' | 'settings' | 'holidays'

type ProjectAssignment = { project_id: number; role: 'project_admin' | 'contributor' | 'reader' }

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'none' | 'global_reader' | 'super_admin'>('none')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([])

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {})
  }, [])

  function addAssignment() {
    const unused = projects.find(p => !assignments.some(a => a.project_id === p.id))
    if (!unused) return
    setAssignments(prev => [...prev, { project_id: unused.id, role: 'reader' }])
  }

  function updateAssignment(idx: number, patch: Partial<ProjectAssignment>) {
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a))
  }

  function removeAssignment(idx: number) {
    setAssignments(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const resolvedRole = role === 'none' ? 'global_reader' : role
      const user = await api.users.create({ email, display_name: displayName, password, role: resolvedRole } as Parameters<typeof api.users.create>[0])
      for (const a of assignments) {
        await api.projectAccess.grant(a.project_id, { user_id: user.id, role: a.role })
      }
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
  const selectSmCls = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            <select
              value={role}
              onChange={e => {
                const v = e.target.value as 'none' | 'global_reader' | 'super_admin'
                setRole(v)
                if (v === 'super_admin') setAssignments([])
              }}
              className={inputCls}
            >
              <option value="none">None</option>
              <option value="global_reader">Global Reader</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          {role === 'super_admin' ? (
            <p className="text-xs text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2">
              Super Admin has full access to all projects — no project assignment needed.
            </p>
          ) : role === 'none' || role === 'global_reader' ? (
            /* Project Access — only relevant for Global Reader */
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Project Access <span className="text-slate-600">(optional)</span></span>
                <button
                  type="button"
                  onClick={addAssignment}
                  disabled={projects.length === 0 || assignments.length >= projects.length}
                  className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Add project
                </button>
              </div>
              {assignments.length === 0 ? (
                <p className="text-xs text-slate-600">No project access assigned — user will have read-only access to all projects.</p>
              ) : (
                <div className="space-y-2">
                  {assignments.map((a, idx) => {
                    const availableProjects = projects.filter(
                      p => p.id === a.project_id || !assignments.some((x, i) => i !== idx && x.project_id === p.id)
                    )
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={a.project_id}
                          onChange={e => updateAssignment(idx, { project_id: Number(e.target.value) })}
                          className={`${selectSmCls} flex-1 min-w-0`}
                        >
                          {availableProjects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={a.role}
                          onChange={e => updateAssignment(idx, { role: e.target.value as ProjectAssignment['role'] })}
                          className={selectSmCls}
                        >
                          <option value="project_admin">Project Admin</option>
                          <option value="contributor">Contributor</option>
                          <option value="reader">Reader</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeAssignment(idx)}
                          className="text-slate-500 hover:text-red-400 text-sm leading-none px-1"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

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

// ─── Settings Tab ─────────────────────────────────────────────────────────────

interface FlagStatus {
  flag: string
  env_enabled: boolean
  can_toggle: boolean
  db_override: boolean | null
  resolved: boolean
}

function SettingsTab() {
  const [flags, setFlags] = useState<FlagStatus[]>([])
  const [loading, setLoading] = useState(true)
  const { setFlags: setStoreFlags } = useFeatureFlagStore()

  async function refetchFlags() {
    const res = await fetch('/api/admin/feature-overrides', { credentials: 'include' })
    const json = await res.json()
    if (json.data) setFlags(json.data)
  }

  useEffect(() => {
    refetchFlags()
      .catch(() => toast.error('Failed to load feature flags'))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(flag: string, newEnabled: boolean) {
    try {
      const res = await fetch(`/api/admin/feature-overrides/${flag}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setStoreFlags(json.data.features)
      await refetchFlags()
      toast.success(`Feature ${newEnabled ? 'enabled' : 'disabled'}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update feature flag')
    }
  }

  async function handleReset(flag: string) {
    try {
      const res = await fetch(`/api/admin/feature-overrides/${flag}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setStoreFlags(json.data.features)
      await refetchFlags()
      toast.success('Feature flag reset to default')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset feature flag')
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading…</p>

  const featureMeta: Record<string, { label: string; description: string }> = {
    ai: {
      label: 'AI Features',
      description: 'Enable AI-powered features such as card summarization, auto-prioritization, and natural-language search. Requires AI_PROVIDER and AI_API_KEY to be configured.',
    },
    retrospective: {
      label: 'Retrospective Board',
      description: 'Per-sprint retrospective with three columns (Went well / To improve / Action items). Drag-and-drop notes with live updates across users.',
    },
    calendar: {
      label: 'Calendar',
      description: 'Month view of sprints, epics, and features alongside user-managed holidays, project events, and vacations.',
    },
    auth_password: {
      label: 'Email/Password Login',
      description: 'Built-in email + password sign-in. Disable to require all users to authenticate via OAuth or SSO.',
    },
    auth_google: {
      label: 'Google Login',
      description: 'Sign-in with Google OAuth. Requires OAUTH_GOOGLE_CLIENT_ID and OAUTH_GOOGLE_CLIENT_SECRET to be configured.',
    },
    auth_github: {
      label: 'GitHub Login',
      description: 'Sign-in with GitHub OAuth. Requires OAUTH_GITHUB_CLIENT_ID and OAUTH_GITHUB_CLIENT_SECRET to be configured.',
    },
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Enterprise feature flags. Toggle flags here or set the environment variable to force a value.
      </p>
      {flags.map(f => {
        const meta = featureMeta[f.flag] ?? { label: f.flag, description: '' }
        const canToggle = f.can_toggle
        const isOn = f.resolved
        return (
          <div key={f.flag} className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-100">{meta.label}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${f.env_enabled ? 'bg-green-900/60 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                    FEATURE_{f.flag.toUpperCase()}={(f.env_enabled ? 'true' : 'false')}
                  </span>
                  {f.db_override !== null && (
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300">
                      DB override: {f.db_override ? 'on' : 'off'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{meta.description}</p>
                {!canToggle && (
                  <p className="text-xs text-amber-500 mt-1.5">
                    FEATURE_{f.flag.toUpperCase()}=false is set in your environment — this flag cannot be enabled here.
                  </p>
                )}
                {canToggle && !f.env_enabled && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    FEATURE_{f.flag.toUpperCase()} is not set — this toggle is the active control.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {f.db_override !== null && (
                  <button
                    onClick={() => handleReset(f.flag)}
                    className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors"
                    title="Clear DB override and revert to environment default"
                  >
                    Reset
                  </button>
                )}
                <button
                  disabled={!canToggle}
                  onClick={() => handleToggle(f.flag, !isOn)}
                  title={canToggle ? undefined : `FEATURE_${f.flag.toUpperCase()}=false prevents enabling this flag`}
                  className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                    isOn ? 'bg-indigo-600' : 'bg-slate-600'
                  } ${!canToggle ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Holidays Tab ─────────────────────────────────────────────────────────────

function HolidaysTab() {
  const calendarEnabled = useFeatureFlagStore(s => s.isEnabled('calendar'))
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; entry: EntryEditing } | null>(null)

  function loadHolidays() {
    if (!calendarEnabled) { setLoading(false); return }
    setLoading(true)
    const year = new Date().getFullYear()
    const from = `${year - 1}-01-01`
    const to   = `${year + 5}-12-31`
    // The read endpoint is project-scoped; we fetch the default project to obtain the global holidays list.
    api.getProjects()
      .then(projects => {
        const defaultProject = projects.find(p => p.is_default === 1) ?? projects[0]
        if (!defaultProject) {
          setHolidays([])
          return
        }
        return newApi.calendar.get(defaultProject.id, from, to).then(d => setHolidays(d.holidays))
      })
      .catch(() => toast.error('Failed to load holidays'))
      .finally(() => setLoading(false))
  }

  useEffect(loadHolidays, [calendarEnabled])

  if (!calendarEnabled) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 text-sm text-slate-400">
        Enable the <span className="font-semibold text-slate-200">Calendar</span> feature flag in Settings to manage holidays.
      </div>
    )
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''} (global)</p>
        <button onClick={() => setModal({ mode: 'create' })} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg px-4 py-2">
          + New holiday
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Start</th>
              <th className="text-left px-4 py-3">End</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {holidays.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No global holidays yet.</td>
              </tr>
            )}
            {holidays.map(h => (
              <tr key={h.id} className="bg-slate-900 hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <p className="text-slate-100 font-medium">{h.title}</p>
                  {h.description && <p className="text-slate-500 text-xs">{h.description}</p>}
                </td>
                <td className="px-4 py-3 text-slate-300">{h.start_date}</td>
                <td className="px-4 py-3 text-slate-300">{h.end_date}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setModal({ mode: 'edit', entry: {
                      id: h.id, kind: 'holiday', title: h.title, description: h.description,
                      start_date: h.start_date, end_date: h.end_date, color: h.color,
                    }})}
                    className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-700"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <EntryFormModal
          projectId={0}
          initialKind="holiday"
          allowedKinds={['holiday']}
          onClose={() => setModal(null)}
          onSaved={loadHolidays}
        />
      )}
      {modal?.mode === 'edit' && (
        <EntryFormModal
          projectId={0}
          editing={modal.entry}
          allowedKinds={['holiday']}
          canDelete
          onClose={() => setModal(null)}
          onSaved={loadHolidays}
          onDeleted={loadHolidays}
        />
      )}
    </div>
  )
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate()
  const { user, isSuperAdmin } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('users')

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
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'users' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'holidays' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Holidays
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'settings' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Settings
          </button>
        </div>

        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'holidays' && <HolidaysTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
