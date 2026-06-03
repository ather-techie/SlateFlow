import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../api/index'
import { useAuthStore } from '../store/authStore'

type Tab = 'members' | 'settings' | 'lanes'

// ─── Tag Input Component ──────────────────────────────────────────────────────

function TagInput({ value, onChange, placeholder }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const t = input.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setInput('')
  }
  return (
    <div className="flex flex-wrap gap-1 p-2 bg-slate-800 border border-slate-700 rounded-lg min-h-[38px]">
      {value.map(t => (
        <span key={t} className="flex items-center gap-1 bg-indigo-900/50 text-indigo-300 text-xs px-2 py-0.5 rounded">
          {t}
          <button type="button" onClick={() => onChange(value.filter(x => x !== t))} className="text-indigo-400 hover:text-indigo-200 leading-none">×</button>
        </span>
      ))}
      <input
        value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={placeholder ?? 'Type and press Enter'}
        className="flex-1 min-w-[100px] bg-transparent text-xs text-slate-100 placeholder-slate-500 outline-none"
      />
    </div>
  )
}

// ─── Local Types ──────────────────────────────────────────────────────────────

interface ProjectAccessEntry {
  user_id: number
  display_name?: string
  email?: string
  role: 'project_admin' | 'contributor' | 'reader'
  skills?: string[]
  capacity?: number | null
}

interface Lane {
  id: number
  project_id: number
  name: string
  color: string
  position: number
  is_done_col: number
}

interface Project {
  id: number
  name: string
  description: string
  color: string
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ projectId, isSuperAdmin }: { projectId: number; isSuperAdmin: boolean }) {
  const [members, setMembers] = useState<ProjectAccessEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectAccessEntry | null>(null)
  const { user } = useAuthStore()

  useEffect(() => {
    loadMembers()
  }, [projectId])

  const loadMembers = async () => {
    setLoading(true)
    try {
      const data = await api.projectAccess.list(projectId)
      setMembers(data as ProjectAccessEntry[])
    } catch (err) {
      toast.error('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: number, newRole: 'project_admin' | 'contributor' | 'reader') => {
    try {
      await api.projectAccess.update(projectId, userId, { role: newRole })
      setMembers(members.map(m => m.user_id === userId ? { ...m, role: newRole } : m))
      toast.success('Role updated')
    } catch (err) {
      toast.error('Failed to update role')
    }
  }

  const handleRemove = async (userId: number) => {
    const member = members.find(m => m.user_id === userId)
    if (!member) return

    // Guard: cannot remove self
    if (user?.id === userId) {
      toast.error('Cannot remove yourself from the project')
      return
    }

    // Guard: cannot remove the last project_admin
    if (members.filter(m => m.role === 'project_admin').length === 1 && member.role === 'project_admin') {
      toast.error('Cannot remove the last project admin')
      return
    }

    try {
      await api.projectAccess.revoke(projectId, userId)
      setMembers(members.filter(m => m.user_id !== userId))
      toast.success('Member removed')
    } catch (err) {
      toast.error('Failed to remove member')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-100">Project Members</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          + Add Member
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading members…</div>
      ) : members.length === 0 ? (
        <div className="text-slate-400 text-sm">No members assigned yet.</div>
      ) : (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Name / Email</th>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Role</th>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Skills</th>
                <th className="px-4 py-3 text-left text-slate-300 font-medium">Capacity</th>
                <th className="px-4 py-3 text-right text-slate-300 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {members.map(member => (
                <tr key={member.user_id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-slate-100 font-medium">{member.display_name}</div>
                      <div className="text-slate-400 text-xs">{member.email}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user?.id === member.user_id ? (
                      <div className="inline-flex items-center gap-1">
                        <span className="text-slate-300 capitalize">{member.role}</span>
                        <span className="text-slate-500 text-xs ml-1">(your role)</span>
                      </div>
                    ) : member.role === 'project_admin' && !isSuperAdmin ? (
                      <span className="text-slate-400 capitalize">{member.role}</span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={e => handleRoleChange(member.user_id, e.target.value as any)}
                        className="bg-slate-700 text-slate-100 text-sm rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="reader">Reader</option>
                        <option value="contributor">Contributor</option>
                        <option value="project_admin" disabled={!isSuperAdmin} title={!isSuperAdmin ? 'Only super admins can assign Project Admin' : undefined}>
                          Project Admin
                        </option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {member.skills && member.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {member.skills.map(s => (
                          <span key={s} className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {member.capacity ? (
                      <span className="text-slate-300">{member.capacity} pts</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => setEditingMember(member)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-700"
                      title="Edit member"
                    >
                      Edit
                    </button>
                    {user?.id === member.user_id ? (
                      <span className="text-slate-500 text-sm font-medium cursor-not-allowed" title="You cannot remove yourself">Remove</span>
                    ) : member.role === 'project_admin' && !isSuperAdmin ? (
                      <span className="text-slate-500 text-sm font-medium cursor-not-allowed" title="Only super admins can remove project admins">Remove</span>
                    ) : (
                      <button
                        onClick={() => handleRemove(member.user_id)}
                        className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddMemberModal
          projectId={projectId}
          isSuperAdmin={isSuperAdmin}
          members={members}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false)
            loadMembers()
          }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          member={editingMember}
          projectId={projectId}
          onClose={() => setEditingMember(null)}
          onUpdated={() => {
            setEditingMember(null)
            loadMembers()
          }}
        />
      )}
    </div>
  )
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ projectId, isSuperAdmin, members, onClose, onAdded }: {
  projectId: number
  isSuperAdmin: boolean
  members: ProjectAccessEntry[]
  onClose: () => void
  onAdded: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<{ id: number; display_name: string; email: string } | null>(null)
  const [selectedRole, setSelectedRole] = useState<'reader' | 'contributor' | 'project_admin'>('contributor')
  const [skills, setSkills] = useState<string[]>([])
  const [capacity, setCapacity] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    try {
      const results = await api.users.search(q)
      const memberIds = new Set(members.map(m => m.user_id))
      const filtered = results.filter(
        u => u.role !== 'super_admin' && !memberIds.has(u.id)
      )
      setSearchResults(filtered)
    } catch (err) {
      toast.error('Search failed')
    }
  }

  const handleAdd = async () => {
    if (!selectedUser) return
    if (!isSuperAdmin && selectedRole === 'project_admin') {
      toast.error('Only super admins can assign Project Admin role')
      return
    }
    setLoading(true)
    try {
      await api.projectAccess.grant(projectId, {
        user_id: selectedUser.id,
        role: selectedRole,
        skills,
        capacity: capacity ? parseInt(capacity) : null
      })
      toast.success('Member added')
      onAdded()
    } catch (err: any) {
      if (err.message?.includes('409')) {
        toast.error('User already has access to this project')
      } else {
        toast.error('Failed to add member')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full border border-slate-700">
        <h4 className="text-lg font-semibold text-slate-100 mb-4">Add Member</h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Search User</label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="mt-2 border border-slate-700 rounded max-h-40 overflow-y-auto">
                {searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser({ id: user.id, display_name: user.display_name, email: user.email })
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors border-b border-slate-700 last:border-b-0"
                  >
                    <div className="font-medium">{user.display_name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedUser && (
            <div className="bg-slate-800 rounded p-3 text-sm">
              <div className="font-medium text-slate-100">{selectedUser.display_name}</div>
              <div className="text-slate-400">{selectedUser.email}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value as any)}
              className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 focus:border-indigo-500 focus:outline-none"
            >
              <option value="reader">Reader</option>
              <option value="contributor">Contributor</option>
              <option value="project_admin" disabled={!isSuperAdmin}>
                Project Admin
              </option>
            </select>
            {!isSuperAdmin && selectedRole === 'project_admin' && (
              <p className="text-xs text-slate-400 mt-1">Only super admins can assign Project Admin role</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Project Skills (optional)</label>
            <TagInput value={skills} onChange={setSkills} placeholder="e.g. Frontend, API — press Enter to add" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Capacity (story points/sprint)</label>
            <input
              type="number" min={0} max={9999} placeholder="Leave blank if unknown"
              value={capacity} onChange={e => setCapacity(e.target.value)}
              className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button
              onClick={onClose}
              className="px-3 py-2 text-slate-300 hover:text-slate-100 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedUser || loading}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 text-white font-medium rounded transition-colors"
            >
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Member Modal ────────────────────────────────────────────────────────

function EditMemberModal({ member, projectId, onClose, onUpdated }: {
  member: ProjectAccessEntry
  projectId: number
  onClose: () => void
  onUpdated: () => void
}) {
  const [skills, setSkills] = useState<string[]>(member.skills ?? [])
  const [capacity, setCapacity] = useState(member.capacity?.toString() ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      await api.projectAccess.update(projectId, member.user_id, {
        skills,
        capacity: capacity ? parseInt(capacity) : null
      })
      toast.success('Member updated')
      onUpdated()
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : 'Failed to update member')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full border border-slate-700" onClick={e => e.stopPropagation()}>
        <h4 className="text-lg font-semibold text-slate-100 mb-4">Edit Member — {member.display_name}</h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Project Skills (optional)</label>
            <TagInput value={skills} onChange={setSkills} placeholder="e.g. Frontend, API — press Enter to add" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Capacity (story points/sprint)</label>
            <input
              type="number" min={0} max={9999} placeholder="Leave blank if unknown"
              value={capacity} onChange={e => setCapacity(e.target.value)}
              className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <button
              onClick={onClose}
              className="px-3 py-2 text-slate-300 hover:text-slate-100 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 text-white font-medium rounded transition-colors"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ projectId, project, onUpdated }: {
  projectId: number
  project: Project | null
  onUpdated: (p: Project) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description)
      setColor(project.color)
    }
  }, [project])

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Project name is required')
      return
    }

    setSaving(true)
    try {
      const updated = await api.projects.update(projectId, { name, description, color })
      onUpdated(updated)
      toast.success('Project updated')
    } catch (err) {
      toast.error('Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Color</label>
        <div className="flex gap-3 items-center">
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-12 h-10 rounded border border-slate-700 cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={e => {
              if (/^#[0-9a-fA-F]{3,6}$/.test(e.target.value)) setColor(e.target.value)
            }}
            placeholder="#6366f1"
            className="flex-1 bg-slate-800 text-slate-100 border border-slate-700 rounded px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 text-white font-medium rounded transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Lanes Tab ────────────────────────────────────────────────────────────────

function LanesTab({ projectId }: { projectId: number }) {
  const [lanes, setLanes] = useState<Lane[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLaneName, setNewLaneName] = useState('')

  useEffect(() => {
    loadLanes()
  }, [projectId])

  const loadLanes = async () => {
    setLoading(true)
    try {
      const data = await api.lanes.list(projectId)
      setLanes(data)
    } catch (err) {
      toast.error('Failed to load lanes')
    } finally {
      setLoading(false)
    }
  }

  const handleEditSave = async (laneId: number) => {
    if (!editingName.trim()) {
      toast.error('Lane name is required')
      return
    }
    try {
      await api.lanes.update(laneId, { name: editingName })
      setLanes(lanes.map(l => l.id === laneId ? { ...l, name: editingName } : l))
      setEditingId(null)
      toast.success('Lane renamed')
    } catch (err) {
      toast.error('Failed to rename lane')
    }
  }

  const handleToggleDone = async (lane: Lane) => {
    try {
      const newValue = lane.is_done_col === 1 ? 0 : 1
      await api.lanes.update(lane.id, { is_done_col: newValue as any })
      setLanes(lanes.map(l => l.id === lane.id ? { ...l, is_done_col: newValue } : l))
      toast.success(`Lane ${lane.is_done_col === 1 ? 'unmarked' : 'marked'} as done column`)
    } catch (err) {
      toast.error('Failed to update lane')
    }
  }

  const handleReorder = async (fromIdx: number, toIdx: number) => {
    const newLanes = [...lanes]
    const [moved] = newLanes.splice(fromIdx, 1)
    newLanes.splice(toIdx, 0, moved)
    setLanes(newLanes)

    try {
      await api.lanes.reorder(projectId, newLanes.map(l => l.id))
      toast.success('Lanes reordered')
    } catch (err) {
      toast.error('Failed to reorder lanes')
      loadLanes()
    }
  }

  const handleDelete = async (laneId: number) => {
    try {
      await api.lanes.delete(laneId)
      setLanes(lanes.filter(l => l.id !== laneId))
      setConfirmDeleteId(null)
      toast.success('Lane deleted')
    } catch (err: any) {
      if (err.message?.includes('409')) {
        toast.error('Cannot delete lane with cards')
      } else {
        toast.error('Failed to delete lane')
      }
    }
  }

  const handleAddLane = async () => {
    if (!newLaneName.trim()) {
      toast.error('Lane name is required')
      return
    }
    try {
      const newLane = await api.lanes.create(projectId, { name: newLaneName })
      setLanes([...lanes, newLane])
      setNewLaneName('')
      setShowAddForm(false)
      toast.success('Lane created')
    } catch (err) {
      toast.error('Failed to create lane')
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-100">Swim Lanes</h3>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading lanes…</div>
      ) : lanes.length === 0 ? (
        <div className="text-slate-400 text-sm">No lanes found.</div>
      ) : (
        <div className="space-y-2">
          {lanes.map((lane, idx) => (
            <div key={lane.id} className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
              <div className="flex-shrink-0 w-4 h-4 rounded" style={{ backgroundColor: lane.color || '#6366f1' }} />

              {editingId === lane.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={() => handleEditSave(lane.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEditSave(lane.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  autoFocus
                  className="flex-1 bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 focus:border-indigo-500 focus:outline-none"
                />
              ) : (
                <span
                  onDoubleClick={() => {
                    setEditingId(lane.id)
                    setEditingName(lane.name)
                  }}
                  className="flex-1 text-slate-200 cursor-pointer hover:text-slate-100"
                >
                  {lane.name}
                </span>
              )}

              <button
                onClick={() => handleToggleDone(lane)}
                className={`text-xs px-2 py-1 rounded ${
                  lane.is_done_col === 1
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                } transition-colors`}
              >
                {lane.is_done_col === 1 ? 'Done' : 'Normal'}
              </button>

              <div className="flex gap-1">
                <button
                  onClick={() => handleReorder(idx, idx - 1)}
                  disabled={idx === 0}
                  className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => handleReorder(idx, idx + 1)}
                  disabled={idx === lanes.length - 1}
                  className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                  title="Move down"
                >
                  ↓
                </button>
              </div>

              {confirmDeleteId === lane.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDelete(lane.id)}
                    className="text-xs px-2 py-1 bg-red-900 text-red-200 rounded hover:bg-red-800 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(lane.id)}
                  className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  title="Delete"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="flex gap-2 p-3 bg-slate-800 rounded-lg">
          <input
            type="text"
            value={newLaneName}
            onChange={e => setNewLaneName(e.target.value)}
            placeholder="Lane name…"
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddLane()
              if (e.key === 'Escape') setShowAddForm(false)
            }}
            autoFocus
            className="flex-1 bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleAddLane}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-2 text-indigo-400 hover:text-indigo-300 font-medium transition-colors text-sm"
        >
          + Add Lane
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectAdminPage() {
  const { projectId: projectIdStr } = useParams<{ projectId: string }>()
  const projectId = parseInt(projectIdStr ?? '0', 10)
  const navigate = useNavigate()
  const { user, canManageProject, isSuperAdmin } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('members')
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    if (user && !canManageProject(projectId)) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, projectId, canManageProject, navigate])

  useEffect(() => {
    api.projects.get(projectId).then(setProject).catch(() => {})
  }, [projectId])

  if (!user || !canManageProject(projectId)) return null

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-slate-400 hover:text-slate-200 mb-3 transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-slate-100">
            Project Admin — {project?.name ?? '…'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage members, settings, and lanes</p>
        </div>

        <div className="flex border-b border-slate-800 mb-6">
          {(['members', 'settings', 'lanes'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'members' && <MembersTab projectId={projectId} isSuperAdmin={isSuperAdmin()} />}
        {activeTab === 'settings' && <SettingsTab projectId={projectId} project={project} onUpdated={setProject} />}
        {activeTab === 'lanes' && <LanesTab projectId={projectId} />}
      </div>
    </div>
  )
}
