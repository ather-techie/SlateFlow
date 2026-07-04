import { useState } from 'react'
import type { TestCase, TestSuite } from '../../types'
import { api } from '../../api/index'

interface Props {
  cardId: number
  suites: TestSuite[]
  initial?: TestCase
  onSuccess: (tc: TestCase) => void
  onCancel: () => void
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'
const selectCls = `${inputCls} bg-white`

export default function AddTestCaseForm({ cardId, suites, initial, onSuccess, onCancel }: Props) {
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
        ? await api.testCases.update(initial.id, data)
        : await api.testCases.create(cardId, data)
      onSuccess(tc)
    } finally {
      setSubmitting(false)
    }
  }

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
