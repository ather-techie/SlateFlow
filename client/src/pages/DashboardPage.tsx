import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/index'
import type { ActivityItem, DashboardStats, Project, ProjectSummary } from '../types'
import { FeatureGate } from '../components/ui/FeatureGate'
import { NLItemInput } from '../components/NLItemInput'

const PROJECT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.replace(' ', 'T') + 'Z')
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString()
}

function formatAction(action: string, meta: string): string {
  try {
    const m = JSON.parse(meta) as Record<string, string>
    switch (action) {
      case 'create': return 'was created'
      case 'field_changed':
        if (m.field === 'priority') return `priority changed to ${m.to}`
        if (m.field === 'assignee') return m.to ? `assigned to ${m.to}` : 'unassigned'
        if (m.field === 'title') return 'was renamed'
        return `${m.field} updated`
      case 'move':
        return `moved to ${m.to_lane ?? m.to_col ?? 'lane'}`
      case 'test_run':
        return `— marked as ${m.status}${m.run_by ? ` by ${m.run_by}` : ''}`
      default:
        return action
    }
  } catch {
    return action
  }
}

function parseTestRunMeta(meta: string): { title: string; status: string; run_by: string | null } | null {
  try {
    const m = JSON.parse(meta) as Record<string, string>
    return m.title && m.status ? { title: m.title, status: m.status, run_by: m.run_by ?? null } : null
  } catch {
    return null
  }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, sub }: { label: string; value: number; icon: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
        {sub && <div className="mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ─── Lane progress bar ────────────────────────────────────────────────────────

function LaneBar({ project }: { project: ProjectSummary }) {
  const { lanes, total_cards } = project
  if (total_cards === 0 || lanes.length === 0) {
    return <div className="h-1.5 bg-slate-100 rounded-full my-3" />
  }
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden my-3 gap-px bg-slate-100">
      {lanes.map(lane => {
        const pct = (lane.card_count / total_cards) * 100
        if (pct === 0) return null
        return (
          <div
            key={lane.id}
            className="h-full relative group/lane"
            style={{ width: `${pct}%`, backgroundColor: lane.color }}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/lane:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
              {lane.name}: {lane.card_count} {lane.card_count === 1 ? 'card' : 'cards'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Test health bar ──────────────────────────────────────────────────────────

function TestHealthBar({ project }: { project: ProjectSummary }) {
  const { test_cases_total: total, test_cases_passed: passed, test_cases_failed: failed, test_cases_untested: untested } = project
  if (!total) return null
  const tooltip = `${total} ${total === 1 ? 'test' : 'tests'}: ${passed} passed, ${failed} failed, ${untested} untested`
  return (
    <div
      className="flex h-1 rounded-full overflow-hidden mb-2 gap-px bg-slate-100"
      title={tooltip}
    >
      {passed > 0 && <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(passed / total) * 100}%` }} />}
      {failed > 0 && <div className="h-full bg-red-400 transition-all" style={{ width: `${(failed / total) * 100}%` }} />}
      {untested > 0 && <div className="h-full bg-slate-300 transition-all" style={{ width: `${(untested / total) * 100}%` }} />}
    </div>
  )
}

// ─── Edit project modal ───────────────────────────────────────────────────────

function EditProjectModal({
  project,
  onSave,
  onClose,
}: {
  project: ProjectSummary
  onSave: (updated: Project) => void
  onClose: () => void
}) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [color, setColor] = useState(project.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        color,
      })
      onSave(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-5">Edit Project</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={200}
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <svg className="w-3.5 h-3.5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kebab menu ───────────────────────────────────────────────────────────────

function KebabMenu({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectSummary
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={e => { e.preventDefault(); setOpen(o => !o) }}
        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition opacity-0 group-hover/card:opacity-100 focus:opacity-100"
        title="More options"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            Edit Project
          </button>
          <Link
            to={`/projects/${project.id}/board`}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            onClick={() => setOpen(false)}
          >
            Manage Lanes
          </Link>
          {!project.is_default && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={() => { setOpen(false); onDelete() }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
              >
                Delete Project
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectSummary
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden group/card">
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: project.color }} />

      <div className="pl-5 pr-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-900 leading-tight">{project.name}</h3>
            {project.description && (
              <p className="text-sm text-slate-500 truncate mt-0.5">{project.description}</p>
            )}
          </div>
          <KebabMenu project={project} onEdit={onEdit} onDelete={onDelete} />
        </div>

        <LaneBar project={project} />
        <TestHealthBar project={project} />

        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
          <span>{project.total_cards} {project.total_cards === 1 ? 'card' : 'cards'}</span>
          <span className="text-slate-300">·</span>
          <span>{project.open_cards} open</span>
          {project.active_sprint && (
            <>
              <span className="text-slate-300">·</span>
              <span
                className="font-medium truncate max-w-[140px]"
                style={{ color: project.color }}
                title={project.active_sprint.name}
              >
                {project.active_sprint.name}
              </span>
            </>
          )}
        </div>

        <Link
          to={`/projects/${project.id}/board`}
          className="inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-75"
          style={{ color: project.color }}
        >
          Open Board
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

// ─── Activity panel ───────────────────────────────────────────────────────────

function ActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">Recent Activity</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No activity yet.</p>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const isTestRun = item.action === 'test_run'
            const testMeta = isTestRun ? parseTestRunMeta(item.meta) : null
            const testPassed = testMeta?.status === 'passed'
            const testFailed = testMeta?.status === 'failed'

            return (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isTestRun && testMeta
                    ? testPassed ? 'bg-emerald-50' : testFailed ? 'bg-red-50' : 'bg-slate-100'
                    : 'bg-slate-100'
                }`}>
                  {isTestRun && testMeta ? (
                    <svg
                      className={`w-3 h-3 ${testPassed ? 'text-emerald-500' : testFailed ? 'text-red-500' : 'text-slate-400'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 leading-snug">
                    {isTestRun && testMeta ? (
                      <>
                        <span className="font-medium">{testMeta.title}</span>
                        {' '}
                        <span className={testPassed ? 'text-emerald-600' : testFailed ? 'text-red-600' : 'text-slate-500'}>
                          — marked as {testMeta.status}{testMeta.run_by ? ` by ${testMeta.run_by}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{item.card_title}</span>
                        {' '}
                        <span className="text-slate-500">{formatAction(item.action, item.meta)}</span>
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
                    {item.project_id && (
                      <>
                        <span className="text-xs text-slate-300">·</span>
                        <Link
                          to={`/projects/${item.project_id}`}
                          className="text-xs text-slate-400 hover:text-indigo-600 transition truncate"
                        >
                          {item.project_name}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center col-span-2">
      <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">No projects yet</h2>
      <p className="text-slate-500 mb-8 max-w-sm text-sm">
        Create your first project to start organizing work with Kanban boards, sprints, and backlog tracking.
      </p>
      <button
        onClick={() => navigate('/projects/new')}
        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition active:scale-95"
      >
        Create your first project
      </button>
    </div>
  )
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({ total_projects: 0, active_sprints: 0, open_cards: 0, test_cases_total: 0, test_cases_passed: 0, test_cases_failed: 0, test_cases_untested: 0 })
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null)

  useEffect(() => {
    Promise.all([
      api.getDashboardStats(),
      api.getDashboardProjects(),
      api.getDashboardActivity(),
    ])
      .then(([s, p, a]) => {
        setStats(s)
        setProjects(p)
        setActivity(a)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  function handleProjectSaved(updated: Project) {
    setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
    setEditingProject(null)
  }

  async function handleDeleteProject(project: ProjectSummary) {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return
    try {
      await api.deleteProject(project.id)
      setProjects(prev => prev.filter(p => p.id !== project.id))
      setStats(prev => ({
        ...prev,
        total_projects: Math.max(0, prev.total_projects - 1),
        active_sprints: Math.max(0, prev.active_sprints - (project.active_sprint ? 1 : 0)),
        open_cards: Math.max(0, prev.open_cards - project.open_cards),
      }))
      setActivity(prev => prev.filter(a => a.project_id !== project.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete project')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 flex items-center justify-center">
        <span className="text-slate-500 text-sm animate-pulse">Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-3">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-slate-500 hover:text-slate-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2" />
              </svg>
            </div>
            <span className="font-bold text-slate-900">SlateFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <FeatureGate flag="ai">
              <NLItemInput
                allowedTypes={['project']}
                onCreated={() => {
                  api.getProjects().then((projects: any) => setProjects(projects)).catch(() => {})
                }}
              />
            </FeatureGate>
            <button
              onClick={() => navigate('/projects/new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Projects"
            value={stats.total_projects}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z" />
              </svg>
            }
          />
          <StatCard
            label="Active Sprints"
            value={stats.active_sprints}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <StatCard
            label="Open Cards"
            value={stats.open_cards}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            label="Test Cases"
            value={stats.test_cases_total}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            sub={
              <div className="flex items-center gap-1 text-xs flex-wrap">
                <span className="text-emerald-600 font-medium">{stats.test_cases_passed} passed</span>
                <span className="text-slate-300">·</span>
                <span className="text-red-500 font-medium">{stats.test_cases_failed} failed</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">{stats.test_cases_untested} untested</span>
              </div>
            }
          />
        </div>

        {projects.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2">
            <EmptyState />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Project grid */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={() => setEditingProject(project)}
                    onDelete={() => handleDeleteProject(project)}
                  />
                ))}
              </div>
            </div>

            {/* Activity panel */}
            <div className="lg:w-72 xl:w-80 flex-shrink-0">
              <div className="lg:sticky lg:top-24">
                <ActivityPanel items={activity} />
              </div>
            </div>
          </div>
        )}
      </main>

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onSave={handleProjectSaved}
          onClose={() => setEditingProject(null)}
        />
      )}
    </div>
  )
}
