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
import type { Card as CardType, Epic, Feature, Lane, Project, Sprint, TestCaseSummary } from '../types'
import { api } from '../api'
import { useBoardStore } from '../store/boardStore'
import Header from '../components/Header'
import Column from '../components/Board/Column'
import CardContent from '../components/CardContent'
import CardModal from '../components/CardModal'
import BoardSkeleton from '../components/BoardSkeleton'
import ManageLanesModal from '../components/Board/ManageLanesModal'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const setTestCaseSummary = useBoardStore(s => s.setTestCaseSummary)

  const [project, setProject] = useState<Project | null>(null)
  const [lanes, setLanes] = useState<Lane[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showManageLanes, setShowManageLanes] = useState(false)
  const [showNewSprint, setShowNewSprint] = useState(false)
  const [epics, setEpics] = useState<Epic[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [selectedEpicId, setSelectedEpicId] = useState<number | null>(null)
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(null)

  // New sprint form state
  const [newSprintName, setNewSprintName] = useState('')
  const [newSprintStart, setNewSprintStart] = useState('')
  const [newSprintEnd, setNewSprintEnd] = useState('')
  const [creatingSprint, setCreatingSprint] = useState(false)

  // Cards: flat array + ref mirror for stable access in DnD handlers
  const [allCards, _setAllCards] = useState<CardType[]>([])
  const allCardsRef = useRef<CardType[]>([])
  function setAllCards(updater: CardType[] | ((prev: CardType[]) => CardType[])) {
    _setAllCards(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      allCardsRef.current = next
      return next
    })
  }

  // DnD
  const [activeCard, setActiveCard] = useState<CardType | null>(null)
  const prevCardsRef = useRef<CardType[]>([])

  // Modal
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [proj, ls, sps] = await Promise.all([
          api.getProject(pid),
          api.getLanes(pid),
          api.getSprints(pid),
        ])
        setProject(proj)
        setLanes(ls)
        setSprints(sps)
        const cardArrays = await Promise.all(ls.map(l => api.getLaneCards(l.id)))
        setAllCards(cardArrays.flat())

        // Load epics and features for board filter
        api.epics.list(pid).then(setEpics).catch(() => {})
        api.features.list(pid).then(setFeatures).catch(() => {})

        // Populate test case indicators for card tiles
        api.getProjectTestCases(pid).then(cases => {
          const byCard: Record<number, TestCaseSummary> = {}
          for (const tc of cases) {
            if (!byCard[tc.card_id]) byCard[tc.card_id] = { total: 0, passed: 0, failed: 0, untested: 0, blocked: 0, skipped: 0 }
            byCard[tc.card_id].total++
            byCard[tc.card_id][tc.status as keyof TestCaseSummary]++
          }
          Object.entries(byCard).forEach(([cardId, s]) => setTestCaseSummary(Number(cardId), s))
        }).catch(() => {})
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load board')
      } finally {
        setLoading(false)
      }
    })()
  }, [pid])

  // Feature IDs that belong to the selected epic (for hierarchical filtering)
  const epicFeatureIds = useMemo(() => {
    if (!selectedEpicId) return null
    return new Set(features.filter(f => f.epic_id === selectedEpicId).map(f => f.id))
  }, [selectedEpicId, features])

  // ── Derived: cards per lane ───────────────────────────────────────────────────
  const cardsByLane = useMemo(() => {
    const map: Record<number, CardType[]> = {}
    for (const lane of lanes) {
      map[lane.id] = allCards
        .filter(c => {
          if (c.swim_lane_id !== lane.id) return false
          if (selectedSprintId !== null && c.sprint_id !== selectedSprintId) return false
          if (selectedFeatureId !== null && c.feature_id !== selectedFeatureId) return false
          if (epicFeatureIds !== null && (c.feature_id === null || !epicFeatureIds.has(c.feature_id))) return false
          return true
        })
        .sort((a, b) => a.position - b.position || a.id - b.id)
    }
    return map
  }, [lanes, allCards, selectedSprintId, selectedFeatureId, epicFeatureIds])

  // ── DnD handlers ─────────────────────────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent) {
    prevCardsRef.current = allCardsRef.current
    setActiveCard(allCardsRef.current.find(c => c.id === (active.id as number)) ?? null)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return
    const activeId = active.id as number
    const overId = over.id
    const isOverLane = typeof overId === 'string' && (overId as string).startsWith('lane-')

    setAllCards(prev => {
      const card = prev.find(c => c.id === activeId)
      if (!card) return prev

      const overLaneId = isOverLane
        ? parseInt((overId as string).slice(5))
        : prev.find(c => c.id === (overId as number))?.swim_lane_id ?? null
      if (overLaneId === null) return prev

      // Same lane — reorder
      if (card.swim_lane_id === overLaneId) {
        if (isOverLane) return prev
        const col = prev
          .filter(c => c.swim_lane_id === overLaneId)
          .sort((a, b) => a.position - b.position || a.id - b.id)
        const ai = col.findIndex(c => c.id === activeId)
        const oi = col.findIndex(c => c.id === (overId as number))
        if (ai === -1 || oi === -1 || ai === oi) return prev
        const reordered = arrayMove(col, ai, oi).map((c, i) => ({ ...c, position: i }))
        return [...prev.filter(c => c.swim_lane_id !== overLaneId), ...reordered]
      }

      // Cross-lane move
      const withoutActive = prev.filter(c => c.id !== activeId)
      const target = withoutActive
        .filter(c => c.swim_lane_id === overLaneId)
        .sort((a, b) => a.position - b.position || a.id - b.id)
      const moved = { ...card, swim_lane_id: overLaneId }
      if (isOverLane) {
        target.push(moved)
      } else {
        const oi = target.findIndex(c => c.id === (overId as number))
        target.splice(Math.max(0, oi), 0, moved)
      }
      return [
        ...withoutActive.filter(c => c.swim_lane_id !== overLaneId),
        ...target.map((c, i) => ({ ...c, position: i })),
      ]
    })
  }

  function handleDragEnd({ active }: DragEndEvent) {
    setActiveCard(null)
    const card = allCardsRef.current.find(c => c.id === (active.id as number))
    const prev = prevCardsRef.current.find(c => c.id === (active.id as number))
    if (!card || !prev || card.swim_lane_id === null) return

    if (card.swim_lane_id !== prev.swim_lane_id || card.position !== prev.position) {
      api
        .moveLaneCard(card.id, { lane_id: card.swim_lane_id, position: card.position })
        .catch(() => setAllCards(prevCardsRef.current))
    }
  }

  function handleDragCancel() {
    setActiveCard(null)
    setAllCards(prevCardsRef.current)
  }

  // ── Add card (optimistic) ────────────────────────────────────────────────────
  async function handleAddCard(
    laneId: number,
    title: string,
    priority: CardType['priority'] = 'p2',
    assignee?: string,
  ) {
    const tempId = -(Date.now())
    const laneLen = allCardsRef.current.filter(c => c.swim_lane_id === laneId).length
    const optimistic: CardType = {
      id: tempId,
      column_id: null,
      swim_lane_id: laneId,
      sprint_id: selectedSprintId,
      feature_id: null,
      title,
      description: '',
      priority,
      story_points: null,
      assignee: assignee ?? null,
      position: laneLen,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setAllCards(prev => [...prev, optimistic])
    try {
      const created = await api.createLaneCard(laneId, { title, priority, assignee: assignee ?? null, sprint_id: selectedSprintId ?? undefined })
      setAllCards(prev => prev.map(c => (c.id === tempId ? created : c)))
    } catch {
      setAllCards(prev => prev.filter(c => c.id !== tempId))
    }
  }

  // ── Card modal callbacks ──────────────────────────────────────────────────────
  function handleCardUpdate(updated: CardType) {
    setAllCards(prev => prev.map(c => (c.id === updated.id ? updated : c)))
    setSelectedCard(updated)
  }

  function handleCardDelete(id: number) {
    setAllCards(prev => prev.filter(c => c.id !== id))
    setSelectedCard(null)
  }

  // ── New sprint ────────────────────────────────────────────────────────────────
  async function handleCreateSprint(e: React.FormEvent) {
    e.preventDefault()
    if (!newSprintName.trim() || !newSprintStart || !newSprintEnd || creatingSprint) return
    setCreatingSprint(true)
    try {
      const sprint = await api.createSprint(pid, {
        name: newSprintName.trim(),
        start_date: newSprintStart,
        end_date: newSprintEnd,
      })
      setSprints(prev => [...prev, sprint])
      setShowNewSprint(false)
      setNewSprintName('')
      setNewSprintStart('')
      setNewSprintEnd('')
    } finally {
      setCreatingSprint(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const activeSprint =
    sprints.find(s => s.id === selectedSprintId) ??
    sprints.find(s => s.status === 'active') ??
    null

  const cardCountByLane = useMemo(
    () => Object.fromEntries(lanes.map(l => [l.id, cardsByLane[l.id]?.length ?? 0])),
    [lanes, cardsByLane],
  )

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-100">
      {/* Main nav header */}
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

      {/* Board sub-header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {project && (
            <span className="font-semibold text-slate-800 text-sm">{project.name}</span>
          )}
          {activeSprint && (
            <>
              <span className="text-slate-300 select-none">·</span>
              <span className="text-sm text-emerald-600 font-medium truncate">{activeSprint.name}</span>
              {activeSprint.start_date && activeSprint.end_date && (
                <span className="text-xs text-slate-400 hidden md:block">
                  {fmtDate(activeSprint.start_date)} → {fmtDate(activeSprint.end_date)}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {epics.length > 0 && (
            <select
              value={selectedEpicId ?? ''}
              onChange={e => { setSelectedEpicId(e.target.value ? Number(e.target.value) : null); setSelectedFeatureId(null) }}
              className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">All Epics</option>
              {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
            </select>
          )}
          {features.length > 0 && (
            <select
              value={selectedFeatureId ?? ''}
              onChange={e => setSelectedFeatureId(e.target.value ? Number(e.target.value) : null)}
              className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">All Features</option>
              {(selectedEpicId ? features.filter(f => f.epic_id === selectedEpicId) : features).map(f => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowManageLanes(true)}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors font-medium"
          >
            Manage Lanes
          </button>
          <button
            onClick={() => setShowNewSprint(true)}
            className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            New Sprint
          </button>
        </div>
      </div>

      {/* Board area */}
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
              {lanes.map(lane => (
                <Column
                  key={lane.id}
                  lane={lane}
                  cards={cardsByLane[lane.id] ?? []}
                  onCardClick={setSelectedCard}
                  onAddCard={handleAddCard}
                />
              ))}
              {lanes.length === 0 && !loading && (
                <div className="flex items-center justify-center w-full text-slate-400 text-sm">
                  No lanes yet — click "Manage Lanes" to add some.
                </div>
              )}
            </div>

            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
              {activeCard && (
                <CardContent
                  card={activeCard}
                  className="shadow-2xl rotate-[1.5deg] ring-2 ring-indigo-400 ring-offset-2 opacity-95 w-[260px]"
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Card detail modal */}
      {selectedCard && (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          projectId={pid}
          lanes={lanes}
          sprints={sprints}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdate}
          onDelete={handleCardDelete}
        />
      )}

      {/* Manage Lanes modal */}
      {showManageLanes && (
        <ManageLanesModal
          projectId={pid}
          lanes={lanes}
          cardCountByLane={cardCountByLane}
          onClose={() => setShowManageLanes(false)}
          onUpdate={updated => {
            setLanes(updated)
            // Remove cards that belonged to deleted lanes
            const validIds = new Set(updated.map(l => l.id))
            setAllCards(prev => prev.filter(c => c.swim_lane_id === null || validIds.has(c.swim_lane_id)))
          }}
        />
      )}

      {/* New Sprint modal */}
      {showNewSprint && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowNewSprint(false) }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onMouseDown={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 mb-5">New Sprint</h2>
            <form onSubmit={handleCreateSprint} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                  Name
                </label>
                <input
                  value={newSprintName}
                  onChange={e => setNewSprintName(e.target.value)}
                  placeholder="Sprint 1"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newSprintStart}
                    onChange={e => setNewSprintStart(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newSprintEnd}
                    onChange={e => setNewSprintEnd(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={creatingSprint}
                  className="flex-1 bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingSprint ? 'Creating…' : 'Create Sprint'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewSprint(false)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
