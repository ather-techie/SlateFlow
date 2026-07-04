import { useState } from 'react'
import type { TestRun } from '../../types'
import { api } from '../../api/index'

interface Props {
  testCaseId: number
  onSuccess: (run: TestRun) => void
  onCancel: () => void
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function RecordRunForm({ testCaseId, onSuccess, onCancel }: Props) {
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
