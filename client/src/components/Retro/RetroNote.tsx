import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RetroItem } from '../../types'

interface Props {
  item: RetroItem
  canEdit: boolean
  onSave: (body: string) => void
  onDelete: () => void
}

export default function RetroNote({ item, canEdit, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.body)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `retro-item-${item.id}`,
    data: { type: 'retro-item', itemId: item.id, category: item.category },
    disabled: editing || !canEdit,
  })

  function commit() {
    const next = draft.trim()
    if (next.length === 0) {
      setDraft(item.body)
      setEditing(false)
      return
    }
    if (next !== item.body) onSave(next)
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(canEdit && !editing ? attributes : {})}
      {...(canEdit && !editing ? listeners : {})}
      className={[
        'group relative bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm transition',
        canEdit && !editing ? 'cursor-grab active:cursor-grabbing touch-none' : '',
        isDragging ? 'opacity-40' : 'hover:shadow-md',
      ].join(' ')}
    >
      {editing ? (
        <textarea
          autoFocus
          rows={3}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(item.body); setEditing(false) }
          }}
          className="w-full resize-none text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
        />
      ) : (
        <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{item.body}</p>
      )}
      {canEdit && !editing && (
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            className="text-xs text-slate-400 hover:text-indigo-600 px-1"
            title="Edit"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="text-xs text-slate-400 hover:text-red-600 px-1"
            title="Delete"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
