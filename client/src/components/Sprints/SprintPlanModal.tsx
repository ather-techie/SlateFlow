import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/index'
import type { SprintPlan } from '../../api/index'

interface Props {
  projectId: number
  sprintId: number
  sprintName: string
  onApplied?: () => void
  onClose: () => void
}

export default function SprintPlanModal({ projectId, sprintId, sprintName, onApplied, onClose }: Props) {
  const [plan, setPlan] = useState<SprintPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.ai.planSprint(projectId, sprintId)
      .then(p => {
        if (cancelled) return
        setPlan(p)
        setChecked(new Set(p.proposed.map(s => s.card_id)))
      })
      .catch(e => {
        if (cancelled) return
        // The axios interceptor already toasts API errors — show inline only.
        const msg =
          (e?.response?.data as { error?: string } | undefined)?.error ??
          (e instanceof Error ? e.message : 'Failed to generate a sprint plan')
        setError(msg)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, sprintId])

  function toggle(cardId: number) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  const checkedStories = plan ? plan.proposed.filter(s => checked.has(s.card_id)) : []
  const checkedPoints = checkedStories.reduce((sum, s) => sum + (s.points ?? 0), 0)

  async function handleApply() {
    if (!plan || checkedStories.length === 0) return
    setApplying(true)
    try {
      await Promise.all(
        checkedStories.map(s => api.cards.update(s.card_id, { sprint_id: sprintId })),
      )
      toast.success(
        `Added ${checkedStories.length} stor${checkedStories.length === 1 ? 'y' : 'ies'} to ${sprintName}`,
      )
      onApplied?.()
      onClose()
    } catch {
      // axios interceptor already toasts the error
    } finally {
      setApplying(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Plan with AI — {sprintName}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="space-y-3">
              <div className="h-5 w-2/3 bg-slate-100 animate-pulse rounded" />
              <div className="h-4 w-full bg-slate-100 animate-pulse rounded" />
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-lg" />
              ))}
              <p className="text-xs text-slate-400 text-center pt-2">Asking the AI for a sprint plan…</p>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          ) : plan ? (
            <div className="space-y-5">
              {/* Recommendation */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                <p className="text-sm font-semibold text-indigo-800">
                  Recommended capacity: {plan.recommended_points}pt
                </p>
                <p className="text-xs text-indigo-700 mt-1 whitespace-pre-wrap">{plan.rationale}</p>
              </div>

              {/* Proposed stories */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Proposed stories
                  </h3>
                  <span
                    className={`text-xs font-medium ${
                      checkedPoints > plan.recommended_points ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {checkedPoints}pt selected / {plan.recommended_points}pt recommended
                  </span>
                </div>
                {plan.proposed.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3">No backlog stories to propose.</p>
                ) : (
                  <div className="space-y-2">
                    {plan.proposed.map(s => (
                      <label
                        key={s.card_id}
                        className="flex items-start gap-3 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(s.card_id)}
                          onChange={() => toggle(s.card_id)}
                          className="mt-0.5 accent-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 truncate">
                              #{s.card_id} {s.title}
                            </span>
                            <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                              {s.points !== null ? `${s.points}pt` : '—'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{s.reason}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Risks */}
              {plan.risks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Risks
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {plan.risks.map((risk, i) => (
                      <li key={i} className="text-sm text-amber-700">{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || loading || !!error || checkedStories.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {applying
              ? 'Applying…'
              : `Apply (${checkedStories.length} stor${checkedStories.length === 1 ? 'y' : 'ies'})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
