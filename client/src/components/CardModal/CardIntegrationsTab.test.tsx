import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import toast from 'react-hot-toast'
import CardIntegrationsTab from './CardIntegrationsTab'
import { api } from '../../api/index'
import { useBoardStore } from '../../store/boardStore'
import { useFeatureFlagStore } from '../../store/featureFlagStore'
import type { Card, CardLink } from '../../types'

vi.mock('../../api/index', () => ({
  api: {
    cardLinks: {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
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

const githubPr: CardLink = {
  id: 1, card_id: 1, provider: 'github', type: 'pr', repo_url: 'https://github.com/o/r',
  number: 42, sha: null, title: 'Fix the bug', url: 'https://github.com/o/r/pull/42', state: 'open', merged_at: null, created_by: 1, created_at: '2024-01-01',
}

describe('CardIntegrationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBoardStore.setState({ lanes: [], cards: [], testCaseSummary: {}, taskSummary: {}, linkCount: {} })
    useFeatureFlagStore.setState((state) => ({ loading: false, features: { ...state.features, github_integration: true, gitlab_integration: false } }))
  })

  it('renders linked GitHub PRs and syncs link count', async () => {
    mockedApi.cardLinks.list.mockResolvedValue([githubPr])
    render(<CardIntegrationsTab card={mockCard} projectId={1} />)
    expect(await screen.findByText('Fix the bug')).toBeInTheDocument()
    await waitFor(() => {
      expect(useBoardStore.getState().linkCount[1]).toBe(1)
    })
  })

  it('shows empty state when no links exist', async () => {
    mockedApi.cardLinks.list.mockResolvedValue([])
    render(<CardIntegrationsTab card={mockCard} projectId={1} />)
    expect(await screen.findByText('No GitHub PRs linked.')).toBeInTheDocument()
  })

  it('does not render the GitLab section when the flag is off', async () => {
    mockedApi.cardLinks.list.mockResolvedValue([])
    render(<CardIntegrationsTab card={mockCard} projectId={1} />)
    await screen.findByText('No GitHub PRs linked.')
    expect(screen.queryByText(/GitLab/)).not.toBeInTheDocument()
  })

  it('adds a new link', async () => {
    mockedApi.cardLinks.list.mockResolvedValue([])
    mockedApi.cardLinks.add.mockResolvedValue(githubPr)
    const user = userEvent.setup()
    render(<CardIntegrationsTab card={mockCard} projectId={1} />)
    await screen.findByText('No GitHub PRs linked.')
    await user.click(screen.getByText('+ Link a PR / MR / Commit / Issue'))
    await user.type(screen.getByPlaceholderText(/Paste a GitHub PR/), githubPr.url)
    await user.click(screen.getByText('Add'))
    await waitFor(() => {
      expect(mockedApi.cardLinks.add).toHaveBeenCalledWith(1, { url: githubPr.url })
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('removes a link', async () => {
    mockedApi.cardLinks.list.mockResolvedValue([githubPr])
    mockedApi.cardLinks.remove.mockResolvedValue({ id: githubPr.id })
    const user = userEvent.setup()
    render(<CardIntegrationsTab card={mockCard} projectId={1} />)
    await screen.findByText('Fix the bug')
    await user.click(screen.getByTitle('Remove'))
    await waitFor(() => {
      expect(mockedApi.cardLinks.remove).toHaveBeenCalledWith(1, githubPr.id)
    })
  })
})
