import { useEffect, useState } from 'react'
import type { Card, Task } from '../../types'
import { api } from '../../api/index'
import { useBoardStore } from '../../store/boardStore'
import { renderMarkdown } from '../../utils/cardModal'
import { FeatureGate } from '../ui/FeatureGate'
import AcceptanceCriteriaGenerator from './AcceptanceCriteriaGenerator'

interface Props {
  card: Card
  onUpdate: (updated: Card) => void
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none'

export default function CardDescriptionTab({ card, onUpdate }: Props) {
  const setTaskSummary = useBoardStore(s => s.setTaskSummary)

  const [description, setDescription] = useState(card.description ?? '')
  const [descPreview, setDescPreview] = useState(false)

  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [savingTask, setSavingTask] = useState(false)

  useEffect(() => {
    setDescription(card.description ?? '')
  }, [card.id, card.description])

  useEffect(() => {
    api.cards.listTasks(card.id).then(ts => {
      setTasks(ts)
      syncTaskSummary(ts)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  function syncTaskSummary(ts: Task[]) {
    setTaskSummary(card.id, { total: ts.length, done: ts.filter(t => t.status === 'done').length })
  }

  async function handleDescriptionSave() {
    if (description === (card.description ?? '')) return
    try {
      const updated = await api.cards.update(card.id, { description })
      onUpdate(updated)
    } catch {
      // axios interceptor already toasts API errors
    }
  }

  async function handleAppendToDescription(markdownBlock: string) {
    const updated = await api.cards.update(card.id, { description: (card.description ?? '') + markdownBlock })
    onUpdate(updated)
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim() || savingTask) return
    setSavingTask(true)
    try {
      const task = await api.cards.createTask(card.id, { title: newTaskTitle.trim() })
      const next = [...tasks, task]
      setTasks(next)
      syncTaskSummary(next)
      setNewTaskTitle('')
      setAddingTask(false)
    } finally {
      setSavingTask(false)
    }
  }

  async function handleToggleTask(task: Task) {
    const nextStatus: Task['status'] = task.status === 'done' ? 'to-do' : 'done'
    const next = tasks.map(t => t.id === task.id ? { ...t, status: nextStatus } : t)
    setTasks(next)
    syncTaskSummary(next)
    try {
      await api.cards.updateTask(task.id, { status: nextStatus })
    } catch {
      const reverted = tasks.map(t => t.id === task.id ? task : t)
      setTasks(reverted)
      syncTaskSummary(reverted)
    }
  }

  async function handleDeleteTask(taskId: number) {
    const next = tasks.filter(t => t.id !== taskId)
    setTasks(next)
    syncTaskSummary(next)
    await api.cards.deleteTask(taskId).catch(() => {})
  }

  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-5">
      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Description</label>
          <button onClick={() => setDescPreview(p => !p)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
            {descPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {descPreview ? (
          <div
            className="min-h-[7.5rem] rounded-lg border border-slate-200 px-3 py-2.5 text-slate-800"
            dangerouslySetInnerHTML={{ __html: description ? renderMarkdown(description) : '<p class="text-sm text-slate-400">No description.</p>' }}
          />
        ) : (
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={handleDescriptionSave}
            rows={5}
            placeholder="Add a description… (Markdown supported)"
            className={inputCls}
          />
        )}
      </div>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Tasks
            {tasks.length > 0 && (
              <span className="ml-1.5 text-slate-500 normal-case font-normal">{doneCount}/{tasks.length}</span>
            )}
          </label>
          {!addingTask && (
            <button onClick={() => setAddingTask(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">+ Add task</button>
          )}
        </div>

        {tasks.length > 0 && (
          <div className="mb-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round((doneCount / tasks.length) * 100)}%` }}
            />
          </div>
        )}

        <ul className="space-y-1">
          {tasks.map(task => (
            <li key={task.id} className="flex items-center gap-2 group py-0.5">
              <button
                onClick={() => handleToggleTask(task)}
                className={`w-4 h-4 rounded flex-shrink-0 border transition-colors flex items-center justify-center ${task.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-400'}`}
              >
                {task.status === 'done' && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 10 8" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-5" />
                  </svg>
                )}
              </button>
              <span className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                {task.title}
              </span>
              <button
                onClick={() => handleDeleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        {addingTask && (
          <form onSubmit={handleAddTask} className="flex items-center gap-2 mt-1.5">
            <input
              autoFocus
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              placeholder="Task title…"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              onKeyDown={e => e.key === 'Escape' && setAddingTask(false)}
            />
            <button type="submit" disabled={!newTaskTitle.trim() || savingTask} className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-500 disabled:opacity-40">
              {savingTask ? '…' : 'Add'}
            </button>
            <button type="button" onClick={() => setAddingTask(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
          </form>
        )}
      </div>

      <FeatureGate flag="ai">
        <FeatureGate flag="ai_writing_assist">
          <AcceptanceCriteriaGenerator cardId={card.id} onAppend={handleAppendToDescription} />
        </FeatureGate>
      </FeatureGate>
    </div>
  )
}
