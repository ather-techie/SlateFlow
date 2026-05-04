import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import type { Feature, Project, RoadmapEpic } from '../types'
import Header from '../components/Header'

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(s: string | null): Date | null {
  if (!s) return null
  return new Date(s + 'T00:00:00')
}

function fmtMonth(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Bar positioning ───────────────────────────────────────────────────────────

interface BarProps {
  start: Date | null
  end: Date | null
  rangeStart: Date
  totalDays: number
  color: string
  label: string
  onEdit: () => void
}

function GanttBar({ start, end, rangeStart, totalDays, color, label, onEdit }: BarProps) {
  if (!start || !end || totalDays === 0) {
    return (
      <button
        onClick={onEdit}
        className="text-xs text-slate-400 hover:text-indigo-600 italic transition-colors"
      >
        + Set dates
      </button>
    )
  }
  const left = Math.max(0, (daysBetween(rangeStart, start) / totalDays) * 100)
  const width = Math.max(0.5, (daysBetween(start, end) / totalDays) * 100)

  return (
    <div className="relative h-6 w-full">
      <div
        className="absolute h-full rounded-md flex items-center px-2 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, minWidth: 8 }}
        onClick={onEdit}
        title={`${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`}
      >
        <span className="text-white text-[10px] font-medium truncate leading-tight">{label}</span>
      </div>
    </div>
  )
}

// ── Date editor popover ───────────────────────────────────────────────────────

interface DateEditorProps {
  title: string
  startDate: string
  endDate: string
  onSave: (start: string, end: string) => void
  onClose: () => void
}

function DateEditor({ title, startDate, endDate, onSave, onClose }: DateEditorProps) {
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72"
      style={{ top: '100%', left: 0 }}
    >
      <p className="text-xs font-semibold text-slate-700 mb-3 truncate">{title}</p>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Start date</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">End date</label>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => { if (start && end) onSave(start, end) }}
          disabled={!start || !end}
          className="flex-1 text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  new:      'bg-slate-100 text-slate-600',
  active:   'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed:   'bg-purple-100 text-purple-700',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [epics, setEpics] = useState<RoadmapEpic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLoading(true)
    Promise.all([api.getProject(pid), api.roadmap.get(pid)])
      .then(([proj, data]) => {
        setProject(proj)
        setEpics(data)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load roadmap'))
      .finally(() => setLoading(false))
  }, [pid])

  // Compute overall date range from all items with dates
  const allDates: Date[] = []
  for (const epic of epics) {
    const s = parseDate(epic.start_date)
    const e = parseDate(epic.end_date)
    if (s) allDates.push(s)
    if (e) allDates.push(e)
    for (const f of epic.features) {
      const fs = parseDate(f.start_date)
      const fe = parseDate(f.end_date)
      if (fs) allDates.push(fs)
      if (fe) allDates.push(fe)
    }
  }

  const today = new Date()
  const rangeStart = allDates.length > 0
    ? addDays(allDates.reduce((a, b) => a < b ? a : b), -7)
    : addDays(today, -30)
  const rangeEnd = allDates.length > 0
    ? addDays(allDates.reduce((a, b) => a > b ? a : b), 14)
    : addDays(today, 90)
  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd))

  // Build month markers for x-axis
  const months: { label: string; pct: number }[] = []
  const cur = new Date(rangeStart)
  cur.setDate(1)
  while (cur <= rangeEnd) {
    const pct = (daysBetween(rangeStart, cur) / totalDays) * 100
    if (pct >= 0) months.push({ label: fmtMonth(cur), pct })
    cur.setMonth(cur.getMonth() + 1)
  }

  async function handleEpicDateSave(epicId: number, start: string, end: string) {
    try {
      const updated = await api.epics.update(epicId, { start_date: start, end_date: end })
      setEpics(prev => prev.map(e => e.id === epicId ? { ...e, ...updated } : e))
    } catch { /* ignore */ }
  }

  async function handleFeatureDateSave(featureId: number, epicId: number, start: string, end: string) {
    try {
      const updated = await api.features.update(featureId, { start_date: start, end_date: end })
      setEpics(prev => prev.map(e =>
        e.id === epicId
          ? { ...e, features: e.features.map(f => f.id === featureId ? { ...f, ...updated } as typeof f : f) }
          : e
      ))
    } catch { /* ignore */ }
  }

  function toggleCollapse(epicId: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(epicId)) next.delete(epicId)
      else next.add(epicId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-slate-100">
        <div className="h-14 bg-slate-900 flex-shrink-0" />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-slate-400 text-sm animate-pulse">Loading roadmap…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {project ? (
        <Header project={project} sprints={[]} selectedSprintId={null} onSprintChange={() => {}} />
      ) : (
        <div className="h-14 bg-slate-900 flex-shrink-0" />
      )}

      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-slate-800">Roadmap</h1>
          <p className="text-sm text-slate-500 mt-0.5">Timeline view across Epics and Features. Click any bar or "Set dates" to assign a date range.</p>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{error}</div>
        )}

        {epics.length === 0 && !loading ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-lg">No epics yet</p>
            <p className="text-sm mt-1">Create epics in the Epics page to get started.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {/* Header row with month markers */}
            <div className="grid grid-cols-[260px_1fr] border-b border-slate-200 bg-slate-50">
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-200">
                Item
              </div>
              <div className="relative h-8 overflow-hidden">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-slate-200 pl-1 flex items-center"
                    style={{ left: `${m.pct}%` }}
                  >
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">{m.label}</span>
                  </div>
                ))}
                {/* Today marker */}
                {(() => {
                  const todayPct = (daysBetween(rangeStart, today) / totalDays) * 100
                  if (todayPct < 0 || todayPct > 100) return null
                  return (
                    <div
                      className="absolute top-0 h-full border-l-2 border-indigo-400 border-dashed"
                      style={{ left: `${todayPct}%` }}
                      title="Today"
                    />
                  )
                })()}
              </div>
            </div>

            {/* Rows */}
            {epics.map(epic => (
              <div key={epic.id}>
                {/* Epic row */}
                <div className="grid grid-cols-[260px_1fr] border-b border-slate-100 bg-amber-50/40 hover:bg-amber-50 transition-colors">
                  <div className="flex items-center gap-2 px-3 py-2.5 border-r border-slate-100">
                    <button
                      onClick={() => toggleCollapse(epic.id)}
                      className="text-slate-400 hover:text-slate-600 flex-shrink-0 w-4 text-xs"
                    >
                      {collapsed.has(epic.id) ? '▶' : '▼'}
                    </button>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-sm text-slate-800 font-semibold truncate flex-1">{epic.title}</span>
                    <StatusBadge status={epic.status} />
                  </div>
                  <div className="px-2 py-2.5 flex items-center relative">
                    <EpicBarWithEditor
                      epic={epic}
                      rangeStart={rangeStart}
                      totalDays={totalDays}
                      onSave={(s, e) => handleEpicDateSave(epic.id, s, e)}
                    />
                  </div>
                </div>

                {/* Feature rows */}
                {!collapsed.has(epic.id) && epic.features.map(feature => (
                  <FeatureRowItem
                    key={feature.id}
                    feature={feature}
                    epicId={epic.id}
                    rangeStart={rangeStart}
                    totalDays={totalDays}
                    onSave={(s, e) => handleFeatureDateSave(feature.id, epic.id, s, e)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Separate inline bar+editor components to avoid duplicate onEdit prop ──────

function EpicBarWithEditor({
  epic,
  rangeStart,
  totalDays,
  onSave,
}: {
  epic: RoadmapEpic
  rangeStart: Date
  totalDays: number
  onSave: (start: string, end: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="relative w-full flex items-center">
      <GanttBar
        start={parseDate(epic.start_date)}
        end={parseDate(epic.end_date)}
        rangeStart={rangeStart}
        totalDays={totalDays}
        color="#f59e0b"
        label={epic.title}
        onEdit={() => setEditing(true)}
      />
      {editing && (
        <DateEditor
          title={epic.title}
          startDate={epic.start_date ?? new Date().toISOString().slice(0, 10)}
          endDate={epic.end_date ?? addDays(new Date(), 30).toISOString().slice(0, 10)}
          onSave={(s, e) => { onSave(s, e); setEditing(false) }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function FeatureRowItem({
  feature,
  epicId: _epicId,
  rangeStart,
  totalDays,
  onSave,
}: {
  feature: Feature & { story_count: number; done_story_count: number }
  epicId: number
  rangeStart: Date
  totalDays: number
  onSave: (start: string, end: string) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-slate-100 hover:bg-purple-50/30 transition-colors">
      <div className="flex items-center gap-2 px-3 py-2 border-r border-slate-100 pl-10">
        <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
        <span className="text-sm text-slate-700 truncate flex-1">{feature.title}</span>
        {feature.story_count > 0 && (
          <span className="text-[10px] text-slate-400 flex-shrink-0">
            {feature.done_story_count}/{feature.story_count}
          </span>
        )}
      </div>
      <div className="px-2 py-2 flex items-center relative">
        <div className="relative w-full flex items-center">
          <GanttBar
            start={parseDate(feature.start_date)}
            end={parseDate(feature.end_date)}
            rangeStart={rangeStart}
            totalDays={totalDays}
            color="#a855f7"
            label={feature.title}
            onEdit={() => setEditing(true)}
          />
          {editing && (
            <DateEditor
              title={feature.title}
              startDate={feature.start_date ?? new Date().toISOString().slice(0, 10)}
              endDate={feature.end_date ?? addDays(new Date(), 14).toISOString().slice(0, 10)}
              onSave={(s, e) => { onSave(s, e); setEditing(false) }}
              onClose={() => setEditing(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
