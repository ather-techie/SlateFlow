import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardDependenciesTab from './CardDependenciesTab'
import { api } from '../../api/index'
import type { Card, DependencyList } from '../../types'

vi.mock('../../api/index', () => ({
  api: {
    dependencies: {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    },
    cards: {
      searchStories: vi.fn(),
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

const emptyDeps: DependencyList = { blocks: [], blocked_by: [] }

describe('CardDependenciesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no dependencies exist', async () => {
    mockedApi.dependencies.list.mockResolvedValue(emptyDeps)
    render(<CardDependenciesTab card={mockCard} projectId={1} />)
    expect(await screen.findByText("This story doesn't block anything.")).toBeInTheDocument()
    expect(screen.getByText('This story is not blocked.')).toBeInTheDocument()
  })

  it('renders blocks and blocked-by lists', async () => {
    mockedApi.dependencies.list.mockResolvedValue({
      blocks: [{ dep_id: 1, id: 2, title: 'Downstream story', priority: 'p2', story_points: 3, assignee: null, swim_lane_id: null }],
      blocked_by: [{ dep_id: 2, id: 3, title: 'Upstream story', priority: 'p1', story_points: null, assignee: null, swim_lane_id: null }],
    })
    render(<CardDependenciesTab card={mockCard} projectId={1} />)
    expect(await screen.findByText('Downstream story')).toBeInTheDocument()
    expect(screen.getByText('Upstream story')).toBeInTheDocument()
  })

  it('searches and adds a new dependency', async () => {
    mockedApi.dependencies.list
      .mockResolvedValueOnce(emptyDeps)
      .mockResolvedValueOnce({ blocks: [{ dep_id: 5, id: 2, title: 'Related story', priority: 'p2', story_points: null, assignee: null, swim_lane_id: null }], blocked_by: [] })
    mockedApi.cards.searchStories.mockResolvedValue([
      { id: 2, title: 'Related story', priority: 'p2', story_points: null, assignee: null, swim_lane_id: null },
    ])
    mockedApi.dependencies.add.mockResolvedValue({ dep_id: 5, id: 2, title: 'Related story', priority: 'p2', story_points: null, assignee: null, swim_lane_id: null })

    const user = userEvent.setup()
    render(<CardDependenciesTab card={mockCard} projectId={1} />)
    await screen.findByText("This story doesn't block anything.")
    await user.click(screen.getByText('+ Add dependency'))
    await user.type(screen.getByPlaceholderText('Search stories by title…'), 'Related')
    expect(await screen.findByText('Related story')).toBeInTheDocument()
    await user.click(screen.getByText('Related story'))
    await waitFor(() => {
      expect(mockedApi.dependencies.add).toHaveBeenCalledWith(1, { target_id: 2, type: 'blocks' })
    })
  })

  it('removes a dependency', async () => {
    mockedApi.dependencies.list
      .mockResolvedValueOnce({ blocks: [{ dep_id: 1, id: 2, title: 'Downstream story', priority: 'p2', story_points: null, assignee: null, swim_lane_id: null }], blocked_by: [] })
      .mockResolvedValueOnce(emptyDeps)
    mockedApi.dependencies.remove.mockResolvedValue({ id: 1 })
    const user = userEvent.setup()
    render(<CardDependenciesTab card={mockCard} projectId={1} />)
    await screen.findByText('Downstream story')
    await user.click(screen.getByTitle('Remove'))
    await waitFor(() => {
      expect(mockedApi.dependencies.remove).toHaveBeenCalledWith(1)
    })
  })
})
