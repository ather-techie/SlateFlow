import type { LaneWithCount } from './board'

export interface Project {
  id: number
  name: string
  description: string
  color: string
  is_default?: number
  created_at: string
}

export interface Sprint {
  id: number
  project_id: number
  name: string
  goal: string
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'planned'
  is_default?: number
  velocity_completed_points?: number
  velocity_total_points?: number
  velocity_completed_stories?: number
  velocity_total_stories?: number
}

export interface Epic {
  id: number
  project_id: number
  title: string
  description: string
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  status: 'new' | 'active' | 'resolved' | 'closed'
  assignee: string | null
  position: number
  is_default: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  feature_count?: number
  story_count?: number
}

export interface Feature {
  id: number
  project_id: number
  epic_id: number | null
  title: string
  description: string
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  status: 'new' | 'active' | 'resolved' | 'closed'
  assignee: string | null
  position: number
  is_default: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  story_count?: number
  done_story_count?: number
}

export interface RoadmapEpic extends Epic {
  features: (Feature & { story_count: number; done_story_count: number })[]
}

export interface ProjectSummary extends Project {
  lanes: LaneWithCount[]
  total_cards: number
  open_cards: number
  active_sprint: Sprint | null
  test_cases_total: number
  test_cases_passed: number
  test_cases_failed: number
  test_cases_untested: number
}

export interface DashboardStats {
  total_projects: number
  active_sprints: number
  open_cards: number
  test_cases_total: number
  test_cases_passed: number
  test_cases_failed: number
  test_cases_untested: number
}
