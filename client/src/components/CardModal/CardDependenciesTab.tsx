import { useEffect, useState } from 'react'
import type { Card, Dependency, DependencyList } from '../../types'
import { api } from '../../api/index'

interface Props {
  card: Card
  projectId: number
}

export default function CardDependenciesTab({ card, projectId }: Props) {
  const [deps, setDeps] = useState<DependencyList | null>(null)
  const [depSearch, setDepSearch] = useState('')
  const [depType, setDepType] = useState<'blocks' | 'blocked_by'>('blocks')
  const [addingDep, setAddingDep] = useState(false)
  const [depSearchResults, setDepSearchResults] = useState<Dependency[]>([])

  useEffect(() => {
    api.dependencies.list(card.id).then(setDeps).catch(() => setDeps({ blocks: [], blocked_by: [] }))
  }, [card.id])

  async function handleDepSearch(q: string) {
    setDepSearch(q)
    if (q.trim().length < 2) { setDepSearchResults([]); return }
    try {
      const results = await api.cards.searchStories(projectId, q)
      setDepSearchResults(
        results
          .filter(c => c.id !== card.id)
          .slice(0, 6)
          .map(c => ({ dep_id: 0, id: c.id, title: c.title, priority: c.priority, story_points: c.story_points, assignee: c.assignee, swim_lane_id: c.swim_lane_id }))
      )
    } catch { setDepSearchResults([]) }
  }

  async function handleAddDep(target: Dependency) {
    try {
      await api.dependencies.add(card.id, { target_id: target.id, type: depType })
      const updated = await api.dependencies.list(card.id)
      setDeps(updated)
      setDepSearch('')
      setDepSearchResults([])
      setAddingDep(false)
    } catch { /* ignore */ }
  }

  async function handleRemoveDep(depId: number) {
    try {
      await api.dependencies.remove(depId)
      const updated = await api.dependencies.list(card.id)
      setDeps(updated)
    } catch { /* ignore */ }
  }

  if (deps === null) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => <div key={i} className="h-8 bg-slate-100 animate-pulse rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Blocks list */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Blocks</p>
        {deps.blocks.length === 0 ? (
          <p className="text-xs text-slate-400 italic">This story doesn't block anything.</p>
        ) : (
          <ul className="space-y-1">
            {deps.blocks.map(d => (
              <li key={d.dep_id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-700 flex-1 truncate">{d.title}</span>
                {d.story_points !== null && <span className="text-xs text-slate-400 font-mono">{d.story_points}pt</span>}
                <button onClick={() => handleRemoveDep(d.dep_id)} className="text-slate-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0" title="Remove">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Blocked by list */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Blocked By</p>
        {deps.blocked_by.length === 0 ? (
          <p className="text-xs text-slate-400 italic">This story is not blocked.</p>
        ) : (
          <ul className="space-y-1">
            {deps.blocked_by.map(d => (
              <li key={d.dep_id} className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <span className="text-xs text-amber-600 font-semibold flex-shrink-0">⊘</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{d.title}</span>
                {d.story_points !== null && <span className="text-xs text-slate-400 font-mono">{d.story_points}pt</span>}
                <button onClick={() => handleRemoveDep(d.dep_id)} className="text-slate-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0" title="Remove">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add dependency */}
      {!addingDep ? (
        <button
          onClick={() => setAddingDep(true)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
        >
          + Add dependency
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
          <div className="flex gap-2">
            <select
              value={depType}
              onChange={e => setDepType(e.target.value as 'blocks' | 'blocked_by')}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="blocks">Blocks</option>
              <option value="blocked_by">Blocked by</option>
            </select>
            <input
              autoFocus
              value={depSearch}
              onChange={e => handleDepSearch(e.target.value)}
              placeholder="Search stories by title…"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button onClick={() => { setAddingDep(false); setDepSearch(''); setDepSearchResults([]) }} className="text-slate-400 hover:text-slate-600 text-xs px-2">✕</button>
          </div>
          {depSearchResults.length > 0 && (
            <ul className="border border-slate-200 rounded-lg overflow-hidden">
              {depSearchResults.map(r => (
                <li key={r.id}>
                  <button
                    onClick={() => handleAddDep(r)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 transition-colors"
                  >
                    <span className="font-medium">#{r.id}</span> {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {depSearch.trim().length >= 2 && depSearchResults.length === 0 && (
            <p className="text-xs text-slate-400 italic">No stories found.</p>
          )}
        </div>
      )}
    </div>
  )
}
