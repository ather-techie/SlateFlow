import { useState } from 'react'
import { api, type AcceptanceCriterion } from '../../api/index'

interface Props {
  cardId: number
  /** Appends the markdown block to the card description via the tab's existing save path. */
  onAppend: (markdownBlock: string) => Promise<void>
}

export default function AcceptanceCriteriaGenerator({ cardId, onAppend }: Props) {
  const [criteria, setCriteria] = useState<AcceptanceCriterion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  async function handleGenerate() {
    if (loading) return
    setLoading(true)
    try {
      const res = await api.ai.generateAcceptanceCriteria(cardId)
      setCriteria(res.criteria)
    } catch {
      // axios interceptor already toasts API errors
    } finally {
      setLoading(false)
    }
  }

  function updateCriterion(index: number, field: keyof AcceptanceCriterion, value: string) {
    setCriteria(prev => (prev ? prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)) : prev))
  }

  function removeCriterion(index: number) {
    setCriteria(prev => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  async function handleAppend() {
    if (!criteria || criteria.length === 0 || applying) return
    const block =
      '\n\n## Acceptance Criteria\n\n' +
      criteria.map(c => `- **Given** ${c.given}, **when** ${c.when}, **then** ${c.then}.`).join('\n') +
      '\n'
    setApplying(true)
    try {
      await onAppend(block)
      setCriteria(null)
    } catch {
      // axios interceptor already toasts API errors
    } finally {
      setApplying(false)
    }
  }

  const fieldCls =
    'flex-1 min-w-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="space-y-2">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        ✨ {loading ? 'Generating…' : 'Acceptance criteria'}
      </button>

      {criteria && (
        <div className="border border-indigo-200 rounded-xl bg-indigo-50/50 p-3 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Acceptance criteria preview
          </p>
          {criteria.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No criteria left. Discard or regenerate.</p>
          ) : (
            criteria.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-12 flex-shrink-0 text-[10px] font-semibold text-slate-500">Given</span>
                    <input
                      value={c.given}
                      onChange={e => updateCriterion(i, 'given', e.target.value)}
                      aria-label={`Criterion ${i + 1}: given`}
                      className={fieldCls}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-12 flex-shrink-0 text-[10px] font-semibold text-slate-500">When</span>
                    <input
                      value={c.when}
                      onChange={e => updateCriterion(i, 'when', e.target.value)}
                      aria-label={`Criterion ${i + 1}: when`}
                      className={fieldCls}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-12 flex-shrink-0 text-[10px] font-semibold text-slate-500">Then</span>
                    <input
                      value={c.then}
                      onChange={e => updateCriterion(i, 'then', e.target.value)}
                      aria-label={`Criterion ${i + 1}: then`}
                      className={fieldCls}
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeCriterion(i)}
                  aria-label={`Remove criterion ${i + 1}`}
                  className="text-slate-400 hover:text-red-500 text-sm leading-none mt-0.5 transition-colors"
                >
                  ×
                </button>
              </div>
            ))
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAppend}
              disabled={applying || criteria.length === 0}
              className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? 'Appending…' : 'Append to description'}
            </button>
            <button
              onClick={() => setCriteria(null)}
              disabled={applying}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
