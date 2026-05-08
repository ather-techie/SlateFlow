import { useMemo } from 'react'
import type { CalendarRange } from '../../types'
import EntryBar from './EntryBar'

interface Props {
  year: number
  monthIndex: number          // 0-11
  data: CalendarRange | null
  onAddDay?: (dateISO: string) => void
  onSprintClick?: (id: number) => void
  onEpicClick?: (id: number) => void
  onFeatureClick?: (id: number) => void
  onHolidayClick?: (id: number) => void
  onEventClick?: (id: number) => void
  onVacationClick?: (id: number) => void
}

interface Bar {
  id: string
  title: string
  color: string
  start: string
  end: string
  onClick?: () => void
  group: 'sprint' | 'epic' | 'feature' | 'holiday' | 'event' | 'vacation'
}

const COLORS = {
  sprint: '#2563eb',
  epic: '#7c3aed',
  feature: '#10b981',
  holiday: '#dc2626',
  event: '#d97706',
  vacation: '#0d9488',
} as const

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function buildDays(year: number, monthIndex: number): Date[] {
  const first = new Date(year, monthIndex, 1)
  const startOffset = first.getDay() // 0 = Sunday
  const start = new Date(year, monthIndex, 1 - startOffset)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return days
}

export default function MonthGrid({
  year, monthIndex, data,
  onAddDay,
  onSprintClick, onEpicClick, onFeatureClick,
  onHolidayClick, onEventClick, onVacationClick,
}: Props) {
  const days = useMemo(() => buildDays(year, monthIndex), [year, monthIndex])

  const bars: Bar[] = useMemo(() => {
    if (!data) return []
    const rows: Bar[] = []
    for (const s of data.sprints) {
      rows.push({ id: `s${s.id}`, title: `🏃 ${s.name}`, color: COLORS.sprint, start: s.start_date, end: s.end_date, onClick: () => onSprintClick?.(s.id), group: 'sprint' })
    }
    for (const e of data.epics) {
      rows.push({ id: `e${e.id}`, title: `📦 ${e.title}`, color: COLORS.epic, start: e.start_date, end: e.end_date, onClick: () => onEpicClick?.(e.id), group: 'epic' })
    }
    for (const f of data.features) {
      rows.push({ id: `f${f.id}`, title: `✨ ${f.title}`, color: COLORS.feature, start: f.start_date, end: f.end_date, onClick: () => onFeatureClick?.(f.id), group: 'feature' })
    }
    for (const h of data.holidays) {
      rows.push({ id: `h${h.id}`, title: `🎉 ${h.title}`, color: h.color || COLORS.holiday, start: h.start_date, end: h.end_date, onClick: () => onHolidayClick?.(h.id), group: 'holiday' })
    }
    for (const ev of data.events) {
      rows.push({ id: `ev${ev.id}`, title: `📅 ${ev.title}`, color: ev.color || COLORS.event, start: ev.start_date, end: ev.end_date, onClick: () => onEventClick?.(ev.id), group: 'event' })
    }
    for (const v of data.vacations) {
      rows.push({ id: `v${v.id}`, title: `🌴 ${v.title}`, color: v.color || COLORS.vacation, start: v.start_date, end: v.end_date, onClick: () => onVacationClick?.(v.id), group: 'vacation' })
    }
    return rows
  }, [data, onSprintClick, onEpicClick, onFeatureClick, onHolidayClick, onEventClick, onVacationClick])

  const today = isoDate(new Date())

  return (
    <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="px-2 py-1.5 text-xs font-semibold text-slate-500 text-center uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells — 6 rows of 7 */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 divide-x divide-y divide-slate-200">
        {days.map(d => {
          const iso = isoDate(d)
          const inMonth = d.getMonth() === monthIndex
          const isToday = iso === today
          const dayBars = bars.filter(b => iso >= b.start && iso <= b.end)

          return (
            <div
              key={iso}
              className={[
                'group relative min-h-[88px] flex flex-col p-1 text-left',
                inMonth ? 'bg-white' : 'bg-slate-50/60',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    'text-xs font-medium rounded px-1',
                    isToday ? 'bg-indigo-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-400',
                  ].join(' ')}
                >
                  {d.getDate()}
                </span>
                {onAddDay && (
                  <button
                    onClick={() => onAddDay(iso)}
                    className="text-xs text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Add entry"
                  >
                    +
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 mt-1 overflow-hidden">
                {dayBars.slice(0, 4).map(bar => (
                  <EntryBar
                    key={bar.id}
                    title={bar.title}
                    color={bar.color}
                    onClick={bar.onClick}
                    startsToday={iso === bar.start}
                    endsToday={iso === bar.end}
                  />
                ))}
                {dayBars.length > 4 && (
                  <span className="text-[10px] text-slate-500 px-1">+{dayBars.length - 4} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
