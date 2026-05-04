export interface Project {
  id: number
  name: string
  description: string
  color: string
  is_default?: number
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
  feature_id: number | null
  title: string
  description: string
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  story_points: number | null
  assignee: string | null
  position: number
  created_at: string
  updated_at: string
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

export interface VelocityEntry {
  sprint_id: number
  sprint_name: string
  status: string
  start_date: string
  end_date: string
  total_points: number
  completed_points: number
  total_stories: number
  completed_stories: number
}

export interface CycleTimeEntry {
  lane_id: number
  lane_name: string
  avg_days: number | null
  sample_size: number
}

export interface CapacityEntry {
  assignee: string
  story_count: number
  story_points: number
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

export interface Sprint {
  id: number
  project_id: number
  name: string
  goal: string
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'planned'
  is_default?: number
}

export interface Comment {
  id: number
  card_id: number
  author: string
  author_id: number | null
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

export interface TestSuite {
  id: number
  project_id: number
  name: string
  description: string | null
  created_at: string
}

export interface TestStep {
  step: string
  expected: string
}

export type TestStatus = 'untested' | 'passed' | 'failed' | 'blocked' | 'skipped'
export type TestPriority = 'critical' | 'high' | 'medium' | 'low'

export interface TestCase {
  id: number
  suite_id: number | null
  card_id: number
  project_id: number
  title: string
  description: string | null
  status: TestStatus
  priority: TestPriority
  test_type: 'manual' | 'automated'
  steps: TestStep[] | null
  preconditions: string | null
  expected_result: string | null
  assigned_to: string | null
  position: number
  created_at: string
  updated_at: string
  latest_run?: TestRun | null
  card_title?: string | null
}

export interface TestRun {
  id: number
  test_case_id: number
  card_id: number
  status: 'passed' | 'failed' | 'blocked' | 'skipped'
  notes: string | null
  run_by: string | null
  run_at: string
}

export interface TestCaseSummary {
  total: number
  passed: number
  failed: number
  untested: number
  blocked: number
  skipped: number
}

// ── Auth & Users ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number
  email: string
  display_name: string
  role: 'super_admin' | 'member'
  epic_access: EpicAccessEntry[]
}

export interface User {
  id: number
  email: string
  display_name: string
  role: 'super_admin' | 'member'
  is_active: number
  created_at: string
}

export interface EpicAccessEntry {
  id: number
  user_id: number
  epic_id: number
  role: 'epic_admin' | 'contributor' | 'reader'
  granted_by: number | null
  created_at: string
  display_name?: string
  email?: string
}

export interface Notification {
  id: number
  user_id: number
  type: 'mention' | 'board_update' | 'assignment'
  entity_type: string
  entity_id: number
  message: string
  is_read: number
  created_at: string
}
