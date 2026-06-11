import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import type { Card, Feature, Label, Lane, Sprint } from '../types'
import { api } from '../api/index'
import { LABEL_PALETTE, PRIORITIES, PRIORITY_LABELS } from '../utils/cardModal'
import { useFeatureFlagStore } from '../store/featureFlagStore'
import { FeatureGate } from './ui/FeatureGate'
import SuggestAssigneePopover from './CardModal/SuggestAssigneePopover'
import SuggestEstimatePopover from './CardModal/SuggestEstimatePopover'
// Tab components — each manages its own data fetching and state
import CardDescriptionTab from './CardModal/CardDescriptionTab'
import CardCommentsTab from './CardModal/CardCommentsTab'
import CardActivityTab from './CardModal/CardActivityTab'
import CardTestsTab from './CardModal/CardTestsTab'
import CardDependenciesTab from './CardModal/CardDependenciesTab'
import CardIntegrationsTab from './CardModal/CardIntegrationsTab'
import CardAttachmentsTab from './CardModal/CardAttachmentsTab'

interface Props {
  card: Card
  projectId: number
  lanes?: Lane[]
  sprints?: Sprint[]
  onClose: () => void
  onUpdate: (updated: Card) => void
  onDelete: (id: number) => void
}

type Tab = 'description' | 'comments' | 'activity' | 'tests' | 'dependencies' | 'integrations' | 'attachments'

const TAB_LABELS: Record<Tab, string> = {
  description: 'Description',
  comments: 'Comments',
  activity: 'Activity',
  tests: 'Tests',
  dependencies: 'Dependencies',
  integrations: 'Integrations',
  attachments: 'Attachments',
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function CardModal({ card, projectId, lanes, sprints, onClose, onUpdate, onDelete }: Props) {
  const { isEnabled } = useFeatureFlagStore()
  const [activeTab, setActiveTab] = useState<Tab>('description')
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [priority, setPriority] = useState(card.priority)
  const [storyPoints, setStoryPoints] = useState(card.story_points?.toString() ?? '')
  const [assignee, setAssignee] = useState(card.assignee ?? '')
  const [currentLaneId, setCurrentLaneId] = useState<number | null>(card.swim_lane_id ?? null)
  const [currentSprintId, setCurrentSprintId] = useState<number | null>(card.sprint_id ?? null)
  const [currentFeatureId, setCurrentFeatureId] = useState<number | null>(card.feature_id ?? null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [cardLabels, setCardLabels] = useState<Label[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_PALETTE[5])
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [movingLane, setMovingLane] = useState(false)
  const labelPickerRef = useRef<HTMLDivElement>(null)

  const visibleTabs = (Object.keys(TAB_LABELS) as Tab[]).filter(tab => {
    if (tab === 'integrations') return isEnabled('github_integration')
    if (tab === 'attachments') return isEnabled('card_attachments')
    return true
  })

  // Load initial data
  useEffect(() => {
    Promise.all([
      api.labels.getCardLabels(card.id).then(setCardLabels).catch(() => {}),
      api.labels.list(projectId).then(setAllLabels).catch(() => {}),
      api.features.list(projectId).then(setFeatures).catch(() => {}),
    ])
  }, [card.id, projectId])

  // Close label picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!labelPickerRef.current?.contains(e.target as Node)) setShowLabelPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function saveField(fields: Partial<Card>) {
    try {
      const updated = await api.cards.update(card.id, fields as any)
      onUpdate(updated)
    } catch (e) {
      toast.error('Failed to save')
    }
  }

  async function handleTitleSave() {
    if (title.trim() === card.title) {
      setEditingTitle(false)
      return
    }
    await saveField({ title: title.trim() })
    setEditingTitle(false)
  }

  async function handleCreateLabel() {
    if (!newLabelName.trim() || creatingLabel) return
    setCreatingLabel(true)
    try {
      const label = await api.labels.create(projectId, { name: newLabelName.trim(), color: newLabelColor })
      setAllLabels(prev => [...prev, label])
      setCardLabels(prev => [...prev, label])
      setNewLabelName('')
      setNewLabelColor(LABEL_PALETTE[5])
      setShowLabelPicker(false)
    } finally {
      setCreatingLabel(false)
    }
  }

  function toggleLabel(label: Label) {
    const isActive = cardLabels.some(l => l.id === label.id)
    if (isActive) {
      api.labels.removeCardLabel(card.id, label.id).then(() => {
        setCardLabels(prev => prev.filter(l => l.id !== label.id))
      }).catch(() => {})
    } else {
      api.labels.addCardLabel(card.id, label.id).then(() => {
        setCardLabels(prev => [...prev, label])
      }).catch(() => {})
    }
  }

  async function handleSprintChange(sprintId: number | null) {
    setCurrentSprintId(sprintId)
    await saveField({ sprint_id: sprintId })
  }

  async function handleFeatureChange(featureId: number | null) {
    setCurrentFeatureId(featureId)
    await saveField({ feature_id: featureId })
  }

  async function handleMoveLane(laneId: number) {
    setMovingLane(true)
    try {
      const updated = await api.cards.move(card.id, { lane_id: laneId, position: 0 })
      setCurrentLaneId(updated.swim_lane_id)
      onUpdate(updated)
    } finally {
      setMovingLane(false)
    }
  }

  function handleDelete() {
    api.cards.delete(card.id).then(() => onDelete(card.id)).catch(() => {})
  }

  const modal = (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header with title and close */}
        <div className="flex items-center justify-between flex-shrink-0 border-b border-slate-200 px-6 py-4">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => { if (e.key === 'Enter') handleTitleSave() }}
                className={inputCls}
              />
            ) : (
              <h2 onClick={() => setEditingTitle(true)} className="text-lg font-semibold text-slate-900 truncate cursor-pointer hover:text-indigo-600 transition-colors">
                {title}
              </h2>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none flex-shrink-0 ml-4">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 px-6 overflow-x-auto flex-shrink-0 bg-slate-50">
          {visibleTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-y-auto flex gap-6 p-6">
          {/* Left: Tab content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'description' && <CardDescriptionTab card={card} onUpdate={onUpdate} />}
            {activeTab === 'comments' && <CardCommentsTab card={card} />}
            {activeTab === 'activity' && <CardActivityTab card={card} />}
            {activeTab === 'tests' && <CardTestsTab card={card} projectId={projectId} />}
            {activeTab === 'dependencies' && <CardDependenciesTab card={card} projectId={projectId} />}
            {activeTab === 'integrations' && <CardIntegrationsTab card={card} projectId={projectId} />}
            {activeTab === 'attachments' && <CardAttachmentsTab card={card} />}
          </div>

          {/* Right: Metadata sidebar */}
          <div className="w-56 space-y-4 flex-shrink-0">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={e => {
                  const p = e.target.value as Card['priority']
                  setPriority(p)
                  saveField({ priority: p })
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Story Points</label>
                <FeatureGate flag="ai">
                  <FeatureGate flag="ai_planning_assist">
                    <SuggestEstimatePopover
                      cardId={card.id}
                      onApply={points => {
                        setStoryPoints(String(points))
                        saveField({ story_points: points })
                      }}
                    />
                  </FeatureGate>
                </FeatureGate>
              </div>
              <input
                type="number"
                min={1}
                max={13}
                value={storyPoints}
                onChange={e => setStoryPoints(e.target.value)}
                onBlur={() => saveField({ story_points: storyPoints !== '' ? Number(storyPoints) : null })}
                placeholder="—"
                className={inputCls}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Assignee</label>
                <FeatureGate flag="ai">
                  <FeatureGate flag="ai_planning_assist">
                    <SuggestAssigneePopover
                      cardId={card.id}
                      onApply={s => {
                        setAssignee(s.assignee)
                        saveField({ assignee: s.assignee })
                      }}
                    />
                  </FeatureGate>
                </FeatureGate>
              </div>
              <input
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                onBlur={() => saveField({ assignee: assignee.trim() || null })}
                placeholder="Unassigned"
                className={inputCls}
              />
            </div>

            {/* Labels */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Labels</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {cardLabels.map(l => (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l)}
                    title="Click to remove"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-xs font-medium transition-opacity hover:opacity-75"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}<span className="text-white/70 text-[10px] leading-none">×</span>
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
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
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
                              className={`w-5 h-5 rounded-full transition-transform ${
                                newLabelColor === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'
                              }`}
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

            {lanes && lanes.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Lane</label>
                <select
                  value={currentLaneId ?? ''}
                  onChange={e => handleMoveLane(Number(e.target.value))}
                  disabled={movingLane}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-60"
                >
                  {!currentLaneId && <option value="">— unassigned —</option>}
                  {lanes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}

            {sprints && sprints.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Sprint</label>
                <select
                  value={currentSprintId ?? ''}
                  onChange={e => handleSprintChange(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">— No sprint —</option>
                  {sprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' ●' : ''}</option>)}
                </select>
              </div>
            )}

            {features.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Feature</label>
                <select
                  value={currentFeatureId ?? ''}
                  onChange={e => handleFeatureChange(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">— No feature —</option>
                  {features.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Created{' '}
                {new Date(card.created_at.includes('Z') ? card.created_at : card.created_at + 'Z').toLocaleDateString(
                  undefined,
                  { month: 'short', day: 'numeric', year: 'numeric' }
                )}
              </p>
            </div>

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
