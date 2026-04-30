import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Lane } from '../../types'
import { api } from '../../api'

const LANE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#64748b', '#1e293b',
]

interface LaneEdit {
  id: number
  name: string
  color: string
  is_done_col: number
  isNew: boolean
  deleted: boolean
}

interface Props {
  projectId: number
  lanes: Lane[]
  cardCountByLane: Record<number, number>
  onClose: () => void
  onUpdate: (lanes: Lane[]) => void
}

interface RowProps {
  lane: LaneEdit
  cardCount: number
  onUpdate: (changes: Partial<LaneEdit>) => void
  onDelete: () => void
}

function SortableLaneRow({ lane, cardCount, onUpdate, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lane.id,
  })
  const [showColors, setShowColors] = useState(false)
  const hasCards = !lane.isNew && cardCount > 0

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0',
        isDragging ? 'opacity-50 bg-white rounded-lg' : '',
      ].join(' ')}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none px-0.5 select-none"
        tabIndex={-1}
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="4" cy="4" r="1.5" />
          <circle cx="8" cy="4" r="1.5" />
          <circle cx="4" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="8" cy="12" r="1.5" />
        </svg>
      </button>

      {/* Color swatch + picker */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowColors(p => !p)}
          className="w-5 h-5 rounded-full ring-2 ring-white shadow-sm hover:scale-110 transition-transform"
          style={{ backgroundColor: lane.color }}
          title="Change color"
        />
        {showColors && (
          <div className="absolute left-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 flex flex-wrap gap-1.5 w-36">
            {LANE_COLORS.map(c => (
              <button
                key={c}
                onClick={() => { onUpdate({ color: c }); setShowColors(false) }}
                className={[
                  'w-5 h-5 rounded-full transition-transform hover:scale-110',
                  lane.color === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : '',
                ].join(' ')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Name input */}
      <input
        value={lane.name}
        onChange={e => onUpdate({ name: e.target.value })}
        className="flex-1 text-sm text-slate-800 border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-transparent"
      />

      {/* Done col toggle */}
      <label className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer select-none" title="Mark as done column">
        <input
          type="checkbox"
          checked={lane.is_done_col === 1}
          onChange={e => onUpdate({ is_done_col: e.target.checked ? 1 : 0 })}
          className="w-3.5 h-3.5 accent-emerald-600"
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Done</span>
      </label>

      {/* Delete */}
      <button
        onClick={onDelete}
        disabled={hasCards}
        title={hasCards ? `Move ${cardCount} card(s) out first` : 'Delete lane'}
        className={[
          'flex-shrink-0 p-1 rounded transition-colors',
          hasCards
            ? 'text-slate-200 cursor-not-allowed'
            : 'text-slate-300 hover:text-red-500 hover:bg-red-50',
        ].join(' ')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
        </svg>
      </button>
    </div>
  )
}

export default function ManageLanesModal({ projectId, lanes, cardCountByLane, onClose, onUpdate }: Props) {
  const [localLanes, setLocalLanes] = useState<LaneEdit[]>(() =>
    lanes.map(l => ({ ...l, isNew: false, deleted: false })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const visibleLanes = localLanes.filter(l => !l.deleted)

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    setLocalLanes(prev => {
      const visible = prev.filter(l => !l.deleted)
      const oldIdx = visible.findIndex(l => l.id === active.id)
      const newIdx = visible.findIndex(l => l.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reordered = arrayMove(visible, oldIdx, newIdx)
      const deletedLanes = prev.filter(l => l.deleted)
      return [...reordered, ...deletedLanes]
    })
  }

  function updateLane(id: number, changes: Partial<LaneEdit>) {
    setLocalLanes(prev => prev.map(l => {
      if (l.id === id) return { ...l, ...changes }
      if ('is_done_col' in changes && changes.is_done_col === 1) return { ...l, is_done_col: 0 }
      return l
    }))
  }

  function markDeleted(id: number) {
    setLocalLanes(prev => prev.map(l => l.id === id ? { ...l, deleted: true } : l))
  }

  function addLane() {
    const tempId = -(Date.now())
    const usedColors = localLanes.filter(l => !l.deleted).map(l => l.color)
    const color = LANE_COLORS.find(c => !usedColors.includes(c)) ?? LANE_COLORS[0]
    setLocalLanes(prev => [
      ...prev,
      { id: tempId, name: 'New Lane', color, is_done_col: 0, isNew: true, deleted: false },
    ])
  }

  async function handleSave() {
    if (!visibleLanes.some(l => l.name.trim())) return
    setSaving(true)
    setError(null)
    try {
      // 1. Create new lanes, collect real IDs
      const tempToReal: Record<number, number> = {}
      for (const lane of visibleLanes) {
        if (lane.isNew) {
          const created = await api.createLane(projectId, { name: lane.name.trim(), color: lane.color })
          tempToReal[lane.id] = created.id
        }
      }

      // 2. Delete marked lanes
      const deletedExisting = localLanes.filter(l => l.deleted && !l.isNew)
      for (const lane of deletedExisting) {
        await api.deleteLane(lane.id)
      }

      // 3. Reorder (all existing non-deleted + newly created)
      const orderedIds = visibleLanes.map(l => (l.isNew ? tempToReal[l.id] : l.id)).filter(Boolean) as number[]
      if (orderedIds.length > 1) {
        await api.reorderLanes(projectId, orderedIds)
      }

      // 4. Update changed name/color on existing lanes
      const origMap = new Map(lanes.map(l => [l.id, l]))
      for (const lane of visibleLanes) {
        if (!lane.isNew) {
          const orig = origMap.get(lane.id)
          if (orig && (orig.name !== lane.name || orig.color !== lane.color || orig.is_done_col !== lane.is_done_col)) {
            await api.updateLane(lane.id, { name: lane.name.trim(), color: lane.color, is_done_col: lane.is_done_col === 1 })
          }
        }
      }

      // 5. Fetch fresh lanes and propagate
      const fresh = await api.getLanes(projectId)
      onUpdate(fresh)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Manage Lanes</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-0.5 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Lane list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
          )}

          {visibleLanes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No lanes yet.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleLanes.map(l => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {visibleLanes.map(lane => (
                  <SortableLaneRow
                    key={lane.id}
                    lane={lane}
                    cardCount={lane.isNew ? 0 : (cardCountByLane[lane.id] ?? 0)}
                    onUpdate={changes => updateLane(lane.id, changes)}
                    onDelete={() => markDeleted(lane.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          <button
            onClick={addLane}
            className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium py-2 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Add Lane
          </button>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
