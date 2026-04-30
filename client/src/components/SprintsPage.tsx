import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api'
import type { Card, Column, Project, Sprint } from '../types'
import Header from './Header'
import PriorityBadge from './PriorityBadge'

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function daysInRange(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function buildBurndown(sprint: Sprint, cards: Card[]) {
  const total = cards.reduce((s, c) => s + (c.story_points ?? 1), 0)
  if (!sprint.start_date || !sprint.end_date || total === 0) return []

  const days = daysInRange(sprint.start_date, sprint.end_date)
  if (days.length === 0) return []

  const today = new Date().toISOString().slice(0, 10)

  return days.map((day, i) => {
    const ideal = Math.round(total - (total / (days.length - 1 || 1)) * i)
    return {
      day: fmt(day),
      ideal,
      actual: day <= today ? total : undefined,
    }
  })
}

// ── Create sprint form ─────────────────────────────────────────────────────

interface CreateFormProps {
  projectId: number
  onCreated: (s: Sprint) => void
}

function CreateSprintForm({ projectId, onCreated }: CreateFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const twoWeeks = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)

  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(twoWeeks)
  const [status, setStatus] = useState<Sprint['status']>('planned')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setErr('Name is required')
    setSaving(true)
    setErr(null)
    try {
      const sprint = await api.createSprint(projectId, {
        name: name.trim(),
        goal: goal.trim(),
        start_date: start,
        end_date: end,
        status,
      })
      onCreated(sprint)
      setName('')
      setGoal('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create sprint')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">New Sprint</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sprint 1"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Goal</label>
          <input
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="What will this sprint achieve?"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Start date</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">End date</label>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Sprint['status'])}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
          </select>
        </div>
      </div>
      {err && <p className="text-xs text-red-500 mt-3">{err}</p>}
      <div className="mt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? 'Creating…' : 'Create Sprint'}
        </button>
      </div>
    </form>
  )
}

// ── Sprint card ────────────────────────────────────────────────────────────

interface SprintCardProps {
  sprint: Sprint
  columns: Column[]
  onComplete: (id: number) => void
  onActivate: (id: number) => void
}

function SprintCard({ sprint, columns, onComplete, onActivate }: SprintCardProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [loadingCards, setLoadingCards] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [activating, setActivating] = useState(false)
  const [expanded, setExpanded] = useState(sprint.status === 'active')

  useEffect(() => {
    api
      .getSprintCards(sprint.id)
      .then(setCards)
      .finally(() => setLoadingCards(false))
  }, [sprint.id])

  const lastColumnId = useMemo(() => {
    if (columns.length === 0) return null
    return [...columns].sort((a, b) => b.position - a.position)[0].id
  }, [columns])

  const doneCards = lastColumnId ? cards.filter(c => c.column_id === lastColumnId) : []
  const totalPts = cards.reduce((s, c) => s + (c.story_points ?? 0), 0)
  const donePts = doneCards.reduce((s, c) => s + (c.story_points ?? 0), 0)
  const progressPct = cards.length === 0 ? 0 : Math.round((doneCards.length / cards.length) * 100)
  const burndownData = buildBurndown(sprint, cards)

  async function handleComplete() {
    setCompleting(true)
    try {
      await api.completeSprint(sprint.id)
      onComplete(sprint.id)
    } finally {
      setCompleting(false)
    }
  }

  async function handleActivate() {
    setActivating(true)
    try {
      await api.updateSprint(sprint.id, { status: 'active' })
      onActivate(sprint.id)
    } finally {
      setActivating(false)
    }
  }

  const statusColors: Record<Sprint['status'], string> = {
    active: 'bg-emerald-100 text-emerald-700',
    planned: 'bg-slate-100 text-slate-600',
    completed: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        onClick={() => setExpanded(p => !p)}
      >
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[sprint.status]}`}>
          {sprint.status}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800">{sprint.name}</h3>
            {sprint.start_date && sprint.end_date && (
              <span className="text-xs text-slate-400">
                {fmt(sprint.start_date)} – {fmt(sprint.end_date)}
              </span>
            )}
          </div>
          {sprint.goal && <p className="text-xs text-slate-500 mt-0.5 truncate">{sprint.goal}</p>}
        </div>

        {/* Progress bar */}
        {!loadingCards && cards.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 w-10 text-right">
              {doneCards.length}/{cards.length}
            </span>
            {totalPts > 0 && (
              <span className="text-xs text-slate-400">
                ({donePts}/{totalPts}pt)
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {sprint.status === 'planned' && (
            <button
              onClick={e => { e.stopPropagation(); handleActivate() }}
              disabled={activating}
              className="px-3 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {activating ? '…' : 'Activate'}
            </button>
          )}
          {sprint.status === 'active' && (
            <button
              onClick={e => { e.stopPropagation(); handleComplete() }}
              disabled={completing}
              className="px-3 py-1 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {completing ? 'Completing…' : 'Complete Sprint'}
            </button>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Burndown chart */}
          {burndownData.length > 1 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Burndown
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={burndownData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="ideal"
                    stroke="#c7d2fe"
                    strokeWidth={2}
                    dot={false}
                    name="Ideal"
                    strokeDasharray="5 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                    name="Remaining"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cards list */}
          {loadingCards ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg" />)}
            </div>
          ) : cards.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No cards in this sprint yet.</p>
          ) : (
            <div className="space-y-1.5">
              {cards.map(card => {
                const col = columns.find(c => c.id === card.column_id)
                return (
                  <div key={card.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                    <PriorityBadge priority={card.priority} />
                    <span className="text-sm text-slate-700 flex-1 truncate">{card.title}</span>
                    {col && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: col.color + '22', color: col.color || '#64748b' }}
                      >
                        {col.name}
                      </span>
                    )}
                    {card.story_points !== null && (
                      <span className="text-xs text-slate-400 font-mono">{card.story_points}pt</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SprintsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [columns, setColumns] = useState<Column[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const [proj, sps, cols] = await Promise.all([
          api.getProject(pid),
          api.getSprints(pid),
          api.getColumns(pid),
        ])
        setProject(proj)
        setSprints(sps)
        setColumns(cols)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sprints')
      } finally {
        setLoading(false)
      }
    })()
  }, [pid])

  function handleCreated(sprint: Sprint) {
    setSprints(prev => [sprint, ...prev])
    setShowForm(false)
  }

  function handleComplete(id: number) {
    setSprints(prev => prev.map(s => (s.id === id ? { ...s, status: 'completed' } : s)))
  }

  function handleActivate(id: number) {
    setSprints(prev => prev.map(s => (s.id === id ? { ...s, status: 'active' } : s)))
  }

  const sorted = [...sprints].sort((a, b) => {
    const order = { active: 0, planned: 1, completed: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {project ? (
        <Header
          project={project}
          sprints={sprints}
          selectedSprintId={selectedSprintId}
          onSprintChange={setSelectedSprintId}
        />
      ) : (
        <div className="h-14 bg-slate-900 flex-shrink-0" />
      )}

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Sprints</h1>
              <p className="text-sm text-slate-500 mt-0.5">{sprints.length} sprint{sprints.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => setShowForm(p => !p)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {showForm ? 'Cancel' : '+ New Sprint'}
            </button>
          </div>

          {showForm && (
            <CreateSprintForm projectId={pid} onCreated={handleCreated} />
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-20 bg-slate-200 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-lg">No sprints yet</p>
              <p className="text-sm mt-1">Create your first sprint to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map(sprint => (
                <SprintCard
                  key={sprint.id}
                  sprint={sprint}
                  columns={columns}
                  onComplete={handleComplete}
                  onActivate={handleActivate}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
