import { useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/index'
import type { NLAllowedType, ParsedIntent } from '../api/index'
import toast from 'react-hot-toast'

const priorityMap: Record<string, 'p0' | 'p1' | 'p2' | 'p3'> = {
  critical: 'p0',
  high: 'p1',
  medium: 'p2',
  low: 'p3',
}

export const normalizePriority = (priority: string): 'p0' | 'p1' | 'p2' | 'p3' => priorityMap[priority] || 'p2'

interface Lane {
  id: number
  title?: string
  name?: string
  is_done_col?: number
}

interface Card {
  id: number
  title: string
}

interface NLItemInputProps {
  allowedTypes: NLAllowedType[]
  context?: { projectId?: number; epicId?: number; laneId?: number }
  lanes?: Lane[]
  cards?: Card[]
  onCreated?: () => void
}

type State = 'idle' | 'input' | 'loading' | 'preview' | 'confirming'

export function NLItemInput({ allowedTypes, context, lanes = [], cards = [], onCreated }: NLItemInputProps) {
  const [state, setState] = useState<State>('idle')
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState<ParsedIntent | null>(null)
  const [selectedLaneId, setSelectedLaneId] = useState<number | null>(lanes[0]?.id ?? null)
  const [selectedCardId, setSelectedCardId] = useState<number | null>(cards[0]?.id ?? null)

  const handleParse = async () => {
    if (!input.trim()) return
    setState('loading')
    try {
      const result = await api.ai.parseItem({
        input,
        context: { ...context, allowedTypes },
      })
      setParsed(result)
      setState('preview')
    } catch (e) {
      setState('input')
      toast.error('Failed to parse item')
    }
  }

  const handleConfirm = async () => {
    if (!parsed || parsed.type === 'unknown') return
    setState('confirming')
    try {
      const payload = parsed.payload as any
      switch (parsed.type) {
        case 'epic':
          if (!context?.projectId) throw new Error('Project ID required')
          await api.epics.create(context.projectId, {
            title: payload.title,
            description: payload.description,
            priority: normalizePriority(payload.priority),
            assignee: payload.assignee,
          })
          break

        case 'feature':
          if (!context?.projectId) throw new Error('Project ID required')
          await api.features.create(context.projectId, {
            title: payload.title,
            description: payload.description,
            priority: normalizePriority(payload.priority),
            assignee: payload.assignee,
          })
          break

        case 'story':
          if (!selectedLaneId) throw new Error('Lane required')
          await api.cards.create(selectedLaneId, {
            title: payload.title,
            priority: normalizePriority(payload.priority),
            assignee: payload.assignee,
          })
          break

        case 'task':
          if (!selectedCardId) throw new Error('Parent card required')
          await api.cards.createTask(selectedCardId, {
            title: payload.title,
            description: payload.description,
            assignee: payload.assignee,
          })
          break

        case 'project':
          await api.projects.create({
            name: payload.name,
            description: payload.description,
            preset_id: 1,
          })
          break

        case 'sprint':
          if (!context?.projectId) throw new Error('Project ID required')
          await api.sprints.create(context.projectId, {
            name: payload.name,
            goal: payload.goal,
            start_date: payload.start_date,
            end_date: payload.end_date,
          })
          break

        case 'calendar':
          if (!context?.projectId) throw new Error('Project ID required')
          await api.calendar.events.create(context.projectId, {
            title: payload.title,
            description: payload.description,
            start_date: payload.start_date,
            end_date: payload.end_date,
          })
          break
      }

      toast.success('Item created!')
      setInput('')
      setParsed(null)
      setState('idle')
      onCreated?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create item')
      setState('preview')
    }
  }

  const typeBadgeColor: Record<NLAllowedType, string> = {
    epic: 'bg-purple-100 text-purple-800',
    feature: 'bg-blue-100 text-blue-800',
    story: 'bg-indigo-100 text-indigo-800',
    task: 'bg-cyan-100 text-cyan-800',
    project: 'bg-emerald-100 text-emerald-800',
    sprint: 'bg-orange-100 text-orange-800',
    calendar: 'bg-pink-100 text-pink-800',
  }

  const nonDoneLanes = lanes.filter(l => !l.is_done_col)
  const defaultLane = nonDoneLanes[0] || lanes[0]

  const closeModal = () => {
    if (state === 'confirming') return
    setState('idle')
    setInput('')
    setParsed(null)
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => {
          setState('input')
          setSelectedLaneId(defaultLane?.id ?? null)
          setSelectedCardId(cards[0]?.id ?? null)
        }}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        title="Create work items with AI"
      >
        <span>✦</span>
        <span>Create with AI</span>
      </button>
    )
  }

  if (state === 'input' || state === 'loading') {
    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
        onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}
      >
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Create with AI</h2>
            <button
              onClick={closeModal}
              className="text-slate-400 hover:text-slate-600 transition"
              title="Close"
            >
              ✕
            </button>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-2">
            Describe what you want to create
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g., High-priority epic: Platform refactoring, assign to Alice..."
            className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            rows={5}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleParse()
              } else if (e.key === 'Escape') {
                closeModal()
              }
            }}
            disabled={state === 'loading'}
            autoFocus
          />

          <div className="flex gap-2">
            <button
              onClick={handleParse}
              disabled={state === 'loading' || !input.trim()}
              className="flex-1 px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
            >
              {state === 'loading' ? 'Parsing...' : 'Parse'}
            </button>
            <button
              onClick={closeModal}
              disabled={state === 'loading'}
              className="flex-1 px-3 py-2 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  if ((state === 'preview' || state === 'confirming') && parsed) {
    if (parsed.type === 'unknown') {
      return createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Could not parse intent</h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">{(parsed as any).reason}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setParsed(null)
                  setState('input')
                }}
                className="flex-1 px-3 py-2 rounded-md text-sm bg-amber-600 text-white hover:bg-amber-700 transition"
              >
                Try rephrasing
              </button>
              <button
                onClick={closeModal}
                className="flex-1 px-3 py-2 rounded-md text-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    }

    const payload = parsed.payload as any
    const typeName = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1)
    const isStory = parsed.type === 'story'
    const isTask = parsed.type === 'task'
    const isConfirming = state === 'confirming'

    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
        onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}
      >
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${typeBadgeColor[parsed.type]}`}>
              {typeName}
            </span>
            <h2 className="text-lg font-semibold text-slate-800">Create {typeName}</h2>
          </div>
          <button
            onClick={closeModal}
            disabled={isConfirming}
            className="text-slate-400 hover:text-slate-600 disabled:text-slate-300 transition"
            title="Close"
          >
            ✕
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-1">
          {parsed.type === 'project' ? 'Project name' : 'Title'}
        </label>
        <input
          type="text"
          value={payload.title || payload.name || ''}
          onChange={e => {
            const key = 'title' in payload ? 'title' : 'name'
            setParsed({ ...parsed, payload: { ...payload, [key]: e.target.value } })
          }}
          className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={isConfirming}
        />

        {parsed.type !== 'sprint' && parsed.type !== 'calendar' && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={payload.description || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, description: e.target.value } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="Add details about this item..."
              rows={3}
            />
          </>
        )}

        {(parsed.type === 'sprint' || parsed.type === 'calendar') && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start date</label>
            <input
              type="date"
              value={payload.start_date || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, start_date: e.target.value } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
            />
            <label className="block text-sm font-medium text-slate-700 mb-1">End date</label>
            <input
              type="date"
              value={payload.end_date || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, end_date: e.target.value } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
            />
          </>
        )}

        {parsed.type === 'sprint' && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sprint goal</label>
            <textarea
              value={payload.goal || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, goal: e.target.value } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="What are we trying to accomplish?"
              rows={3}
            />
          </>
        )}

        {(parsed.type === 'epic' || parsed.type === 'feature' || parsed.type === 'story') && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
            <select
              value={payload.priority || 'medium'}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, priority: e.target.value } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>

            <label className="block text-sm font-medium text-slate-700 mb-1">Assignee (optional)</label>
            <input
              type="text"
              value={payload.assignee || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, assignee: e.target.value || null } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="Enter assignee name..."
            />
          </>
        )}

        {parsed.type === 'story' && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Story points (optional)</label>
            <input
              type="number"
              value={payload.estimate || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, estimate: e.target.value ? parseInt(e.target.value) : null } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="0"
              min="0"
            />

            <label className="block text-sm font-medium text-slate-700 mb-1">Lane (required)</label>
            <select
              value={selectedLaneId || ''}
              onChange={e => setSelectedLaneId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
            >
              <option value="">Select lane...</option>
              {nonDoneLanes.map(l => (
                <option key={l.id} value={l.id}>
                  {l.title || l.name || `Lane ${l.id}`}
                </option>
              ))}
            </select>
          </>
        )}

        {parsed.type === 'task' && (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assignee (optional)</label>
            <input
              type="text"
              value={payload.assignee || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, assignee: e.target.value || null } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="Enter assignee name..."
            />

            <label className="block text-sm font-medium text-slate-700 mb-1">Parent story (required)</label>
            {cards.length > 0 ? (
              <select
                value={selectedCardId || ''}
                onChange={e => setSelectedCardId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isConfirming}
              >
                <option value="">Select a story...</option>
                {cards.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full p-2 mb-3 rounded text-sm bg-slate-100 text-slate-700">
                No stories exist yet — create a story first
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleConfirm}
            disabled={
              isConfirming ||
              (isStory && !selectedLaneId) ||
              (isTask && cards.length > 0 && !selectedCardId) ||
              (isTask && cards.length === 0)
            }
            className="flex-1 px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {isConfirming ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => {
              setParsed(null)
              setState('input')
            }}
            disabled={isConfirming}
            className="flex-1 px-3 py-2 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400 transition"
          >
            Back
          </button>
        </div>
        </div>
      </div>,
      document.body
    )
  }

  return null
}
