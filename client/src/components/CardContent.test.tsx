// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CardContent from './CardContent'
import type { Card, TestCaseSummary, TaskSummary } from '../types'

describe('CardContent', () => {
  const makeCard = (overrides?: Partial<Card>): Card => ({
    id: 1,
    sprint_id: 1,
    swim_lane_id: 1,
    title: 'Test card',
    description: '',
    priority: 'p2',
    story_points: null,
    assignee: null,
    assigned_to: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'user1',
    feature_id: null,
    epic_id: null,
    sort_order: 0,
    position: 0,
    ...overrides,
  })

  beforeEach(() => {
    // Reset any store state if needed
  })

  describe('basic rendering', () => {
    it('renders card title', () => {
      const card = makeCard({ title: 'My Task' })
      render(<CardContent card={card} />)
      expect(screen.getByText('My Task')).toBeInTheDocument()
    })

    it('renders PriorityBadge with correct priority', () => {
      const card = makeCard({ priority: 'p1' })
      render(<CardContent card={card} />)
      expect(screen.getByText('High')).toBeInTheDocument()
    })
  })

  describe('story points badge', () => {
    it('renders story points when set', () => {
      const card = makeCard({ story_points: 5 })
      render(<CardContent card={card} />)
      expect(screen.getByText('5 pt')).toBeInTheDocument()
    })

    it('does not render story points when null', () => {
      const card = makeCard({ story_points: null })
      render(<CardContent card={card} />)
      expect(screen.queryByText(/pt$/)).not.toBeInTheDocument()
    })

    it('renders "1 pt" for single point', () => {
      const card = makeCard({ story_points: 1 })
      render(<CardContent card={card} />)
      expect(screen.getByText('1 pt')).toBeInTheDocument()
    })
  })

  describe('assignee avatar', () => {
    it('renders assignee avatar with first letter', () => {
      const card = makeCard({ assignee: 'john' })
      render(<CardContent card={card} />)
      expect(screen.getByText('J')).toBeInTheDocument()
    })

    it('renders avatar with assignee name as title', () => {
      const card = makeCard({ assignee: 'alice' })
      const { container } = render(<CardContent card={card} />)
      const avatar = container.querySelector('span[title="alice"]')
      expect(avatar).toBeInTheDocument()
      expect(avatar?.textContent).toBe('A')
    })

    it('does not render avatar when assignee is null', () => {
      const card = makeCard({ assignee: null })
      const { container } = render(<CardContent card={card} />)
      expect(container.querySelector('span[title]')).not.toBeInTheDocument()
    })

    it('uses uppercase first letter for avatar', () => {
      const card = makeCard({ assignee: 'bob' })
      render(<CardContent card={card} />)
      expect(screen.getByText('B')).toBeInTheDocument()
    })
  })

  describe('task summary', () => {
    it('does not render task summary when undefined', () => {
      const card = makeCard()
      render(<CardContent card={card} />)
      expect(screen.queryByText(/tasks/)).not.toBeInTheDocument()
    })

    it('does not render task summary when total is 0', () => {
      const card = makeCard()
      const taskSummary: TaskSummary = { total: 0, done: 0 }
      render(<CardContent card={card} taskSummary={taskSummary} />)
      expect(screen.queryByText(/tasks/)).not.toBeInTheDocument()
    })

    it('renders task indicator when total > 0', () => {
      const card = makeCard()
      const taskSummary: TaskSummary = { total: 3, done: 1 }
      render(<CardContent card={card} taskSummary={taskSummary} />)
      expect(screen.getByText('1/3 tasks')).toBeInTheDocument()
    })

    it('applies text-emerald-600 class when all tasks done', () => {
      const card = makeCard()
      const taskSummary: TaskSummary = { total: 3, done: 3 }
      const { container } = render(<CardContent card={card} taskSummary={taskSummary} />)
      const taskSpan = screen.getByText('3/3 tasks')
      expect(taskSpan.className).toContain('text-emerald-600')
    })

    it('does not apply text-emerald-600 when tasks incomplete', () => {
      const card = makeCard()
      const taskSummary: TaskSummary = { total: 3, done: 1 }
      const { container } = render(<CardContent card={card} taskSummary={taskSummary} />)
      const taskSpan = screen.getByText('1/3 tasks')
      expect(taskSpan.className).not.toContain('text-emerald-600')
    })
  })

  describe('test case summary', () => {
    it('does not render test indicator when undefined', () => {
      const card = makeCard()
      render(<CardContent card={card} />)
      expect(screen.queryByText(/passed/)).not.toBeInTheDocument()
    })

    it('does not render test indicator when total is 0', () => {
      const card = makeCard()
      const testSummary: TestCaseSummary = { total: 0, passed: 0, failed: 0, untested: 0 }
      render(<CardContent card={card} testCaseSummary={testSummary} />)
      expect(screen.queryByText(/passed/)).not.toBeInTheDocument()
    })

    it('renders test indicator when total > 0', () => {
      const card = makeCard()
      const testSummary: TestCaseSummary = { total: 5, passed: 3, failed: 1, untested: 1 }
      render(<CardContent card={card} testCaseSummary={testSummary} />)
      expect(screen.getByText('3/5 passed')).toBeInTheDocument()
    })

    it('applies text-red-500 class when any tests failed', () => {
      const card = makeCard()
      const testSummary: TestCaseSummary = { total: 5, passed: 3, failed: 2, untested: 0 }
      render(<CardContent card={card} testCaseSummary={testSummary} />)
      const testDiv = screen.getByText('3/5 passed').closest('div')
      expect(testDiv?.className).toContain('text-red-500')
    })

    it('applies text-green-600 class when all tests passed', () => {
      const card = makeCard()
      const testSummary: TestCaseSummary = { total: 5, passed: 5, failed: 0, untested: 0 }
      render(<CardContent card={card} testCaseSummary={testSummary} />)
      const testDiv = screen.getByText('5/5 passed').closest('div')
      expect(testDiv?.className).toContain('text-green-600')
    })

    it('applies text-slate-400 class when tests are mixed', () => {
      const card = makeCard()
      const testSummary: TestCaseSummary = { total: 5, passed: 3, failed: 0, untested: 2 }
      render(<CardContent card={card} testCaseSummary={testSummary} />)
      const testDiv = screen.getByText('3/5 passed').closest('div')
      expect(testDiv?.className).toContain('text-slate-400')
    })

    it('renders tooltip with test summary details', () => {
      const card = makeCard()
      const testSummary: TestCaseSummary = { total: 5, passed: 3, failed: 1, untested: 1 }
      const { container } = render(<CardContent card={card} testCaseSummary={testSummary} />)
      const testDiv = container.querySelector('div[title*="test case"]')
      expect(testDiv?.title).toContain('5 test cases')
      expect(testDiv?.title).toContain('3 passed')
      expect(testDiv?.title).toContain('1 failed')
    })
  })

  describe('link count indicator', () => {
    it('does not render link indicator when linkCount is 0 (default)', () => {
      const card = makeCard()
      render(<CardContent card={card} />)
      expect(screen.queryByText(/PR/)).not.toBeInTheDocument()
    })

    it('does not render link indicator when linkCount is undefined', () => {
      const card = makeCard()
      render(<CardContent card={card} linkCount={undefined} />)
      expect(screen.queryByText(/PR/)).not.toBeInTheDocument()
    })

    it('renders link indicator when linkCount > 0', () => {
      const card = makeCard()
      render(<CardContent card={card} linkCount={2} />)
      expect(screen.getByText('2 PRs')).toBeInTheDocument()
    })

    it('uses singular "PR" when linkCount is 1', () => {
      const card = makeCard()
      render(<CardContent card={card} linkCount={1} />)
      expect(screen.getByText('1 PR')).toBeInTheDocument()
    })

    it('uses plural "PRs" when linkCount > 1', () => {
      const card = makeCard()
      render(<CardContent card={card} linkCount={3} />)
      expect(screen.getByText('3 PRs')).toBeInTheDocument()
    })
  })

  describe('styling and className', () => {
    it('applies custom className prop', () => {
      const card = makeCard()
      const { container } = render(<CardContent card={card} className="custom-class" />)
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
    })

    it('applies inline style prop', () => {
      const card = makeCard()
      const { container } = render(<CardContent card={card} style={{ padding: '10px' }} />)
      const div = container.firstChild as HTMLElement
      expect(div.style.padding).toBe('10px')
    })
  })
})
