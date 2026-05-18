import nodemailer from 'nodemailer'

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
    const secure = process.env.SMTP_SECURE === 'true'
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS

    if (!host) {
      throw new Error('SMTP_HOST is not configured')
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })
  }
  return transporter
}

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    const smtp = getTransporter()
    const from = process.env.SMTP_FROM || 'SlateFlow <noreply@example.com>'
    await smtp.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    })
  } catch (e) {
    console.error('[email] failed to send:', e)
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))

  if (diffHours < 0) return 'overdue'
  if (diffHours === 0) return 'today'
  if (diffHours <= 24) return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`
  const days = Math.ceil(diffHours / 24)
  return `in ${days} day${days !== 1 ? 's' : ''}`
}

function buildCardLink(cardId: number): string {
  const baseUrl = process.env.OAUTH_FRONTEND_URL?.trim() || process.env.OAUTH_REDIRECT_BASE_URL || 'http://localhost:3000'
  return `${baseUrl.replace(/\/$/, '')}/projects/default/board?card=${cardId}`
}

export function mentionEmailHtml(params: {
  mentionedBy: string
  cardTitle: string
  cardId: number
  commentId: number
}): string {
  const link = buildCardLink(params.cardId)
  return `
    <p><strong>${params.mentionedBy}</strong> mentioned you in a comment on <strong>"${params.cardTitle}"</strong>.</p>
    <p><a href="${link}#comment-${params.commentId}">View comment</a></p>
  `
}

export function assignmentEmailHtml(params: {
  assignedBy: string
  cardTitle: string
  cardId: number
  type: 'card' | 'task'
}): string {
  const link = buildCardLink(params.cardId)
  const itemType = params.type === 'card' ? 'story' : 'task'
  return `
    <p><strong>${params.assignedBy}</strong> assigned you to a ${itemType}: <strong>"${params.cardTitle}"</strong>.</p>
    <p><a href="${link}">View ${itemType}</a></p>
  `
}

export function dueDateEmailHtml(params: {
  cardTitle: string
  cardId: number
  dueDate: string
  type: 'card' | 'task'
}): string {
  const link = buildCardLink(params.cardId)
  const itemType = params.type === 'card' ? 'story' : 'task'
  const status = formatDate(params.dueDate)
  return `
    <p><strong>"${params.cardTitle}"</strong> (${itemType}) is due <strong>${status}</strong>.</p>
    <p><a href="${link}">View ${itemType}</a></p>
  `
}
