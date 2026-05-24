import { Hono } from 'hono'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'
import { requireFeature } from '../middleware/requireRole.js'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { join, parse } from 'path'

const attachments = new Hono()

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]

// Ensure uploads directory exists on startup
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {
  // ignore if it already exists
})

attachments.use('*', requireFeature('card_attachments'))

attachments.get('/cards/:id/attachments', async (c) => {
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid card id', 400)

  const card = await db.get<{ id: number; swim_lane_id: number }>(
    'SELECT id, swim_lane_id FROM cards WHERE id = ?',
    cardId
  )
  if (!card) return err(c, 'card not found', 404)

  // Resolve project from swim lane
  const lane = await db.get<{ project_id: number }>(
    'SELECT project_id FROM swim_lanes WHERE id = ?',
    card.swim_lane_id
  )
  if (!lane) return err(c, 'lane not found', 404)

  const user = c.get('user')
  const canRead = user.role === 'super_admin' || (await db.get(
    'SELECT 1 FROM project_access WHERE user_id = ? AND project_id = ? AND role IN (?, ?)',
    user.id, lane.project_id, 'contributor', 'project_admin'
  )) || (await db.get(
    'SELECT 1 FROM project_access WHERE user_id = ? AND project_id = ?',
    user.id, lane.project_id
  ))

  if (!canRead && user.role !== 'super_admin') return err(c, 'forbidden', 403)

  const attachments_list = await db.all<{
    id: number
    card_id: number
    filename: string
    original_name: string
    mime_type: string
    size: number
    uploaded_by: number | null
    uploader_name?: string
    created_at: string
  }>(
    `SELECT ca.*, u.display_name as uploader_name
     FROM card_attachments ca
     LEFT JOIN users u ON ca.uploaded_by = u.id
     WHERE ca.card_id = ?
     ORDER BY ca.created_at DESC`,
    cardId
  )

  const result = attachments_list.map(a => ({
    ...a,
    url: `/uploads/${a.filename}`,
  }))

  return ok(c, result)
})

attachments.post('/cards/:id/attachments', async (c) => {
  const user = c.get('user')
  const cardId = parseId(c.req.param('id'))
  if (!cardId) return err(c, 'invalid card id', 400)

  const card = await db.get<{ id: number; swim_lane_id: number }>(
    'SELECT id, swim_lane_id FROM cards WHERE id = ?',
    cardId
  )
  if (!card) return err(c, 'card not found', 404)

  // Resolve project from swim lane
  const lane = await db.get<{ project_id: number }>(
    'SELECT project_id FROM swim_lanes WHERE id = ?',
    card.swim_lane_id
  )
  if (!lane) return err(c, 'lane not found', 404)

  // Check write permission
  const hasAccess = user.role === 'super_admin' || (await db.get(
    'SELECT 1 FROM project_access WHERE user_id = ? AND project_id = ? AND role = ?',
    user.id, lane.project_id, 'contributor'
  )) || (await db.get(
    'SELECT 1 FROM project_access WHERE user_id = ? AND project_id = ? AND role = ?',
    user.id, lane.project_id, 'project_admin'
  ))

  if (!hasAccess && user.role !== 'super_admin') return err(c, 'forbidden', 403)

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return err(c, 'invalid form data', 400)
  }

  const file = form.get('file') as File | null
  if (!file) return err(c, 'file field is required', 400)

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return err(c, `file size exceeds 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`, 413)
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return err(c, `file type ${file.type} is not allowed`, 415)
  }

  // Generate safe filename
  const uuid = randomUUID()
  const ext = parse(file.name).ext || ''
  const sanitized = file.name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 100)
  const filename = `${uuid}-${sanitized}`

  // Write file to disk
  try {
    const buffer = await file.arrayBuffer()
    await fs.writeFile(join(UPLOADS_DIR, filename), Buffer.from(buffer))
  } catch (error) {
    console.error('Failed to write file:', error)
    return err(c, 'failed to write file to disk', 500)
  }

  // Insert into database
  const { lastID } = await db.run(
    'INSERT INTO card_attachments (card_id, filename, original_name, mime_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    cardId, filename, file.name, file.type, file.size, user.id
  )

  const attachment = await db.get<{
    id: number
    card_id: number
    filename: string
    original_name: string
    mime_type: string
    size: number
    uploaded_by: number | null
    uploader_name?: string
    created_at: string
  }>(
    `SELECT ca.*, u.display_name as uploader_name
     FROM card_attachments ca
     LEFT JOIN users u ON ca.uploaded_by = u.id
     WHERE ca.id = ?`,
    lastID
  )

  return ok(c, {
    ...attachment,
    url: `/uploads/${attachment.filename}`,
  }, 201)
})

attachments.delete('/attachments/:id', async (c) => {
  const user = c.get('user')
  const attachmentId = parseId(c.req.param('id'))
  if (!attachmentId) return err(c, 'invalid attachment id', 400)

  const attachment = await db.get<{
    id: number
    card_id: number
    filename: string
    uploaded_by: number | null
  }>(
    'SELECT id, card_id, filename, uploaded_by FROM card_attachments WHERE id = ?',
    attachmentId
  )
  if (!attachment) return err(c, 'attachment not found', 404)

  // Get card and resolve project
  const card = await db.get<{ id: number; swim_lane_id: number }>(
    'SELECT id, swim_lane_id FROM cards WHERE id = ?',
    attachment.card_id
  )
  if (!card) return err(c, 'card not found', 404)

  const lane = await db.get<{ project_id: number }>(
    'SELECT project_id FROM swim_lanes WHERE id = ?',
    card.swim_lane_id
  )
  if (!lane) return err(c, 'lane not found', 404)

  // Check authorization: uploader or super_admin or project_admin
  const isUploader = user.id === attachment.uploaded_by
  const isSuperAdmin = user.role === 'super_admin'
  const isProjectAdmin = await db.get(
    'SELECT 1 FROM project_access WHERE user_id = ? AND project_id = ? AND role = ?',
    user.id, lane.project_id, 'project_admin'
  )

  if (!isUploader && !isSuperAdmin && !isProjectAdmin) {
    return err(c, 'forbidden', 403)
  }

  // Delete file from disk
  try {
    await fs.unlink(join(UPLOADS_DIR, attachment.filename))
  } catch (error: any) {
    // Ignore ENOENT errors (file already deleted)
    if (error?.code !== 'ENOENT') {
      console.error('Failed to delete file:', error)
    }
  }

  // Delete from database
  await db.run('DELETE FROM card_attachments WHERE id = ?', attachmentId)

  return ok(c, { deleted: true })
})

export default attachments
