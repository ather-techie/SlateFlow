import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: {
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('./featureFlags.js', () => ({
  isEnabled: vi.fn(),
}))

vi.mock('./email.js', () => ({
  sendEmail: vi.fn(),
  dueDateEmailHtml: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('dueDateJob', () => {
  describe('interval registration', () => {
    it('registers setInterval with 60-minute interval (3,600,000 ms)', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      const { startDueDateJob } = await import('./dueDateJob.js')
      startDueDateJob()

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 60 * 1000 // 3,600,000 ms
      )

      setIntervalSpy.mockRestore()
    })
  })

  describe('job execution', () => {
    it('checks email_notifications flag on each execution', async () => {
      const { isEnabled } = await import('./featureFlags.js')

      vi.mocked(isEnabled).mockResolvedValue(false)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()

      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>

      await callback()

      expect(vi.mocked(isEnabled)).toHaveBeenCalledWith('email_notifications')

      setIntervalSpy.mockRestore()
    })

    it('skips DB query when email_notifications is disabled', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')

      vi.mocked(isEnabled).mockResolvedValue(false)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(db.all)).not.toHaveBeenCalled()

      setIntervalSpy.mockRestore()
    })

    it('queries DB when email_notifications is enabled', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([])

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(db.all)).toHaveBeenCalled()

      setIntervalSpy.mockRestore()
    })
  })

  describe('due date query', () => {
    it('queries for cards and tasks with UNION ALL', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([])

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      const query = vi.mocked(db.all).mock.calls[0][0]
      expect(query).toContain('UNION ALL')
      expect(query).toContain('FROM cards')
      expect(query).toContain('FROM tasks')

      setIntervalSpy.mockRestore()
    })

    it('filters for items due within 25 hours', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([])

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      const query = vi.mocked(db.all).mock.calls[0][0]
      expect(query).toContain('+25 hours')

      setIntervalSpy.mockRestore()
    })

    it('filters for items without recent reminders', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([])

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      const query = vi.mocked(db.all).mock.calls[0][0]
      expect(query).toContain('due_reminder_sent_at IS NULL')
      expect(query).toContain('-20 hours')

      setIntervalSpy.mockRestore()
    })

    it('filters for users with email_notifications enabled', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([])

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      const query = vi.mocked(db.all).mock.calls[0][0]
      expect(query).toContain('email_notifications = 1')

      setIntervalSpy.mockRestore()
    })
  })

  describe('email sending', () => {
    it('sends email for each due item', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail, dueDateEmailHtml } = await import('./email.js')

      const dueItems = [
        {
          id: 1,
          title: 'Task 1',
          due_date: '2025-05-28T10:00:00Z',
          email: 'user1@example.com',
          email_notifications: 1,
          kind: 'card' as const,
        },
        {
          id: 2,
          title: 'Task 2',
          due_date: '2025-05-29T14:00:00Z',
          email: 'user2@example.com',
          email_notifications: 1,
          kind: 'task' as const,
        },
      ]

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue(dueItems)
      vi.mocked(dueDateEmailHtml).mockReturnValue('<p>Reminder</p>')
      vi.mocked(db.run).mockResolvedValue(undefined)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2)

      setIntervalSpy.mockRestore()
    })

    it('sends email to correct recipient', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail, dueDateEmailHtml } = await import('./email.js')

      const dueItem = {
        id: 42,
        title: 'Important task',
        due_date: '2025-05-28T10:00:00Z',
        email: 'test@example.com',
        email_notifications: 1,
        kind: 'card' as const,
      }

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([dueItem])
      vi.mocked(dueDateEmailHtml).mockReturnValue('<p>Reminder</p>')
      vi.mocked(db.run).mockResolvedValue(undefined)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
        })
      )

      setIntervalSpy.mockRestore()
    })

    it('includes task title in subject line', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail, dueDateEmailHtml } = await import('./email.js')

      const dueItem = {
        id: 1,
        title: 'Fix critical bug',
        due_date: '2025-05-28T10:00:00Z',
        email: 'user@example.com',
        email_notifications: 1,
        kind: 'card' as const,
      }

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([dueItem])
      vi.mocked(dueDateEmailHtml).mockReturnValue('<p>HTML</p>')
      vi.mocked(db.run).mockResolvedValue(undefined)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Fix critical bug'),
        })
      )

      setIntervalSpy.mockRestore()
    })
  })

  describe('timestamp updates', () => {
    it('updates due_reminder_sent_at for cards', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail, dueDateEmailHtml } = await import('./email.js')

      const dueItem = {
        id: 100,
        title: 'Card task',
        due_date: '2025-05-28T10:00:00Z',
        email: 'user@example.com',
        email_notifications: 1,
        kind: 'card' as const,
      }

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([dueItem])
      vi.mocked(dueDateEmailHtml).mockReturnValue('<p>HTML</p>')
      vi.mocked(db.run).mockResolvedValue(undefined)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(db.run)).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cards'),
        100
      )

      setIntervalSpy.mockRestore()
    })

    it('updates due_reminder_sent_at for tasks', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail, dueDateEmailHtml } = await import('./email.js')

      const dueItem = {
        id: 200,
        title: 'Task item',
        due_date: '2025-05-28T10:00:00Z',
        email: 'user@example.com',
        email_notifications: 1,
        kind: 'task' as const,
      }

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([dueItem])
      vi.mocked(dueDateEmailHtml).mockReturnValue('<p>HTML</p>')
      vi.mocked(db.run).mockResolvedValue(undefined)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(db.run)).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks'),
        200
      )

      setIntervalSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('catches errors and logs them', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const testError = new Error('DB connection failed')
      vi.mocked(isEnabled).mockRejectedValue(testError)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[dueDateJob] error:',
        testError
      )

      consoleErrorSpy.mockRestore()
      setIntervalSpy.mockRestore()
    })

    it('does not rethrow caught errors', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      vi.spyOn(console, 'error').mockImplementation(() => {})

      vi.mocked(isEnabled).mockRejectedValue(new Error('Test error'))

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>

      // Should not throw
      await expect(callback()).resolves.not.toThrow()

      setIntervalSpy.mockRestore()
      vi.restoreAllMocks()
    })
  })

  describe('integration flow', () => {
    it('complete flow: enabled → query → send → update', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail, dueDateEmailHtml } = await import('./email.js')

      const dueItem = {
        id: 50,
        title: 'Integration test',
        due_date: '2025-05-30T10:00:00Z',
        email: 'integration@example.com',
        email_notifications: 1,
        kind: 'card' as const,
      }

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([dueItem])
      vi.mocked(dueDateEmailHtml).mockReturnValue('<p>Reminder</p>')
      vi.mocked(sendEmail).mockResolvedValue(undefined)
      vi.mocked(db.run).mockResolvedValue(undefined)

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>
      await callback()

      expect(vi.mocked(isEnabled)).toHaveBeenCalled()
      expect(vi.mocked(db.all)).toHaveBeenCalled()
      expect(vi.mocked(dueDateEmailHtml)).toHaveBeenCalled()
      expect(vi.mocked(sendEmail)).toHaveBeenCalled()
      expect(vi.mocked(db.run)).toHaveBeenCalled()

      setIntervalSpy.mockRestore()
    })

    it('handles empty results gracefully', async () => {
      const { isEnabled } = await import('./featureFlags.js')
      const { db } = await import('../db/index.js')
      const { sendEmail } = await import('./email.js')

      vi.mocked(isEnabled).mockResolvedValue(true)
      vi.mocked(db.all).mockResolvedValue([])

      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      const { startDueDateJob } = await import('./dueDateJob.js')

      startDueDateJob()
      const callback = setIntervalSpy.mock.calls[0][0] as () => Promise<void>

      await expect(callback()).resolves.not.toThrow()
      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()

      setIntervalSpy.mockRestore()
    })
  })
})
