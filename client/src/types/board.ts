export interface Card {
  id: number
  column_id: number | null
  swim_lane_id: number | null
  sprint_id: number | null
  feature_id: number | null
  title: string
  description: string
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  story_points: number | null
  assignee: string | null
  assignee_id: number | null
  position: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface Lane {
  id: number
  project_id: number
  name: string
  position: number
  color: string
  is_done_col: number
}

export interface Column {
  id: number
  project_id: number
  name: string
  position: number
  color: string
}

export interface Task {
  id: number
  story_id: number
  title: string
  description: string
  status: 'to-do' | 'in-progress' | 'done'
  assignee: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface TaskSummary {
  total: number
  done: number
}

export interface BacklogCard extends Card {
  column_name: string
  column_color: string
}

export interface Dependency {
  dep_id: number
  id: number
  title: string
  priority: Card['priority']
  story_points: number | null
  assignee: string | null
  swim_lane_id: number | null
}

export interface DependencyList {
  blocks: Dependency[]
  blocked_by: Dependency[]
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
