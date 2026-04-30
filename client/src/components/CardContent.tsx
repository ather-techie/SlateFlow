import type { Card } from '../types'
import PriorityBadge from './PriorityBadge'

interface Props {
  card: Card
  className?: string
  style?: React.CSSProperties
}

export default function CardContent({ card, className = '', style }: Props) {
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
    </div>
  )
}
