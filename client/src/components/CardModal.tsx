import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActivityLog, Card, Comment, Label } from '../types'
import { api } from '../api'

interface Props {
  card: Card
  projectId: number
  onClose: () => void
  onUpdate: (updated: Card) => void
  onDelete: (id: number) => void
}

const PRIORITIES: Card['priority'][] = ['p0', 'p1', 'p2', 'p3']
const PRIORITY_LABELS: Record<string, string> = {
  p0: 'P0 — Critical',
  p1: 'P1 — High',
  p2: 'P2 — Medium',
  p3: 'P3 — Low',
}

const LABEL_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
  '#64748b', '#1e293b',
]

function fmtDate(iso: string) {
  const d = new Date(iso.includes('Z') ? iso : iso + 'Z')
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function activityText(action: string, meta: string): string {
  try {
    const m = JSON.parse(meta)
    if (action === 'create') return 'Card created'
    if (action === 'move') return 'Card moved between columns'
    if (action === 'comment') return `${m.author ?? 'Someone'} added a comment`
    if (action === 'update') {
      const fields = Object.keys(m).map(k => k.replace(/_/g, ' ')).join(', ')
      return `Updated ${fields}`
    }
    return action
  } catch {
    return action
  }
}

// Minimal Markdown → HTML renderer (no external deps)
function renderMarkdown(md: string): string {
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = esc.split('\n')
  const out: string[] = []
  let inList = false

  function inline(s: string) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono">$1</code>')
  }

  for (const raw of lines) {
    if (raw.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h3 class="text-sm font-semibold mt-3 mb-0.5">${inline(raw.slice(4))}</h3>`)
    } else if (raw.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h2 class="text-base font-semibold mt-3 mb-1">${inline(raw.slice(3))}</h2>`)
    } else if (raw.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h1 class="text-lg font-bold mt-4 mb-1">${inline(raw.slice(2))}</h1>`)
    } else if (/^[-*] /.test(raw)) {
      if (!inList) { out.push('<ul class="list-disc pl-5 my-1 space-y-0.5">'); inList = true }
      out.push(`<li class="text-sm">${inline(raw.slice(2))}</li>`)
    } else if (raw === '') {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('<div class="h-2"></div>')
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p class="text-sm mb-1">${inline(raw)}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

export default function CardModal({ card, projectId, onClose, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState(card.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [description, setDescription] = useState(card.description)
  const [descPreview, setDescPreview] = useState(false)
  const [priority, setPriority] = useState(card.priority)
  const [storyPoints, setStoryPoints] = useState(card.story_points?.toString() ?? '')
  const [assignee, setAssignee] = useState(card.assignee ?? '')

  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [cardLabels, setCardLabels] = useState<Label[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_PALETTE[5])
  const [creatingLabel, setCreatingLabel] = useState(false)

  const [comments, setComments] = useState<Comment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentAuthor, setCommentAuthor] = useState(() => localStorage.getItem('lb-author') ?? '')
  const [submittingComment, setSubmittingComment] = useState(false)

  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)
  const labelPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getComments(card.id).then(setComments).catch(() => {})
    api.getActivityLog(card.id).then(setActivity).catch(() => {})
    api.getLabels(projectId).then(setAllLabels).catch(() => {})
    api.getCardLabels(card.id).then(setCardLabels).catch(() => {})
  }, [card.id, projectId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLabelPicker) { setShowLabelPicker(false); return }
        if (confirmDelete) { setConfirmDelete(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, showLabelPicker, confirmDelete])

  useEffect(() => {
    if (!showLabelPicker) return
    const handler = (e: MouseEvent) => {
      if (!labelPickerRef.current?.contains(e.target as Node)) setShowLabelPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLabelPicker])

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus()
  }, [editingTitle])

  async function saveField(
    updates: Partial<Pick<Card, 'title' | 'description' | 'priority' | 'story_points' | 'assignee'>>,
  ) {
    try {
      const updated = await api.updateCard(card.id, updates)
      onUpdate(updated)
    } catch {
      // silently fail — optimistic value already displayed
    }
  }

  function handleTitleSave() {
    setEditingTitle(false)
    const t = title.trim() || card.title
    setTitle(t)
    saveField({ title: t })
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleTitleSave()
    if (e.key === 'Escape') { setTitle(card.title); setEditingTitle(false) }
  }

  function handlePriority(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = e.target.value as Card['priority']
    setPriority(p)
    saveField({ priority: p })
  }

  async function toggleLabel(label: Label) {
    const has = cardLabels.some(l => l.id === label.id)
    if (has) {
      setCardLabels(prev => prev.filter(l => l.id !== label.id))
      await api.removeCardLabel(card.id, label.id).catch(() => {
        setCardLabels(prev => [...prev, label])
      })
    } else {
      setCardLabels(prev => [...prev, label])
      await api.addCardLabel(card.id, label.id).catch(() => {
        setCardLabels(prev => prev.filter(l => l.id !== label.id))
      })
    }
  }

  async function handleCreateLabel() {
    if (!newLabelName.trim() || creatingLabel) return
    setCreatingLabel(true)
    try {
      const label = await api.createLabel(projectId, { name: newLabelName.trim(), color: newLabelColor })
      setAllLabels(prev => [...prev, label])
      setNewLabelName('')
      setCardLabels(prev => [...prev, label])
      await api.addCardLabel(card.id, label.id).catch(() => {
        setCardLabels(prev => prev.filter(l => l.id !== label.id))
      })
    } finally {
      setCreatingLabel(false)
    }
  }

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = commentBody.trim()
    const author = commentAuthor.trim() || 'anonymous'
    if (!body) return
    setSubmittingComment(true)
    try {
      localStorage.setItem('lb-author', author)
      const comment = await api.createComment(card.id, { author, body })
      setComments(prev => [...prev, comment])
      setCommentBody('')
      api.getActivityLog(card.id).then(setActivity).catch(() => {})
    } finally {
      setSubmittingComment(false)
    }
  }

  async function handleDelete() {
    await api.deleteCard(card.id).catch(() => {})
    onDelete(card.id)
    onClose()
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-start justify-center p-4 sm:p-10 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="flex-1 text-lg font-semibold text-slate-900 border-0 p-0 focus:outline-none bg-transparent min-w-0"
            />
          ) : (
            <h2
              className="flex-1 text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 min-w-0 transition-colors"
              onClick={() => setEditingTitle(true)}
            >
              {title}
            </h2>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-0.5 transition-colors flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-3 gap-x-6 gap-y-5">
          {/* Left column */}
          <div className="col-span-2 space-y-5">

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                  Description
                </label>
                <button
                  onClick={() => setDescPreview(p => !p)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  {descPreview ? 'Edit' : 'Preview'}
                </button>
              </div>
              {descPreview ? (
                <div
                  className="min-h-[7.5rem] rounded-lg border border-slate-200 px-3 py-2.5 text-slate-800"
                  dangerouslySetInnerHTML={{
                    __html: description
                      ? renderMarkdown(description)
                      : '<p class="text-sm text-slate-400">No description.</p>',
                  }}
                />
              ) : (
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  onBlur={() => saveField({ description })}
                  rows={5}
                  placeholder="Add a description… (Markdown supported)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              )}
            </div>

            {/* Labels */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Labels
              </label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {cardLabels.map(l => (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l)}
                    title="Click to remove"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-xs font-medium transition-opacity hover:opacity-75"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                    <span className="text-white/70 text-[10px] leading-none">×</span>
                  </button>
                ))}

                <div ref={labelPickerRef} className="relative">
                  <button
                    onClick={() => setShowLabelPicker(p => !p)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                  >
                    + Add label
                  </button>

                  {showLabelPicker && (
                    <div className="absolute left-0 top-8 z-10 bg-white border border-slate-200 rounded-xl shadow-lg w-56 p-3 space-y-3">
                      {allLabels.length > 0 && (
                        <div className="space-y-0.5 max-h-36 overflow-y-auto">
                          {allLabels.map(l => {
                            const active = cardLabels.some(cl => cl.id === l.id)
                            return (
                              <button
                                key={l.id}
                                onClick={() => toggleLabel(l)}
                                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors text-left"
                              >
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: l.color }}
                                />
                                <span className="flex-1 text-xs text-slate-700">{l.name}</span>
                                {active && <span className="text-indigo-500 text-xs">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      <div className={allLabels.length > 0 ? 'border-t border-slate-100 pt-2 space-y-1.5' : 'space-y-1.5'}>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">New label</p>
                        <input
                          value={newLabelName}
                          onChange={e => setNewLabelName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateLabel() }}
                          placeholder="Label name…"
                          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex gap-1 flex-wrap">
                          {LABEL_PALETTE.map(c => (
                            <button
                              key={c}
                              onClick={() => setNewLabelColor(c)}
                              className={`w-5 h-5 rounded-full transition-transform ${newLabelColor === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <button
                          onClick={handleCreateLabel}
                          disabled={creatingLabel || !newLabelName.trim()}
                          className="w-full text-xs bg-indigo-600 text-white rounded-md py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Create &amp; add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Comments
              </label>

              {comments.length === 0 ? (
                <p className="text-sm text-slate-400 mb-3">No comments yet.</p>
              ) : (
                <ul className="space-y-3 mb-4 max-h-52 overflow-y-auto pr-1">
                  {comments.map(c => (
                    <li key={c.id} className="flex gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {c.author[0].toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-slate-700">{c.author}</span>
                          <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleCommentSubmit} className="space-y-2">
                <input
                  value={commentAuthor}
                  onChange={e => setCommentAuthor(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <textarea
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !commentBody.trim()}
                  className="bg-indigo-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Post comment
                </button>
              </form>
            </div>

            {/* Activity log */}
            {activity.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                  Activity
                </label>
                <ul className="space-y-2 max-h-44 overflow-y-auto">
                  {activity.map(a => (
                    <li key={a.id} className="flex items-start gap-2 text-xs text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                      <span className="flex-1">{activityText(a.action, a.meta)}</span>
                      <span className="text-slate-400 flex-shrink-0 tabular-nums">{fmtDate(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right column: metadata */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={handlePriority}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                Story Points
              </label>
              <input
                type="number"
                min={1}
                max={13}
                value={storyPoints}
                onChange={e => setStoryPoints(e.target.value)}
                onBlur={() => saveField({ story_points: storyPoints !== '' ? Number(storyPoints) : null })}
                placeholder="—"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                Assignee
              </label>
              <input
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                onBlur={() => saveField({ assignee: assignee.trim() || null })}
                placeholder="Unassigned"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Created{' '}
                {new Date(card.created_at.includes('Z') ? card.created_at : card.created_at + 'Z').toLocaleDateString(
                  undefined,
                  { month: 'short', day: 'numeric', year: 'numeric' },
                )}
              </p>
            </div>

            {/* Delete */}
            <div className="pt-1 border-t border-slate-100">
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 font-medium">Delete this card permanently?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="flex-1 text-xs bg-red-600 text-white rounded-lg py-1.5 font-medium hover:bg-red-700 transition-colors"
                    >
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-xs text-red-500 border border-red-200 rounded-lg py-1.5 font-medium hover:bg-red-50 transition-colors"
                >
                  Delete card
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
