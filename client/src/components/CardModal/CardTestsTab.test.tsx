import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardTestsTab from './CardTestsTab'
import { api } from '../../api/index'
import { useBoardStore } from '../../store/boardStore'
import { useFeatureFlagStore } from '../../store/featureFlagStore'
import type { Card, TestCase } from '../../types'

vi.mock('../../api/index', () => ({
  api: {
    testCases: {
      listByCard: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      bulkStatus: vi.fn(),
      listRuns: vi.fn(),
      addRun: vi.fn(),
    },
    testSuites: {
      listByProject: vi.fn(),
    },
    ai: {
      generateTestCases: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(api, true)

const mockCard: Card = {
  id: 1,
  column_id: null,
  swim_lane_id: 1,
  sprint_id: 1,
  feature_id: null,
  title: 'Test Card',
  description: '',
  priority: 'p1',
  story_points: 5,
  assignee: null,
  assignee_id: null,
  position: 0,
  due_date: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockTestCase: TestCase = {
  id: 10,
  suite_id: null,
  card_id: 1,
  project_id: 1,
  title: 'Login works',
  description: null,
  status: 'untested',
  priority: 'high',
  test_type: 'manual',
  steps: null,
  preconditions: null,
  expected_result: null,
  assigned_to: null,
  position: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('CardTestsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBoardStore.setState({ lanes: [], cards: [], testCaseSummary: {}, taskSummary: {}, linkCount: {} })
    useFeatureFlagStore.setState((state) => ({ loading: false, features: { ...state.features, auto_test_case_generation_ai: false } }))
    mockedApi.testCases.listByCard.mockResolvedValue({
      cases: [mockTestCase],
      summary: { total: 1, passed: 0, failed: 0, untested: 1, blocked: 0, skipped: 0 },
    })
    mockedApi.testSuites.listByProject.mockResolvedValue([])
  })

  it('renders test cases from the API', async () => {
    render(<CardTestsTab card={mockCard} projectId={1} />)
    expect(await screen.findByText('Login works')).toBeInTheDocument()
    expect(screen.getByText('All (1)')).toBeInTheDocument()
  })

  it('syncs the test case summary into the board store', async () => {
    render(<CardTestsTab card={mockCard} projectId={1} />)
    await screen.findByText('Login works')
    await waitFor(() => {
      expect(useBoardStore.getState().testCaseSummary[1]).toEqual({ total: 1, passed: 0, failed: 0, untested: 1, blocked: 0, skipped: 0 })
    })
  })

  it('adds a new test case via the form', async () => {
    const created: TestCase = { ...mockTestCase, id: 11, title: 'Logout works' }
    mockedApi.testCases.create.mockResolvedValue(created)
    const user = userEvent.setup()
    render(<CardTestsTab card={mockCard} projectId={1} />)
    await screen.findByText('Login works')
    await user.click(screen.getByText('+ Add Test Case'))
    await user.type(screen.getByPlaceholderText('Test case title (required)'), 'Logout works')
    await user.click(screen.getByText('Add test case'))
    await waitFor(() => {
      expect(mockedApi.testCases.create).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Logout works' }))
    })
    expect(await screen.findByText('Logout works')).toBeInTheDocument()
  })

  it('marks a test case as passed via the quick-status button', async () => {
    mockedApi.testCases.addRun.mockResolvedValue({ id: 1, test_case_id: 10, card_id: 1, status: 'passed', notes: null, run_by: null, run_at: '2024-01-01' })
    const user = userEvent.setup()
    render(<CardTestsTab card={mockCard} projectId={1} />)
    await screen.findByText('Login works')
    await user.click(screen.getByText('Pass'))
    await waitFor(() => {
      expect(mockedApi.testCases.addRun).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'passed' }))
    })
  })

  it('filters the list by status', async () => {
    const user = userEvent.setup()
    render(<CardTestsTab card={mockCard} projectId={1} />)
    await screen.findByText('Login works')
    await user.click(screen.getByText('passed'))
    expect(screen.queryByText('Login works')).not.toBeInTheDocument()
    expect(screen.getByText('No test cases match this filter.')).toBeInTheDocument()
  })
})
