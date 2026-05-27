import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  delete process.env.SMTP_HOST
  delete process.env.SMTP_PORT
  delete process.env.SMTP_SECURE
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  delete process.env.SMTP_FROM
  delete process.env.OAUTH_FRONTEND_URL
  delete process.env.OAUTH_REDIRECT_BASE_URL
})

describe('isEmailConfigured', () => {
  it('returns true when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    const { isEmailConfigured } = await import('./email.js')
    expect(isEmailConfigured()).toBe(true)
  })

  it('returns false when SMTP_HOST is not set', async () => {
    delete process.env.SMTP_HOST
    const { isEmailConfigured } = await import('./email.js')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when SMTP_HOST is empty string', async () => {
    process.env.SMTP_HOST = ''
    const { isEmailConfigured } = await import('./email.js')
    expect(isEmailConfigured()).toBe(false)
  })
})

describe('sendEmail', () => {
  it('calls nodemailer.createTransport when sending email', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    const nodemailer = await import('nodemailer')
    const mockSendMail = vi.fn().mockResolvedValue({})
    vi.mocked(nodemailer.default.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as any)

    const { sendEmail } = await import('./email.js')
    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    })

    expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalled()
    expect(mockSendMail).toHaveBeenCalled()
  })

  it('passes correct parameters to sendMail', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_FROM = 'sender@example.com'
    const nodemailer = await import('nodemailer')
    const mockSendMail = vi.fn().mockResolvedValue({})
    vi.mocked(nodemailer.default.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as any)

    const { sendEmail } = await import('./email.js')
    await sendEmail({
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>HTML content</p>',
      text: 'Text content',
    })

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>HTML content</p>',
        text: 'Text content',
      })
    )
  })

  it('uses default SMTP_FROM when not set', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    delete process.env.SMTP_FROM
    const nodemailer = await import('nodemailer')
    const mockSendMail = vi.fn().mockResolvedValue({})
    vi.mocked(nodemailer.default.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as any)

    const { sendEmail } = await import('./email.js')
    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    })

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SlateFlow <noreply@example.com>',
      })
    )
  })

  it('catches and logs errors without rethrowing', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    const nodemailer = await import('nodemailer')
    const error = new Error('SMTP failed')
    const mockSendMail = vi.fn().mockRejectedValue(error)
    vi.mocked(nodemailer.default.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as any)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { sendEmail } = await import('./email.js')
    // Should not throw
    await expect(sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    })).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledWith('[email] failed to send:', error)
    consoleErrorSpy.mockRestore()
  })

  it('throws when SMTP_HOST is not configured and sendEmail is called', async () => {
    delete process.env.SMTP_HOST
    const { sendEmail } = await import('./email.js')

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[email] failed to send:',
      expect.any(Error)
    )
    consoleErrorSpy.mockRestore()
  })
})

describe('mentionEmailHtml', () => {
  it('includes mentioner name in output', async () => {
    const { mentionEmailHtml } = await import('./email.js')
    const html = mentionEmailHtml({
      mentionedBy: 'Alice',
      cardTitle: 'My Card',
      cardId: 1,
      commentId: 100,
    })

    expect(html).toContain('Alice')
  })

  it('includes card title in output', async () => {
    const { mentionEmailHtml } = await import('./email.js')
    const html = mentionEmailHtml({
      mentionedBy: 'Bob',
      cardTitle: 'Important Task',
      cardId: 1,
      commentId: 100,
    })

    expect(html).toContain('Important Task')
  })

  it('includes comment anchor link with correct ID', async () => {
    const { mentionEmailHtml } = await import('./email.js')
    const html = mentionEmailHtml({
      mentionedBy: 'Charlie',
      cardTitle: 'Task',
      cardId: 42,
      commentId: 999,
    })

    expect(html).toContain('#comment-999')
  })

  it('includes card link', async () => {
    process.env.OAUTH_REDIRECT_BASE_URL = 'https://app.example.com'
    const { mentionEmailHtml } = await import('./email.js')
    const html = mentionEmailHtml({
      mentionedBy: 'Dave',
      cardTitle: 'Task',
      cardId: 42,
      commentId: 100,
    })

    expect(html).toContain('/projects/default/board?card=42')
  })
})

describe('assignmentEmailHtml', () => {
  it('includes assignee name in output', async () => {
    const { assignmentEmailHtml } = await import('./email.js')
    const html = assignmentEmailHtml({
      assignedBy: 'Manager',
      cardTitle: 'Task',
      cardId: 1,
      type: 'card',
    })

    expect(html).toContain('Manager')
  })

  it('includes card title in output', async () => {
    const { assignmentEmailHtml } = await import('./email.js')
    const html = assignmentEmailHtml({
      assignedBy: 'Manager',
      cardTitle: 'Fix bug in login',
      cardId: 1,
      type: 'card',
    })

    expect(html).toContain('Fix bug in login')
  })

  it('shows "story" label for card type', async () => {
    const { assignmentEmailHtml } = await import('./email.js')
    const html = assignmentEmailHtml({
      assignedBy: 'Manager',
      cardTitle: 'Task',
      cardId: 1,
      type: 'card',
    })

    expect(html).toContain('story')
    expect(html).not.toContain('task:')
  })

  it('shows "task" label for task type', async () => {
    const { assignmentEmailHtml } = await import('./email.js')
    const html = assignmentEmailHtml({
      assignedBy: 'Manager',
      cardTitle: 'Subtask',
      cardId: 1,
      type: 'task',
    })

    expect(html).toContain('task')
    expect(html).not.toContain('story:')
  })

  it('includes card link', async () => {
    process.env.OAUTH_REDIRECT_BASE_URL = 'https://example.com'
    const { assignmentEmailHtml } = await import('./email.js')
    const html = assignmentEmailHtml({
      assignedBy: 'Manager',
      cardTitle: 'Task',
      cardId: 55,
      type: 'card',
    })

    expect(html).toContain('/projects/default/board?card=55')
  })
})

describe('dueDateEmailHtml', () => {
  it('includes card title in output', async () => {
    const { dueDateEmailHtml } = await import('./email.js')
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Urgent Task',
      cardId: 1,
      dueDate: futureDate,
      type: 'card',
    })

    expect(html).toContain('Urgent Task')
  })

  it('shows "story" label for card type', async () => {
    const { dueDateEmailHtml } = await import('./email.js')
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Task',
      cardId: 1,
      dueDate: futureDate,
      type: 'card',
    })

    expect(html).toContain('story')
  })

  it('shows "task" label for task type', async () => {
    const { dueDateEmailHtml } = await import('./email.js')
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Subtask',
      cardId: 1,
      dueDate: futureDate,
      type: 'task',
    })

    expect(html).toContain('task')
  })

  it('includes card link', async () => {
    process.env.OAUTH_REDIRECT_BASE_URL = 'https://example.com'
    const { dueDateEmailHtml } = await import('./email.js')
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Task',
      cardId: 77,
      dueDate: futureDate,
      type: 'card',
    })

    expect(html).toContain('/projects/default/board?card=77')
  })

  it('handles overdue dates', async () => {
    const { dueDateEmailHtml } = await import('./email.js')
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Task',
      cardId: 1,
      dueDate: pastDate,
      type: 'card',
    })

    expect(html).toContain('overdue')
  })

  it('handles due today', async () => {
    const { dueDateEmailHtml } = await import('./email.js')
    const now = new Date().toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Task',
      cardId: 1,
      dueDate: now,
      type: 'card',
    })

    expect(html).toContain('today')
  })

  it('handles future dates with hour precision', async () => {
    const { dueDateEmailHtml } = await import('./email.js')
    const in5Hours = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    const html = dueDateEmailHtml({
      cardTitle: 'Task',
      cardId: 1,
      dueDate: in5Hours,
      type: 'card',
    })

    expect(html).toContain('hours')
  })
})
