// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Card from './Card'
import { useBoardStore } from '../../store/boardStore'
import type { Card as CardType, TaskSummary } from '../../types/board'
import type { TestCaseSummary } from '../../types/testing'

// Mock @dnd-kit modules
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}))

describe('Board Card', () => {
  const makeCard = (overrides?: Partial<CardType>): CardType => ({
    id: 1,
    column_id: null,
    swim_lane_id: 1,
    sprint_id: 1,
    feature_id: null,
    title: 'Test card',
    description: '',
    priority: 'p2',
    story_points: null,
    assignee: null,
    assignee_id: null,
    position: 0,
    due_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  })

  beforeEach(() => {
    // Reset board store to clean state
    useBoardStore.setState({
      lanes: [],
      cards: [],
      testCaseSummary: {},
      taskSummary: {},
      linkCount: {},
    })
    vi.clearAllMocks()
  })

  it('renders card title via CardContent', () => {
    const card = makeCard({ title: 'My Task' })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(screen.getByText('My Task')).toBeInTheDocument()
  })

  it('renders card priority via CardContent', () => {
    const card = makeCard({ priority: 'p1', title: 'High priority task' })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup()
    const mockOnClick = vi.fn()
    const card = makeCard({ title: 'Clickable' })
    render(<Card card={card} onClick={mockOnClick} />)
    await user.click(screen.getByText('Clickable').closest('div') as Element)
    expect(mockOnClick).toHaveBeenCalled()
  })

  it('receives testCaseSummary from board store and renders it', () => {
    const card = makeCard({ id: 42, title: 'Card with tests' })
    const testSummary: TestCaseSummary = { total: 3, passed: 2, failed: 1, untested: 0, blocked: 0, skipped: 0 }
    useBoardStore.setState({
      testCaseSummary: { [card.id]: testSummary },
    })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(screen.getByText('2/3 passed')).toBeInTheDocument()
  })

  it('receives taskSummary from board store and renders it', () => {
    const card = makeCard({ id: 43, title: 'Card with tasks' })
    const taskSummary: TaskSummary = { total: 5, done: 3 }
    useBoardStore.setState({
      taskSummary: { [card.id]: taskSummary },
    })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(screen.getByText('3/5 tasks')).toBeInTheDocument()
  })

  it('receives linkCount from board store and renders it', () => {
    const card = makeCard({ id: 44, title: 'Card with links' })
    useBoardStore.setState({
      linkCount: { [card.id]: 2 },
    })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(screen.getByText('2 PRs')).toBeInTheDocument()
  })

  it('does not have opacity-40 class by default (isDragging=false)', () => {
    const card = makeCard({ title: 'Static card' })
    const { container } = render(<Card card={card} onClick={vi.fn()} />)
    const cardDiv = container.firstChild as Element
    expect(cardDiv?.className).toContain('cursor-pointer')
    expect(cardDiv?.className).toContain('touch-none')
    // Check that opacity-40 is NOT present by default
    expect(cardDiv?.className).not.toContain('opacity-40')
  })

  it('sets ref from useSortable', () => {
    const { useSortable } = require('@dnd-kit/sortable')
    const mockSetNodeRef = vi.fn()
    useSortable.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: mockSetNodeRef,
      transform: null,
      transition: undefined,
      isDragging: false,
    })
    const card = makeCard({ title: 'Draggable card' })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(mockSetNodeRef).toHaveBeenCalled()
  })

  it('passes card id to useSortable', () => {
    const { useSortable } = require('@dnd-kit/sortable')
    const card = makeCard({ id: 999, title: 'Card with id' })
    render(<Card card={card} onClick={vi.fn()} />)
    expect(useSortable).toHaveBeenCalledWith(expect.objectContaining({ id: 999 }))
  })

  it('renders all board store data without throwing', () => {
    const card = makeCard({ id: 55, title: 'Full card' })
    useBoardStore.setState({
      testCaseSummary: { [card.id]: { total: 2, passed: 1, failed: 1, untested: 0, blocked: 0, skipped: 0 } },
      taskSummary: { [card.id]: { total: 4, done: 2 } },
      linkCount: { [card.id]: 1 },
    })
    expect(() => render(<Card card={card} onClick={vi.fn()} />)).not.toThrow()
    expect(screen.getByText('Full card')).toBeInTheDocument()
  })
})
