import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ok, err, parseId, zodErr } from '../lib/response.js'
import { emitBoardEvent } from '../lib/eventBus.js'
import { isEnabled } from '../lib/featureFlags.js'
import { sendEmail, assignmentEmailHtml } from '../lib/email.js'

const cards = new Hono()

const LaneCreateSchema = z.object({
  title:        z.string().min(1, 'title is required').max(500),
  description:  z.string().max(5000).optional().default(''),
  priority:     z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  story_points: z.number().int().min(1).max(13).nullable().optional(),
  assignee:     z.string().max(200).nullable().optional(),
  sprint_id:    z.number().int().positive().nullable().optional(),
  feature_id:   z.number().int().positive().nullable().optional(),
  label_ids:    z.array(z.number().int().positive()).optional(),
})

const ColCreateSchema = z.object({
  title:        z.string().min(1, 'title is required').max(500),
  description:  z.string().max(5000).optional().default(''),
  priority:     z.enum(['p0', 'p1', 'p2', 'p3']).optional().default('p2'),
  story_points: z.number().int().min(0).max(999).nullable().optional(),
  assignee:     z.string().max(200).nullable().optional(),
  sprint_id:    z.number().int().positive().nullable().optional(),
  feature_id:   z.number().int().positive().nullable().optional(),
})

const UpdateSchema = z.object({
  title:        z.string().min(1).max(500).optional(),
  description:  z.string().max(5000).optional(),
  priority:     z.enum(['p0', 'p1', 'p2', 'p3']).optional(),
  story_points: z.number().int().min(0).max(999).nullable().optional(),
  assignee:     z.string().max(200).nullable().optional(),
  sprint_id:    z.number().int().positive().nullable().optional(),
  feature_id:   z.number().int().positive().nullable().optional(),
  due_date:     z.string().nullable().optional(),
})

const TaskCreateSchema = z.object({
  title:       z.string().min(1, 'title is required').max(500),
  description: z.string().max(5000).optional().default(''),
  status:      z.enum(['to-do', 'in-progress', 'done']).optional().default('to-do'),
  assignee:    z.string().max(200).nullable().optional(),
})

const TaskUpdateSchema = z.object({
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status:      z.enum(['to-do', 'in-progress', 'done']).optional(),
  assignee:    z.string().max(200).nullable().optional(),
  due_date:    z.string().nullable().optional(),
})

const TaskReorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
})

const MoveSchema = z.object({
  lane_id:  z.number().int().positive('lane_id is required'),
  position: z.number().int().min(0).optional(),
})

type CardRow = { id: number; column_id: number | null; swim_lane_id: number | null }

cards.get('/lanes/:id/cards', async (c) => {
  const laneId = parseId(c.req.param('id'))
  if (!laneId) return err(c, 'invalid id', 400)

  const lane = await db.get('SELECT id FROM swim_lanes WHERE id = ?', laneId)
  if (!lane) return err(c, 'lane not found', 404)

  const rows = await db.all('SELECT * FROM cards WHERE swim_lane_id = ? ORDER BY position, id', laneId)
  return ok(c, rows)
})

cards.post('/lanes/:id/cards', async (c) => {
  const laneId = parseId(c.req.param('id'))
  if (!laneId) return err(c, 'invalid id', 400)

  const lane = await db.get<{ id: number; project_id: number }>('SELECT id, project_id FROM swim_lanes WHERE id = ?', laneId)
  if (!lane) return err(c, 'lane not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = LaneCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, priority, story_points, assignee, sprint_id, feature_id, label_ids } = parsed.data

  let resolvedFeatureId: number | null = feature_id ?? null
  if (!resolvedFeatureId) {
    const def = await db.get<{ id: number }>('SELECT id FROM features WHERE project_id = ? AND is_default = 1 LIMIT 1', lane.project_id)
    if (def) resolvedFeatureId = def.id
  }

  let resolvedSprintId: number | null = sprint_id ?? null
  if (!resolvedSprintId) {
    const defSprint = await db.get<{ id: number }>('SELECT id FROM sprints WHERE project_id = ? AND is_default = 1 LIMIT 1', lane.project_id)
    if (defSprint) resolvedSprintId = defSprint.id
  }

  const maxPosRow = await db.get<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE swim_lane_id = ?', laneId)

  const user = c.get('user')
  const result = await db.transaction(async () => {
    const { lastID } = await db.run(
      `INSERT INTO cards
         (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, assignee, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      laneId, resolvedSprintId, resolvedFeatureId, title, description, priority,
      story_points ?? null, assignee ?? null, (maxPosRow?.m ?? -1) + 1,
    )

    if (label_ids?.length) {
      for (const labelId of label_ids) {
        await db.run('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)', lastID, labelId)
      }
    }

    await db.run(
      "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'create', ?)",
      lastID, JSON.stringify({ swim_lane_id: laneId }),
    )

    // Send assignment notification if set on creation
    if (assignee) {
      const assigneeUser = await db.get<{ id: number; email: string; email_notifications: number }>(
        `SELECT id, email, email_notifications FROM users
         WHERE display_name = ? AND deleted_at IS NULL`,
        assignee,
      )

      if (assigneeUser && assigneeUser.id !== user.id) {
        await db.run(
          "INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, 'assignment', 'card', ?, ?)",
          assigneeUser.id, lastID, `${user.display_name} assigned you to "${title}"`,
        )
        emitBoardEvent({ type: 'notification', userId: assigneeUser.id, data: { type: 'assignment', card_id: lastID } })

        const emailEnabled = await isEnabled('email_notifications')
        if (emailEnabled && assigneeUser.email_notifications) {
          sendEmail({
            to: assigneeUser.email,
            subject: `You've been assigned to "${title}"`,
            html: assignmentEmailHtml({
              assignedBy: user.display_name,
              cardTitle: title,
              cardId: lastID as number,
              type: 'card',
            }),
          }).catch(console.error)
        }
      }
    }

    return await db.get('SELECT * FROM cards WHERE id = ?', lastID)
  })()

  emitBoardEvent({ type: 'card:created', projectId: lane.project_id, data: result })
  return ok(c, result, 201)
})

cards.get('/columns/:id/cards', async (c) => {
  const columnId = parseId(c.req.param('id'))
  if (!columnId) return err(c, 'invalid id', 400)

  const col = await db.get('SELECT id FROM columns WHERE id = ?', columnId)
  if (!col) return err(c, 'column not found', 404)

  const rows = await db.all('SELECT * FROM cards WHERE column_id = ? ORDER BY position, id', columnId)
  return ok(c, rows)
})

cards.post('/columns/:id/cards', async (c) => {
  const columnId = parseId(c.req.param('id'))
  if (!columnId) return err(c, 'invalid id', 400)

  const col = await db.get<{ id: number; project_id: number }>('SELECT id, project_id FROM columns WHERE id = ?', columnId)
  if (!col) return err(c, 'column not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = ColCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, priority, story_points, assignee, sprint_id } = parsed.data

  let resolvedColSprintId: number | null = sprint_id ?? null
  if (!resolvedColSprintId) {
    const defSprint = await db.get<{ id: number }>('SELECT id FROM sprints WHERE project_id = ? AND is_default = 1 LIMIT 1', col.project_id)
    if (defSprint) resolvedColSprintId = defSprint.id
  }

  const maxPosRow = await db.get<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?', columnId)

  const { lastID } = await db.run(
    `INSERT INTO cards
       (column_id, sprint_id, title, description, priority, story_points, assignee, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    columnId, resolvedColSprintId, title, description, priority,
    story_points ?? null, assignee ?? null, (maxPosRow?.m ?? -1) + 1,
  )

  await db.run(
    "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'create', ?)",
    lastID, JSON.stringify({ column_id: columnId }),
  )

  return ok(c, await db.get('SELECT * FROM cards WHERE id = ?', lastID), 201)
})

cards.get('/cards/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT * FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  const [labels, comments, activity] = await Promise.all([
    db.all(
      `SELECT l.* FROM labels l
       JOIN card_labels cl ON cl.label_id = l.id
       WHERE cl.card_id = ?
       ORDER BY l.id`,
      id,
    ),
    db.all('SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC', id),
    db.all('SELECT * FROM activity_log WHERE card_id = ? ORDER BY created_at DESC', id),
  ])

  return ok(c, { ...(card as object), labels, comments, activity })
})

cards.patch('/cards/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<Record<string, unknown>>('SELECT * FROM cards WHERE id = ?', id)
  if (!existing) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const allowed = ['title', 'description', 'priority', 'story_points', 'assignee', 'sprint_id', 'feature_id', 'due_date'] as const
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`)
      vals.push(fields[key] ?? null)
    }
  }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  await db.transaction(async () => {
    for (const key of allowed) {
      if (key in fields) {
        await db.run(
          "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'field_changed', ?)",
          id, JSON.stringify({ field: key, from: existing[key] ?? null, to: fields[key] ?? null }),
        )
      }
    }
  })()

  // Handle assignment change notification/email
  const user = c.get('user')
  if ('assignee' in fields && fields.assignee && fields.assignee !== existing.assignee) {
    const assigneeUser = await db.get<{ id: number; email: string; email_notifications: number }>(
      `SELECT id, email, email_notifications FROM users
       WHERE display_name = ? AND deleted_at IS NULL`,
      fields.assignee,
    )

    if (assigneeUser && assigneeUser.id !== user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, 'assignment', 'card', ?, ?)",
        assigneeUser.id, id, `${user.display_name} assigned you to "${existing.title}"`,
      )
      emitBoardEvent({ type: 'notification', userId: assigneeUser.id, data: { type: 'assignment', card_id: id } })

      const emailEnabled = await isEnabled('email_notifications')
      if (emailEnabled && assigneeUser.email_notifications) {
        sendEmail({
          to: assigneeUser.email,
          subject: `You've been assigned to "${existing.title}"`,
          html: assignmentEmailHtml({
            assignedBy: user.display_name,
            cardTitle: existing.title as string,
            cardId: id,
            type: 'card',
          }),
        }).catch(console.error)
      }
    }
  }

  const updated = await db.get<{ swim_lane_id?: number }>('SELECT * FROM cards WHERE id = ?', id)
  if (updated) {
    const laneRow = updated.swim_lane_id
      ? await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', updated.swim_lane_id)
      : undefined
    if (laneRow) emitBoardEvent({ type: 'card:updated', projectId: laneRow.project_id, data: updated })
  }
  return ok(c, updated)
})

cards.delete('/cards/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get<{ id: number; swim_lane_id: number | null }>('SELECT id, swim_lane_id FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  const laneRow = card.swim_lane_id
    ? await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', card.swim_lane_id)
    : undefined

  await db.run('DELETE FROM cards WHERE id = ?', id)

  if (laneRow) emitBoardEvent({ type: 'card:deleted', projectId: laneRow.project_id, data: { id } })
  return ok(c, { id })
})

cards.patch('/cards/:id/move', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const card = await db.get<CardRow>('SELECT * FROM cards WHERE id = ?', id)
  if (!card) return err(c, 'card not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = MoveSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { lane_id, position } = parsed.data

  const lane = await db.get('SELECT id FROM swim_lanes WHERE id = ?', lane_id)
  if (!lane) return err(c, 'lane not found', 404)

  await db.transaction(async () => {
    const siblings = await db.all<{ id: number }>(
      'SELECT id FROM cards WHERE swim_lane_id = ? AND id != ? ORDER BY position, id',
      lane_id, id,
    )

    const ids = siblings.map(r => r.id)
    const targetPos = position !== undefined
      ? Math.max(0, Math.min(position, ids.length))
      : ids.length
    ids.splice(targetPos, 0, id)

    for (let i = 0; i < ids.length; i++) {
      await db.run('UPDATE cards SET position = ? WHERE id = ?', i, ids[i])
    }

    await db.run(
      "UPDATE cards SET swim_lane_id = ?, updated_at = datetime('now') WHERE id = ?",
      lane_id, id,
    )

    await db.run(
      "INSERT INTO activity_log (card_id, action, meta) VALUES (?, 'move', ?)",
      id, JSON.stringify({ from_lane_id: card.swim_lane_id, to_lane_id: lane_id, position: targetPos }),
    )
  })()

  const movedCard = await db.get('SELECT * FROM cards WHERE id = ?', id)
  const movedLane = await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', lane_id)
  if (movedLane) emitBoardEvent({ type: 'card:moved', projectId: movedLane.project_id, data: movedCard })
  return ok(c, movedCard)
})

cards.get('/projects/:id/tasks', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const project = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!project) return err(c, 'project not found', 404)

  const rows = await db.all(
    `SELECT t.*, c.title as story_title
     FROM tasks t
     JOIN cards c ON c.id = t.story_id
     LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     WHERE sl.project_id = ? OR EXISTS (
       SELECT 1 FROM columns col WHERE col.id = c.column_id AND col.project_id = ?
     )
     ORDER BY t.story_id, t.position, t.id`,
    projectId, projectId,
  )

  return ok(c, rows)
})

cards.get('/cards/:id/tasks', async (c) => {
  const storyId = parseId(c.req.param('id'))
  if (!storyId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', storyId)
  if (!card) return err(c, 'story not found', 404)

  const rows = await db.all('SELECT * FROM tasks WHERE story_id = ? ORDER BY position, id', storyId)
  return ok(c, rows)
})

cards.post('/cards/:id/tasks', async (c) => {
  const storyId = parseId(c.req.param('id'))
  if (!storyId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', storyId)
  if (!card) return err(c, 'story not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = TaskCreateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { title, description, status, assignee } = parsed.data

  const maxPosRow = await db.get<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE story_id = ?', storyId)

  const { lastID } = await db.run(
    `INSERT INTO tasks (story_id, title, description, status, assignee, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
    storyId, title, description, status, assignee ?? null, (maxPosRow?.m ?? -1) + 1,
  )

  return ok(c, await db.get('SELECT * FROM tasks WHERE id = ?', lastID), 201)
})

cards.patch('/tasks/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const existing = await db.get<Record<string, unknown>>('SELECT * FROM tasks WHERE id = ?', id)
  if (!existing) return err(c, 'task not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = TaskUpdateSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const fields = parsed.data
  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []

  const allowed = ['title', 'description', 'status', 'assignee', 'due_date'] as const
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`)
      vals.push(fields[key] ?? null)
    }
  }

  if (sets.length === 1) return err(c, 'no fields to update', 400)

  vals.push(id)
  await db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  // Handle assignment change notification/email for tasks
  const user = c.get('user')
  if ('assignee' in fields && fields.assignee && fields.assignee !== existing.assignee) {
    const assigneeUser = await db.get<{ id: number; email: string; email_notifications: number }>(
      `SELECT id, email, email_notifications FROM users
       WHERE display_name = ? AND deleted_at IS NULL`,
      fields.assignee,
    )

    if (assigneeUser && assigneeUser.id !== user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, entity_type, entity_id, message) VALUES (?, 'assignment', 'task', ?, ?)",
        assigneeUser.id, id, `${user.display_name} assigned you to "${existing.title}"`,
      )
      emitBoardEvent({ type: 'notification', userId: assigneeUser.id, data: { type: 'assignment', card_id: id } })

      const emailEnabled = await isEnabled('email_notifications')
      if (emailEnabled && assigneeUser.email_notifications) {
        sendEmail({
          to: assigneeUser.email,
          subject: `You've been assigned to task "${existing.title}"`,
          html: assignmentEmailHtml({
            assignedBy: user.display_name,
            cardTitle: existing.title as string,
            cardId: id,
            type: 'task',
          }),
        }).catch(console.error)
      }
    }
  }

  return ok(c, await db.get('SELECT * FROM tasks WHERE id = ?', id))
})

cards.delete('/tasks/:id', async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return err(c, 'invalid id', 400)

  const task = await db.get('SELECT id FROM tasks WHERE id = ?', id)
  if (!task) return err(c, 'task not found', 404)

  await db.run('DELETE FROM tasks WHERE id = ?', id)
  return ok(c, { id })
})

cards.post('/cards/:id/tasks/reorder', async (c) => {
  const storyId = parseId(c.req.param('id'))
  if (!storyId) return err(c, 'invalid id', 400)

  const card = await db.get('SELECT id FROM cards WHERE id = ?', storyId)
  if (!card) return err(c, 'story not found', 404)

  let body: unknown
  try { body = await c.req.json() } catch { return err(c, 'invalid JSON') }

  const parsed = TaskReorderSchema.safeParse(body)
  if (!parsed.success) return err(c, zodErr(parsed.error.issues), 422)

  const { ids } = parsed.data

  await db.transaction(async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.run('UPDATE tasks SET position = ? WHERE id = ? AND story_id = ?', i, ids[i], storyId)
    }
  })()

  return ok(c, await db.all('SELECT * FROM tasks WHERE story_id = ? ORDER BY position, id', storyId))
})

cards.get('/projects/:id/stories/search', async (c) => {
  const projectId = parseId(c.req.param('id'))
  if (!projectId) return err(c, 'invalid id', 400)

  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return ok(c, [])

  const rows = await db.all(
    `SELECT c.id, c.title, c.priority, c.story_points, c.assignee, c.swim_lane_id, c.sprint_id
     FROM cards c
     LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN sprints s ON s.id = c.sprint_id
     WHERE (sl.project_id = ? OR s.project_id = ?)
       AND c.title LIKE ? ESCAPE '\\'
     ORDER BY c.title
     LIMIT 20`,
    projectId, projectId, `%${q.replace(/[%_\\]/g, '\\$&')}%`,
  )

  return ok(c, rows)
})

export default cards
