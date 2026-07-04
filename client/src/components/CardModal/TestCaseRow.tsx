import { useEffect, useRef, useState } from 'react'
import type { TestCase, TestRun, TestSuite } from '../../types'
import { api } from '../../api/index'
import { fmtRelative, renderMarkdown } from '../../utils/cardModal'
import { StatusIcon, TPriBadge, TypeBadge, STATUS_CFG } from './CardStatusBadges'
import AddTestCaseForm from './AddTestCaseForm'
import RecordRunForm from './RecordRunForm'

interface Props {
  tc: TestCase
  suites: TestSuite[]
  cardId: number
  expanded: boolean
  onToggleExpand: () => void
  onQuickStatus: (tc: TestCase, status: 'passed' | 'failed' | 'blocked') => void
  onUpdate: (updated: TestCase) => void
  onDelete: (id: number) => void
}

export default function TestCaseRow({ tc, suites, cardId, expanded, onToggleExpand, onQuickStatus, onUpdate, onDelete }: Props) {
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
      const r = await api.testCases.listRuns(tc.id)
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
    await api.testCases.delete(tc.id).catch(() => {})
    onDelete(tc.id)
  }

  const qBtnCls = 'text-xs px-2 py-0.5 rounded border font-medium transition-colors'

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
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
                <button onClick={handleKebabEdit} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Edit</button>
                <button onClick={handleKebabHistory} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">View History</button>
                <button onClick={handleKebabDelete} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">Delete</button>
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

      {confirmDelete && (
        <div className="px-3 pb-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-red-600 font-medium flex-1">Delete this test case?</span>
          <button onClick={handleConfirmDelete} className="text-xs bg-red-600 text-white rounded-lg px-3 py-1 hover:bg-red-700 transition-colors">Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="text-xs border border-slate-200 rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      )}

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
