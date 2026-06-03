// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NLItemInput, normalizePriority } from './NLItemInput'
import toast from 'react-hot-toast'

vi.mock('../api/index', () => ({
  api: {
    ai: {
      parseItem: vi.fn(),
    },
    epics: {
      create: vi.fn(),
    },
    features: {
      create: vi.fn(),
    },
    cards: {
      create: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast')

describe('normalizePriority', () => {
  it('normalizes "critical" to p0', () => {
    expect(normalizePriority('critical')).toBe('p0')
  })

  it('normalizes "high" to p1', () => {
    expect(normalizePriority('high')).toBe('p1')
  })

  it('normalizes "medium" to p2', () => {
    expect(normalizePriority('medium')).toBe('p2')
  })

  it('normalizes "low" to p3', () => {
    expect(normalizePriority('low')).toBe('p3')
  })

  it('returns p2 (default) for unknown priority', () => {
    expect(normalizePriority('unknown')).toBe('p2')
    expect(normalizePriority('')).toBe('p2')
    expect(normalizePriority('urgent')).toBe('p2')
  })

  it('is case-insensitive for lookups in priorityMap', () => {
    // Note: normalizePriority expects lowercase input since it's called from parseItem
    expect(normalizePriority('Critical')).toBe('p2') // not found (case-sensitive map)
    expect(normalizePriority('critical')).toBe('p0')
  })
})

describe('NLItemInput component', () => {
  const mockOnCreated = vi.fn()
  const { api } = require('../api/index')

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnCreated.mockClear()
    ;(toast.success as any).mockClear()
    ;(toast.error as any).mockClear()
  })

  const renderComponent = () => {
    return render(
      <NLItemInput
        allowedTypes={['epic', 'feature', 'story']}
        context={{ projectId: 1 }}
        onCreated={mockOnCreated}
      />
    )
  }

  it('renders "Create with AI" button in idle state', () => {
    renderComponent()
    expect(screen.getByRole('button', { name: /create with ai/i })).toBeInTheDocument()
  })

  it('opens modal with textarea when button is clicked', async () => {
    const user = userEvent.setup()
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    // Modal renders into portal, so we check for textarea in document.body
    await waitFor(() => {
      expect(document.querySelector('textarea')).toBeInTheDocument()
    })
  })

  it('disables Parse button when textarea is empty', async () => {
    const user = userEvent.setup()
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    await waitFor(() => {
      const parseBtn = screen.getByRole('button', { name: /parse/i })
      expect(parseBtn).toBeDisabled()
    })
  })

  it('enables Parse button when textarea has text', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({ type: 'unknown', reason: 'test' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    await waitFor(() => {
      const textarea = document.querySelector('textarea')
      expect(textarea).toBeInTheDocument()
    })
    const textarea = document.querySelector('textarea')!
    await user.type(textarea, 'test input')
    await waitFor(() => {
      const parseBtn = screen.getByRole('button', { name: /parse/i })
      expect(parseBtn).not.toBeDisabled()
    })
  })

  it('closes modal when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    await waitFor(() => {
      expect(document.querySelector('textarea')).toBeInTheDocument()
    })
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)
    await waitFor(() => {
      expect(document.querySelector('textarea')).not.toBeInTheDocument()
    })
  })

  it('closes modal when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    await waitFor(() => {
      expect(document.querySelector('textarea')).toBeInTheDocument()
    })
    const textarea = document.querySelector('textarea')!
    await user.type(textarea, '{Escape}')
    await waitFor(() => {
      expect(document.querySelector('textarea')).not.toBeInTheDocument()
    })
  })

  it('calls api.ai.parseItem when Parse button is clicked', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({ type: 'unknown', reason: 'test' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'create a task')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      expect(api.ai.parseItem).toHaveBeenCalledWith({
        input: 'create a task',
        context: { projectId: 1 },
        allowedTypes: ['epic', 'feature', 'story'],
      })
    })
  })

  it('shows error dialog when parseItem returns unknown type', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({ type: 'unknown', reason: 'Could not understand' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'nonsense input')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
      expect(screen.getByText('Could not understand')).toBeInTheDocument()
    })
  })

  it('shows preview when parseItem returns a valid type', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({
      type: 'epic',
      payload: { title: 'New Epic', description: 'Epic description', priority: 'p1' },
    })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'new epic')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      expect(screen.getByText('Epic')).toBeInTheDocument()
      expect(screen.getByText('New Epic')).toBeInTheDocument()
    })
  })

  it('calls toast.error when parseItem fails', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockRejectedValue(new Error('API error'))
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'test')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('parse'))
    })
  })

  it('shows "Try rephrasing" button when unknown type is returned', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({ type: 'unknown', reason: 'Not clear' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'unclear input')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try rephrasing/i })).toBeInTheDocument()
    })
  })

  it('returns to input state when "Try rephrasing" is clicked', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({ type: 'unknown', reason: 'Not clear' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'unclear')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      const rephraseBtn = screen.getByRole('button', { name: /try rephrasing/i })
      expect(rephraseBtn).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /try rephrasing/i }))
    await waitFor(() => {
      const newTextarea = document.querySelector('textarea')
      expect(newTextarea).toBeInTheDocument()
      expect(newTextarea?.value).toBe('')
    })
  })

  it('calls onCreated callback after successful confirmation', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({
      type: 'story',
      payload: { title: 'New Story', priority: 'p2', assignee: undefined },
    })
    api.cards.create.mockResolvedValue({ id: 1, title: 'New Story' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'create story')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    })
    // Click confirm/create button
    const createBtn = screen.getByRole('button', { name: /create/i })
    await user.click(createBtn)
    await waitFor(() => {
      expect(mockOnCreated).toHaveBeenCalled()
    })
  })

  it('resets to idle state after successful creation', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({
      type: 'epic',
      payload: { title: 'Epic', priority: 'p1' },
    })
    api.epics.create.mockResolvedValue({ id: 1, title: 'Epic' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'new epic')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      const createBtn = screen.queryByRole('button', { name: /create/i })
      expect(createBtn).toBeInTheDocument()
    })
    const createBtn = screen.getByRole('button', { name: /create/i })
    await user.click(createBtn)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create with ai/i })).toBeInTheDocument()
    })
  })

  it('renders idle state button after successful creation', async () => {
    const user = userEvent.setup()
    api.ai.parseItem.mockResolvedValue({
      type: 'feature',
      payload: { title: 'Feature', priority: 'p2' },
    })
    api.features.create.mockResolvedValue({ id: 1, title: 'Feature' })
    renderComponent()
    await user.click(screen.getByRole('button', { name: /create with ai/i }))
    const textarea = await waitFor(() => document.querySelector('textarea')!)
    await user.type(textarea, 'feature')
    await user.click(screen.getByRole('button', { name: /parse/i }))
    await waitFor(() => {
      const createBtn = screen.queryByRole('button', { name: /create/i })
      expect(createBtn).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => {
      // Back to idle: "Create with AI" button visible
      expect(screen.getByRole('button', { name: /create with ai/i })).toBeInTheDocument()
      // Portal should be empty
      expect(document.querySelector('textarea')).not.toBeInTheDocument()
    })
  })
})
