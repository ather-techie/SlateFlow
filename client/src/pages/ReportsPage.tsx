import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import { api } from '../api/index'
import type { CycleTimeEntry, Project, Sprint, VelocityEntry } from '../types'
import Header from '../components/Header'

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Velocity chart ────────────────────────────────────────────────────────────

function VelocityChart({ data }: { data: VelocityEntry[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No sprint data yet. Create and complete sprints to see velocity.</p>
  }

  const chartData = data.map(d => ({
    name: d.sprint_name.length > 12 ? d.sprint_name.slice(0, 12) + '…' : d.sprint_name,
    'Total Points': d.total_points,
    'Completed': d.completed_points,
    status: d.status,
  }))

  const completedVelocities = data.filter(v => v.status === 'completed').map(v => v.completed_points)
  const avgVelocity = completedVelocities.length > 0
    ? Math.round(completedVelocities.reduce((s, v) => s + v, 0) / completedVelocities.length)
    : null

  return (
    <div>
      {avgVelocity !== null && (
        <div className="mb-4">
          <span className="text-sm text-slate-600">Average velocity (completed sprints): </span>
          <span className="inline-block text-sm font-semibold text-indigo-700 bg-indigo-50 rounded-full px-3 py-0.5 ml-1">
            {avgVelocity} pts / sprint
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Total Points" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Completed" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Cycle time chart ──────────────────────────────────────────────────────────

function CycleTimeChart({ data }: { data: CycleTimeEntry[] }) {
  const withData = data.filter(d => d.avg_days !== null && d.sample_size > 0)

  if (withData.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No movement data yet. Move cards between lanes to see cycle time.</p>
  }

  const chartData = withData.map(d => ({
    name: d.lane_name.length > 12 ? d.lane_name.slice(0, 12) + '…' : d.lane_name,
    'Avg Days': d.avg_days ?? 0,
    sample: d.sample_size,
  }))

  const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e', '#ef4444']

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} label={{ value: 'days', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(value: unknown) => [`${value} days`, 'Avg Days']}
          />
          <Bar dataKey="Avg Days" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-400 mt-2">Average days a card spends in each lane before moving on.</p>
    </div>
  )
}

// ── Export section ────────────────────────────────────────────────────────────

function ExportSection({ projectId, sprints }: { projectId: number; sprints: Sprint[] }) {
  const [selectedSprintId, setSelectedSprintId] = useState<number | ''>(sprints[0]?.id ?? '')

  function downloadCsv(type: 'backlog' | 'sprint' | 'full') {
    const url = type === 'sprint' && selectedSprintId
      ? api.reports.exportUrl(projectId, type, selectedSprintId as number)
      : api.reports.exportUrl(projectId, type)
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => downloadCsv('backlog')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Backlog CSV
        </button>
        <button
          onClick={() => downloadCsv('full')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Full Project CSV
        </button>
      </div>

      {sprints.length > 0 && (
        <div className="flex items-center gap-3">
          <select
            value={selectedSprintId}
            onChange={e => setSelectedSprintId(e.target.value ? Number(e.target.value) : '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">— Select sprint —</option>
            {sprints.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' ●' : ''}</option>
            ))}
          </select>
          <button
            onClick={() => downloadCsv('sprint')}
            disabled={!selectedSprintId}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Sprint CSV
          </button>
        </div>
      )}

      <p className="text-xs text-slate-400">
        CSV includes: ID, Type, Title, Sprint, Epic, Feature, Assignee, Priority, Story Points, Status, Created date.
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [velocity, setVelocity] = useState<VelocityEntry[]>([])
  const [cycleTime, setCycleTime] = useState<CycleTimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.projects.get(pid),
      api.sprints.list(pid),
      api.reports.velocity(pid),
      api.reports.cycleTime(pid),
    ])
      .then(([proj, sps, vel, ct]) => {
        setProject(proj)
        setSprints(sps.filter(s => !s.is_default))
        setVelocity(vel)
        setCycleTime(ct)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load reports'))
      .finally(() => setLoading(false))
  }, [pid])

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-slate-100">
        <div className="h-14 bg-slate-900 flex-shrink-0" />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-slate-400 text-sm animate-pulse">Loading reports…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {project ? (
        <Header project={project} sprints={sprints} selectedSprintId={null} onSprintChange={() => {}} />
      ) : (
        <div className="h-14 bg-slate-900 flex-shrink-0" />
      )}

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">Velocity trends, cycle time analysis, and data exports.</p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
          )}

          <Section
            title="Velocity"
            subtitle="Story points completed vs. planned per sprint"
          >
            <VelocityChart data={velocity} />
          </Section>

          <Section
            title="Cycle Time / Lead Time"
            subtitle="Average days cards spend in each lane"
          >
            <CycleTimeChart data={cycleTime} />
          </Section>

          <Section
            title="Export"
            subtitle="Download project data as CSV"
          >
            <ExportSection projectId={pid} sprints={sprints} />
          </Section>
        </div>
      </main>
    </div>
  )
}
