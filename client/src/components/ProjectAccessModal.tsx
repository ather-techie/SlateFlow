import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../api'
import type { User } from '../types'

type ProjectRole = 'project_admin' | 'contributor' | 'reader'

interface ProjectRow {
  project_id: number
  project_name: string
  role: ProjectRole | null
}

interface Props {
  user: User
  onClose: () => void
}


export default function ProjectAccessModal({ user, onClose }: Props) {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  useEffect(() => {
    api.users.projectAccess(user.id)
      .then(setRows)
      .catch(() => toast.error('Failed to load project access'))
      .finally(() => setLoading(false))
  }, [user.id])

  async function handleRoleChange(projectId: number, currentRole: ProjectRole | null, newValue: string) {
    const newRole = newValue === '' ? null : (newValue as ProjectRole)
    setSaving(prev => ({ ...prev, [projectId]: true }))
    try {
      if (currentRole === null && newRole !== null) {
        await api.projectAccess.grant(projectId, { user_id: user.id, role: newRole })
        toast.success('Access granted')
      } else if (currentRole !== null && newRole !== null) {
        await api.projectAccess.update(projectId, user.id, { role: newRole })
        toast.success('Role updated')
      } else if (currentRole !== null && newRole === null) {
        await api.projectAccess.revoke(projectId, user.id)
        toast.success('Access revoked')
      }
      setRows(prev => prev.map(r => r.project_id === projectId ? { ...r, role: newRole } : r))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update access')
    } finally {
      setSaving(prev => ({ ...prev, [projectId]: false }))
    }
  }

  const selectCls = 'bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Project Access</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Managing access for <span className="text-slate-200 font-medium">{user.display_name}</span>
          </p>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm py-4 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No projects found</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {rows.map(row => (
              <div key={row.project_id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <span className="text-sm text-slate-200 truncate mr-3">{row.project_name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {saving[row.project_id] && (
                    <span className="text-xs text-slate-500">Saving…</span>
                  )}
                  <select
                    value={row.role ?? ''}
                    onChange={e => handleRoleChange(row.project_id, row.role, e.target.value)}
                    disabled={saving[row.project_id]}
                    className={selectCls}
                  >
                    <option value="">No Access</option>
                    <option value="project_admin">Project Admin</option>
                    <option value="contributor">Contributor</option>
                    <option value="reader">Reader</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-between items-center">
          <p className="text-xs text-slate-500">Changes save immediately per project</p>
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
