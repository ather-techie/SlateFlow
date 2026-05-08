import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { api } from '../api/index'
import { useAuthStore } from '../store/authStore'
import { useRetroStore } from '../store/retroStore'
import { useBoardEvents } from '../hooks/useBoardEvents'
import type { Project, RetroCategory, RetroItem, Sprint } from '../types'
import Header from '../components/Header'
import RetroColumn from '../components/Retro/RetroColumn'

const COLUMNS: { category: RetroCategory; title: string; accent: string }[] = [
  { category: 'went_well',  title: 'Went well',   accent: '#22c55e' },
  { category: 'to_improve', title: 'To improve',  accent: '#f59e0b' },
  { category: 'action',     title: 'Action items', accent: '#6366f1' },
]

export default function RetrospectivePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const [searchParams, setSearchParams] = useSearchParams()
  const sprintIdParam = searchParams.get('sprint_id')

  const canWrite = useAuthStore(s => s.canWriteProject(pid))

  const [project, setProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(
    sprintIdParam ? Number(sprintIdParam) : null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { items, retroId, setRetro, addItem, updateItem, removeItem, setItems } = useRetroStore()
  const itemsRef = useRef<RetroItem[]>([])
  itemsRef.current = items

  const prevItemsRef = useRef<RetroItem[]>([])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useBoardEvents(pid)

  // Load project + sprints
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([api.projects.get(pid), loadSprints(pid)])
      .then(([proj, sprintList]) => {
        if (cancelled) return
        setProject(proj)
        setSprints(sprintList)
        if (selectedSprintId === null) {
          const active = sprintList.find(s => s.status === 'active') ?? sprintList[0] ?? null
          if (active) {
            setSelectedSprintId(active.id)
            setSearchParams(prev => { prev.set('sprint_id', String(active.id)); return prev }, { replace: true })
          }
        }
      })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load retrospective'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid])

  // Load retrospective for selected sprint
  useEffect(() => {
    if (!selectedSprintId) return
    api.retrospectives.getBySprint(selectedSprintId)
      .then(({ retrospective, items: rows }) => setRetro(retrospective.id, rows))
      .catch(() => toast.error('Failed to load retrospective'))
  }, [selectedSprintId, setRetro])

  function changeSprint(id: number | null) {
    setSelectedSprintId(id)
    setSearchParams(prev => {
      if (id) prev.set('sprint_id', String(id))
      else prev.delete('sprint_id')
      return prev
    }, { replace: true })
  }

  const itemsByCategory = useMemo(() => {
    const map: Record<RetroCategory, RetroItem[]> = { went_well: [], to_improve: [], action: [] }
    for (const i of items) map[i.category].push(i)
    for (const cat of Object.keys(map) as RetroCategory[]) {
      map[cat].sort((a, b) => a.position - b.position || a.id - b.id)
    }
    return map
  }, [items])

  // ── DnD ──────────────────────────────────────────────────────────────────────

  function findItemById(idStr: string): RetroItem | undefined {
    if (!idStr.startsWith('retro-item-')) return undefined
    const itemId = Number(idStr.slice('retro-item-'.length))
    return itemsRef.current.find(i => i.id === itemId)
  }

  function handleDragStart({ active: _active }: DragStartEvent) {
    void _active
    prevItemsRef.current = itemsRef.current
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const activeItem = findItemById(String(active.id))
    if (!activeItem) return

    const overId = String(over.id)
    const isOverColumn = overId.startsWith('retro-col-')
    const targetCategory: RetroCategory = isOverColumn
      ? (overId.slice('retro-col-'.length) as RetroCategory)
      : findItemById(overId)?.category ?? activeItem.category

    setItems(((): RetroItem[] => {
      const prev = itemsRef.current

      // Same category — reorder
      if (activeItem.category === targetCategory) {
        if (isOverColumn) return prev
        const col = prev.filter(i => i.category === targetCategory).sort((a, b) => a.position - b.position || a.id - b.id)
        const ai = col.findIndex(i => i.id === activeItem.id)
        const oi = col.findIndex(i => `retro-item-${i.id}` === overId)
        if (ai === -1 || oi === -1 || ai === oi) return prev
        const reordered = arrayMove(col, ai, oi).map((c, idx) => ({ ...c, position: idx }))
        return [...prev.filter(i => i.category !== targetCategory), ...reordered]
      }

      // Cross-category move
      const withoutActive = prev.filter(i => i.id !== activeItem.id)
      const target = withoutActive.filter(i => i.category === targetCategory).sort((a, b) => a.position - b.position || a.id - b.id)
      const moved: RetroItem = { ...activeItem, category: targetCategory }
      if (isOverColumn) {
        target.push(moved)
      } else {
        const oi = target.findIndex(i => `retro-item-${i.id}` === overId)
        target.splice(Math.max(0, oi), 0, moved)
      }
      return [
        ...withoutActive.filter(i => i.category !== targetCategory),
        ...target.map((c, idx) => ({ ...c, position: idx })),
      ]
    })())
  }

  async function handleDragEnd({ active }: DragEndEvent) {
    const card = itemsRef.current.find(i => `retro-item-${i.id}` === String(active.id))
    const prev = prevItemsRef.current.find(i => i.id === card?.id)
    if (!card || !prev || !retroId) return

    if (card.category === prev.category && card.position === prev.position) return

    try {
      if (card.category !== prev.category) {
        await api.retrospectives.updateItem(card.id, { category: card.category, position: card.position })
      }
      // Persist ordering for the category we landed in
      const ordered = itemsRef.current
        .filter(i => i.category === card.category)
        .sort((a, b) => a.position - b.position || a.id - b.id)
        .map(i => i.id)
      await api.retrospectives.reorder(retroId, card.category, ordered)
    } catch {
      setItems(prevItemsRef.current)
    }
  }

  function handleDragCancel() {
    setItems(prevItemsRef.current)
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  async function handleAdd(category: RetroCategory, body: string) {
    if (!retroId) return
    try {
      const created = await api.retrospectives.addItem(retroId, { category, body })
      addItem(created)
    } catch {
      // axios interceptor toasts already
    }
  }

  async function handleUpdate(id: number, body: string) {
    try {
      const updated = await api.retrospectives.updateItem(id, { body })
      updateItem(updated)
    } catch {
      // toast handled
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.retrospectives.deleteItem(id)
      removeItem(id)
    } catch {
      // toast handled
    }
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-100">
      {project ? (
        <Header
          project={project}
          sprints={sprints}
          selectedSprintId={selectedSprintId}
          onSprintChange={changeSprint}
        />
      ) : (
        <div className="h-14 bg-slate-900 flex-shrink-0" />
      )}

      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-3">
        <span className="font-semibold text-slate-800 text-sm">Retrospective</span>
        {sprints.length > 0 && (
          <>
            <span className="text-slate-300 select-none">·</span>
            <select
              value={selectedSprintId ?? ''}
              onChange={e => changeSprint(e.target.value ? Number(e.target.value) : null)}
              className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Select sprint…</option>
              {sprints.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.status === 'active' ? ' ●' : ''}
                </option>
              ))}
            </select>
          </>
        )}
        {!canWrite && (
          <span className="ml-auto text-xs text-slate-500 italic">Read-only</span>
        )}
      </div>

      <main className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
        ) : !selectedSprintId ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            Select a sprint to view its retrospective.
          </div>
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
              {COLUMNS.map(col => (
                <RetroColumn
                  key={col.category}
                  category={col.category}
                  title={col.title}
                  accent={col.accent}
                  items={itemsByCategory[col.category]}
                  canEdit={canWrite}
                  onAdd={(body) => handleAdd(col.category, body)}
                  onUpdateItem={handleUpdate}
                  onDeleteItem={handleDelete}
                />
              ))}
            </div>
          </DndContext>
        )}
      </main>
    </div>
  )
}

// Fallback for codebases that haven't migrated sprints to api.sprints — uses fetch
async function loadSprints(projectId: number): Promise<Sprint[]> {
  const res = await fetch(`/api/projects/${projectId}/sprints`, { credentials: 'include' })
  const json = await res.json()
  return (json?.data as Sprint[] | null) ?? []
}
