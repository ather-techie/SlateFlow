import { useState } from 'react'
import type { RetroSynthesis } from '../../api/index'

const STATUS_STYLES: Record<RetroSynthesis['previous_actions_review'][number]['status'], { label: string; className: string }> = {
  addressed: { label: 'Addressed', className: 'bg-green-100 text-green-700' },
  partially: { label: 'Partially', className: 'bg-amber-100 text-amber-700' },
  not_addressed: { label: 'Not addressed', className: 'bg-red-100 text-red-700' },
  unknown: { label: 'Unknown', className: 'bg-slate-100 text-slate-600' },
}

interface Props {
  synthesis: RetroSynthesis
  canWrite: boolean
  onAddAction: (body: string) => Promise<void>
  onDismiss: () => void
}

function ThemeGroup({ title, accent, themes }: { title: string; accent: string; themes: RetroSynthesis['themes'] }) {
  if (themes.length === 0) return null
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${accent}`}>{title}</h4>
      <ul className="space-y-1">
        {themes.map((t, i) => (
          <li key={i} className="text-sm text-slate-700 flex items-baseline gap-2">
            <span>{t.title}</span>
            <span className="text-xs text-slate-400 flex-shrink-0">
              {t.item_ids.length} item{t.item_ids.length === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function RetroSynthesisPanel({ synthesis, canWrite, onAddAction, onDismiss }: Props) {
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [addingIdx, setAddingIdx] = useState<number | null>(null)

  async function handleAdd(idx: number, body: string) {
    if (added.has(idx) || addingIdx !== null) return
    setAddingIdx(idx)
    try {
      await onAddAction(body)
      setAdded(prev => new Set(prev).add(idx))
    } catch {
      // axios interceptor toasts
    } finally {
      setAddingIdx(null)
    }
  }

  const wentWell = synthesis.themes.filter(t => t.category === 'went_well')
  const toImprove = synthesis.themes.filter(t => t.category === 'to_improve')

  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-800">✨ Retro Synthesis</h3>
        <button
          onClick={onDismiss}
          aria-label="Dismiss synthesis panel"
          className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Themes */}
        <div className="space-y-3">
          {synthesis.themes.length === 0 ? (
            <p className="text-sm text-slate-400">No themes identified.</p>
          ) : (
            <>
              <ThemeGroup title="Went well" accent="text-green-600" themes={wentWell} />
              <ThemeGroup title="To improve" accent="text-amber-600" themes={toImprove} />
            </>
          )}
        </div>

        {/* Suggested actions */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1.5">Suggested actions</h4>
          {synthesis.suggested_actions.length === 0 ? (
            <p className="text-sm text-slate-400">No suggested actions.</p>
          ) : (
            <ul className="space-y-2">
              {synthesis.suggested_actions.map((a, i) => (
                <li key={i} className="text-sm text-slate-700">
                  <p>{a.body}</p>
                  {canWrite && (
                    <button
                      onClick={() => handleAdd(i, a.body)}
                      disabled={added.has(i) || addingIdx !== null}
                      className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {added.has(i) ? 'Added ✓' : addingIdx === i ? 'Adding…' : 'Add as action item'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Previous retro follow-through */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Previous retro follow-through</h4>
          {synthesis.previous_actions_review.length === 0 ? (
            <p className="text-sm text-slate-400">No previous actions to review.</p>
          ) : (
            <ul className="space-y-2">
              {synthesis.previous_actions_review.map((p, i) => {
                const s = STATUS_STYLES[p.status] ?? STATUS_STYLES.unknown
                return (
                  <li key={i} className="text-sm text-slate-700">
                    <div className="flex items-baseline gap-2">
                      <span>{p.body}</span>
                      <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 flex-shrink-0 ${s.className}`}>
                        {s.label}
                      </span>
                    </div>
                    {p.evidence && <p className="text-xs text-slate-400 mt-0.5">{p.evidence}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
