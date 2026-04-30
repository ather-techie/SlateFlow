import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card as CardType, Lane } from '../../types'
import BoardCard from './Card'
import AddCardForm from './AddCardForm'

interface Props {
  lane: Lane
  cards: CardType[]
  onCardClick: (card: CardType) => void
  onAddCard: (laneId: number, title: string, priority: CardType['priority'], assignee?: string) => void
}

export default function Column({ lane, cards, onCardClick, onAddCard }: Props) {
  const isDone = lane.is_done_col === 1

  const { setNodeRef, isOver } = useDroppable({
    id: `lane-${lane.id}`,
    data: { type: 'lane', laneId: lane.id },
  })

  return (
    <div className="flex-shrink-0 w-[260px] flex flex-col min-h-0">
      {/* Header */}
      <div
        className={[
          'flex items-center gap-2 px-3 py-2 mb-1.5 rounded-t-lg',
          isDone ? 'bg-emerald-50' : '',
        ].join(' ')}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
          style={{ background: lane.color }}
        />
        <h2
          className={[
            'text-sm font-semibold truncate flex-1',
            isDone ? 'text-emerald-700' : 'text-slate-700',
          ].join(' ')}
        >
          {lane.name}
        </h2>
        <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5 font-medium tabular-nums">
          {cards.length}
        </span>
      </div>

      {/* Drop zone + cards */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 flex flex-col gap-2 rounded-xl p-2 overflow-y-auto min-h-[64px] transition-colors duration-100',
          isOver
            ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300'
            : isDone
            ? 'bg-emerald-50/60 ring-1 ring-emerald-200/50'
            : 'bg-slate-200/60',
        ].join(' ')}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <BoardCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>
      </div>

      {/* Add card */}
      <div className="mt-2 px-0.5">
        <AddCardForm onAdd={(title, priority, assignee) => onAddCard(lane.id, title, priority, assignee)} />
      </div>
    </div>
  )
}
