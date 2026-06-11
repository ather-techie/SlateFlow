import { useEffect, useRef, useState } from 'react'
import { api, type AssigneeSuggestion } from '../../api/index'

const CONFIDENCE_CLS: Record<AssigneeSuggestion['confidence'], string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

interface Props {
  cardId: number
  onApply: (suggestion: AssigneeSuggestion) => void
}

export default function SuggestAssigneePopover({ cardId, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AssigneeSuggestion[]>([])
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
    setSuggestions([])
    try {
      const res = await api.ai.suggestAssignee(cardId)
      setSuggestions(res.suggestions.slice(0, 3))
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
        aria-label="Suggest assignee with AI"
        title="Suggest assignee with AI"
        className="text-xs leading-none rounded-md px-1 py-0.5 text-indigo-500 hover:bg-indigo-50 transition-colors"
      >
        ✨
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
          <p className="px-2 pt-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Suggested assignees
          </p>
          {loading ? (
            <p className="px-2 py-2 text-xs text-slate-400">Thinking…</p>
          ) : suggestions.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-400 italic">No suggestions available.</p>
          ) : (
            suggestions.map(s => (
              <button
                key={s.user_id}
                onClick={() => {
                  onApply(s)
                  setOpen(false)
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate">{s.assignee}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CONFIDENCE_CLS[s.confidence]}`}>
                    {s.confidence}
                  </span>
                </span>
                <span className="block text-[11px] text-slate-500 truncate">{s.reason}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
