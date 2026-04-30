import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import type { BacklogCard, Project, Sprint } from '../types'
import Header from './Header'
import PriorityBadge from './PriorityBadge'

function groupByColumn(cards: BacklogCard[]) {
  const groups: Record<string, { name: string; color: string; cards: BacklogCard[] }> = {}
  for (const card of cards) {
    if (!groups[card.column_id]) {
      groups[card.column_id] = { name: card.column_name, color: card.column_color, cards: [] }
    }
    groups[card.column_id].cards.push(card)
  }
  return Object.values(groups)
}

function CardRow({
  card,
  sprints,
  onMoved,
}: {
  card: BacklogCard
  sprints: Sprint[]
  onMoved: (cardId: number) => void
}) {
  const [moving, setMoving] = useState(false)

  async function handleMove(sprintId: number) {
    setMoving(true)
    try {
      await api.updateCard(card.id, { sprint_id: sprintId })
      onMoved(card.id)
    } finally {
      setMoving(false)
    }
  }

  const availableSprints = sprints.filter(s => s.status !== 'completed')

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors group">
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
          onChange={e => e.target.value && handleMove(Number(e.target.value))}
          className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-1 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Move to sprint…</option>
          {availableSprints.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.status === 'active' ? ' (active)' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export default function BacklogPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [project, setProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [cards, setCards] = useState<BacklogCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const [proj, sps, backlog] = await Promise.all([
          api.getProject(pid),
          api.getSprints(pid),
          api.getBacklog(pid),
        ])
        setProject(proj)
        setSprints(sps)
        setCards(backlog)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load backlog')
      } finally {
        setLoading(false)
      }
    })()
  }, [pid])

  function handleMoved(cardId: number) {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  const groups = groupByColumn(cards)

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
                {cards.length} card{cards.length !== 1 ? 's' : ''} not assigned to any sprint
              </p>
            </div>
          </div>

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
              <p className="text-lg">Backlog is empty</p>
              <p className="text-sm mt-1">All cards are assigned to sprints.</p>
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
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
