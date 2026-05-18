import { db } from '../db/index.js'
import { isEnabled } from './featureFlags.js'
import { sendEmail, dueDateEmailHtml } from './email.js'

interface DueItem {
  id: number
  title: string
  due_date: string
  email: string
  email_notifications: number
  kind: 'card' | 'task'
}

export function startDueDateJob() {
  setInterval(async () => {
    try {
      const emailEnabled = await isEnabled('email_notifications')
      if (!emailEnabled) return

      const items = await db.all<DueItem>(`
        SELECT c.id, c.title, c.due_date, u.email, u.email_notifications, 'card' as kind
        FROM cards c
        JOIN users u ON u.display_name = c.assignee AND u.deleted_at IS NULL AND u.is_active = 1
        WHERE c.due_date IS NOT NULL
          AND c.due_date <= datetime('now', '+25 hours')
          AND (c.due_reminder_sent_at IS NULL OR c.due_reminder_sent_at < datetime('now', '-20 hours'))
          AND u.email_notifications = 1
        UNION ALL
        SELECT t.id, t.title, t.due_date, u.email, u.email_notifications, 'task' as kind
        FROM tasks t
        JOIN users u ON u.display_name = t.assignee AND u.deleted_at IS NULL AND u.is_active = 1
        WHERE t.due_date IS NOT NULL
          AND t.due_date <= datetime('now', '+25 hours')
          AND (t.due_reminder_sent_at IS NULL OR t.due_reminder_sent_at < datetime('now', '-20 hours'))
          AND u.email_notifications = 1
      `)

      for (const item of items) {
        await sendEmail({
          to: item.email,
          subject: `Due date reminder: "${item.title}"`,
          html: dueDateEmailHtml({
            cardTitle: item.title,
            cardId: item.id,
            dueDate: item.due_date,
            type: item.kind,
          }),
        })

        const table = item.kind === 'card' ? 'cards' : 'tasks'
        await db.run(
          `UPDATE ${table} SET due_reminder_sent_at = datetime('now') WHERE id = ?`,
          item.id
        )
      }
    } catch (e) {
      console.error('[dueDateJob] error:', e)
    }
  }, 60 * 60 * 1000) // every 60 minutes
}
