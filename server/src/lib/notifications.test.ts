import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('./eventBus.js', () => ({
  emitBoardEvent: vi.fn(),
}))

vi.mock('./email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  assignmentEmailHtml: vi.fn().mockReturnValue('<html>assignment</html>'),
  mentionEmailHtml: vi.fn().mockReturnValue('<html>mention</html>'),
}))

vi.mock('./featureFlags.js', () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
}))

import { db } from '../db/index.js'
import { emitBoardEvent } from './eventBus.js'
import { sendEmail, assignmentEmailHtml } from './email.js'
import { isEnabled } from './featureFlags.js'
import { notifyAssignment, notifyMentions } from './notifications'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.get).mockResolvedValue(undefined)
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(isEnabled).mockResolvedValue(false)
})

describe('notifyAssignment', () => {
  it('creates notification row for card assignment', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 5,
      email: 'john@example.com',
      email_notifications: 1,
    })

    await notifyAssignment({
      assigneeName: 'John Doe',
      assignedById: 1,
      assignedByName: 'Admin',
      entityType: 'card',
      entityId: 10,
      entityTitle: 'Fix login bug',
    })

    expect(vi.mocked(db.run)).toHaveBeenCalledWith(
      'INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)',
      5,
      'assignment',
      'card',
      10,
      'Admin assigned you to "Fix login bug"',
    )
  })

  it('returns early if assignee not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)

    await notifyAssignment({
      assigneeName: 'Unknown User',
      assignedById: 1,
      assignedByName: 'Admin',
      entityType: 'card',
      entityId: 10,
      entityTitle: 'Fix login bug',
    })

    expect(vi.mocked(db.run)).not.toHaveBeenCalled()
  })

  it('returns early if user assigned themselves', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 5, // same id as assignedById
      email: 'john@example.com',
      email_notifications: 1,
    })

    await notifyAssignment({
      assigneeName: 'John Doe',
      assignedById: 5,
      assignedByName: 'John Doe',
      entityType: 'card',
      entityId: 10,
      entityTitle: 'Review PR',
    })

    expect(vi.mocked(db.run)).not.toHaveBeenCalled()
  })

  it('emits notification SSE event after creating notification', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 6,
      email: 'jane@example.com',
      email_notifications: 1,
    })

    await notifyAssignment({
      assigneeName: 'Jane Smith',
      assignedById: 2,
      assignedByName: 'Reviewer',
      entityType: 'card',
      entityId: 20,
      entityTitle: 'Implement feature',
    })

    expect(emitBoardEvent).toHaveBeenCalledWith({
      type: 'notification',
      userId: 6,
      data: expect.objectContaining({ type: 'assignment', card_id: 20 }),
    })
  })

  it('sends email if email_notifications enabled and user opted in', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 7,
      email: 'alice@example.com',
      email_notifications: 1,
    })
    vi.mocked(isEnabled).mockResolvedValueOnce(true)

    await notifyAssignment({
      assigneeName: 'Alice',
      assignedById: 3,
      assignedByName: 'Bob',
      entityType: 'task',
      entityId: 30,
      entityTitle: 'Code review',
    })

    expect(sendEmail).toHaveBeenCalled()
  })

  it('does not send email if user has opted out', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 8,
      email: 'bob@example.com',
      email_notifications: 0,
    })
    vi.mocked(isEnabled).mockResolvedValueOnce(true)

    const sendEmailCallsBefore = vi.mocked(sendEmail).mock.calls.length

    await notifyAssignment({
      assigneeName: 'Bob',
      assignedById: 3,
      assignedByName: 'Charlie',
      entityType: 'card',
      entityId: 40,
      entityTitle: 'Fix bug',
    })

    expect(vi.mocked(sendEmail).mock.calls.length).toBe(sendEmailCallsBefore)
  })
})

describe('notifyMentions', () => {
  it('parses mentions from comment body and creates notifications', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 10, display_name: 'alice', email: 'alice@example.com', email_notifications: 1 },
      { id: 11, display_name: 'bob', email: 'bob@example.com', email_notifications: 1 },
    ])

    await notifyMentions({
      commentBody: 'Hey @alice and @bob, can you review?',
      mentionedByName: 'Charlie',
      mentionedById: 5,
      cardId: 100,
      cardTitle: 'Feature proposal',
      commentId: 500,
    })

    const notificationCalls = vi.mocked(db.run).mock.calls.filter(
      (call) => (call[0] as string).includes('INSERT INTO notifications'),
    )
    expect(notificationCalls.length).toBe(2)
  })

  it('returns early if no mentions found', async () => {
    const runCallsBefore = vi.mocked(db.run).mock.calls.length

    await notifyMentions({
      commentBody: 'No mentions in this comment',
      mentionedByName: 'Dave',
      mentionedById: 6,
      cardId: 200,
      cardTitle: 'Bug fix',
      commentId: 600,
    })

    expect(vi.mocked(db.run).mock.calls.length).toBe(runCallsBefore)
  })

  it('excludes author from mentions', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([
      // mentionedById is 7, so they should be excluded by the SQL query
      { id: 8, display_name: 'alice', email: 'alice@example.com', email_notifications: 1 },
    ])

    await notifyMentions({
      commentBody: '@alice and @author please review',
      mentionedByName: 'Author',
      mentionedById: 7,
      cardId: 300,
      cardTitle: 'Code review',
      commentId: 700,
    })

    expect(vi.mocked(db.all)).toHaveBeenCalled()
    // The SQL should exclude the author (mentionedById)
    const allCall = vi.mocked(db.all).mock.calls[0]
    expect(allCall[allCall.length - 1]).toBe(7) // last param is mentionedById
  })

  it('sends mention emails if email_notifications enabled', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 40, display_name: 'frank', email: 'frank@example.com', email_notifications: 1 },
    ])
    vi.mocked(isEnabled).mockResolvedValueOnce(true)

    await notifyMentions({
      commentBody: '@frank your input needed',
      mentionedByName: 'Grace',
      mentionedById: 8,
      cardId: 400,
      cardTitle: 'Decision needed',
      commentId: 800,
    })

    expect(sendEmail).toHaveBeenCalled()
  })

  it('emits notification SSE event for each mentioned user', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 50, display_name: 'helen', email: 'helen@example.com', email_notifications: 1 },
      { id: 51, display_name: 'ivan', email: 'ivan@example.com', email_notifications: 1 },
    ])

    await notifyMentions({
      commentBody: '@helen @ivan review this PR',
      mentionedByName: 'Jack',
      mentionedById: 9,
      cardId: 500,
      cardTitle: 'PR ready for review',
      commentId: 900,
    })

    const eventCalls = vi.mocked(emitBoardEvent).mock.calls.filter(
      (call) => (call[0] as any)?.type === 'notification',
    )
    expect(eventCalls.length).toBe(2)
  })
})
