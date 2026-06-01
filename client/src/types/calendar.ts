import type { Sprint } from './planning'
import type { Epic, Feature } from './planning'

export type CalendarEntryKind = 'holiday' | 'event' | 'vacation'

export type EntryFormKind = CalendarEntryKind

export interface EntryEditing {
  id: number
  kind: EntryFormKind
  title: string
  description: string | null
  start_date: string
  end_date: string
  color: string | null
  user_id?: number | null
  project_id?: number | null
  country?: string | null
  state_province?: string | null
}

export interface CalendarSprintEntry {
  id: number
  name: string
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'planned'
}

export interface CalendarEpicEntry {
  id: number
  title: string
  start_date: string
  end_date: string
  status: Epic['status']
  priority: Epic['priority']
}

export interface CalendarFeatureEntry {
  id: number
  title: string
  start_date: string
  end_date: string
  status: Feature['status']
  priority: Feature['priority']
  epic_id: number | null
}

export interface CalendarHoliday {
  id: number
  title: string
  description: string | null
  start_date: string
  end_date: string
  color: string | null
  country: string | null
  state_province: string | null
  created_by: number | null
  created_at: string
}

export interface CalendarEvent {
  id: number
  project_id: number
  title: string
  description: string | null
  start_date: string
  end_date: string
  color: string | null
  created_by: number | null
  created_at: string
}

export interface CalendarVacation {
  id: number
  user_id: number
  title: string
  description: string | null
  start_date: string
  end_date: string
  color: string | null
  created_by: number | null
  created_at: string
  user_display_name: string | null
  user_email: string | null
}

export interface CalendarRange {
  sprints: CalendarSprintEntry[]
  epics: CalendarEpicEntry[]
  features: CalendarFeatureEntry[]
  holidays: CalendarHoliday[]
  events: CalendarEvent[]
  vacations: CalendarVacation[]
}
