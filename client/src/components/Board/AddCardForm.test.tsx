import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddCardForm from './AddCardForm'

describe('AddCardForm', () => {
  const mockOnAdd = vi.fn()

  const renderForm = () => {
    return render(<AddCardForm onAdd={mockOnAdd} />)
  }

  beforeEach(() => {
    mockOnAdd.mockClear()
  })

  it('renders "Add card" button initially', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /add card/i })).toBeInTheDocument()
  })

  it('does not render textarea initially', () => {
    renderForm()
    expect(screen.queryByPlaceholderText('Card title…')).not.toBeInTheDocument()
  })

  it('shows textarea when "Add card" button is clicked', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    expect(screen.getByPlaceholderText('Card title…')).toBeInTheDocument()
  })

  it('hides textarea after form is closed', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    expect(screen.getByPlaceholderText('Card title…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByPlaceholderText('Card title…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add card/i })).toBeInTheDocument()
  })

  it('renders priority select with all 4 options when form is open', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    expect(screen.getByDisplayValue('Medium')).toBeInTheDocument() // p2 is default
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('renders assignee input when form is open', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    expect(screen.getByPlaceholderText('Assignee…')).toBeInTheDocument()
  })

  it('calls onAdd with title, default priority p2, and no assignee on submit', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'New task')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledWith('New task', 'p2', undefined)
  })

  it('does not call onAdd if title is only whitespace', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), '   ')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).not.toHaveBeenCalled()
  })

  it('trims whitespace from title before passing to onAdd', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), '  Task title  ')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledWith('Task title', 'p2', undefined)
  })

  it('calls onAdd with selected priority', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'Urgent task')
    await user.selectOptions(screen.getByDisplayValue('Medium'), 'p0')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledWith('Urgent task', 'p0', undefined)
  })

  it('calls onAdd with assignee when filled', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'My task')
    await user.type(screen.getByPlaceholderText('Assignee…'), 'john')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledWith('My task', 'p2', 'john')
  })

  it('trims whitespace from assignee', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'Task')
    await user.type(screen.getByPlaceholderText('Assignee…'), '  alice  ')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledWith('Task', 'p2', 'alice')
  })

  it('passes undefined assignee if only whitespace is entered', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'Task')
    await user.type(screen.getByPlaceholderText('Assignee…'), '   ')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledWith('Task', 'p2', undefined)
  })

  it('closes form on Cancel button click', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'Task')
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockOnAdd).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Card title…')).not.toBeInTheDocument()
  })

  it('resets form fields after successful submit', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    const textarea = screen.getByPlaceholderText('Card title…')
    await user.type(textarea, 'Task')
    const select = screen.getByDisplayValue('Medium')
    await user.selectOptions(select, 'p1')
    const assigneeInput = screen.getByPlaceholderText('Assignee…')
    await user.type(assigneeInput, 'bob')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))

    // Form should close, then "Add card" button should appear again
    expect(screen.getByRole('button', { name: /add card/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Card title…')).not.toBeInTheDocument()
  })

  it('calls onAdd exactly once per submit', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    await user.type(screen.getByPlaceholderText('Card title…'), 'Task')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(mockOnAdd).toHaveBeenCalledTimes(1)
  })

  it('closes form when Escape is pressed in textarea', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    const textarea = screen.getByPlaceholderText('Card title…')
    await user.type(textarea, 'Task{Escape}')
    expect(screen.queryByPlaceholderText('Card title…')).not.toBeInTheDocument()
    expect(mockOnAdd).not.toHaveBeenCalled()
  })

  it('submits form when Enter is pressed in textarea (without Shift)', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    const textarea = screen.getByPlaceholderText('Card title…')
    await user.type(textarea, 'Task{Enter}')
    expect(mockOnAdd).toHaveBeenCalledWith('Task', 'p2', undefined)
    expect(screen.queryByPlaceholderText('Card title…')).not.toBeInTheDocument()
  })

  it('does not submit when Shift+Enter is pressed in textarea', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add card/i }))
    const textarea = screen.getByPlaceholderText('Card title…')
    await user.type(textarea, 'Task{Shift>}{Enter}{/Shift}')
    // Shift+Enter should insert a newline, not submit
    expect(mockOnAdd).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Card title…')).toBeInTheDocument()
  })
})
