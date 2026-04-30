import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card as CardType, Column as ColumnType } from '../types'
import Card from './Card'
import AddCardForm from './AddCardForm'

interface Props {
  column: ColumnType
  cards: CardType[]
  onCardClick: (card: CardType) => void
  onAddCard: (columnId: number, title: string) => void
}

export default function Column({ column, cards, onCardClick, onAddCard }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${column.id}`,
    data: { type: 'column', columnId: column.id },
  })

  return (
    <div className="flex-shrink-0 w-72 flex flex-col min-h-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 py-2 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
          style={{ background: column.color }}
        />
        <h2 className="text-sm font-semibold text-slate-700 truncate flex-1">{column.name}</h2>
        <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5 font-medium tabular-nums">
          {cards.length}
        </span>
      </div>

      {/* Drop zone + cards */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 flex flex-col gap-2 rounded-xl p-2 overflow-y-auto min-h-[64px] transition-colors duration-100',
          isOver ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300' : 'bg-slate-200/60',
        ].join(' ')}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <Card key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </SortableContext>
      </div>

      {/* Add card */}
      <div className="mt-2 px-0.5">
        <AddCardForm onAdd={title => onAddCard(column.id, title)} />
      </div>
    </div>
  )
}
