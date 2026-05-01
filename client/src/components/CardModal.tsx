import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActivityLog, Card, Comment, Label, Lane, Sprint, TestCase, TestCaseSummary, TestRun, TestSuite } from '../types'
import { api } from '../api'
import { useBoardStore } from '../store/boardStore'

interface Props {
  card: Card
  projectId: number
  lanes?: Lane[]
  sprints?: Sprint[]
  onClose: () => void
  onUpdate: (updated: Card) => void
  onDelete: (id: number) => void
}

type Tab = 'description' | 'comments' | 'activity' | 'tests'

const PRIORITIES: Card['priority'][] = ['p0', 'p1', 'p2', 'p3']
const PRIORITY_LABELS: Record<string, string> = {
  p0: 'P0 — Critical', p1: 'P1 — High', p2: 'P2 — Medium', p3: 'P3 — Low',
}
const LABEL_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
  '#64748b', '#1e293b',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso.includes('Z') ? iso : iso + 'Z')
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtRelative(iso: string) {
  const secs = (Date.now() - new Date(iso.includes('Z') ? iso : iso + 'Z').getTime()) / 1000
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function activityText(action: string, meta: string): string {
  try {
    const m = JSON.parse(meta)
    if (action === 'create') return 'Card created'
    if (action === 'move') return 'Card moved between columns'
    if (action === 'comment') return `${m.author ?? 'Someone'} added a comment`
    if (action === 'test_run') return `Test "${m.title}" marked ${m.status}${m.run_by ? ` by ${m.run_by}` : ''}`
    if (action === 'update') {
      const fields = Object.keys(m).map(k => k.replace(/_/g, ' ')).join(', ')
      return `Updated ${fields}`
    }
    return action
  } catch { return action }
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

function computeSummary(cases: TestCase[]): TestCaseSummary {
  return {
    total: cases.length,
    passed: cases.filter(t => t.status === 'passed').length,
    failed: cases.filter(t => t.status === 'failed').length,
    untested: cases.filter(t => t.status === 'untested').length,
    blocked: cases.filter(t => t.status === 'blocked').length,
    skipped: cases.filter(t => t.status === 'skipped').length,
  }
}

// ── Test-specific small components ────────────────────────────────────────────

const STATUS_CFG = {
  untested: { icon: '○', color: 'text-slate-400' },
  passed:   { icon: '✓', color: 'text-green-600' },
  failed:   { icon: '✗', color: 'text-red-500' },
  blocked:  { icon: '⊘', color: 'text-amber-500' },
  skipped:  { icon: '—', color: 'text-slate-400' },
} as const

const TPRI_CFG: Record<string, { label: string; cls: string }> = {
  critical: { label: 'CRITICAL', cls: 'bg-red-100 text-red-700' },
  high:     { label: 'HIGH',     cls: 'bg-orange-100 text-orange-700' },
  medium:   { label: 'MEDIUM',   cls: 'bg-blue-100 text-blue-700' },
  low:      { label: 'LOW',      cls: 'bg-slate-100 text-slate-500' },
}

function StatusIcon({ status }: { status: TestCase['status'] }) {
  const cfg = STATUS_CFG[status]
  return <span className={`text-base font-bold w-5 flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
}

function TPriBadge({ priority }: { priority: TestCase['priority'] }) {
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

// ── AddTestCaseForm ───────────────────────────────────────────────────────────

interface AddFormProps {
  cardId: number
  suites: TestSuite[]
  initial?: TestCase
  onSuccess: (tc: TestCase) => void
  onCancel: () => void
}

function AddTestCaseForm({ cardId, suites, initial, onSuccess, onCancel }: AddFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [priority, setPriority] = useState<TestCase['priority']>(initial?.priority ?? 'medium')
  const [testType, setTestType] = useState<'manual' | 'automated'>(initial?.test_type ?? 'manual')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? '')
  const [preconditions, setPreconditions] = useState(initial?.preconditions ?? '')
  const [expectedResult, setExpectedResult] = useState(initial?.expected_result ?? '')
  const [suiteId, setSuiteId] = useState<number | ''>(initial?.suite_id ?? '')
  const [steps, setSteps] = useState<{ step: string; expected: string }[]>(initial?.steps ?? [])
  const [submitting, setSubmitting] = useState(false)

  function addStep() { setSteps(prev => [...prev, { step: '', expected: '' }]) }
  function removeStep(i: number) { setSteps(prev => prev.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, field: 'step' | 'expected', value: string) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        test_type: testType,
        assigned_to: assignedTo.trim() || undefined,
        preconditions: preconditions.trim() || undefined,
        expected_result: expectedResult.trim() || undefined,
        suite_id: suiteId || undefined,
        steps: steps.filter(s => s.step.trim()).length ? steps.filter(s => s.step.trim()) : undefined,
      }
      const tc = initial
        ? await api.updateTestCase(initial.id, data)
        : await api.createTestCase(cardId, data)
      onSuccess(tc)
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const selectCls = `${inputCls} bg-white`

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded-xl bg-slate-50 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-slate-700">{initial ? 'Edit test case' : 'New test case'}</h4>

      <input
        autoFocus
        required
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Test case title (required)"
        className={inputCls}
      />

      <div className="grid grid-cols-3 gap-2">
        <select value={priority} onChange={e => setPriority(e.target.value as TestCase['priority'])} className={selectCls}>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={testType} onChange={e => setTestType(e.target.value as 'manual' | 'automated')} className={selectCls}>
          <option value="manual">Manual</option>
          <option value="automated">Automated</option>
        </select>
        <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Assigned to" className={inputCls} />
      </div>

      {suites.length > 0 && (
        <select value={suiteId} onChange={e => setSuiteId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
          <option value="">— No suite —</option>
          {suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (Markdown supported)" rows={2} className={`${inputCls} resize-none`} />
      <textarea value={preconditions} onChange={e => setPreconditions(e.target.value)} placeholder="Preconditions" rows={2} className={`${inputCls} resize-none`} />
      <textarea value={expectedResult} onChange={e => setExpectedResult(e.target.value)} placeholder="Expected result" rows={2} className={`${inputCls} resize-none`} />

      {/* Steps builder */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Steps</span>
          <button type="button" onClick={addStep} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Add Step</button>
        </div>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 mb-1.5 items-start">
            <span className="text-xs text-slate-400 font-mono pt-2 w-4 flex-shrink-0">{i + 1}</span>
            <input value={step.step} onChange={e => updateStep(i, 'step', e.target.value)} placeholder="Step" className={`${inputCls} flex-1`} />
            <input value={step.expected} onChange={e => updateStep(i, 'expected', e.target.value)} placeholder="Expected" className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => removeStep(i)} className="text-slate-400 hover:text-red-500 pt-2 text-lg leading-none flex-shrink-0">×</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting || !title.trim()} className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Add test case'}
        </button>
        <button type="button" onClick={onCancel} className="border border-slate-200 text-slate-600 text-sm rounded-lg px-4 py-1.5 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
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
      const run = await api.addTestRun(testCaseId, {
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
    <form onSubmit={handleSubmit} className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Record run</p>
      <div className="grid grid-cols-2 gap-2">
        <select value={status} onChange={e => setStatus(e.target.value as TestRun['status'])} className={`${inputCls} bg-white`}>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
          <option value="skipped">Skipped</option>
        </select>
        <input value={runBy} onChange={e => setRunBy(e.target.value)} placeholder="Run by" className={inputCls} />
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes / actual result observed" rows={2} className={`${inputCls} resize-none`} />
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving…' : 'Submit'}
        </button>
        <button type="button" onClick={onCancel} className="border border-slate-200 text-slate-600 text-sm rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">Cancel</button>
      </div>
    </form>
  )
}

// ── TestCaseRow ───────────────────────────────────────────────────────────────

interface TestCaseRowProps {
  tc: TestCase
  suites: TestSuite[]
  cardId: number
  expanded: boolean
  onToggleExpand: () => void
  onQuickStatus: (tc: TestCase, status: 'passed' | 'failed' | 'blocked') => void
  onUpdate: (updated: TestCase) => void
  onDelete: (id: number) => void
}

function TestCaseRow({ tc, suites, cardId, expanded, onToggleExpand, onQuickStatus, onUpdate, onDelete }: TestCaseRowProps) {
  const [editing, setEditing] = useState(false)
  const [showRunForm, setShowRunForm] = useState(false)
  const [runs, setRuns] = useState<TestRun[] | null>(null)
  const [kebabOpen, setKebabOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const kebabRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!kebabOpen) return
    const handler = (e: MouseEvent) => {
      if (!kebabRef.current?.contains(e.target as Node)) setKebabOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [kebabOpen])

  async function loadRunHistory() {
    if (runs !== null || loadingRuns) return
    setLoadingRuns(true)
    try {
      const r = await api.getTestRuns(tc.id)
      setRuns(r)
    } finally {
      setLoadingRuns(false)
    }
  }

  function handleExpand() {
    onToggleExpand()
    if (!expanded) loadRunHistory()
  }

  function handleRunSuccess(run: TestRun) {
    setShowRunForm(false)
    setRuns(prev => (prev ? [run, ...prev] : [run]))
    onUpdate({ ...tc, status: run.status as TestCase['status'] })
  }

  function handleKebabEdit() {
    setKebabOpen(false)
    setEditing(true)
    if (!expanded) { onToggleExpand(); loadRunHistory() }
  }

  function handleKebabHistory() {
    setKebabOpen(false)
    if (!expanded) { onToggleExpand(); loadRunHistory() }
  }

  function handleKebabDelete() {
    setKebabOpen(false)
    setConfirmDelete(true)
  }

  async function handleConfirmDelete() {
    await api.deleteTestCase(tc.id).catch(() => {})
    onDelete(tc.id)
  }

  const qBtnCls = 'text-xs px-2 py-0.5 rounded border font-medium transition-colors'

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* Main row */}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <StatusIcon status={tc.status} />
          <span className="flex-1 text-sm font-medium text-slate-800 min-w-0 truncate">{tc.title}</span>
          <button onClick={handleExpand} className="text-slate-400 hover:text-slate-600 transition-colors text-xs w-5 flex-shrink-0" title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? '▾' : '▸'}
          </button>
          <div ref={kebabRef} className="relative flex-shrink-0">
            <button
              onClick={() => setKebabOpen(p => !p)}
              className="text-slate-400 hover:text-slate-600 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 transition-colors text-base leading-none"
            >
              ⋮
            </button>
            {kebabOpen && (
              <div className="absolute right-0 top-7 z-10 bg-white border border-slate-200 rounded-xl shadow-lg w-32 py-1">
                <button onClick={handleKebabEdit}    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Edit</button>
                <button onClick={handleKebabHistory} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">View History</button>
                <button onClick={handleKebabDelete}  className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">Delete</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1.5 pl-7">
          <TPriBadge priority={tc.priority} />
          <TypeBadge type={tc.test_type} />
          {tc.assigned_to && (
            <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{tc.assigned_to}</span>
          )}
          <div className="ml-auto flex gap-1">
            <button onClick={() => onQuickStatus(tc, 'passed')} className={`${qBtnCls} border-green-200 text-green-700 hover:bg-green-50`}>Pass</button>
            <button onClick={() => onQuickStatus(tc, 'failed')} className={`${qBtnCls} border-red-200 text-red-600 hover:bg-red-50`}>Fail</button>
            <button onClick={() => onQuickStatus(tc, 'blocked')} className={`${qBtnCls} border-amber-200 text-amber-600 hover:bg-amber-50`}>Block</button>
          </div>
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="px-3 pb-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-red-600 font-medium flex-1">Delete this test case?</span>
          <button onClick={handleConfirmDelete} className="text-xs bg-red-600 text-white rounded-lg px-3 py-1 hover:bg-red-700 transition-colors">Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="text-xs border border-slate-200 rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && !editing && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 bg-slate-50">
          {tc.description && (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(tc.description) }} />
          )}
          {tc.preconditions && (
            <p className="text-xs text-slate-500 italic"><span className="font-semibold not-italic text-slate-600">Preconditions: </span>{tc.preconditions}</p>
          )}
          {tc.steps && tc.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Steps</p>
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
          {tc.expected_result && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Expected Result</p>
              <p className="text-xs text-slate-700">{tc.expected_result}</p>
            </div>
          )}

          {/* Run History */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Run History</p>
            {loadingRuns && <p className="text-xs text-slate-400">Loading…</p>}
            {runs !== null && runs.length === 0 && <p className="text-xs text-slate-400">No runs recorded yet.</p>}
            {runs !== null && runs.slice(0, 5).map(r => {
              const cfg = STATUS_CFG[r.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.untested
              return (
                <div key={r.id} className="flex items-start gap-2 py-1 border-t border-slate-100 first:border-t-0">
                  <span className={`text-xs font-bold flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold ${cfg.color} capitalize`}>{r.status}</span>
                    {r.run_by && <span className="text-xs text-slate-500 ml-1.5">by {r.run_by}</span>}
                    {r.notes && <p className="text-xs text-slate-500 mt-0.5 truncate">{r.notes}</p>}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{fmtRelative(r.run_at)}</span>
                </div>
              )
            })}
          </div>

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
      )}

      {/* Edit mode */}
      {expanded && editing && (
        <div className="border-t border-slate-100 p-4 bg-slate-50">
          <AddTestCaseForm
            cardId={cardId}
            suites={suites}
            initial={tc}
            onSuccess={updated => { onUpdate(updated); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── Main CardModal ────────────────────────────────────────────────────────────

export default function CardModal({ card, projectId, lanes, sprints, onClose, onUpdate, onDelete }: Props) {
  const setTestCaseSummary = useBoardStore(s => s.setTestCaseSummary)

  const [activeTab, setActiveTab] = useState<Tab>('description')

  // Description / metadata
  const [title, setTitle]             = useState(card.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [description, setDescription] = useState(card.description)
  const [descPreview, setDescPreview] = useState(false)
  const [priority, setPriority]       = useState(card.priority)
  const [storyPoints, setStoryPoints] = useState(card.story_points?.toString() ?? '')
  const [assignee, setAssignee]       = useState(card.assignee ?? '')
  const [currentLaneId, setCurrentLaneId]     = useState<number | null>(card.swim_lane_id ?? null)
  const [movingLane, setMovingLane]   = useState(false)
  const [currentSprintId, setCurrentSprintId] = useState<number | null>(card.sprint_id ?? null)

  // Labels
  const [allLabels, setAllLabels]       = useState<Label[]>([])
  const [cardLabels, setCardLabels]     = useState<Label[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_PALETTE[5])
  const [creatingLabel, setCreatingLabel] = useState(false)

  // Comments
  const [comments, setComments]           = useState<Comment[]>([])
  const [commentBody, setCommentBody]     = useState('')
  const [commentAuthor, setCommentAuthor] = useState(() => localStorage.getItem('lb-author') ?? '')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Activity
  const [activity, setActivity] = useState<ActivityLog[]>([])

  // Danger
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Tests
  const [testCases, setTestCases]   = useState<TestCase[]>([])
  const [testSummary, setTestSummaryLocal] = useState<TestCaseSummary>({ total: 0, passed: 0, failed: 0, untested: 0, blocked: 0, skipped: 0 })
  const [testFilter, setTestFilter] = useState<'all' | TestCase['status']>('all')
  const [showAddTestForm, setShowAddTestForm] = useState(false)
  const [expandedTestId, setExpandedTestId]   = useState<number | null>(null)
  const [passAllConfirm, setPassAllConfirm]   = useState(false)
  const [testSuites, setTestSuites]           = useState<TestSuite[]>([])

  const titleRef    = useRef<HTMLInputElement>(null)
  const labelPickerRef = useRef<HTMLDivElement>(null)

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    api.getComments(card.id).then(setComments).catch(() => {})
    api.getActivityLog(card.id).then(setActivity).catch(() => {})
    api.getLabels(projectId).then(setAllLabels).catch(() => {})
    api.getCardLabels(card.id).then(setCardLabels).catch(() => {})
    api.getTestCases(card.id).then(({ cases, summary }) => {
      setTestCases(cases)
      syncSummary(cases, summary)
    }).catch(() => {})
    api.getTestSuites(projectId).then(setTestSuites).catch(() => {})
  }, [card.id, projectId])

  function syncSummary(cases: TestCase[], overrideSummary?: TestCaseSummary) {
    const s = overrideSummary ?? computeSummary(cases)
    setTestSummaryLocal(s)
    setTestCaseSummary(card.id, s)
  }

  // ── Key / click handlers ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLabelPicker) { setShowLabelPicker(false); return }
        if (confirmDelete) { setConfirmDelete(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, showLabelPicker, confirmDelete])

  useEffect(() => {
    if (!showLabelPicker) return
    const handler = (e: MouseEvent) => {
      if (!labelPickerRef.current?.contains(e.target as Node)) setShowLabelPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLabelPicker])

  useEffect(() => { if (editingTitle) titleRef.current?.focus() }, [editingTitle])

  // ── Card save helpers ───────────────────────────────────────────────────────

  async function saveField(updates: Partial<Pick<Card, 'title' | 'description' | 'priority' | 'story_points' | 'assignee' | 'sprint_id'>>) {
    try { onUpdate(await api.updateCard(card.id, updates)) } catch { /* optimistic */ }
  }

  async function handleMoveLane(laneId: number) {
    const prev = currentLaneId
    setCurrentLaneId(laneId)
    setMovingLane(true)
    try { onUpdate(await api.moveLaneCard(card.id, { lane_id: laneId })) }
    catch { setCurrentLaneId(prev) }
    finally { setMovingLane(false) }
  }

  async function handleSprintChange(sprintId: number | null) {
    const prev = currentSprintId
    setCurrentSprintId(sprintId)
    try { onUpdate(await api.updateCard(card.id, { sprint_id: sprintId })) }
    catch { setCurrentSprintId(prev) }
  }

  function handleTitleSave() {
    setEditingTitle(false)
    const t = title.trim() || card.title
    setTitle(t)
    saveField({ title: t })
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleTitleSave()
    if (e.key === 'Escape') { setTitle(card.title); setEditingTitle(false) }
  }

  // ── Labels ──────────────────────────────────────────────────────────────────

  async function toggleLabel(label: Label) {
    const has = cardLabels.some(l => l.id === label.id)
    if (has) {
      setCardLabels(prev => prev.filter(l => l.id !== label.id))
      await api.removeCardLabel(card.id, label.id).catch(() => setCardLabels(prev => [...prev, label]))
    } else {
      setCardLabels(prev => [...prev, label])
      await api.addCardLabel(card.id, label.id).catch(() => setCardLabels(prev => prev.filter(l => l.id !== label.id)))
    }
  }

  async function handleCreateLabel() {
    if (!newLabelName.trim() || creatingLabel) return
    setCreatingLabel(true)
    try {
      const label = await api.createLabel(projectId, { name: newLabelName.trim(), color: newLabelColor })
      setAllLabels(prev => [...prev, label])
      setNewLabelName('')
      setCardLabels(prev => [...prev, label])
      await api.addCardLabel(card.id, label.id).catch(() => setCardLabels(prev => prev.filter(l => l.id !== label.id)))
    } finally { setCreatingLabel(false) }
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = commentBody.trim()
    const author = commentAuthor.trim() || 'anonymous'
    if (!body) return
    setSubmittingComment(true)
    try {
      localStorage.setItem('lb-author', author)
      const comment = await api.createComment(card.id, { author, body })
      setComments(prev => [...prev, comment])
      setCommentBody('')
      api.getActivityLog(card.id).then(setActivity).catch(() => {})
    } finally { setSubmittingComment(false) }
  }

  // ── Delete card ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    await api.deleteCard(card.id).catch(() => {})
    onDelete(card.id)
    onClose()
  }

  // ── Tests ─────────────────────────────────────────────────────────────────────

  function handleTestCaseUpdate(updated: TestCase) {
    const next = testCases.map(t => t.id === updated.id ? updated : t)
    setTestCases(next)
    syncSummary(next)
  }

  function handleTestCaseDelete(id: number) {
    const next = testCases.filter(t => t.id !== id)
    setTestCases(next)
    syncSummary(next)
  }

  async function handleQuickStatus(tc: TestCase, status: 'passed' | 'failed' | 'blocked') {
    // Optimistic update
    const prev = testCases
    const next = testCases.map(t => t.id === tc.id ? { ...t, status } : t)
    setTestCases(next)
    syncSummary(next)
    try {
      const tester = localStorage.getItem('lb-author') || undefined
      await api.addTestRun(tc.id, { status, run_by: tester })
    } catch {
      setTestCases(prev)
      syncSummary(prev)
    }
  }

  async function handlePassAll() {
    setPassAllConfirm(false)
    const untestedIds = testCases.filter(t => t.status === 'untested').map(t => t.id)
    if (!untestedIds.length) return
    const prev = testCases
    const next = testCases.map(t => t.status === 'untested' ? { ...t, status: 'passed' as const } : t)
    setTestCases(next)
    syncSummary(next)
    try {
      await api.bulkStatusTestCases(card.id, untestedIds, 'passed')
    } catch {
      setTestCases(prev)
      syncSummary(prev)
    }
  }

  const filteredTests = testFilter === 'all' ? testCases : testCases.filter(t => t.status === testFilter)

  // ── Tab label helpers ─────────────────────────────────────────────────────────

  const testBadgeColor = testSummary.failed > 0
    ? 'bg-red-500'
    : testSummary.total > 0 && testSummary.passed === testSummary.total
      ? 'bg-green-500'
      : 'bg-slate-400'

  // ── Render ────────────────────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-start justify-center p-4 sm:p-10 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto" onMouseDown={e => e.stopPropagation()}>

        {/* Title */}
        <div className="flex items-start gap-3 px-6 pt-5 pb-3 border-b border-slate-100">
          {editingTitle ? (
            <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)} onBlur={handleTitleSave} onKeyDown={handleTitleKeyDown} className="flex-1 text-lg font-semibold text-slate-900 border-0 p-0 focus:outline-none bg-transparent min-w-0" />
          ) : (
            <h2 className="flex-1 text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 min-w-0 transition-colors" onClick={() => setEditingTitle(true)}>{title}</h2>
          )}
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-0.5 transition-colors flex-shrink-0">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 px-4">
          {(['description', 'comments', 'activity', 'tests'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {tab === 'comments' ? `Comments${comments.length ? ` (${comments.length})` : ''}` : null}
              {tab === 'description' ? 'Description' : null}
              {tab === 'activity' ? 'Activity' : null}
              {tab === 'tests' ? (
                <>
                  Tests
                  {testSummary.total > 0 && (
                    <span className={`text-white text-[10px] font-bold rounded-full px-1.5 min-w-[1.25rem] h-4 flex items-center justify-center ${testBadgeColor}`}>
                      {testSummary.total}
                    </span>
                  )}
                </>
              ) : null}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-3 gap-x-6 gap-y-5">
          {/* Left column — tab content */}
          <div className="col-span-2">

            {/* ── Description tab ── */}
            {activeTab === 'description' && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Description</label>
                    <button onClick={() => setDescPreview(p => !p)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                      {descPreview ? 'Edit' : 'Preview'}
                    </button>
                  </div>
                  {descPreview ? (
                    <div className="min-h-[7.5rem] rounded-lg border border-slate-200 px-3 py-2.5 text-slate-800" dangerouslySetInnerHTML={{ __html: description ? renderMarkdown(description) : '<p class="text-sm text-slate-400">No description.</p>' }} />
                  ) : (
                    <textarea value={description} onChange={e => setDescription(e.target.value)} onBlur={() => saveField({ description })} rows={5} placeholder="Add a description… (Markdown supported)" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  )}
                </div>
              </div>
            )}

            {/* ── Comments tab ── */}
            {activeTab === 'comments' && (
              <div>
                {comments.length === 0 ? (
                  <p className="text-sm text-slate-400 mb-3">No comments yet.</p>
                ) : (
                  <ul className="space-y-3 mb-4 max-h-52 overflow-y-auto pr-1">
                    {comments.map(c => (
                      <li key={c.id} className="flex gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{c.author[0].toUpperCase()}</span>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                            <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={handleCommentSubmit} className="space-y-2">
                  <input value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)} placeholder="Your name" className={inputCls} />
                  <textarea value={commentBody} onChange={e => setCommentBody(e.target.value)} placeholder="Add a comment…" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  <button type="submit" disabled={submittingComment || !commentBody.trim()} className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Post comment</button>
                </form>
              </div>
            )}

            {/* ── Activity tab ── */}
            {activeTab === 'activity' && (
              <div>
                {activity.length === 0 ? (
                  <p className="text-sm text-slate-400">No activity yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto">
                    {activity.map(a => (
                      <li key={a.id} className="flex items-start gap-2 text-xs text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                        <span className="flex-1">{activityText(a.action, a.meta)}</span>
                        <span className="text-slate-400 flex-shrink-0 tabular-nums">{fmtDate(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Tests tab ── */}
            {activeTab === 'tests' && (
              <div className="space-y-3">
                {/* Top bar */}
                <div className="flex items-center gap-2">
                  {testSummary.untested > 0 && (
                    passAllConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Mark {testSummary.untested} untested as passed?</span>
                        <button onClick={handlePassAll} className="text-xs bg-green-600 text-white rounded-lg px-3 py-1 hover:bg-green-700 transition-colors">Confirm</button>
                        <button onClick={() => setPassAllConfirm(false)} className="text-xs border border-slate-200 rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setPassAllConfirm(true)} className="text-xs border border-green-200 text-green-700 rounded-lg px-3 py-1.5 hover:bg-green-50 transition-colors font-medium">
                        Pass All
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setShowAddTestForm(p => !p)}
                    className="ml-auto text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 transition-colors font-medium"
                  >
                    {showAddTestForm ? '× Cancel' : '+ Add Test Case'}
                  </button>
                </div>

                {/* Filter pills */}
                <div className="flex gap-1 flex-wrap">
                  {(['all', 'untested', 'passed', 'failed', 'blocked', 'skipped'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setTestFilter(f)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors capitalize ${
                        testFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {f === 'all' ? `All (${testSummary.total})` : f}
                    </button>
                  ))}
                </div>

                {/* Summary row */}
                {testSummary.total > 0 && (
                  <p className="text-xs">
                    <span className="text-green-600 font-semibold">{testSummary.passed} passed</span>
                    <span className="text-slate-300 mx-1">·</span>
                    <span className="text-red-500 font-semibold">{testSummary.failed} failed</span>
                    <span className="text-slate-300 mx-1">·</span>
                    <span className="text-slate-400">{testSummary.untested} untested</span>
                    {testSummary.blocked > 0 && (
                      <><span className="text-slate-300 mx-1">·</span><span className="text-amber-500">{testSummary.blocked} blocked</span></>
                    )}
                    {testSummary.skipped > 0 && (
                      <><span className="text-slate-300 mx-1">·</span><span className="text-slate-400">{testSummary.skipped} skipped</span></>
                    )}
                  </p>
                )}

                {/* Add form */}
                {showAddTestForm && (
                  <AddTestCaseForm
                    cardId={card.id}
                    suites={testSuites}
                    onSuccess={tc => {
                      const next = [...testCases, tc]
                      setTestCases(next)
                      syncSummary(next)
                      setShowAddTestForm(false)
                    }}
                    onCancel={() => setShowAddTestForm(false)}
                  />
                )}

                {/* Test case list */}
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredTests.length === 0 && (
                    <p className="text-sm text-slate-400 py-4 text-center">
                      {testCases.length === 0 ? 'No test cases yet.' : 'No test cases match this filter.'}
                    </p>
                  )}
                  {filteredTests.map(tc => (
                    <TestCaseRow
                      key={tc.id}
                      tc={tc}
                      suites={testSuites}
                      cardId={card.id}
                      expanded={expandedTestId === tc.id}
                      onToggleExpand={() => setExpandedTestId(p => p === tc.id ? null : tc.id)}
                      onQuickStatus={handleQuickStatus}
                      onUpdate={handleTestCaseUpdate}
                      onDelete={handleTestCaseDelete}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right column — metadata (always visible) */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Priority</label>
              <select value={priority} onChange={e => { const p = e.target.value as Card['priority']; setPriority(p); saveField({ priority: p }) }} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Story Points</label>
              <input type="number" min={1} max={13} value={storyPoints} onChange={e => setStoryPoints(e.target.value)} onBlur={() => saveField({ story_points: storyPoints !== '' ? Number(storyPoints) : null })} placeholder="—" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Assignee</label>
              <input value={assignee} onChange={e => setAssignee(e.target.value)} onBlur={() => saveField({ assignee: assignee.trim() || null })} placeholder="Unassigned" className={inputCls} />
            </div>

            {/* Labels */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Labels</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {cardLabels.map(l => (
                  <button key={l.id} onClick={() => toggleLabel(l)} title="Click to remove" className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-xs font-medium transition-opacity hover:opacity-75" style={{ backgroundColor: l.color }}>
                    {l.name}<span className="text-white/70 text-[10px] leading-none">×</span>
                  </button>
                ))}
                <div ref={labelPickerRef} className="relative">
                  <button onClick={() => setShowLabelPicker(p => !p)} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">+ Add label</button>
                  {showLabelPicker && (
                    <div className="absolute left-0 top-8 z-10 bg-white border border-slate-200 rounded-xl shadow-lg w-56 p-3 space-y-3">
                      {allLabels.length > 0 && (
                        <div className="space-y-0.5 max-h-36 overflow-y-auto">
                          {allLabels.map(l => {
                            const active = cardLabels.some(cl => cl.id === l.id)
                            return (
                              <button key={l.id} onClick={() => toggleLabel(l)} className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors text-left">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                                <span className="flex-1 text-xs text-slate-700">{l.name}</span>
                                {active && <span className="text-indigo-500 text-xs">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      <div className={allLabels.length > 0 ? 'border-t border-slate-100 pt-2 space-y-1.5' : 'space-y-1.5'}>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">New label</p>
                        <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateLabel() }} placeholder="Label name…" className="w-full text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <div className="flex gap-1 flex-wrap">
                          {LABEL_PALETTE.map(c => (
                            <button key={c} onClick={() => setNewLabelColor(c)} className={`w-5 h-5 rounded-full transition-transform ${newLabelColor === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <button onClick={handleCreateLabel} disabled={creatingLabel || !newLabelName.trim()} className="w-full text-xs bg-indigo-600 text-white rounded-md py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Create &amp; add</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {lanes && lanes.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Lane</label>
                <select value={currentLaneId ?? ''} onChange={e => handleMoveLane(Number(e.target.value))} disabled={movingLane} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-60">
                  {!currentLaneId && <option value="">— unassigned —</option>}
                  {lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {sprints && sprints.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Sprint</label>
                <select value={currentSprintId ?? ''} onChange={e => handleSprintChange(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">— No sprint —</option>
                  {sprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' ●' : ''}</option>)}
                </select>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Created{' '}
                {new Date(card.created_at.includes('Z') ? card.created_at : card.created_at + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <div className="pt-1 border-t border-slate-100">
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 font-medium">Delete this card permanently?</p>
                  <div className="flex gap-2">
                    <button onClick={handleDelete} className="flex-1 text-xs bg-red-600 text-white rounded-lg py-1.5 font-medium hover:bg-red-700 transition-colors">Yes, delete</button>
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="w-full text-xs text-red-500 border border-red-200 rounded-lg py-1.5 font-medium hover:bg-red-50 transition-colors">Delete card</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
