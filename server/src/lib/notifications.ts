import { db } from '../db/index.js'
import { emitBoardEvent } from './eventBus.js'
import { isEnabled } from './featureFlags.js'
import { sendEmail, assignmentEmailHtml, mentionEmailHtml } from './email.js'

export async function notifyAssignment(params: {
  assigneeName: string
  assignedById: number
  assignedByName: string
  entityType: 'card' | 'task'
  entityId: number
  entityTitle: string
}): Promise<void> {
  const { assigneeName, assignedById, assignedByName, entityType, entityId, entityTitle } = params

  const assigneeUser = await db.get<{ id: number; email: string; email_notifications: number }>(
    `SELECT id, email, email_notifications FROM users
     WHERE display_name = ? AND deleted_at IS NULL`,
    assigneeName,
  )
  if (!assigneeUser || assigneeUser.id === assignedById) return

  await db.run(
    `INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)`,
    assigneeUser.id, 'assignment', entityType, entityId,
    `${assignedByName} assigned you to "${entityTitle}"`,
  )
  emitBoardEvent({ type: 'notification', userId: assigneeUser.id, data: { type: 'assignment', card_id: entityId } })

  const emailEnabled = await isEnabled('email_notifications')
  if (emailEnabled && assigneeUser.email_notifications) {
    sendEmail({
      to: assigneeUser.email,
      subject: `You've been assigned to "${entityTitle}"`,
      html: assignmentEmailHtml({ assignedBy: assignedByName, cardTitle: entityTitle, cardId: entityId, type: entityType }),
    }).catch(console.error)
  }
}

export async function notifyMentions(params: {
  commentBody: string
  mentionedByName: string
  mentionedById: number
  cardId: number
  cardTitle: string
  commentId: number
}): Promise<void> {
  const { commentBody, mentionedByName, mentionedById, cardId, cardTitle, commentId } = params

  const mentionPattern = /@([\w.-]+)/g
  const mentions: string[] = []
  let m: RegExpExecArray | null
  while ((m = mentionPattern.exec(commentBody)) !== null) {
    mentions.push(m[1].toLowerCase())
  }
  if (mentions.length === 0) return

  const placeholders = mentions.map(() => '?').join(', ')
  const mentionedUsers = await db.all<{ id: number; display_name: string; email: string; email_notifications: number }>(
    `SELECT id, display_name, email, email_notifications FROM users
     WHERE LOWER(REPLACE(REPLACE(display_name, ' ', ''), '.', '')) IN (${placeholders})
       AND deleted_at IS NULL AND id != ?`,
    ...mentions, mentionedById,
  )

  const emailEnabled = await isEnabled('email_notifications')

  for (const mentioned of mentionedUsers) {
    await db.run(
      `INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)`,
      mentioned.id, 'mention', 'comment', commentId,
      `${mentionedByName} mentioned you in a comment on "${cardTitle}"`,
    )
    emitBoardEvent({ type: 'notification', userId: mentioned.id, data: { type: 'mention', card_id: cardId, comment_id: commentId } })

    if (emailEnabled && mentioned.email_notifications) {
      sendEmail({
        to: mentioned.email,
        subject: `${mentionedByName} mentioned you on "${cardTitle}"`,
        html: mentionEmailHtml({ mentionedBy: mentionedByName, cardTitle, cardId, commentId }),
      }).catch(console.error)
    }
  }
}
