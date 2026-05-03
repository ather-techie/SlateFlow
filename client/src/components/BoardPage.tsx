import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Card as CardType, Column as ColumnType, Project, Sprint } from '../types'
import { api } from '../api'
import Header from './Header'
import Column from './Column'
import CardContent from './CardContent'
import CardModal from './CardModal'
import BoardSkeleton from './BoardSkeleton'

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [columns, setColumns] = useState<ColumnType[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Cards: flat array with a ref mirror for stable access in DnD handlers
  const [allCards, _setAllCards] = useState<CardType[]>([])
  const allCardsRef = useRef<CardType[]>([])
  function setAllCards(updater: CardType[] | ((prev: CardType[]) => CardType[])) {
    _setAllCards(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      allCardsRef.current = next
      return next
    })
  }

  // ── DnD
  const [activeCard, setActiveCard] = useState<CardType | null>(null)
  const prevCardsRef = useRef<CardType[]>([])

  // ── Modal
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [proj, cols, sps] = await Promise.all([
          api.getProject(pid),
          api.getColumns(pid),
          api.getSprints(pid),
        ])
        setProject(proj)
        setColumns(cols)
        setSprints(sps)
        const cardArrays = await Promise.all(cols.map(c => api.getCards(c.id)))
        setAllCards(cardArrays.flat())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load board')
      } finally {
        setLoading(false)
      }
    })()
  }, [pid])

  // ── Derived: cards per column, sorted ─────────────────────────────────────
  const cardsByColumn = useMemo(() => {
    const map: Record<number, CardType[]> = {}
    for (const col of columns) {
      map[col.id] = allCards
        .filter(c => c.column_id === col.id)
        .sort((a, b) => a.position - b.position || a.id - b.id)
    }
    return map
  }, [columns, allCards])

  // ── DnD handlers ──────────────────────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent) {
    prevCardsRef.current = allCardsRef.current
    setActiveCard(allCardsRef.current.find(c => c.id === (active.id as number)) ?? null)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return
    const activeId = active.id as number
    const overId = over.id
    const isOverCol = typeof overId === 'string'

    setAllCards(prev => {
      const activeCard = prev.find(c => c.id === activeId)
      if (!activeCard) return prev

      const overColumnId = isOverCol
        ? parseInt((overId as string).slice(4))
        : prev.find(c => c.id === (overId as number))?.column_id ?? null
      if (overColumnId === null) return prev

      // ── same column ──────────────────────────────────────────────────────
      if (activeCard.column_id === overColumnId) {
        if (isOverCol) return prev // hovering own column's empty space

        const col = prev
          .filter(c => c.column_id === overColumnId)
          .sort((a, b) => a.position - b.position || a.id - b.id)
        const ai = col.findIndex(c => c.id === activeId)
        const oi = col.findIndex(c => c.id === (overId as number))
        if (ai === -1 || oi === -1 || ai === oi) return prev

        const reordered = arrayMove(col, ai, oi).map((c, i) => ({ ...c, position: i }))
        return [...prev.filter(c => c.column_id !== overColumnId), ...reordered]
      }

      // ── cross-column ─────────────────────────────────────────────────────
      const withoutActive = prev.filter(c => c.id !== activeId)
      const target = withoutActive
        .filter(c => c.column_id === overColumnId)
        .sort((a, b) => a.position - b.position || a.id - b.id)

      const moved = { ...activeCard, column_id: overColumnId }
      if (isOverCol) {
        target.push(moved)
      } else {
        const oi = target.findIndex(c => c.id === (overId as number))
        target.splice(Math.max(0, oi), 0, moved)
      }

      return [
        ...withoutActive.filter(c => c.column_id !== overColumnId),
        ...target.map((c, i) => ({ ...c, position: i })),
      ]
    })
  }

  function handleDragEnd({ active }: DragEndEvent) {
    setActiveCard(null)
    const card = allCardsRef.current.find(c => c.id === (active.id as number))
    const prev = prevCardsRef.current.find(c => c.id === (active.id as number))
    if (!card || !prev) return

    if (card.column_id !== prev.column_id || card.position !== prev.position) {
      api
        .moveCard(card.id, { column_id: card.column_id!, position: card.position })
        .catch(() => setAllCards(prevCardsRef.current))
    }
  }

  function handleDragCancel() {
    setActiveCard(null)
    setAllCards(prevCardsRef.current)
  }

  // ── Add card (optimistic) ─────────────────────────────────────────────────
  async function handleAddCard(columnId: number, title: string) {
    const tempId = -(Date.now())
    const colLen = allCardsRef.current.filter(c => c.column_id === columnId).length
    const optimistic: CardType = {
      id: tempId,
      column_id: columnId,
      swim_lane_id: null,
      sprint_id: null,
      feature_id: null,
      title,
      description: '',
      priority: 'p2',
      story_points: null,
      assignee: null,
      position: colLen,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setAllCards(prev => [...prev, optimistic])
    try {
      const created = await api.createCard(columnId, { title })
      setAllCards(prev => prev.map(c => (c.id === tempId ? created : c)))
    } catch {
      setAllCards(prev => prev.filter(c => c.id !== tempId))
    }
  }

  // ── Card modal update ─────────────────────────────────────────────────────
  function handleCardUpdate(updated: CardType) {
    setAllCards(prev => prev.map(c => (c.id === updated.id ? updated : c)))
    setSelectedCard(updated)
  }

  // ── Card modal delete ─────────────────────────────────────────────────────
  function handleCardDelete(id: number) {
    setAllCards(prev => prev.filter(c => c.id !== id))
    setSelectedCard(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const activeSprint = sprints.find(s => s.id === selectedSprintId) ?? sprints.find(s => s.status === 'active') ?? null

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
      {project ? (
        <Header
          project={project}
          sprints={sprints}
          selectedSprintId={selectedSprintId}
          onSprintChange={setSelectedSprintId}
        />
      ) : (
        <div className="h-14 bg-slate-900 flex-shrink-0" />
      )}

      {activeSprint && (
        <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-6 py-2 flex items-center gap-4 text-xs">
          <span className={`font-semibold ${activeSprint.status === 'active' ? 'text-emerald-400' : 'text-indigo-300'}`}>
            {activeSprint.name}
          </span>
          {activeSprint.start_date && activeSprint.end_date && (
            <span className="text-slate-400">
              {fmtDate(activeSprint.start_date)} → {fmtDate(activeSprint.end_date)}
            </span>
          )}
          {activeSprint.goal && (
            <span className="text-slate-500 truncate hidden sm:block">{activeSprint.goal}</span>
          )}
          <span className={`ml-auto px-2 py-0.5 rounded-full font-medium ${
            activeSprint.status === 'active'
              ? 'bg-emerald-900/50 text-emerald-400'
              : activeSprint.status === 'completed'
              ? 'bg-purple-900/50 text-purple-400'
              : 'bg-slate-700 text-slate-400'
          }`}>
            {activeSprint.status}
          </span>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <BoardSkeleton />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex gap-5 px-6 pt-4 pb-6 h-full overflow-x-auto">
              {columns.map(col => (
                <Column
                  key={col.id}
                  column={col}
                  cards={cardsByColumn[col.id] ?? []}
                  onCardClick={setSelectedCard}
                  onAddCard={handleAddCard}
                />
              ))}
              {columns.length === 0 && (
                <div className="flex items-center justify-center w-full text-slate-400 text-sm">
                  No columns yet — add one via the API to get started.
                </div>
              )}
            </div>

            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
              {activeCard && (
                <CardContent
                  card={activeCard}
                  className="shadow-2xl rotate-[1.5deg] ring-2 ring-indigo-400 ring-offset-2 opacity-95"
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {selectedCard && (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          projectId={pid}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdate}
          onDelete={handleCardDelete}
        />
      )}
    </div>
  )
}
