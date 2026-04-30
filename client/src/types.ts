export interface Project {
  id: number
  name: string
  description: string
  created_at: string
}

export interface Column {
  id: number
  project_id: number
  name: string
  position: number
  color: string
}

export interface Card {
  id: number
  column_id: number
  sprint_id: number | null
  title: string
  description: string
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  story_points: number | null
  assignee: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface Sprint {
  id: number
  project_id: number
  name: string
  goal: string
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'planned'
}

export interface Comment {
  id: number
  card_id: number
  author: string
  body: string
  created_at: string
}

export interface Label {
  id: number
  project_id: number
  name: string
  color: string
}

export interface ActivityLog {
  id: number
  card_id: number
  action: string
  meta: string
  created_at: string
}

export interface BacklogCard extends Card {
  column_name: string
  column_color: string
}
