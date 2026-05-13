import { useState } from 'react'
import type { NLAllowedType, ParsedIntent } from '../api/index'
import * as api from '../api'
import toast from 'react-hot-toast'

// Map human-readable priority names to p0-p3 codes
const priorityMap: Record<string, 'p0' | 'p1' | 'p2' | 'p3'> = {
  critical: 'p0',
  high: 'p1',
  medium: 'p2',
  low: 'p3',
}

const normalizePriority = (priority: string): 'p0' | 'p1' | 'p2' | 'p3' => priorityMap[priority] || 'p2'

// Bridge API calls that may not exist in the fetch-based api.ts
const createEpic = async (projectId: number, data: any) => {
  return (api as any).epics?.create?.(projectId, data) ??
    fetch(`/api/projects/${projectId}/epics`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
}

const createFeature = async (projectId: number, data: any) => {
  return (api as any).features?.create?.(projectId, data) ??
    fetch(`/api/projects/${projectId}/features`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
}

const createLaneCard = async (laneId: number, data: any) => {
  return (api as any).createLaneCard?.(laneId, data) ??
    fetch(`/api/lanes/${laneId}/cards`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
}

const createTask = async (storyId: number, data: any) => {
  return (api as any).createTask?.(storyId, data) ??
    fetch(`/api/cards/${storyId}/tasks`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
}

const createProject = async (data: any) => {
  return (api as any).createProject?.(data) ??
    fetch('/api/projects', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
}

const createSprint = async (projectId: number, data: any) => {
  return (api as any).createSprint?.(projectId, data) ??
    fetch(`/api/projects/${projectId}/sprints`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
}

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

const parseItem = async (data: any): Promise<ParsedIntent> => {
  const response = await fetch('/api/ai/parse-item', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to parse item')
  const json = await response.json()
  if (json.error) throw new Error(json.error)
  return json.data as ParsedIntent
}

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
      const result = await parseItem({
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
          await createEpic(context.projectId, {
            title: payload.title,
            description: payload.description,
            priority: normalizePriority(payload.priority),
            assignee: payload.assignee,
          })
          break

        case 'feature':
          if (!context?.projectId) throw new Error('Project ID required')
          await createFeature(context.projectId, {
            title: payload.title,
            description: payload.description,
            priority: normalizePriority(payload.priority),
            assignee: payload.assignee,
          })
          break

        case 'story':
          if (!selectedLaneId) throw new Error('Lane required')
          await createLaneCard(selectedLaneId, {
            title: payload.title,
            priority: normalizePriority(payload.priority),
            assignee: payload.assignee,
          })
          break

        case 'task':
          if (!selectedCardId) throw new Error('Parent card required')
          await createTask(selectedCardId, {
            title: payload.title,
            description: payload.description,
            assignee: payload.assignee,
          })
          break

        case 'project':
          await createProject({
            name: payload.name,
            description: payload.description,
            preset_id: 1,
          })
          break

        case 'sprint':
          if (!context?.projectId) throw new Error('Project ID required')
          await createSprint(context.projectId, {
            name: payload.name,
            goal: payload.goal,
            start_date: payload.start_date,
            end_date: payload.end_date,
          })
          break

        case 'calendar':
          if (!context?.projectId) throw new Error('Project ID required')
          await fetch(`/api/projects/${context.projectId}/calendar/events`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: payload.title,
              description: payload.description,
              start_date: payload.start_date,
              end_date: payload.end_date,
            }),
          }).then(r => {
            if (!r.ok) throw new Error('Failed to create calendar entry')
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
    return (
      <div className="inline-flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="e.g., High-priority epic: Platform refactoring, for Alice..."
          className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          rows={3}
          style={{ minWidth: '300px' }}
          onKeyDown={e => {
            if (e.key === 'Enter' && e.ctrlKey) {
              handleParse()
            } else if (e.key === 'Escape') {
              setState('idle')
              setInput('')
            }
          }}
          disabled={state === 'loading'}
        />
        <button
          onClick={handleParse}
          disabled={state === 'loading' || !input.trim()}
          className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-300 transition"
        >
          {state === 'loading' ? 'Parsing...' : 'Parse'}
        </button>
        <button
          onClick={() => {
            setState('idle')
            setInput('')
          }}
          className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          Cancel
        </button>
      </div>
    )
  }

  if ((state === 'preview' || state === 'confirming') && parsed) {
    if (parsed.type === 'unknown') {
      return (
        <div className="max-w-md">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900 mb-2">Could not parse intent</p>
            <p className="text-sm text-amber-800 mb-4">{(parsed as any).reason}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setParsed(null)
                  setState('input')
                }}
                className="px-3 py-1 rounded text-sm bg-amber-600 text-white hover:bg-amber-700 transition"
              >
                Try rephrasing
              </button>
              <button
                onClick={() => {
                  setState('idle')
                  setInput('')
                }}
                className="px-3 py-1 rounded text-sm border border-amber-300 text-amber-900 hover:bg-amber-100 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )
    }

    const payload = parsed.payload as any
    const typeName = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1)
    const isStory = parsed.type === 'story'
    const isTask = parsed.type === 'task'
    const isConfirming = state === 'confirming'

    return (
      <div className="max-w-md border border-slate-200 rounded-lg shadow-sm bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${typeBadgeColor[parsed.type]}`}>
            {typeName}
          </span>
          {isConfirming && <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />}
        </div>

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
          <textarea
            value={payload.description || ''}
            onChange={e => setParsed({ ...parsed, payload: { ...payload, description: e.target.value } })}
            className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm resize-none rows-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isConfirming}
            placeholder="Description"
            rows={2}
          />
        )}

        {(parsed.type === 'sprint' || parsed.type === 'calendar') && (
          <>
            <input
              type="date"
              value={payload.start_date || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, start_date: e.target.value } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
            />
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
          <textarea
            value={payload.goal || ''}
            onChange={e => setParsed({ ...parsed, payload: { ...payload, goal: e.target.value } })}
            className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm resize-none rows-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isConfirming}
            placeholder="Sprint goal"
            rows={2}
          />
        )}

        {(parsed.type === 'epic' || parsed.type === 'feature' || parsed.type === 'story') && (
          <>
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

            <input
              type="text"
              value={payload.assignee || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, assignee: e.target.value || null } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="Assignee (optional)"
            />
          </>
        )}

        {parsed.type === 'story' && (
          <>
            <input
              type="number"
              value={payload.estimate || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, estimate: e.target.value ? parseInt(e.target.value) : null } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="Story points (optional)"
              min="0"
            />

            <select
              value={selectedLaneId || ''}
              onChange={e => setSelectedLaneId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
            >
              <option value="">Select lane (required)</option>
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
            <input
              type="text"
              value={payload.assignee || ''}
              onChange={e => setParsed({ ...parsed, payload: { ...payload, assignee: e.target.value || null } })}
              className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isConfirming}
              placeholder="Assignee (optional)"
            />

            {cards.length > 0 ? (
              <select
                value={selectedCardId || ''}
                onChange={e => setSelectedCardId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-2 py-1 mb-3 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isConfirming}
              >
                <option value="">Select parent story (required)</option>
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

        <div className="flex gap-2">
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
            {isConfirming ? 'Confirming...' : 'Confirm'}
          </button>
          <button
            onClick={() => {
              setParsed(null)
              setState('input')
            }}
            disabled={isConfirming}
            className="flex-1 px-3 py-2 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return null
}
