import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/index'
import { useAuthStore } from '../store/authStore'
import { COUNTRIES } from '../constants/countries'
import type { CalendarEvent, CalendarHoliday, CalendarRange, CalendarVacation, Project, Sprint } from '../types'
import Header from '../components/Header'
import MonthGrid from '../components/Calendar/MonthGrid'
import EntryFormModal, { type EntryEditing } from '../components/Calendar/EntryFormModal'
import { FeatureGate } from '../components/FeatureGate'
import { NLItemInput } from '../components/NLItemInput'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function rangeForMonth(year: number, monthIndex: number): { from: string; to: string } {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const startOffset = firstOfMonth.getDay()
  const start = new Date(year, monthIndex, 1 - startOffset)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41)
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    to:   `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const canWrite = useAuthStore(s => s.canWriteProject(pid))

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState(today.getMonth())
  const [project, setProject] = useState<Project | null>(null)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [data, setData] = useState<CalendarRange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCountry, setFilterCountry] = useState(user?.country ?? '')

  const [modalState, setModalState] = useState<
    | { mode: 'closed' }
    | { mode: 'create'; date?: string }
    | { mode: 'edit'; entry: EntryEditing }
  >({ mode: 'closed' })

  // Project + sprints metadata
  useEffect(() => {
    api.projects.get(pid).then(setProject).catch(() => {})
    api.sprints.list(pid).then(setSprints).catch(() => setSprints([]))
  }, [pid])

  const refetch = useCallback(() => {
    const range = rangeForMonth(year, monthIndex)
    setLoading(true)
    api.calendar.get(pid, range.from, range.to)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load calendar'))
      .finally(() => setLoading(false))
  }, [pid, year, monthIndex])

  useEffect(() => { refetch() }, [refetch])

  // SSE — refetch on calendar:entry:* events
  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true })
    const handler = () => refetch()
    es.addEventListener('calendar:entry:created', handler)
    es.addEventListener('calendar:entry:updated', handler)
    es.addEventListener('calendar:entry:deleted', handler)
    return () => es.close()
  }, [refetch])

  function gotoPrev() {
    if (monthIndex === 0) { setYear(y => y - 1); setMonthIndex(11) }
    else setMonthIndex(monthIndex - 1)
  }
  function gotoNext() {
    if (monthIndex === 11) { setYear(y => y + 1); setMonthIndex(0) }
    else setMonthIndex(monthIndex + 1)
  }
  function gotoToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonthIndex(t.getMonth())
  }

  const editingEvent = useCallback((id: number) => {
    if (!data) return
    const e = data.events.find(x => x.id === id) as CalendarEvent | undefined
    if (!e) return
    setModalState({
      mode: 'edit',
      entry: {
        id: e.id, kind: 'event', title: e.title, description: e.description,
        start_date: e.start_date, end_date: e.end_date, color: e.color,
        project_id: e.project_id,
      },
    })
  }, [data])

  const editingVacation = useCallback((id: number) => {
    if (!data) return
    const v = data.vacations.find(x => x.id === id) as CalendarVacation | undefined
    if (!v) return
    setModalState({
      mode: 'edit',
      entry: {
        id: v.id, kind: 'vacation', title: v.title, description: v.description,
        start_date: v.start_date, end_date: v.end_date, color: v.color,
        user_id: v.user_id,
      },
    })
  }, [data])

  const editingHoliday = useCallback((id: number) => {
    if (!data) return
    const h = data.holidays.find(x => x.id === id) as CalendarHoliday | undefined
    if (!h) return
    setModalState({
      mode: 'edit',
      entry: {
        id: h.id, kind: 'holiday', title: h.title, description: h.description,
        start_date: h.start_date, end_date: h.end_date, color: h.color,
      },
    })
  }, [data])

  const headerLabel = useMemo(() => `${MONTH_NAMES[monthIndex]} ${year}`, [monthIndex, year])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-100">
      {project ? (
        <Header project={project} sprints={sprints} selectedSprintId={null} onSprintChange={() => {}} />
      ) : (
        <div className="h-14 bg-slate-900 flex-shrink-0" />
      )}

      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-3">
        <span className="font-semibold text-slate-800 text-sm">Calendar</span>
        <span className="text-slate-300 select-none">·</span>
        <span className="text-sm text-slate-700">{headerLabel}</span>
        <select
          value={filterCountry}
          onChange={e => setFilterCountry(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white text-slate-800 text-sm px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All countries</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={gotoPrev}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors font-medium"
          >
            ←
          </button>
          <button
            onClick={gotoToday}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={gotoNext}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors font-medium"
          >
            →
          </button>
          {canWrite && (
            <>
              <FeatureGate flag="ai">
                <NLItemInput
                  allowedTypes={['calendar']}
                  context={{ projectId: pid }}
                  onCreated={refetch}
                />
              </FeatureGate>
              <button
                onClick={() => setModalState({ mode: 'create' })}
                className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                + New entry
              </button>
            </>
          )}
        </div>
      </div>

      <main className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {loading && !data ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <MonthGrid
            year={year}
            monthIndex={monthIndex}
            data={data ? {
              ...data,
              holidays: data.holidays.filter(h => !filterCountry || h.country === filterCountry || h.country === null),
            } : data}
            onAddDay={canWrite ? (d) => setModalState({ mode: 'create', date: d }) : undefined}
            onSprintClick={() => navigate(`/projects/${pid}/sprints`)}
            onEpicClick={() => navigate(`/projects/${pid}/epics`)}
            onFeatureClick={() => navigate(`/projects/${pid}/roadmap`)}
            onHolidayClick={editingHoliday}
            onEventClick={editingEvent}
            onVacationClick={editingVacation}
          />
        )}
      </main>

      {/* Legend */}
      <div className="flex-shrink-0 px-6 py-2 border-t border-slate-200 bg-white flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <Legend color="#2563eb" label="Sprint" />
        <Legend color="#7c3aed" label="Epic" />
        <Legend color="#10b981" label="Feature" />
        <Legend color="#dc2626" label="Holiday" />
        <Legend color="#d97706" label="Event" />
        <Legend color="#0d9488" label="Vacation" />
      </div>

      {modalState.mode === 'create' && (
        <EntryFormModal
          projectId={pid}
          initialDate={modalState.date}
          onClose={() => setModalState({ mode: 'closed' })}
          onSaved={refetch}
        />
      )}
      {modalState.mode === 'edit' && (
        <EntryFormModal
          projectId={pid}
          editing={modalState.entry}
          canDelete={canCallerEditEntry(modalState.entry, canWrite)}
          onClose={() => setModalState({ mode: 'closed' })}
          onSaved={refetch}
          onDeleted={refetch}
        />
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function canCallerEditEntry(entry: EntryEditing, canWriteProject: boolean): boolean {
  // The form's submit will hard-fail at the server if the caller lacks rights;
  // we only use this to show/hide the Delete button. Be generous by default —
  // server is the source of truth.
  if (entry.kind === 'event') return canWriteProject
  // For holidays/vacations, defer to server. We let the user attempt; on 403
  // they'll see a toast from the axios interceptor.
  return true
}
