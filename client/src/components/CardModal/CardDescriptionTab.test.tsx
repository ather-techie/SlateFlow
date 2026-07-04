import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardDescriptionTab from './CardDescriptionTab'
import { api } from '../../api/index'
import { useBoardStore } from '../../store/boardStore'
import { useFeatureFlagStore } from '../../store/featureFlagStore'
import type { Card, Task } from '../../types'

vi.mock('../../api/index', () => ({
  api: {
    cards: {
      update: vi.fn(),
      listTasks: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
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
  description: 'Existing description',
  priority: 'p1',
  story_points: 5,
  assignee: null,
  assignee_id: null,
  position: 0,
  due_date: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockTasks: Task[] = [
  { id: 1, story_id: 1, title: 'First task', description: '', status: 'to-do', assignee: null, position: 0, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 2, story_id: 1, title: 'Second task', description: '', status: 'done', assignee: null, position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
]

describe('CardDescriptionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBoardStore.setState({ lanes: [], cards: [], testCaseSummary: {}, taskSummary: {}, linkCount: {} })
    useFeatureFlagStore.setState((state) => ({ loading: false, features: { ...state.features, ai: false, ai_writing_assist: false } }))
    mockedApi.cards.listTasks.mockResolvedValue(mockTasks)
  })

  it('renders the existing description', async () => {
    render(<CardDescriptionTab card={mockCard} onUpdate={vi.fn()} />)
    expect(await screen.findByDisplayValue('Existing description')).toBeInTheDocument()
  })

  it('loads and renders tasks with progress', async () => {
    render(<CardDescriptionTab card={mockCard} onUpdate={vi.fn()} />)
    expect(await screen.findByText('First task')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(useBoardStore.getState().taskSummary[1]).toEqual({ total: 2, done: 1 })
  })

  it('saves the description on blur', async () => {
    const onUpdate = vi.fn()
    mockedApi.cards.update.mockResolvedValue({ ...mockCard, description: 'Updated text' })
    const user = userEvent.setup()
    render(<CardDescriptionTab card={mockCard} onUpdate={onUpdate} />)
    const textarea = await screen.findByDisplayValue('Existing description')
    await user.clear(textarea)
    await user.type(textarea, 'Updated text')
    await user.tab()
    await waitFor(() => {
      expect(mockedApi.cards.update).toHaveBeenCalledWith(1, { description: 'Updated text' })
    })
    expect(onUpdate).toHaveBeenCalled()
  })

  it('adds a new task', async () => {
    const newTask: Task = { id: 3, story_id: 1, title: 'New task', description: '', status: 'to-do', assignee: null, position: 2, created_at: '2024-01-01', updated_at: '2024-01-01' }
    mockedApi.cards.createTask.mockResolvedValue(newTask)
    const user = userEvent.setup()
    render(<CardDescriptionTab card={mockCard} onUpdate={vi.fn()} />)
    await screen.findByText('First task')
    await user.click(screen.getByText('+ Add task'))
    await user.type(screen.getByPlaceholderText('Task title…'), 'New task')
    await user.click(screen.getByText('Add'))
    await waitFor(() => {
      expect(mockedApi.cards.createTask).toHaveBeenCalledWith(1, { title: 'New task' })
    })
    expect(await screen.findByText('New task')).toBeInTheDocument()
  })

  it('toggles a task to done', async () => {
    mockedApi.cards.updateTask.mockResolvedValue({ ...mockTasks[0], status: 'done' })
    const user = userEvent.setup()
    render(<CardDescriptionTab card={mockCard} onUpdate={vi.fn()} />)
    await screen.findByText('First task')
    const checkboxes = screen.getAllByRole('button', { name: '' })
    await user.click(checkboxes[0])
    await waitFor(() => {
      expect(mockedApi.cards.updateTask).toHaveBeenCalledWith(1, { status: 'done' })
    })
  })

  it('deletes a task', async () => {
    mockedApi.cards.deleteTask.mockResolvedValue({ id: 1 })
    render(<CardDescriptionTab card={mockCard} onUpdate={vi.fn()} />)
    await screen.findByText('First task')
    const deleteButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg path[d^="M6 18L18"]'))
    const user = userEvent.setup()
    await user.click(deleteButtons[0])
    await waitFor(() => {
      expect(mockedApi.cards.deleteTask).toHaveBeenCalledWith(1)
    })
    expect(screen.queryByText('First task')).not.toBeInTheDocument()
  })
})
