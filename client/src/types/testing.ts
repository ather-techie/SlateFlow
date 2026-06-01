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
