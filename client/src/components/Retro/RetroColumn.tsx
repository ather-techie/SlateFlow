import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { RetroCategory, RetroItem } from '../../types'
import RetroNote from './RetroNote'

interface Props {
  category: RetroCategory
  title: string
  accent: string
  items: RetroItem[]
  canEdit: boolean
  onAdd: (body: string) => void
  onUpdateItem: (id: number, body: string) => void
  onDeleteItem: (id: number) => void
}

export default function RetroColumn({ category, title, accent, items, canEdit, onAdd, onUpdateItem, onDeleteItem }: Props) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const { setNodeRef, isOver } = useDroppable({
    id: `retro-col-${category}`,
    data: { type: 'retro-column', category },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    onAdd(body)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex-1 min-w-[260px] flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 mb-1.5 rounded-t-lg">
        <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{ background: accent }} />
        <h2 className="text-sm font-semibold text-slate-700 truncate flex-1">{title}</h2>
        <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-1.5 py-0.5 font-medium tabular-nums">
          {items.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          'flex-1 flex flex-col gap-2 rounded-xl p-2 overflow-y-auto min-h-[64px] transition-colors duration-100',
          isOver ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300' : 'bg-slate-200/60',
        ].join(' ')}
      >
        <SortableContext items={items.map(i => `retro-item-${i.id}`)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <RetroNote
              key={item.id}
              item={item}
              canEdit={canEdit}
              onSave={(body) => onUpdateItem(item.id, body)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}
        </SortableContext>
      </div>

      {canEdit && (
        <div className="mt-2 px-0.5">
          {adding ? (
            <form onSubmit={submit} className="space-y-2">
              <textarea
                autoFocus
                value={draft}
                rows={2}
                placeholder="Add a note…"
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e as unknown as React.FormEvent) }
                  if (e.key === 'Escape') { setAdding(false); setDraft('') }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-indigo-700 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setDraft('') }}
                  className="text-slate-500 text-sm hover:text-slate-700 px-2 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg px-2 py-1.5 transition-colors"
            >
              <span className="text-base font-light leading-none">+</span>
              Add note
            </button>
          )}
        </div>
      )}
    </div>
  )
}
