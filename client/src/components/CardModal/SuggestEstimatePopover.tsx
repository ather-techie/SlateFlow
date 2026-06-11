import { useEffect, useRef, useState } from 'react'
import { api, type EstimateSuggestion } from '../../api/index'

const CONFIDENCE_CLS: Record<EstimateSuggestion['confidence'], string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

interface Props {
  cardId: number
  onApply: (points: number) => void
}

export default function SuggestEstimatePopover({ cardId, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<EstimateSuggestion | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleToggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setLoading(true)
    setSuggestion(null)
    try {
      setSuggestion(await api.ai.suggestEstimate(cardId))
    } catch {
      // axios interceptor already toasts API errors
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        aria-label="Suggest story points with AI"
        title="Suggest story points with AI"
        className="text-xs leading-none rounded-md px-1 py-0.5 text-indigo-500 hover:bg-indigo-50 transition-colors"
      >
        ✨
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Suggested estimate</p>
          {loading ? (
            <p className="text-xs text-slate-400">Thinking…</p>
          ) : !suggestion ? (
            <p className="text-xs text-slate-400 italic">No suggestion available.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-900">{suggestion.points}</span>
                <span className="text-xs text-slate-500">points</span>
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CONFIDENCE_CLS[suggestion.confidence]}`}
                >
                  {suggestion.confidence}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">{suggestion.rationale}</p>
              {suggestion.comparables.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                    Comparable cards
                  </p>
                  <ul className="space-y-0.5">
                    {suggestion.comparables.map(c => (
                      <li key={c.card_id} className="text-[11px] text-slate-500 truncate">
                        #{c.card_id} {c.title} — {c.points} pts
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={() => {
                  onApply(suggestion.points)
                  setOpen(false)
                }}
                className="w-full text-xs bg-indigo-600 text-white rounded-lg py-1.5 font-medium hover:bg-indigo-700 transition-colors"
              >
                Apply {suggestion.points} points
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
