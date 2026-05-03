import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import type { Card, Epic, Feature, Task } from '../types'
import PriorityBadge from '../components/PriorityBadge'
import CardModal from '../components/CardModal'

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-700 text-slate-300',
  active: 'bg-blue-900 text-blue-300',
  resolved: 'bg-emerald-900 text-emerald-300',
  closed: 'bg-slate-800 text-slate-500',
}

const TASK_STATUS_NEXT: Record<Task['status'], Task['status']> = {
  'to-do': 'in-progress',
  'in-progress': 'done',
  'done': 'to-do',
}

// ── Inline create form ────────────────────────────────────────────────────────

function InlineForm({
  placeholder,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  onSubmit: (title: string) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try { await onSubmit(title.trim()) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 py-1.5 px-3">
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm bg-slate-700 text-slate-100 border border-slate-600 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
        onKeyDown={e => e.key === 'Escape' && onCancel()}
      />
      <button
        type="submit"
        disabled={!title.trim() || saving}
        className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500 disabled:opacity-40"
      >
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300 px-1">
        Cancel
      </button>
    </form>
  )
}

// ── Inline title editor ────────────────────────────────────────────────────────

function InlineTitleEdit({
  value,
  onSave,
  onCancel,
  className,
}: {
  value: string
  onSave: (title: string) => Promise<void>
  onCancel: () => void
  className?: string
}) {
  const [title, setTitle] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function commit() {
    const trimmed = title.trim()
    if (!trimmed || trimmed === value) { onCancel(); return }
    setSaving(true)
    try { await onSave(trimmed) } finally { setSaving(false) }
  }

  return (
    <input
      ref={inputRef}
      value={title}
      onChange={e => setTitle(e.target.value)}
      disabled={saving}
      className={`bg-slate-700 text-slate-100 border border-indigo-500 rounded px-1.5 py-0.5 focus:outline-none text-sm ${className ?? ''}`}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
    />
  )
}

// ── Task status icon ───────────────────────────────────────────────────────────

function TaskStatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'done') {
    return (
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <circle cx="12" cy="12" r="10" className="stroke-emerald-500" fill="none" strokeWidth="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-5" />
      </svg>
    )
  }
  if (status === 'in-progress') {
    return (
      <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

// ── Task row ───────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onStatusToggle,
  onDelete,
}: {
  task: Task
  onStatusToggle: (task: Task) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="flex items-center gap-2 py-1 px-3 hover:bg-slate-800 rounded group">
      <button
        onClick={() => onStatusToggle(task)}
        className="flex-shrink-0 hover:scale-110 transition-transform"
        title={`Status: ${task.status} — click to advance`}
      >
        <TaskStatusIcon status={task.status} />
      </button>
      <span className={`flex-1 text-xs truncate ${task.status === 'done' ? 'line-through text-slate-500' : 'text-slate-300'}`}>
        {task.title}
      </span>
      {task.assignee && (
        <span className="text-xs text-slate-600 truncate max-w-[80px]">{task.assignee}</span>
      )}
      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
        task.status === 'done' ? 'bg-emerald-900 text-emerald-400' :
        task.status === 'in-progress' ? 'bg-blue-900 text-blue-400' :
        'bg-slate-700 text-slate-500'
      }`}>
        {task.status}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 flex-shrink-0"
        title="Delete task"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Story row (with expandable tasks) ─────────────────────────────────────────

function StoryWithTasks({ card, onClick }: { card: Card; onClick: () => void }) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)

  async function loadTasks() {
    if (loadingTasks) return
    setLoadingTasks(true)
    try {
      const t = await api.cards.listTasks(card.id)
      setTasks(t)
    } finally {
      setLoadingTasks(false)
    }
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !open
    setOpen(next)
    if (next && tasks.length === 0) loadTasks()
  }

  async function addTask(title: string) {
    const task = await api.cards.createTask(card.id, { title })
    setTasks(prev => [...prev, task])
    setShowAddTask(false)
  }

  async function handleStatusToggle(task: Task) {
    const next = TASK_STATUS_NEXT[task.status]
    const updated = await api.cards.updateTask(task.id, { status: next })
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
  }

  async function handleDeleteTask(id: number) {
    await api.cards.deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div>
      <div
        onClick={onClick}
        className="flex items-center gap-2 py-1.5 px-3 hover:bg-slate-800 rounded cursor-pointer group"
      >
        <button
          onClick={toggle}
          className="text-slate-600 hover:text-slate-400 flex-shrink-0"
        >
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 6 10" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l4 4-4 4" />
          </svg>
        </button>
        <span className="w-3 h-3 rounded-sm border border-indigo-500 bg-indigo-900 flex-shrink-0" title="Story" />
        <span className="flex-1 text-sm text-slate-200 truncate group-hover:text-white">{card.title}</span>
        <PriorityBadge priority={card.priority} />
        {card.assignee && (
          <span className="text-xs text-slate-500 truncate max-w-[90px]">{card.assignee}</span>
        )}
      </div>

      {open && (
        <div className="ml-8 border-l border-slate-700/60">
          {loadingTasks && <p className="text-xs text-slate-600 px-3 py-1">Loading tasks…</p>}
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onStatusToggle={handleStatusToggle}
              onDelete={handleDeleteTask}
            />
          ))}
          {showAddTask ? (
            <InlineForm
              placeholder="Task title…"
              onSubmit={addTask}
              onCancel={() => setShowAddTask(false)}
            />
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setShowAddTask(true) }}
              className="text-xs text-slate-600 hover:text-emerald-400 px-3 py-1"
            >
              + Add Task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureRow({
  feature,
  projectId,
  onStoryClick,
  onUpdated,
  onDeleted,
}: {
  feature: Feature
  projectId: number
  onStoryClick: (card: Card) => void
  onUpdated: (feature: Feature) => void
  onDeleted: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [stories, setStories] = useState<Card[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [showAddStory, setShowAddStory] = useState(false)
  const [lanes, setLanes] = useState<{ id: number; name: string }[]>([])
  const [editing, setEditing] = useState(false)

  async function loadStories() {
    if (loadingStories) return
    setLoadingStories(true)
    try {
      const [s, l] = await Promise.all([
        api.features.listStories(feature.id),
        api.lanes.list(projectId),
      ])
      setStories(s)
      setLanes(l)
    } finally {
      setLoadingStories(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && stories.length === 0) loadStories()
  }

  async function addStory(title: string) {
    const defaultLane = lanes[0]
    if (!defaultLane) return
    const card = await api.cards.create(defaultLane.id, { title, feature_id: feature.id })
    setStories(prev => [...prev, card])
    setShowAddStory(false)
  }

  async function saveTitle(title: string) {
    const updated = await api.features.update(feature.id, { title })
    onUpdated(updated)
    setEditing(false)
  }

  async function deleteFeature() {
    if (!confirm(`Delete feature "${feature.title}"? Stories will be unlinked.`)) return
    await api.features.delete(feature.id)
    onDeleted(feature.id)
  }

  const total = feature.story_count ?? 0
  const done = feature.done_story_count ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="ml-6 border-l border-slate-700">
      {/* Feature header */}
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded group">
        <button onClick={toggle} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 6 10" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l4 4-4 4" />
          </svg>
        </button>
        <span className="w-3 h-3 rounded-full border border-purple-400 bg-purple-900 flex-shrink-0" title="Feature" />
        {editing ? (
          <InlineTitleEdit
            value={feature.title}
            onSave={saveTitle}
            onCancel={() => setEditing(false)}
            className="flex-1"
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-slate-200 truncate">{feature.title}</span>
        )}
        {feature.is_default === 1 && (
          <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">Default</span>
        )}
        {total > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-slate-500">{done}/{total}</span>
          </div>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${STATUS_COLORS[feature.status]}`}>
          {feature.status}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setShowAddStory(true); setOpen(true) }}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            + Story
          </button>
          {!editing && (
            <button
              onClick={e => { e.stopPropagation(); setEditing(true) }}
              className="text-slate-500 hover:text-slate-300"
              title="Edit feature title"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 16H9v-3z" />
              </svg>
            </button>
          )}
          {!feature.is_default && (
            <button
              onClick={e => { e.stopPropagation(); deleteFeature() }}
              className="text-slate-600 hover:text-red-400"
              title="Delete feature"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Stories */}
      {open && (
        <div className="ml-4">
          {loadingStories && (
            <p className="text-xs text-slate-600 px-3 py-1">Loading…</p>
          )}
          {stories.map(s => (
            <StoryWithTasks key={s.id} card={s} onClick={() => onStoryClick(s)} />
          ))}
          {showAddStory ? (
            <InlineForm
              placeholder="Story title…"
              onSubmit={addStory}
              onCancel={() => setShowAddStory(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddStory(true)}
              className="text-xs text-slate-600 hover:text-indigo-400 px-3 py-1"
            >
              + Add Story
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Epic row ──────────────────────────────────────────────────────────────────

function EpicRow({
  epic,
  projectId,
  onStoryClick,
  onDeleted,
  onUpdated,
}: {
  epic: Epic
  projectId: number
  onStoryClick: (card: Card) => void
  onDeleted: (id: number) => void
  onUpdated: (epic: Epic) => void
}) {
  const [open, setOpen] = useState(false)
  const [features, setFeatures] = useState<Feature[]>([])
  const [loadingFeatures, setLoadingFeatures] = useState(false)
  const [showAddFeature, setShowAddFeature] = useState(false)
  const [editing, setEditing] = useState(false)

  async function loadFeatures() {
    if (loadingFeatures) return
    setLoadingFeatures(true)
    try {
      const f = await api.features.list(projectId, epic.id)
      setFeatures(f)
    } finally {
      setLoadingFeatures(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && features.length === 0) loadFeatures()
  }

  async function addFeature(title: string) {
    const f = await api.features.create(projectId, { title, epic_id: epic.id })
    setFeatures(prev => [...prev, f])
    setShowAddFeature(false)
  }

  async function deleteEpic() {
    if (!confirm(`Delete epic "${epic.title}"? Features will be unlinked.`)) return
    await api.epics.delete(epic.id)
    onDeleted(epic.id)
  }

  async function saveTitle(title: string) {
    const updated = await api.epics.update(epic.id, { title })
    onUpdated(updated)
    setEditing(false)
  }

  const total = epic.story_count ?? 0
  const featureCount = epic.feature_count ?? 0

  return (
    <div className="border border-slate-700 rounded-lg mb-2 overflow-hidden">
      {/* Epic header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-750 group">
        <button onClick={toggle} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 6 10" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l4 4-4 4" />
          </svg>
        </button>
        <span className="w-3.5 h-3.5 rounded border-2 border-amber-400 bg-amber-900 flex-shrink-0" title="Epic" />
        {editing ? (
          <InlineTitleEdit
            value={epic.title}
            onSave={saveTitle}
            onCancel={() => setEditing(false)}
            className="flex-1"
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-white truncate">{epic.title}</span>
        )}
        {epic.is_default === 1 && (
          <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">Default</span>
        )}
        <span className="text-xs text-slate-500 flex-shrink-0">
          {featureCount} feature{featureCount !== 1 ? 's' : ''} · {total} stor{total !== 1 ? 'ies' : 'y'}
        </span>
        <PriorityBadge priority={epic.priority} />
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${STATUS_COLORS[epic.status]}`}>
          {epic.status}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setShowAddFeature(true); setOpen(true) }}
            className="text-xs text-purple-400 hover:text-purple-300"
          >
            + Feature
          </button>
          {!editing && (
            <button
              onClick={e => { e.stopPropagation(); setEditing(true) }}
              className="text-slate-500 hover:text-slate-300"
              title="Edit epic title"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 16H9v-3z" />
              </svg>
            </button>
          )}
          {!epic.is_default && (
            <button
              onClick={e => { e.stopPropagation(); deleteEpic() }}
              className="text-slate-600 hover:text-red-400 ml-1"
              title="Delete epic"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Features */}
      {open && (
        <div className="bg-slate-850 py-1">
          {loadingFeatures && (
            <p className="text-xs text-slate-600 px-4 py-1">Loading…</p>
          )}
          {features.map(f => (
            <FeatureRow
              key={f.id}
              feature={f}
              projectId={projectId}
              onStoryClick={onStoryClick}
              onUpdated={updated => setFeatures(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDeleted={id => setFeatures(prev => prev.filter(x => x.id !== id))}
            />
          ))}
          {showAddFeature ? (
            <div className="ml-6">
              <InlineForm
                placeholder="Feature title…"
                onSubmit={addFeature}
                onCancel={() => setShowAddFeature(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAddFeature(true)}
              className="text-xs text-slate-600 hover:text-purple-400 px-4 py-1"
            >
              + Add Feature
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── New Feature form (standalone, with epic selector) ─────────────────────────

function NewFeatureForm({
  projectId,
  epics,
  onCreated,
  onCancel,
}: {
  projectId: number
  epics: Epic[]
  onCreated: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [epicId, setEpicId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.features.create(projectId, {
        title: title.trim(),
        epic_id: epicId ? parseInt(epicId, 10) : null,
      })
      onCreated()
    } finally {
      setSaving(false) }
  }

  return (
    <div className="border border-slate-700 rounded-lg mb-2 overflow-hidden">
      <div className="bg-slate-800 px-4 py-3">
        <p className="text-xs text-slate-500 mb-2">New Feature</p>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Feature title…"
            className="flex-1 text-sm bg-slate-700 text-slate-100 border border-slate-600 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-slate-500"
            onKeyDown={e => e.key === 'Escape' && onCancel()}
          />
          <select
            value={epicId}
            onChange={e => setEpicId(e.target.value)}
            className="text-sm bg-slate-700 text-slate-300 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">Default Epic (auto)</option>
            {epics.filter(ep => !ep.is_default).map(ep => (
              <option key={ep.id} value={ep.id}>{ep.title}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300 px-1">
            Cancel
          </button>
        </form>
      </div>
    </div>
  )
}

// ── EpicsPage ─────────────────────────────────────────────────────────────────

export default function EpicsPage() {
  const { projectId: projectIdStr } = useParams<{ projectId: string }>()
  const projectId = parseInt(projectIdStr ?? '0', 10)

  const [epics, setEpics] = useState<Epic[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddEpic, setShowAddEpic] = useState(false)
  const [showAddFeature, setShowAddFeature] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  async function loadEpics() {
    if (!projectId) return
    const data = await api.epics.list(projectId)
    setEpics(data)
  }

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    loadEpics().catch(() => {}).finally(() => setLoading(false))
  }, [projectId])

  async function addEpic(title: string) {
    const epic = await api.epics.create(projectId, { title })
    setEpics(prev => [...prev, epic])
    setShowAddEpic(false)
  }

  function handleEpicDeleted(id: number) {
    setEpics(prev => prev.filter(e => e.id !== id))
  }

  function handleEpicUpdated(updated: Epic) {
    setEpics(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  async function handleFeatureCreated() {
    setShowAddFeature(false)
    await loadEpics()
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Epics</h1>
          <p className="text-xs text-slate-500 mt-0.5">Epic → Feature → Story → Task hierarchy</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFeature(true)}
            className="flex items-center gap-1.5 text-sm bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-600 border border-slate-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Feature
          </button>
          <button
            onClick={() => setShowAddEpic(true)}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Epic
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-slate-800 flex-shrink-0 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border-2 border-amber-400 bg-amber-900 inline-block" /> Epic
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border border-purple-400 bg-purple-900 inline-block" /> Feature
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-indigo-500 bg-indigo-900 inline-block" /> Story
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border border-emerald-500 bg-emerald-900 inline-block" /> Task
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-sm text-slate-500 animate-pulse">Loading epics…</p>
        ) : (
          <>
            {epics.length === 0 && !showAddEpic && !showAddFeature && (
              <div className="text-center py-16">
                <p className="text-slate-500 text-sm mb-3">No epics yet.</p>
                <button
                  onClick={() => setShowAddEpic(true)}
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Create your first epic
                </button>
              </div>
            )}

            {showAddFeature && (
              <NewFeatureForm
                projectId={projectId}
                epics={epics}
                onCreated={handleFeatureCreated}
                onCancel={() => setShowAddFeature(false)}
              />
            )}

            {epics.map(epic => (
              <EpicRow
                key={epic.id}
                epic={epic}
                projectId={projectId}
                onStoryClick={setSelectedCard}
                onDeleted={handleEpicDeleted}
                onUpdated={handleEpicUpdated}
              />
            ))}

            {showAddEpic ? (
              <div className="border border-slate-700 rounded-lg mb-2 overflow-hidden">
                <div className="bg-slate-800 px-4 py-1">
                  <InlineForm
                    placeholder="Epic title…"
                    onSubmit={addEpic}
                    onCancel={() => setShowAddEpic(false)}
                  />
                </div>
              </div>
            ) : (
              epics.length > 0 && (
                <button
                  onClick={() => setShowAddEpic(true)}
                  className="text-sm text-slate-600 hover:text-amber-400 py-2"
                >
                  + Add Epic
                </button>
              )
            )}
          </>
        )}
      </div>

      {/* Card modal */}
      {selectedCard && (
        <CardModal
          card={selectedCard}
          projectId={projectId}
          onClose={() => setSelectedCard(null)}
          onUpdate={updated => setSelectedCard(updated)}
          onDelete={() => setSelectedCard(null)}
        />
      )}
    </div>
  )
}
