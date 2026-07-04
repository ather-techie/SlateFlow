import { useEffect, useState } from 'react'
import type { Card, TestCase, TestCaseSummary, TestSuite } from '../../types'
import { api } from '../../api/index'
import { useBoardStore } from '../../store/boardStore'
import { computeSummary } from '../../utils/cardModal'
import { FeatureGate } from '../ui/FeatureGate'
import { TPriBadge } from './CardStatusBadges'
import AddTestCaseForm from './AddTestCaseForm'
import TestCaseRow from './TestCaseRow'

interface Props {
  card: Card
  projectId: number
}

type GeneratedTestCase = {
  title: string
  preconditions?: string
  steps: Array<{ step: string; expected: string }>
  expected_result: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

const EMPTY_SUMMARY: TestCaseSummary = { total: 0, passed: 0, failed: 0, untested: 0, blocked: 0, skipped: 0 }

export default function CardTestsTab({ card, projectId }: Props) {
  const setTestCaseSummary = useBoardStore(s => s.setTestCaseSummary)

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [testSummary, setTestSummary] = useState<TestCaseSummary>(EMPTY_SUMMARY)
  const [testSuites, setTestSuites] = useState<TestSuite[]>([])
  const [testFilter, setTestFilter] = useState<'all' | TestCase['status']>('all')
  const [showAddTestForm, setShowAddTestForm] = useState(false)
  const [expandedTestId, setExpandedTestId] = useState<number | null>(null)
  const [passAllConfirm, setPassAllConfirm] = useState(false)

  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiPreview, setAiPreview] = useState<Array<GeneratedTestCase & { selected: boolean }> | null>(null)

  useEffect(() => {
    api.testCases.listByCard(card.id).then(({ cases, summary }) => {
      setTestCases(cases)
      syncSummary(cases, summary)
    }).catch(() => {})
    api.testSuites.listByProject(projectId).then(setTestSuites).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, projectId])

  function syncSummary(cases: TestCase[], overrideSummary?: TestCaseSummary) {
    const s = overrideSummary ?? computeSummary(cases)
    setTestSummary(s)
    setTestCaseSummary(card.id, s)
  }

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
    const prev = testCases
    const next = testCases.map(t => t.id === tc.id ? { ...t, status } : t)
    setTestCases(next)
    syncSummary(next)
    try {
      const tester = localStorage.getItem('lb-author') || undefined
      await api.testCases.addRun(tc.id, { status, run_by: tester })
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
      await api.testCases.bulkStatus(card.id, untestedIds, 'passed')
    } catch {
      setTestCases(prev)
      syncSummary(prev)
    }
  }

  async function handleGenerateTestCases() {
    setAiGenerating(true)
    try {
      const res = await api.ai.generateTestCases(card.id)
      setAiPreview(res.data.testCases.map((tc: GeneratedTestCase) => ({ ...tc, selected: true })))
    } catch {
      // error already shown via axios interceptor
    } finally {
      setAiGenerating(false)
    }
  }

  async function handleSaveSelected() {
    if (!aiPreview) return
    try {
      const selected = aiPreview.filter(t => t.selected)
      const newCases: TestCase[] = []
      for (const tc of selected) {
        const newCase = await api.testCases.create(card.id, {
          title: tc.title,
          preconditions: tc.preconditions,
          steps: tc.steps,
          expected_result: tc.expected_result,
          priority: tc.priority,
          test_type: 'manual',
        })
        newCases.push(newCase)
      }
      const updated = [...testCases, ...newCases]
      setTestCases(updated)
      syncSummary(updated)
      setAiPreview(null)
    } catch {
      // error already shown
    }
  }

  const filteredTests = testFilter === 'all' ? testCases : testCases.filter(t => t.status === testFilter)

  return (
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
        <FeatureGate flag="auto_test_case_generation_ai">
          <button
            onClick={handleGenerateTestCases}
            disabled={aiGenerating}
            className="text-xs flex items-center gap-1.5 bg-purple-600 text-white rounded-lg px-3 py-1.5 hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiGenerating ? 'Generating…' : '✨ Generate with AI'}
          </button>
        </FeatureGate>
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

      {/* AI Preview Panel */}
      {aiPreview && (
        <div className="border border-purple-200 rounded-xl bg-purple-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-purple-700 flex items-center gap-1.5">✨ AI-Generated Test Cases</span>
            <button onClick={() => setAiPreview(null)} className="text-slate-500 hover:text-slate-700 transition-colors">×</button>
          </div>
          <div className="space-y-3">
            {aiPreview.map((tc, i) => (
              <label key={i} className="flex gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={tc.selected}
                  onChange={() => setAiPreview(prev => prev!.map((t, j) => j === i ? { ...t, selected: !t.selected } : t))}
                  className="mt-0.5 accent-purple-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{tc.title}</div>
                  {tc.steps && tc.steps.length > 0 && (
                    <ol className="mt-1 space-y-0.5 text-xs text-slate-500 list-decimal list-inside">
                      {tc.steps.map((s, si) => <li key={si}>{s.step}</li>)}
                    </ol>
                  )}
                  <div className="mt-1 text-xs text-slate-500">Expected: {tc.expected_result}</div>
                </div>
                <span className="self-start flex-shrink-0"><TPriBadge priority={tc.priority} /></span>
              </label>
            ))}
          </div>
          <button
            onClick={handleSaveSelected}
            disabled={!aiPreview.some(t => t.selected)}
            className="mt-4 w-full py-1.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save Selected ({aiPreview.filter(t => t.selected).length})
          </button>
        </div>
      )}

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
  )
}
