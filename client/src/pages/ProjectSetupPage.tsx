import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../api/index'
import type { LanePreset } from '../types'

const PROJECT_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
]

const LANE_COLORS = [
  '#64748b',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#f97316',
  '#84cc16',
  '#14b8a6',
]

interface CustomLane {
  id: string
  name: string
  color: string
}

function makeLane(colorIdx: number, name = ''): CustomLane {
  return {
    id: crypto.randomUUID(),
    name,
    color: LANE_COLORS[colorIdx % LANE_COLORS.length],
  }
}

// ─── Sortable lane row ────────────────────────────────────────────────────────

function SortableLane({
  lane,
  isLast,
  canRemove,
  onChange,
  onRemove,
}: {
  lane: CustomLane
  isLast: boolean
  canRemove: boolean
  onChange: (id: string, name: string) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lane.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none flex-shrink-0 transition-colors"
        {...attributes}
        {...listeners}
        tabIndex={-1}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
        </svg>
      </button>

      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: lane.color }} />

      <input
        type="text"
        value={lane.name}
        onChange={(e) => onChange(lane.id, e.target.value)}
        placeholder="Lane name…"
        maxLength={200}
        className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
      />

      {isLast && (
        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
          ✓ Done
        </span>
      )}

      <button
        type="button"
        onClick={() => onRemove(lane.id)}
        tabIndex={-1}
        className={`flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors ${
          canRemove ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function LivePreview({
  projectName,
  projectColor,
  lanes,
}: {
  projectName: string
  projectColor: string
  lanes: { name: string; color: string }[]
}) {
  const hasLanes = lanes.length > 0

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-white">
      {/* Browser chrome */}
      <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-300" />
        </div>
        <div className="flex-1 bg-white rounded-md h-5 mx-2 flex items-center px-2">
          <span className="text-[10px] text-slate-400 truncate">slateflow.app/projects/1</span>
        </div>
      </div>

      {/* App header */}
      <div className="px-4 py-2.5 transition-colors" style={{ backgroundColor: projectColor }}>
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-sm truncate max-w-[160px]">
            {projectName || 'Your Project'}
          </span>
          <div className="flex gap-3 text-[10px] text-white/70">
            <span>Board</span>
            <span>Backlog</span>
            <span>Sprints</span>
          </div>
        </div>
      </div>

      {/* Board area */}
      <div className="bg-slate-50 p-3" style={{ minHeight: '180px' }}>
        {hasLanes ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {lanes.map((lane, i) => (
              <div key={i} className="flex-shrink-0 w-[88px]">
                <div
                  className="text-[9px] font-bold px-2 py-1 rounded-md text-white mb-2 truncate"
                  style={{ backgroundColor: lane.color }}
                >
                  {lane.name || '…'}
                </div>
                <div className="space-y-1">
                  {[...Array(Math.max(1, 4 - i))].map((_, j) => (
                    <div
                      key={j}
                      className="h-7 rounded-md bg-white border border-slate-200 shadow-sm"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-slate-400 text-xs text-center">
            Select a preset or build your own lanes above
          </div>
        )}
      </div>

      {/* Caption */}
      <div className="px-3 py-2 bg-white border-t border-slate-100 text-center">
        <span className="text-[11px] text-slate-400 font-medium">Your board will look like this →</span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectSetupPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')

  const [presets, setPresets] = useState<LanePreset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(true)
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null)
  const [useCustom, setUseCustom] = useState(false)
  const [customLanes, setCustomLanes] = useState<CustomLane[]>([
    makeLane(0, 'To Do'),
    makeLane(1, 'In Progress'),
    makeLane(2, 'Done'),
  ])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    api
      .lanePresets.list()
      .then((data) => {
        setPresets(data)
        if (data.length > 0) setSelectedPresetId(data[0].id)
      })
      .catch(() => {
        setUseCustom(true)
      })
      .finally(() => setPresetsLoading(false))
  }, [])

  const previewLanes: { name: string; color: string }[] = useCustom
    ? customLanes.map((l) => ({ name: l.name, color: l.color }))
    : (() => {
        const preset = presets.find((p) => p.id === selectedPresetId)
        return preset
          ? preset.lanes.map((n, i) => ({ name: n, color: LANE_COLORS[i % LANE_COLORS.length] }))
          : []
      })()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setCustomLanes((prev) => {
        const from = prev.findIndex((l) => l.id === active.id)
        const to = prev.findIndex((l) => l.id === over.id)
        return arrayMove(prev, from, to)
      })
    }
  }

  function addLane() {
    if (customLanes.length >= 12) return
    setCustomLanes((prev) => {
      const newLane = makeLane(prev.length - 1)
      return [...prev.slice(0, -1), newLane, prev[prev.length - 1]]
    })
  }

  function removeLane(id: string) {
    if (customLanes.length <= 2) return
    setCustomLanes((prev) => prev.filter((l) => l.id !== id))
  }

  function changeLaneName(id: string, value: string) {
    setCustomLanes((prev) => prev.map((l) => (l.id === id ? { ...l, name: value } : l)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    if (!useCustom && selectedPresetId === null) {
      setError('Please select a lane preset or build your own.')
      return
    }

    if (useCustom && customLanes.some((l) => !l.name.trim())) {
      setError('All lanes must have a name.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload: Parameters<typeof api.projects.create>[0] = {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      }

      if (useCustom) {
        payload.custom_lanes = customLanes.map((l) => l.name.trim())
      } else {
        payload.preset_id = selectedPresetId!
      }

      const project = await api.projects.create(payload)
      navigate(`/projects/${project.id}/board`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.')
    } finally {
      setSubmitting(false)
    }
  }

  const isCustomColor = !PROJECT_COLORS.includes(color)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm px-6 py-3.5 flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ backgroundColor: color }}
        >
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2"
            />
          </svg>
        </div>
        <span className="font-semibold text-slate-800">SlateFlow</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500 text-sm">New Project</span>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Set up your project</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Configure your board lanes and get started in seconds.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
            {/* ── Left: Form ─────────────────────────────────── */}
            <div className="space-y-5">
              {/* Project Details */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Project Details
                </h2>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Project Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Mobile Redesign"
                    maxLength={200}
                    required
                    autoFocus
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition text-sm"
                    style={{ ['--tw-ring-color' as string]: color }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Description
                    <span className="text-slate-400 font-normal ml-1.5">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this project about?"
                    rows={3}
                    maxLength={2000}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition text-sm resize-none"
                  />
                </div>

                {/* Color picker */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Project Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className="w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: c }}
                        title={c}
                      >
                        {color === c && (
                          <svg
                            className="w-4 h-4 text-white drop-shadow"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    ))}

                    {/* Custom color swatch */}
                    <label
                      className={`relative w-8 h-8 rounded-full flex-shrink-0 cursor-pointer flex items-center justify-center transition-transform hover:scale-110 overflow-hidden ${
                        isCustomColor
                          ? 'ring-2 ring-offset-1 ring-slate-400'
                          : 'border-2 border-dashed border-slate-300 hover:border-slate-400'
                      }`}
                      style={isCustomColor ? { backgroundColor: color } : {}}
                      title="Custom color"
                    >
                      {!isCustomColor && (
                        <svg
                          className="w-3.5 h-3.5 text-slate-400 pointer-events-none"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Swim Lane Config */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Swim Lane Setup
                </h2>

                {/* Preset cards */}
                {presetsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : presets.length > 0 ? (
                  <div
                    className={`grid gap-3 ${
                      presets.length <= 2
                        ? 'grid-cols-2'
                        : presets.length === 3
                          ? 'grid-cols-3'
                          : 'grid-cols-2 sm:grid-cols-4'
                    }`}
                  >
                    {presets.map((preset) => {
                      const isSelected = !useCustom && selectedPresetId === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPresetId(preset.id)
                            setUseCustom(false)
                          }}
                          className={`text-left rounded-xl border-2 p-3 transition-all hover:shadow-sm ${
                            isSelected
                              ? 'bg-white shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                          style={
                            isSelected
                              ? { borderColor: color, boxShadow: `0 0 0 3px ${color}1a` }
                              : {}
                          }
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-800 leading-tight">
                              {preset.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">
                              {preset.lanes.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {preset.lanes.slice(0, 5).map((lane, i) => (
                              <span
                                key={i}
                                className="inline-block text-[9px] font-semibold text-white px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: LANE_COLORS[i % LANE_COLORS.length] }}
                              >
                                {lane}
                              </span>
                            ))}
                            {preset.lanes.length > 5 && (
                              <span className="text-[9px] text-slate-400 self-center">
                                +{preset.lanes.length - 5}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {/* Custom toggle */}
                <div className="border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !useCustom
                      setUseCustom(next)
                      if (next) setSelectedPresetId(null)
                      else if (presets.length > 0) setSelectedPresetId(presets[0].id)
                    }}
                    className="flex items-center gap-2.5 text-sm font-medium transition-colors"
                    style={{ color: useCustom ? color : '#64748b' }}
                  >
                    {/* Toggle pill */}
                    <span
                      className="relative inline-flex items-center flex-shrink-0 rounded-full transition-colors"
                      style={{
                        width: '32px',
                        height: '18px',
                        backgroundColor: useCustom ? color : '#cbd5e1',
                      }}
                    >
                      <span
                        className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform"
                        style={{ transform: useCustom ? 'translateX(14px)' : 'translateX(2px)' }}
                      />
                    </span>
                    Or build your own
                  </button>
                </div>

                {/* Custom builder */}
                {useCustom && (
                  <div className="space-y-2">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={customLanes.map((l) => l.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {customLanes.map((lane, idx) => (
                          <SortableLane
                            key={lane.id}
                            lane={lane}
                            isLast={idx === customLanes.length - 1}
                            canRemove={customLanes.length > 2}
                            onChange={changeLaneName}
                            onRemove={removeLane}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>

                    <button
                      type="button"
                      onClick={addLane}
                      disabled={customLanes.length >= 12}
                      className="flex items-center gap-1.5 text-sm font-medium mt-1 transition-colors disabled:text-slate-400 disabled:cursor-not-allowed"
                      style={{ color: customLanes.length < 12 ? color : undefined }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Lane
                      {customLanes.length >= 12 && (
                        <span className="text-xs text-slate-400">(max 12)</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99]"
                style={{ backgroundColor: color }}
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Creating…
                  </>
                ) : (
                  'Create Project →'
                )}
              </button>
            </div>

            {/* ── Right: Live Preview ─────────────────────────── */}
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 lg:text-right">
                Live Preview
              </p>
              <LivePreview
                projectName={name}
                projectColor={color}
                lanes={previewLanes}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
