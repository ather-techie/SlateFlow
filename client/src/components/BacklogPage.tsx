import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import type { BacklogCard, Card, Lane, Project, Sprint } from '../types'
import CardModal from './CardModal'
import Header from './Header'
import PriorityBadge from './PriorityBadge'

const PRIORITIES: Card['priority'][] = ['p0', 'p1', 'p2', 'p3']
const PRIORITY_LABELS: Record<string, string> = {
  p0: 'P0 — Critical',
  p1: 'P1 — High',
  p2: 'P2 — Medium',
  p3: 'P3 — Low',
}

function groupByLane(cards: BacklogCard[]) {
  const groups: Record<string, { name: string; color: string; cards: BacklogCard[] }> = {}
  for (const card of cards) {
    const key = String(card.swim_lane_id ?? card.column_id ?? 0)
    if (!groups[key]) {
      groups[key] = { name: card.column_name, color: card.column_color, cards: [] }
    }
    groups[key].cards.push(card)
  }
  return Object.values(groups)
}

function AddCardForm({
  lanes,
  onCreate,
  onCancel,
}: {
  lanes: Lane[]
  onCreate: (card: Card) => void
  onCancel: () => void
}) {
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? 0)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Card['priority']>('p2')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !laneId) return
    setSubmitting(true)
    try {
      const card = await api.createLaneCard(laneId, { title: title.trim(), priority })
      onCreate(card)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-lg border border-indigo-200 p-4 space-y-3 shadow-sm"
    >
      <div className="flex gap-3 flex-wrap">
        <select
          value={laneId}
          onChange={e => setLaneId(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
        >
          {lanes.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as Card['priority'])}
          className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
        >
          {PRIORITIES.map(p => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <input
        autoFocus
        placeholder="Card title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Adding…' : 'Add Card'}
        </button>
      </div>
    </form>
  )
}

function CardRow({
  card,
  sprints,
  onMoved,
  onDelete,
  onClick,
}: {
  card: BacklogCard
  sprints: Sprint[]
  onMoved: (cardId: number) => void
  onDelete: (cardId: number) => void
  onClick: (card: BacklogCard) => void
}) {
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleMove(sprintId: number) {
    setMoving(true)
    try {
      await api.updateCard(card.id, { sprint_id: sprintId })
      onMoved(card.id)
    } finally {
      setMoving(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${card.title}"?`)) return
    setDeleting(true)
    try {
      await api.deleteCard(card.id)
      onDelete(card.id)
    } finally {
      setDeleting(false)
    }
  }

  const availableSprints = sprints.filter(s => s.status !== 'completed')

  return (
    <div
      onClick={() => onClick(card)}
      className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group cursor-pointer"
    >
      <PriorityBadge priority={card.priority} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{card.title}</p>
        {card.assignee && <p className="text-xs text-slate-400 mt-0.5">{card.assignee}</p>}
      </div>
      {card.story_points !== null && (
        <span className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-mono">
          {card.story_points}pt
        </span>
      )}
      {availableSprints.length > 0 && (
        <select
          disabled={moving}
          value=""
          onClick={e => e.stopPropagation()}
          onChange={e => e.target.value && handleMove(Number(e.target.value))}
          className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-1 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Move to sprint…</option>
          {availableSprints.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.status === 'active' ? ' (active)' : ''}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete card"
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 rounded disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  )
}

export default function BacklogPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [lanes, setLanes] = useState<Lane[]>([])
  const [cards, setCards] = useState<BacklogCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [activeCard, setActiveCard] = useState<BacklogCard | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [proj, sps, laneList] = await Promise.all([
          api.getProject(pid),
          api.getSprints(pid),
          api.getLanes(pid),
        ])
        setProject(proj)
        setSprints(sps)
        setLanes(laneList)

        if (selectedSprintId === null) {
          setCards(await api.getBacklog(pid))
        } else {
          const sprintCards = await api.getSprintCards(selectedSprintId)
          setCards(sprintCards.map(card => {
            const lane = laneList.find(l => l.id === card.swim_lane_id)
            return { ...card, column_name: lane?.name ?? 'Uncategorized', column_color: lane?.color ?? '#94a3b8' }
          }))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load backlog')
      } finally {
        setLoading(false)
      }
    })()
  }, [pid, selectedSprintId])

  function handleMoved(cardId: number) {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  function handleDelete(cardId: number) {
    setCards(prev => prev.filter(c => c.id !== cardId))
    setActiveCard(prev => (prev?.id === cardId ? null : prev))
  }

  function handleCardCreated(card: Card) {
    setShowAddForm(false)
    if (selectedSprintId !== null) return  // new card has no sprint; don't show in sprint view
    const lane = lanes.find(l => l.id === card.swim_lane_id)
    const backlogCard: BacklogCard = {
      ...card,
      column_name: lane?.name ?? 'Uncategorized',
      column_color: lane?.color ?? '#94a3b8',
    }
    setCards(prev => [...prev, backlogCard])
  }

  function handleCardUpdated(updated: Card) {
    if (selectedSprintId !== null) {
      // Sprint view: remove if moved out of this sprint
      if (updated.sprint_id !== selectedSprintId) {
        setCards(prev => prev.filter(c => c.id !== updated.id))
        setActiveCard(null)
      } else {
        setCards(prev =>
          prev.map(c =>
            c.id === updated.id
              ? { ...c, ...updated, column_name: c.column_name, column_color: c.column_color }
              : c,
          ),
        )
        setActiveCard(prev => (prev ? { ...prev, ...updated } : null))
      }
      return
    }
    // Backlog view: remove if assigned to a sprint
    if (updated.sprint_id !== null) {
      setCards(prev => prev.filter(c => c.id !== updated.id))
      setActiveCard(null)
    } else {
      setCards(prev =>
        prev.map(c =>
          c.id === updated.id
            ? { ...c, ...updated, column_name: c.column_name, column_color: c.column_color }
            : c,
        ),
      )
      setActiveCard(prev => (prev ? { ...prev, ...updated } : null))
    }
  }

  const groups = groupByLane(cards)

  return (
    <div className="flex flex-col h-screen bg-slate-100">
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

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Backlog</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedSprintId
                  ? `${cards.length} card${cards.length !== 1 ? 's' : ''} in this sprint`
                  : `${cards.length} card${cards.length !== 1 ? 's' : ''} not assigned to any sprint`}
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Card
            </button>
          </div>

          {showAddForm && lanes.length > 0 && (
            <div className="mb-6">
              <AddCardForm
                lanes={lanes}
                onCreate={handleCardCreated}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-slate-200 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-lg">{selectedSprintId ? 'No cards in this sprint' : 'Backlog is empty'}</p>
              <p className="text-sm mt-1">
                {selectedSprintId
                  ? 'Assign cards to this sprint from the board or card modal.'
                  : showAddForm ? 'Fill in the form above to add a card.' : 'Click "New Card" to add one.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(group => (
                <div key={group.name}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: group.color || '#94a3b8' }}
                    />
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {group.name}
                    </h2>
                    <span className="text-xs text-slate-400">({group.cards.length})</span>
                  </div>
                  <div className="space-y-2">
                    {group.cards.map(card => (
                      <CardRow
                        key={card.id}
                        card={card}
                        sprints={sprints}
                        onMoved={handleMoved}
                        onDelete={handleDelete}
                        onClick={setActiveCard}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {activeCard && (
        <CardModal
          card={activeCard}
          projectId={pid}
          lanes={lanes}
          sprints={sprints}
          onClose={() => setActiveCard(null)}
          onUpdate={handleCardUpdated}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
