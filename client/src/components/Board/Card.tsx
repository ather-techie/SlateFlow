import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardType } from '../../types'
import CardContent from '../CardContent'
import { useBoardStore } from '../../store/boardStore'

interface Props {
  card: CardType
  onClick: () => void
}

export default function BoardCard({ card, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  })

  const testCaseSummary = useBoardStore(s => s.testCaseSummary[card.id])
  const taskSummary = useBoardStore(s => s.taskSummary[card.id])
  const linkCount = useBoardStore(s => s.linkCount[card.id] ?? 0)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="cursor-pointer touch-none"
    >
      <CardContent
        card={card}
        testCaseSummary={testCaseSummary}
        taskSummary={taskSummary}
        linkCount={linkCount}
        className={
          isDragging
            ? 'opacity-40 shadow-none'
            : 'shadow-sm hover:shadow-md hover:border-slate-300 transition-all'
        }
      />
    </div>
  )
}
