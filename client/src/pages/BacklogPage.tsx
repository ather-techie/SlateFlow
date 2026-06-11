import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/index'
import type { BacklogCard, Card, Epic, Feature, Lane, Project, Sprint, Task } from '../types'
import CardModal from '../components/CardModal'
import Header from '../components/Header'
import PriorityBadge from '../components/ui/PriorityBadge'
import { FeatureGate } from '../components/ui/FeatureGate'
import GroomingPanel from '../components/Backlog/GroomingPanel'

type TypeFilter = 'all' | 'epics' | 'features' | 'stories' | 'tasks'

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'epics', label: 'Epics' },
  { key: 'features', label: 'Features' },
  { key: 'stories', label: 'Stories' },
  { key: 'tasks', label: 'Tasks' },
]

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-500',
  active: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-400',
}

const TASK_STATUS_COLORS: Record<string, string> = {
  'to-do': 'bg-slate-100 text-slate-500',
  'in-progress': 'bg-blue-100 text-blue-700',
  'done': 'bg-emerald-100 text-emerald-700',
}

const PRIORITIES: Card['priority'][] = ['p0', 'p1', 'p2', 'p3']
const PRIORITY_LABELS: Record<string, string> = {
  p0: 'Critical',
  p1: 'High',
  p2: 'Medium',
  p3: 'Low',
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
      await api.cards.update(card.id, { sprint_id: sprintId })
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
      await api.cards.delete(card.id)
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
  const [showGrooming, setShowGrooming] = useState(false)
  const [activeCard, setActiveCard] = useState<BacklogCard | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [epics, setEpics] = useState<Epic[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [projectTasks, setProjectTasks] = useState<(Task & { story_title: string })[]>([])

  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [proj, sps, laneList] = await Promise.all([
          api.projects.get(pid),
          api.sprints.list(pid),
          api.lanes.list(pid),
        ])
        setProject(proj)
        setSprints(sps)
        setLanes(laneList)

        if (selectedSprintId === null) {
          const backlogCards = await api.backlog.get(pid)
          setCards(backlogCards.map(card => {
            const lane = laneList.find(l => l.id === card.swim_lane_id)
            return { ...card, column_name: lane?.name ?? 'Uncategorized', column_color: lane?.color ?? '#94a3b8' } as BacklogCard
          }))
        } else {
          const sprintCards = await api.cards.listBySprint(selectedSprintId)
          setCards(sprintCards.map(card => {
            const lane = laneList.find(l => l.id === card.swim_lane_id)
            return { ...card, column_name: lane?.name ?? 'Uncategorized', column_color: lane?.color ?? '#94a3b8' } as BacklogCard
          }))
        }

        // Load hierarchy data in background
        api.epics.list(pid).then(setEpics).catch(() => {})
        api.features.list(pid).then(setFeatures).catch(() => {})
        api.cards.listProjectTasks(pid).then(setProjectTasks).catch(() => {})
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
    if (selectedSprintId !== null) return
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Backlog</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {selectedSprintId
                  ? `${cards.length} stor${cards.length !== 1 ? 'ies' : 'y'} in this sprint`
                  : `${cards.length} stor${cards.length !== 1 ? 'ies' : 'y'} not assigned to any sprint`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <FeatureGate flag="ai">
                <FeatureGate flag="ai_planning_assist">
                  <button
                    onClick={() => setShowGrooming(v => !v)}
                    className="flex items-center gap-1.5 text-sm bg-violet-50 text-violet-700 border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-100 transition-colors"
                    title="Let AI review the backlog for duplicates, vague and stale cards"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Groom with AI
                  </button>
                </FeatureGate>
              </FeatureGate>
              {(typeFilter === 'all' || typeFilter === 'stories') && (
                <button
                  onClick={() => setShowAddForm(v => !v)}
                  className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Story
                </button>
              )}
            </div>
          </div>

          {/* Type filter tabs */}
          <div className="flex gap-1 mb-5 border-b border-slate-200">
            {TYPE_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setTypeFilter(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  typeFilter === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {tab.key === 'epics' && epics.length > 0 && (
                  <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{epics.length}</span>
                )}
                {tab.key === 'features' && features.length > 0 && (
                  <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{features.length}</span>
                )}
                {tab.key === 'stories' && cards.length > 0 && (
                  <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{cards.length}</span>
                )}
                {tab.key === 'tasks' && projectTasks.length > 0 && (
                  <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{projectTasks.length}</span>
                )}
              </button>
            ))}
          </div>

          {showGrooming && (
            <FeatureGate flag="ai">
              <FeatureGate flag="ai_planning_assist">
                <GroomingPanel
                  projectId={pid}
                  cards={cards}
                  onClose={() => setShowGrooming(false)}
                />
              </FeatureGate>
            </FeatureGate>
          )}

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
          ) : (
            <>
              {/* ── Epics view ── */}
              {typeFilter === 'epics' && (
                <div className="space-y-2">
                  {epics.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">No epics yet. Create them from the Epics page.</p>}
                  {epics.map(ep => (
                    <div key={ep.id} className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
                      <span className="w-3 h-3 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium text-slate-800">{ep.title}</span>
                      <PriorityBadge priority={ep.priority} />
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[ep.status]}`}>{ep.status}</span>
                      <span className="text-xs text-slate-400">{ep.feature_count ?? 0} features · {ep.story_count ?? 0} stories</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Features view ── */}
              {typeFilter === 'features' && (
                <div className="space-y-2">
                  {features.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">No features yet. Create them from the Epics page.</p>}
                  {features.map(f => {
                    const epic = epics.find(e => e.id === f.epic_id)
                    return (
                      <div key={f.id} className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full border border-purple-400 bg-purple-50 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{f.title}</p>
                          {epic && <p className="text-xs text-slate-400 truncate">{epic.title}</p>}
                        </div>
                        <PriorityBadge priority={f.priority} />
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[f.status]}`}>{f.status}</span>
                        <span className="text-xs text-slate-400">{f.story_count ?? 0} stories</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Tasks view ── */}
              {typeFilter === 'tasks' && (
                <div className="space-y-2">
                  {projectTasks.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">No tasks yet. Add tasks inside a story from the board or Epics page.</p>}
                  {projectTasks.map(t => (
                    <div key={t.id} className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
                      <span className={`w-3 h-3 rounded flex-shrink-0 border ${t.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</p>
                        <p className="text-xs text-slate-400 truncate">Story: {t.story_title}</p>
                      </div>
                      {t.assignee && <span className="text-xs text-slate-500">{t.assignee}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TASK_STATUS_COLORS[t.status]}`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── All view: hierarchy + stories ── */}
              {typeFilter === 'all' && (
                <>
                  {/* Epics/Features hierarchy section */}
                  {epics.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Epic → Feature hierarchy</h2>
                      <div className="space-y-2">
                        {epics.map(ep => {
                          const epFeatures = features.filter(f => f.epic_id === ep.id)
                          return (
                            <div key={ep.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <div className="px-4 py-2.5 flex items-center gap-2 bg-amber-50 border-b border-amber-100">
                                <span className="w-3 h-3 rounded border-2 border-amber-400 bg-white flex-shrink-0" />
                                <span className="flex-1 text-sm font-semibold text-slate-800">{ep.title}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[ep.status]}`}>{ep.status}</span>
                              </div>
                              {epFeatures.map(f => (
                                <div key={f.id} className="px-6 py-2 flex items-center gap-2 border-b border-slate-100 last:border-0">
                                  <span className="w-2.5 h-2.5 rounded-full border border-purple-400 bg-white flex-shrink-0" />
                                  <span className="flex-1 text-sm text-slate-700">{f.title}</span>
                                  <span className="text-xs text-slate-400">{f.story_count ?? 0} stories</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[f.status]}`}>{f.status}</span>
                                </div>
                              ))}
                              {epFeatures.length === 0 && (
                                <div className="px-6 py-1.5 text-xs text-slate-400">No features</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Stories section (existing behavior) */}
                  <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Stories</h2>
                  {groups.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                      <p className="text-base">{selectedSprintId ? 'No stories in this sprint' : 'No unassigned stories'}</p>
                      <p className="text-sm mt-1">
                        {selectedSprintId ? 'Assign stories from the board.' : 'Click "New Story" to add one.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groups.map(group => (
                        <div key={group.name}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color || '#94a3b8' }} />
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{group.name}</h3>
                            <span className="text-xs text-slate-400">({group.cards.length})</span>
                          </div>
                          <div className="space-y-2">
                            {group.cards.map(card => (
                              <CardRow key={card.id} card={card} sprints={sprints} onMoved={handleMoved} onDelete={handleDelete} onClick={setActiveCard} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Stories filter view (existing behavior) ── */}
              {typeFilter === 'stories' && (
                groups.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <p className="text-lg">{selectedSprintId ? 'No stories in this sprint' : 'No unassigned stories'}</p>
                    <p className="text-sm mt-1">
                      {selectedSprintId
                        ? 'Assign stories to this sprint from the board or story modal.'
                        : showAddForm ? 'Fill in the form above to add a story.' : 'Click "New Story" to add one.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groups.map(group => (
                      <div key={group.name}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color || '#94a3b8' }} />
                          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{group.name}</h2>
                          <span className="text-xs text-slate-400">({group.cards.length})</span>
                        </div>
                        <div className="space-y-2">
                          {group.cards.map(card => (
                            <CardRow key={card.id} card={card} sprints={sprints} onMoved={handleMoved} onDelete={handleDelete} onClick={setActiveCard} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </>
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
