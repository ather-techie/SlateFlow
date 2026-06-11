import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../api/index'
import type { BacklogGrooming } from '../../api/index'

interface Props {
  projectId: number
  /** Backlog cards already loaded by the page — used to look up titles by id. */
  cards: { id: number; title: string }[]
  onClose: () => void
}

export default function GroomingPanel({ projectId, cards, onClose }: Props) {
  const [grooming, setGrooming] = useState<BacklogGrooming | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set())
  const [applyingId, setApplyingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.ai.groomBacklog(projectId)
      .then(g => { if (!cancelled) setGrooming(g) })
      .catch(e => {
        if (cancelled) return
        // The axios interceptor already toasts API errors — show inline only.
        const msg =
          (e?.response?.data as { error?: string } | undefined)?.error ??
          (e instanceof Error ? e.message : 'Failed to groom the backlog')
        setError(msg)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  function titleFor(cardId: number) {
    return cards.find(c => c.id === cardId)?.title ?? null
  }

  async function handleApplyDescription(cardId: number, description: string) {
    setApplyingId(cardId)
    try {
      await api.cards.update(cardId, { description })
      setAppliedIds(prev => new Set(prev).add(cardId))
      toast.success(`Updated description on #${cardId}`)
    } catch {
      // axios interceptor already toasts the error
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-indigo-200 shadow-sm mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">AI Backlog Grooming</h2>
        <button
          onClick={onClose}
          aria-label="Dismiss grooming panel"
          className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-slate-100 animate-pulse rounded" />
            ))}
            <p className="text-xs text-slate-400 text-center pt-1">Analysing the backlog…</p>
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        ) : grooming ? (
          <div className="space-y-5">
            {/* Notes */}
            {grooming.notes && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">
                {grooming.notes}
              </p>
            )}

            {/* Possible duplicates */}
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Possible duplicates
              </h3>
              {grooming.duplicates.length === 0 ? (
                <p className="text-xs text-slate-400">No likely duplicates found.</p>
              ) : (
                <ul className="space-y-1.5">
                  {grooming.duplicates.map((d, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      <span className="font-medium">
                        {d.card_ids.map(id => `#${id}`).join(', ')}
                      </span>
                      <span className="text-slate-500"> — {d.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Vague cards */}
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Vague cards
              </h3>
              {grooming.vague.length === 0 ? (
                <p className="text-xs text-slate-400">No vague cards found.</p>
              ) : (
                <div className="space-y-2">
                  {grooming.vague.map(v => {
                    const applied = appliedIds.has(v.card_id)
                    return (
                      <div key={v.card_id} className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">#{v.card_id}</span>
                          <span className="text-slate-500"> — {v.issue}</span>
                        </p>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap mt-1 border-l-2 border-indigo-200 pl-2">
                          {v.suggested_description}
                        </p>
                        <button
                          onClick={() => handleApplyDescription(v.card_id, v.suggested_description)}
                          disabled={applied || applyingId === v.card_id}
                          className="mt-2 px-2.5 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg disabled:opacity-50 disabled:hover:bg-indigo-50 transition-colors"
                        >
                          {applied
                            ? 'Applied'
                            : applyingId === v.card_id
                              ? 'Applying…'
                              : 'Apply description'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Stale cards */}
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Stale
              </h3>
              {grooming.stale.length === 0 ? (
                <p className="text-xs text-slate-400">No stale cards.</p>
              ) : (
                <ul className="space-y-1.5">
                  {grooming.stale.map(s => (
                    <li key={s.card_id} className="text-sm text-slate-700">
                      <span className="font-medium">#{s.card_id}</span> {s.title}
                      <span className="text-slate-400"> — idle {s.last_activity_days}d</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Suggested priority order */}
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Suggested priority order
              </h3>
              {grooming.priority_order.length === 0 ? (
                <p className="text-xs text-slate-400">No ordering suggested.</p>
              ) : (
                <ol className="list-decimal list-inside space-y-1">
                  {grooming.priority_order.map(id => {
                    const title = titleFor(id)
                    return (
                      <li key={id} className="text-sm text-slate-700">
                        <span className="font-medium">#{id}</span>
                        {title && <span> {title}</span>}
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}
