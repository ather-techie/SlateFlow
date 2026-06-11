import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/index'
import type { Card, Lane, Project, Sprint, TestCase, TestPriority, TestRun, TestStatus, TestSuite } from '../types'
import Header from '../components/Header'
import CardModal from '../components/CardModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string) {
  const secs = (Date.now() - new Date(iso.includes('Z') ? iso : iso + 'Z').getTime()) / 1000
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function renderMarkdown(md: string): string {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = esc.split('\n')
  const out: string[] = []
  let inList = false
  function inline(s: string) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono">$1</code>')
  }
  for (const raw of lines) {
    if (raw.startsWith('### ')) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h3 class="text-sm font-semibold mt-3 mb-0.5">${inline(raw.slice(4))}</h3>`) }
    else if (raw.startsWith('## ')) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h2 class="text-base font-semibold mt-3 mb-1">${inline(raw.slice(3))}</h2>`) }
    else if (raw.startsWith('# ')) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h1 class="text-lg font-bold mt-4 mb-1">${inline(raw.slice(2))}</h1>`) }
    else if (/^[-*] /.test(raw)) { if (!inList) { out.push('<ul class="list-disc pl-5 my-1 space-y-0.5">'); inList = true } out.push(`<li class="text-sm">${inline(raw.slice(2))}</li>`) }
    else if (raw === '') { if (inList) { out.push('</ul>'); inList = false } out.push('<div class="h-2"></div>') }
    else { if (inList) { out.push('</ul>'); inList = false } out.push(`<p class="text-sm mb-1">${inline(raw)}</p>`) }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

// ── Status / priority config ───────────────────────────────────────────────────

const STATUS_CFG = {
  untested: { icon: '○', color: 'text-slate-400', label: 'Untested' },
  passed:   { icon: '✓', color: 'text-green-600', label: 'Passed' },
  failed:   { icon: '✗', color: 'text-red-500',   label: 'Failed' },
  blocked:  { icon: '⊘', color: 'text-amber-500', label: 'Blocked' },
  skipped:  { icon: '—', color: 'text-slate-400', label: 'Skipped' },
} as const

const TPRI_CFG: Record<string, { label: string; cls: string }> = {
  critical: { label: 'CRITICAL', cls: 'bg-red-100 text-red-700' },
  high:     { label: 'HIGH',     cls: 'bg-orange-100 text-orange-700' },
  medium:   { label: 'MEDIUM',   cls: 'bg-blue-100 text-blue-700' },
  low:      { label: 'LOW',      cls: 'bg-slate-100 text-slate-500' },
}

function StatusIcon({ status }: { status: TestStatus }) {
  const cfg = STATUS_CFG[status]
  return <span className={`text-base font-bold ${cfg.color}`}>{cfg.icon}</span>
}

function TPriBadge({ priority }: { priority: TestPriority }) {
  const cfg = TPRI_CFG[priority]
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">
      {type === 'automated' ? 'AUTO' : 'MANUAL'}
    </span>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}

// ── RecordRunForm ─────────────────────────────────────────────────────────────

function RecordRunForm({
  testCaseId,
  onSuccess,
  onCancel,
}: {
  testCaseId: number
  onSuccess: (run: TestRun) => void
  onCancel: () => void
}) {
  const [status, setStatus] = useState<TestRun['status']>('passed')
  const [notes, setNotes] = useState('')
  const [runBy, setRunBy] = useState(() => localStorage.getItem('lb-author') ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const run = await api.testCases.addRun(testCaseId, {
        status,
        notes: notes.trim() || undefined,
        run_by: runBy.trim() || undefined,
      })
      if (runBy.trim()) localStorage.setItem('lb-author', runBy.trim())
      onSuccess(run)
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Record Run</p>
      <div className="grid grid-cols-2 gap-2">
        <select value={status} onChange={e => setStatus(e.target.value as TestRun['status'])} className={`${inputCls} bg-white`}>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
          <option value="skipped">Skipped</option>
        </select>
        <input value={runBy} onChange={e => setRunBy(e.target.value)} placeholder="Run by" className={inputCls} />
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes / actual result" rows={2} className={`${inputCls} resize-none`} />
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving…' : 'Submit'}
        </button>
        <button type="button" onClick={onCancel} className="border border-slate-200 text-slate-600 text-sm rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">Cancel</button>
      </div>
    </form>
  )
}

// ── TestDetailPanel ───────────────────────────────────────────────────────────

interface DetailPanelProps {
  tc: TestCase
  suites: TestSuite[]
  onUpdate: (updated: TestCase) => void
  onClose: () => void
}

function TestDetailPanel({ tc, suites, onUpdate, onClose }: DetailPanelProps) {
  const [runs, setRuns] = useState<TestRun[] | null>(null)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [showRunForm, setShowRunForm] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(tc.title)
  const [editingFields, setEditingFields] = useState(false)
  const [priority, setPriority] = useState<TestPriority>(tc.priority)
  const [testType, setTestType] = useState<'manual' | 'automated'>(tc.test_type)
  const [assignedTo, setAssignedTo] = useState(tc.assigned_to ?? '')
  const [description, setDescription] = useState(tc.description ?? '')
  const [preconditions, setPreconditions] = useState(tc.preconditions ?? '')
  const [expectedResult, setExpectedResult] = useState(tc.expected_result ?? '')
  const [steps, setSteps] = useState<{ step: string; expected: string }[]>(tc.steps ?? [])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(tc.title)
    setPriority(tc.priority)
    setTestType(tc.test_type)
    setAssignedTo(tc.assigned_to ?? '')
    setDescription(tc.description ?? '')
    setPreconditions(tc.preconditions ?? '')
    setExpectedResult(tc.expected_result ?? '')
    setSteps(tc.steps ?? [])
    setRuns(null)
    setShowRunForm(false)
    setEditingFields(false)
    setEditingTitle(false)
  }, [tc.id])

  useEffect(() => {
    setLoadingRuns(true)
    api.testCases.listRuns(tc.id)
      .then(r => setRuns(r))
      .catch(() => {})
      .finally(() => setLoadingRuns(false))
  }, [tc.id])

  async function quickStatus(status: TestStatus) {
    const tester = localStorage.getItem('lb-author') || undefined
    try {
      if (status === 'untested') {
        const updated = await api.testCases.update(tc.id, { status })
        onUpdate(updated)
      } else {
        const run = await api.testCases.addRun(tc.id, { status, run_by: tester })
        setRuns(prev => (prev ? [run, ...prev] : [run]))
        onUpdate({ ...tc, status })
      }
    } catch {}
  }

  function handleTitleSave() {
    setEditingTitle(false)
    const t = title.trim()
    if (t && t !== tc.title) {
      api.testCases.update(tc.id, { title: t }).then(onUpdate).catch(() => setTitle(tc.title))
    } else {
      setTitle(tc.title)
    }
  }

  function handleRunSuccess(run: TestRun) {
    setShowRunForm(false)
    setRuns(prev => (prev ? [run, ...prev] : [run]))
    onUpdate({ ...tc, status: run.status as TestStatus })
  }

  async function saveAllFields() {
    setSaving(true)
    try {
      const updated = await api.testCases.update(tc.id, {
        priority,
        test_type: testType,
        assigned_to: assignedTo.trim() || undefined,
        description: description.trim() || undefined,
        preconditions: preconditions.trim() || undefined,
        expected_result: expectedResult.trim() || undefined,
        steps: steps.filter(s => s.step.trim()).length ? steps.filter(s => s.step.trim()) : null,
      })
      onUpdate(updated)
      setEditingFields(false)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border-l border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Case Detail</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 transition-colors">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTitleSave()
              if (e.key === 'Escape') { setTitle(tc.title); setEditingTitle(false) }
            }}
            className="w-full text-base font-semibold text-slate-900 border-0 border-b border-indigo-400 p-0 pb-0.5 focus:outline-none bg-transparent"
          />
        ) : (
          <h3
            className="text-base font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 transition-colors"
            onClick={() => setEditingTitle(true)}
          >
            {tc.title}
          </h3>
        )}

        {/* Status quick buttons */}
        <div className="flex flex-wrap gap-1.5">
          {(['untested', 'passed', 'failed', 'blocked', 'skipped'] as const).map(s => (
            <button
              key={s}
              onClick={() => quickStatus(s)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                tc.status === s
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={tc.status === s ? 'text-white' : STATUS_CFG[s].color}>{STATUS_CFG[s].icon}</span>
              {STATUS_CFG[s].label}
            </button>
          ))}
        </div>

        {/* Metadata */}
        {!editingFields ? (
          <div className="flex items-center gap-2 flex-wrap">
            <TPriBadge priority={tc.priority} />
            <TypeBadge type={tc.test_type} />
            {tc.assigned_to && (
              <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{tc.assigned_to}</span>
            )}
            {tc.suite_id && (
              <span className="text-xs text-purple-600 bg-purple-50 rounded-full px-2 py-0.5">
                {suites.find(s => s.id === tc.suite_id)?.name ?? 'Suite'}
              </span>
            )}
            <button
              onClick={() => setEditingFields(true)}
              className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={priority} onChange={e => setPriority(e.target.value as TestPriority)} className={`${inputCls} bg-white`}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={testType} onChange={e => setTestType(e.target.value as 'manual' | 'automated')} className={`${inputCls} bg-white`}>
                <option value="manual">Manual</option>
                <option value="automated">Automated</option>
              </select>
            </div>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Assigned to" className={inputCls} />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (Markdown)" rows={3} className={`${inputCls} resize-none`} />
            <textarea value={preconditions} onChange={e => setPreconditions(e.target.value)} placeholder="Preconditions" rows={2} className={`${inputCls} resize-none`} />
            <textarea value={expectedResult} onChange={e => setExpectedResult(e.target.value)} placeholder="Expected result" rows={2} className={`${inputCls} resize-none`} />
            {/* Steps builder */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Steps</span>
                <button
                  type="button"
                  onClick={() => setSteps(prev => [...prev, { step: '', expected: '' }])}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add Step
                </button>
              </div>
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2 mb-1.5 items-start">
                  <span className="text-xs text-slate-400 font-mono pt-2 w-4 flex-shrink-0">{i + 1}</span>
                  <input
                    value={step.step}
                    onChange={e => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, step: e.target.value } : s))}
                    placeholder="Step"
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    value={step.expected}
                    onChange={e => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, expected: e.target.value } : s))}
                    placeholder="Expected"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => setSteps(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-500 pt-2 text-lg leading-none flex-shrink-0"
                  >×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveAllFields}
                disabled={saving}
                className="bg-indigo-600 text-white text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditingFields(false)}
                className="border border-slate-200 text-slate-600 text-xs rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Description (read) */}
        {!editingFields && tc.description && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</p>
            <div className="text-slate-700" dangerouslySetInnerHTML={{ __html: renderMarkdown(tc.description) }} />
          </div>
        )}

        {/* Preconditions (read) */}
        {!editingFields && tc.preconditions && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Preconditions</p>
            <p className="text-xs text-slate-600 italic">{tc.preconditions}</p>
          </div>
        )}

        {/* Steps (read) */}
        {!editingFields && tc.steps && tc.steps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Steps</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left px-2 py-1 rounded-tl font-semibold text-slate-500 w-6">#</th>
                  <th className="text-left px-2 py-1 font-semibold text-slate-500">Step</th>
                  <th className="text-left px-2 py-1 rounded-tr font-semibold text-slate-500">Expected</th>
                </tr>
              </thead>
              <tbody>
                {tc.steps.map((s, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1 text-slate-400 font-mono">{i + 1}</td>
                    <td className="px-2 py-1 text-slate-700">{s.step}</td>
                    <td className="px-2 py-1 text-slate-700">{s.expected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Expected Result (read) */}
        {!editingFields && tc.expected_result && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Expected Result</p>
            <p className="text-xs text-slate-700">{tc.expected_result}</p>
          </div>
        )}

        {/* Run History */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Run History</p>
          {loadingRuns && <p className="text-xs text-slate-400 animate-pulse">Loading…</p>}
          {!loadingRuns && runs !== null && runs.length === 0 && (
            <p className="text-xs text-slate-400">No runs recorded yet.</p>
          )}
          {runs !== null && runs.map(r => {
            const cfg = STATUS_CFG[r.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.untested
            return (
              <div key={r.id} className="flex items-start gap-2 py-1.5 border-t border-slate-100 first:border-t-0">
                <span className={`text-xs font-bold flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-semibold ${cfg.color} capitalize`}>{r.status}</span>
                  {r.run_by && <span className="text-xs text-slate-500 ml-1.5">by {r.run_by}</span>}
                  {r.notes && <p className="text-xs text-slate-500 mt-0.5">{r.notes}</p>}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{fmtRelative(r.run_at)}</span>
              </div>
            )
          })}
        </div>

        {/* Record Run */}
        {showRunForm ? (
          <RecordRunForm
            testCaseId={tc.id}
            onSuccess={handleRunSuccess}
            onCancel={() => setShowRunForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowRunForm(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
          >
            Record Run
          </button>
        )}
      </div>
    </div>
  )
}

// ── MoveToSuiteModal ──────────────────────────────────────────────────────────

function MoveToSuiteModal({
  suites,
  onSelect,
  onCancel,
}: {
  suites: TestSuite[]
  onSelect: (suiteId: number | null) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-72 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Move to Suite</h3>
        <div className="space-y-0.5 max-h-60 overflow-y-auto mb-4">
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            — No suite —
          </button>
          {suites.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            >
              {s.name}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full border border-slate-200 text-slate-600 text-sm rounded-lg py-1.5 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── TestSuitePage ─────────────────────────────────────────────────────────────

export default function TestSuitePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject]     = useState<Project | null>(null)
  const [sprints, setSprints]     = useState<Sprint[]>([])
  const [lanes, setLanes]         = useState<Lane[]>([])
  const [suites, setSuites]       = useState<TestSuite[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading]     = useState(true)

  // Left panel
  const [selectedSuiteId, setSelectedSuiteId] = useState<number | 'all'>('all')
  const [addingSuite, setAddingSuite]         = useState(false)
  const [newSuiteName, setNewSuiteName]       = useState('')
  const [creatingSuite, setCreatingSuite]     = useState(false)

  // Center filters
  const [statusFilter, setStatusFilter]     = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter]         = useState('all')
  const [search, setSearch]                 = useState('')

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Right panel detail
  const [detailTc, setDetailTc] = useState<TestCase | null>(null)

  // Card modal
  const [modalCard, setModalCard] = useState<Card | null>(null)

  // Move to suite
  const [moveToSuiteIds, setMoveToSuiteIds] = useState<number[]>([])
  const [showMoveModal, setShowMoveModal]   = useState(false)

  // Kebab menus
  const [kebabOpenId, setKebabOpenId]     = useState<number | null>(null)
  const kebabRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Load
  useEffect(() => {
    if (!pid) return
    setLoading(true)
    Promise.all([
      api.projects.get(pid),
      api.sprints.list(pid),
      api.lanes.list(pid),
      api.testSuites.listByProject(pid),
      api.testCases.listByProject(pid),
    ]).then(([proj, sps, ls, ss, tcs]) => {
      setProject(proj)
      setSprints(sps)
      setLanes(ls)
      setSuites(ss)
      setTestCases(tcs)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [pid])

  // Close kebab on outside click
  useEffect(() => {
    if (kebabOpenId === null) return
    const handler = (e: MouseEvent) => {
      const ref = kebabRefs.current.get(kebabOpenId)
      if (!ref?.contains(e.target as Node)) setKebabOpenId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [kebabOpenId])

  // Derived stats (all test cases)
  const stats = {
    total:    testCases.length,
    passed:   testCases.filter(t => t.status === 'passed').length,
    failed:   testCases.filter(t => t.status === 'failed').length,
    untested: testCases.filter(t => t.status === 'untested').length,
    blocked:  testCases.filter(t => t.status === 'blocked').length,
    skipped:  testCases.filter(t => t.status === 'skipped').length,
  }

  const suiteCounts = suites.reduce((acc, s) => {
    acc[s.id] = testCases.filter(tc => tc.suite_id === s.id).length
    return acc
  }, {} as Record<number, number>)

  const filtered = testCases.filter(tc => {
    if (selectedSuiteId !== 'all' && tc.suite_id !== selectedSuiteId) return false
    if (statusFilter !== 'all' && tc.status !== statusFilter) return false
    if (priorityFilter !== 'all' && tc.priority !== priorityFilter) return false
    if (typeFilter !== 'all' && tc.test_type !== typeFilter) return false
    if (search && !tc.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const allSelectedInView = filtered.length > 0 && selectedIds.size === filtered.length

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleCreateSuite() {
    if (!newSuiteName.trim() || creatingSuite) return
    setCreatingSuite(true)
    try {
      const suite = await api.testSuites.create(pid, { name: newSuiteName.trim() })
      setSuites(prev => [...prev, suite])
      setNewSuiteName('')
      setAddingSuite(false)
      setSelectedSuiteId(suite.id)
    } finally {
      setCreatingSuite(false)
    }
  }

  function handleTcUpdate(updated: TestCase) {
    setTestCases(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
    if (detailTc?.id === updated.id) setDetailTc(prev => prev ? { ...prev, ...updated } : null)
  }

  async function handleQuickStatus(tc: TestCase, status: TestStatus) {
    const prev = testCases
    setTestCases(p => p.map(t => t.id === tc.id ? { ...t, status } : t))
    if (detailTc?.id === tc.id) setDetailTc(p => p ? { ...p, status } : null)
    try {
      const tester = localStorage.getItem('lb-author') || undefined
      await api.testCases.addRun(tc.id, { status, run_by: tester })
    } catch {
      setTestCases(prev)
    }
  }

  async function handleDelete(tcId: number) {
    await api.testCases.delete(tcId).catch(() => {})
    setTestCases(prev => prev.filter(t => t.id !== tcId))
    if (detailTc?.id === tcId) setDetailTc(null)
    setSelectedIds(prev => { const next = new Set(prev); next.delete(tcId); return next })
  }

  async function openCardModal(cardId: number) {
    try {
      const card = await api.cards.get(cardId)
      setModalCard(card)
    } catch {}
  }

  async function bulkMarkStatus(status: TestStatus) {
    const ids = [...selectedIds]
    const byCard = new Map<number, number[]>()
    for (const id of ids) {
      const tc = testCases.find(t => t.id === id)
      if (!tc) continue
      const arr = byCard.get(tc.card_id) ?? []
      arr.push(id)
      byCard.set(tc.card_id, arr)
    }
    setTestCases(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, status } : t))
    try {
      await Promise.all([...byCard.entries()].map(([cardId, cardIds]) =>
        api.testCases.bulkStatus(cardId, cardIds, status),
      ))
    } catch {
      api.testCases.listByProject(pid).then(setTestCases).catch(() => {})
    }
    setSelectedIds(new Set())
  }

  async function bulkDelete() {
    const ids = [...selectedIds]
    await Promise.all(ids.map(id => api.testCases.delete(id).catch(() => {})))
    setTestCases(prev => prev.filter(t => !selectedIds.has(t.id)))
    if (detailTc && selectedIds.has(detailTc.id)) setDetailTc(null)
    setSelectedIds(new Set())
  }

  async function handleMoveToSuite(suiteId: number | null) {
    setShowMoveModal(false)
    const ids = moveToSuiteIds
    await Promise.all(ids.map(id => api.testCases.update(id, { suite_id: suiteId }).catch(() => {})))
    const refreshed = await api.testCases.listByProject(pid).catch(() => testCases)
    setTestCases(refreshed)
    setSelectedIds(new Set())
    setMoveToSuiteIds([])
  }

  function exportCsv() {
    const headers = ['ID', 'Title', 'Status', 'Priority', 'Type', 'Card', 'Suite', 'Assigned To', 'Last Run']
    const rows = filtered.map(tc => {
      const suite = suites.find(s => s.id === tc.suite_id)?.name ?? ''
      const lastRun = tc.latest_run
        ? `${tc.latest_run.status} (${fmtRelative(tc.latest_run.run_at)})`
        : ''
      return [
        tc.id, tc.title, tc.status, tc.priority, tc.test_type,
        tc.card_title ?? '', suite, tc.assigned_to ?? '', lastRun,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`)
    })
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-cases-${pid}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(
      selectedIds.size === filtered.length
        ? new Set()
        : new Set(filtered.map(t => t.id)),
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading || !project) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <span className="text-slate-400 text-sm animate-pulse">Loading…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header project={project} sprints={sprints} selectedSprintId={null} onSprintChange={() => {}} />

      {/* Stats bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-6 mb-2">
          <StatChip label="Total"    value={stats.total}    color="text-slate-700" />
          <StatChip label="Passed"   value={stats.passed}   color="text-green-600" />
          <StatChip label="Failed"   value={stats.failed}   color="text-red-500" />
          <StatChip label="Untested" value={stats.untested} color="text-slate-400" />
          <StatChip label="Blocked"  value={stats.blocked}  color="text-amber-500" />
          {stats.skipped > 0 && <StatChip label="Skipped" value={stats.skipped} color="text-slate-400" />}
        </div>
        {stats.total > 0 && (
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="bg-green-500 h-full transition-all" style={{ width: `${(stats.passed / stats.total) * 100}%` }} />
            <div className="bg-red-500 h-full transition-all"   style={{ width: `${(stats.failed / stats.total) * 100}%` }} />
            <div className="bg-amber-400 h-full transition-all" style={{ width: `${(stats.blocked / stats.total) * 100}%` }} />
          </div>
        )}
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Suite Navigator ─────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-2">
            <button
              onClick={() => setSelectedSuiteId('all')}
              className={`w-full text-left flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                selectedSuiteId === 'all'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>All Tests</span>
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[1.25rem] text-center ${
                selectedSuiteId === 'all' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'
              }`}>
                {testCases.length}
              </span>
            </button>

            {suites.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="px-4 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Suites</p>
                {suites.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSuiteId(s.id)}
                    className={`w-full text-left flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                      selectedSuiteId === s.id
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate flex-1 mr-2">{s.name}</span>
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold flex-shrink-0 min-w-[1.25rem] text-center ${
                      selectedSuiteId === s.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {suiteCounts[s.id] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New suite input */}
          <div className="border-t border-slate-200 p-3 flex-shrink-0">
            {addingSuite ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={newSuiteName}
                  onChange={e => setNewSuiteName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSuite()
                    if (e.key === 'Escape') { setAddingSuite(false); setNewSuiteName('') }
                  }}
                  placeholder="Suite name…"
                  className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleCreateSuite}
                  disabled={creatingSuite || !newSuiteName.trim()}
                  className="bg-indigo-600 text-white text-xs rounded-lg px-2 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creatingSuite ? '…' : '✓'}
                </button>
                <button
                  onClick={() => { setAddingSuite(false); setNewSuiteName('') }}
                  className="text-slate-400 hover:text-slate-600 px-1 text-sm"
                >×</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSuite(true)}
                className="w-full text-left text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 px-1 py-1"
              >
                <span className="text-base leading-none">+</span> New Suite
              </button>
            )}
          </div>
        </aside>

        {/* ── Center: Test Case Table ───────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap gap-y-2">
            <span className="text-sm font-semibold text-slate-700 mr-1 flex-shrink-0">
              {selectedSuiteId === 'all' ? 'All Tests' : (suites.find(s => s.id === selectedSuiteId)?.name ?? '')}
            </span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="untested">Untested</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="skipped">Skipped</option>
            </select>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Type</option>
              <option value="manual">Manual</option>
              <option value="automated">Automated</option>
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
            />
            <button
              onClick={exportCsv}
              className="ml-auto flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex-shrink-0 flex-wrap gap-y-1.5">
              <span className="text-xs font-semibold text-indigo-700">{selectedIds.size} selected</span>
              <button onClick={() => bulkMarkStatus('passed')}  className="text-xs bg-green-600 text-white rounded-lg px-2.5 py-1 hover:bg-green-700 transition-colors">Mark Passed</button>
              <button onClick={() => bulkMarkStatus('failed')}  className="text-xs bg-red-600 text-white rounded-lg px-2.5 py-1 hover:bg-red-700 transition-colors">Mark Failed</button>
              <button onClick={() => bulkMarkStatus('blocked')} className="text-xs bg-amber-500 text-white rounded-lg px-2.5 py-1 hover:bg-amber-600 transition-colors">Mark Blocked</button>
              <button
                onClick={() => { setMoveToSuiteIds([...selectedIds]); setShowMoveModal(true) }}
                className="text-xs border border-indigo-300 text-indigo-700 rounded-lg px-2.5 py-1 hover:bg-indigo-100 transition-colors"
              >
                Move to Suite
              </button>
              <button onClick={bulkDelete} className="text-xs border border-red-200 text-red-600 rounded-lg px-2.5 py-1 hover:bg-red-50 transition-colors">Delete</button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-700">Clear</button>
            </div>
          )}

          {/* Table or empty state */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              {testCases.length === 0 ? (
                <>
                  <svg className="w-16 h-16 text-slate-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <p className="text-slate-600 font-medium mb-1">No test cases yet</p>
                  <p className="text-slate-400 text-sm">Open a card from the Board and add test cases from its Tests tab</p>
                </>
              ) : (
                <p className="text-slate-400 text-sm">No test cases match the current filters</p>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="w-9 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={allSelectedInView}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="w-8 px-1 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">St.</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Title</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Priority</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Card</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Suite</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Assigned</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Last Run</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tc => {
                    const suite  = suites.find(s => s.id === tc.suite_id)
                    const isSel  = selectedIds.has(tc.id)
                    const isDet  = detailTc?.id === tc.id

                    return (
                      <tr
                        key={tc.id}
                        className={`border-b border-slate-100 transition-colors ${
                          isDet ? 'bg-indigo-50' : isSel ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(tc.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Status */}
                        <td className="px-1 py-2.5">
                          <StatusIcon status={tc.status} />
                        </td>

                        {/* Title */}
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <button
                            onClick={() => setDetailTc(isDet ? null : tc)}
                            className="text-left text-slate-800 hover:text-indigo-600 font-medium truncate w-full block transition-colors"
                            title={tc.title}
                          >
                            {tc.title}
                          </button>
                        </td>

                        {/* Priority */}
                        <td className="px-3 py-2.5">
                          <TPriBadge priority={tc.priority} />
                        </td>

                        {/* Type */}
                        <td className="px-3 py-2.5">
                          <TypeBadge type={tc.test_type} />
                        </td>

                        {/* Card chip */}
                        <td className="px-3 py-2.5">
                          {tc.card_title ? (
                            <button
                              onClick={() => openCardModal(tc.card_id)}
                              className="text-xs bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 rounded px-2 py-0.5 transition-colors max-w-[110px] truncate block"
                              title={tc.card_title}
                            >
                              {tc.card_title}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Suite chip */}
                        <td className="px-3 py-2.5">
                          {suite ? (
                            <span
                              className="text-xs bg-purple-50 text-purple-600 rounded px-2 py-0.5 max-w-[100px] truncate block"
                              title={suite.name}
                            >
                              {suite.name}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Assigned */}
                        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[80px] truncate">
                          {tc.assigned_to ?? '—'}
                        </td>

                        {/* Last run */}
                        <td className="px-3 py-2.5">
                          {tc.latest_run ? (
                            <div className="flex items-center gap-1">
                              <span className={`text-xs font-bold ${STATUS_CFG[tc.latest_run.status as keyof typeof STATUS_CFG]?.color ?? ''}`}>
                                {STATUS_CFG[tc.latest_run.status as keyof typeof STATUS_CFG]?.icon ?? ''}
                              </span>
                              <span className="text-xs text-slate-400">{fmtRelative(tc.latest_run.run_at)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleQuickStatus(tc, 'passed')}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 text-green-700 hover:bg-green-50 font-medium transition-colors"
                            >
                              Pass
                            </button>
                            <button
                              onClick={() => handleQuickStatus(tc, 'failed')}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors"
                            >
                              Fail
                            </button>
                            <div
                              ref={el => { if (el) kebabRefs.current.set(tc.id, el); else kebabRefs.current.delete(tc.id) }}
                              className="relative"
                            >
                              <button
                                onClick={() => setKebabOpenId(p => p === tc.id ? null : tc.id)}
                                className="text-slate-400 hover:text-slate-600 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-base leading-none transition-colors"
                              >
                                ⋮
                              </button>
                              {kebabOpenId === tc.id && (
                                <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-36 py-1">
                                  <button
                                    onClick={() => { setDetailTc(tc); setKebabOpenId(null) }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => { setMoveToSuiteIds([tc.id]); setShowMoveModal(true); setKebabOpenId(null) }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                                  >
                                    Move to Suite
                                  </button>
                                  <button
                                    onClick={() => { handleDelete(tc.id); setKebabOpenId(null) }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Right: Detail Panel ───────────────────────────────────────── */}
        {detailTc && (
          <div className="flex-shrink-0 overflow-hidden" style={{ width: '360px' }}>
            <TestDetailPanel
              tc={detailTc}
              suites={suites}
              onUpdate={handleTcUpdate}
              onClose={() => setDetailTc(null)}
            />
          </div>
        )}
      </div>

      {/* Card Modal */}
      {modalCard && (
        <CardModal
          card={modalCard}
          projectId={pid}
          lanes={lanes}
          sprints={sprints}
          onClose={() => setModalCard(null)}
          onUpdate={updated => setModalCard(updated)}
          onDelete={() => {
            setModalCard(null)
            api.testCases.listByProject(pid).then(setTestCases).catch(() => {})
          }}
        />
      )}

      {/* Move to Suite Modal */}
      {showMoveModal && (
        <MoveToSuiteModal
          suites={suites}
          onSelect={handleMoveToSuite}
          onCancel={() => { setShowMoveModal(false); setMoveToSuiteIds([]) }}
        />
      )}
    </div>
  )
}
