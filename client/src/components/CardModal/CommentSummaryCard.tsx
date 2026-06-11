import type { CommentThreadSummary } from '../../api/index'

interface Props {
  summary: CommentThreadSummary
  onDismiss: () => void
}

export default function CommentSummaryCard({ summary, onDismiss }: Props) {
  return (
    <div className="border border-indigo-200 rounded-xl bg-indigo-50/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest">✨ Thread summary</p>
        <button
          onClick={onDismiss}
          aria-label="Dismiss thread summary"
          className="text-slate-400 hover:text-slate-600 text-sm leading-none flex-shrink-0"
        >
          ×
        </button>
      </div>
      <p className="text-sm text-slate-700">{summary.summary}</p>
      {summary.decisions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Decisions</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {summary.decisions.map((d, i) => (
              <li key={i} className="text-xs text-slate-600">{d}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.open_questions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1">Open questions</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {summary.open_questions.map((q, i) => (
              <li key={i} className="text-xs text-slate-600">{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
