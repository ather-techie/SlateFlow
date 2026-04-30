export interface Project {
  id: number
  name: string
  description: string
  color: string
  created_at: string
}

export interface Column {
  id: number
  project_id: number
  name: string
  position: number
  color: string
}

export interface Lane {
  id: number
  project_id: number
  name: string
  position: number
  color: string
  is_done_col: number
}

export interface Card {
  id: number
  column_id: number | null
  swim_lane_id: number | null
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

export interface LanePreset {
  id: number
  name: string
  lanes: string[]
}

export interface LaneWithCount {
  id: number
  name: string
  color: string
  position: number
  is_done_col: number
  card_count: number
}

export interface ProjectSummary extends Project {
  lanes: LaneWithCount[]
  total_cards: number
  open_cards: number
  active_sprint: Sprint | null
}

export interface DashboardStats {
  total_projects: number
  active_sprints: number
  open_cards: number
}

export interface ActivityItem {
  id: number
  card_id: number
  card_title: string
  project_id: number
  project_name: string
  action: string
  meta: string
  created_at: string
}
