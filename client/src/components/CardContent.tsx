import type { Card } from '../types'
import PriorityBadge from './PriorityBadge'
import { useBoardStore } from '../store/boardStore'

interface Props {
  card: Card
  className?: string
  style?: React.CSSProperties
}

export default function CardContent({ card, className = '', style }: Props) {
  const summary = useBoardStore(s => s.testCaseSummary[card.id])
  const taskSummary = useBoardStore(s => s.taskSummary[card.id])

  const indicatorColor = summary && summary.total > 0
    ? summary.failed > 0
      ? 'text-red-500'
      : summary.passed === summary.total
        ? 'text-green-600'
        : 'text-slate-400'
    : ''

  const tooltip = summary && summary.total > 0
    ? `${summary.total} test case${summary.total !== 1 ? 's' : ''}: ${summary.passed} passed, ${summary.failed} failed, ${summary.untested} untested`
    : ''

  return (
    <div
      style={style}
      className={`bg-white rounded-lg border border-slate-200 p-3 select-none ${className}`}
    >
      <p className="text-sm font-medium text-slate-900 leading-snug line-clamp-3">{card.title}</p>

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <PriorityBadge priority={card.priority} />

        {card.story_points != null && (
          <span className="text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 font-medium">
            {card.story_points} pt
          </span>
        )}

        {card.assignee && (
          <span
            title={card.assignee}
            className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0"
          >
            {card.assignee[0].toUpperCase()}
          </span>
        )}
      </div>

      {taskSummary && taskSummary.total > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500" title={`${taskSummary.done}/${taskSummary.total} tasks done`}>
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M3 4h10M3 12h5" />
          </svg>
          <span className={taskSummary.done === taskSummary.total ? 'text-emerald-600' : ''}>
            {taskSummary.done}/{taskSummary.total} tasks
          </span>
        </div>
      )}

      {summary && summary.total > 0 && (
        <div
          className={`mt-2 flex items-center gap-1 text-xs ${indicatorColor}`}
          title={tooltip}
        >
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2h4M5 2a1 1 0 00-1 1v1H3a1 1 0 00-1 1v9a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1h-1V3a1 1 0 00-1-1H6z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 9l1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{summary.passed}/{summary.total} passed</span>
        </div>
      )}
    </div>
  )
}
