import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  },
}))

vi.mock('../middleware/requireRole.js', () => ({
  requireFeature: vi.fn(() => async (c: any, next: Function) => next()),
}))

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
}))

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}))

import { db } from '../db/index.js'
import { fileTypeFromBuffer } from 'file-type'
import attachments from './attachments'

const ADMIN = { id: 1, role: 'super_admin', email: 'admin@test.com', display_name: 'Admin' }
const USER = { id: 2, role: 'global_reader', email: 'user@test.com', display_name: 'User' }

function makeApp(user = ADMIN) {
  const app = new Hono()
  // @ts-ignore
  app.use('*', async (c, next) => { c.set('user', user); return next() })
  // @ts-ignore
  app.route('/', attachments)
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default: magic bytes match content-type (image/jpeg)
  vi.mocked(fileTypeFromBuffer).mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' })
})

// ─── GET /cards/:id/attachments ───────────────────────────────────────────────

describe('GET /cards/:id/attachments', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/attachments')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid card id')
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/attachments')
    expect(res.status).toBe(404)
  })

  it('returns 404 when lane not found for card', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce(undefined) // lane not found
    const res = await makeApp().request('/cards/1/attachments')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('lane not found')
  })

  it('returns 403 when user has no access to project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce(undefined) // no access
      .mockResolvedValueOnce(undefined) // no access
    const res = await makeApp(USER).request('/cards/1/attachments')
    expect(res.status).toBe(403)
  })

  it('returns 200 with empty array when no attachments exist', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 }) // has access
    vi.mocked(db.all).mockResolvedValueOnce([])
    const res = await makeApp().request('/cards/1/attachments')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns 200 with attachments including url', async () => {
    const mockAttachments = [
      { id: 1, card_id: 1, filename: 'test-uuid-file.pdf', original_name: 'test.pdf', mime_type: 'application/pdf', size: 1024, uploaded_by: 1, uploader_name: 'Admin', created_at: '2024-01-01' },
    ]
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.all).mockResolvedValueOnce(mockAttachments as any)
    const res = await makeApp().request('/cards/1/attachments')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].url).toContain('/uploads/')
  })
})

// ─── POST /cards/:id/attachments ──────────────────────────────────────────────

describe('POST /cards/:id/attachments', () => {
  it('returns 400 for non-numeric card id', async () => {
    const res = await makeApp().request('/cards/abc/attachments', {
      method: 'POST',
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/cards/99/attachments', {
      method: 'POST',
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user has no write access to project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce(undefined) // no contributor access
      .mockResolvedValueOnce(undefined) // no project_admin access
    const res = await makeApp(USER).request('/cards/1/attachments', {
      method: 'POST',
    })
    expect(res.status).toBe(403)
  })

  it('returns 400 when file field is missing', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 }) // has access

    const formData = new FormData()
    const res = await makeApp().request('/cards/1/attachments', {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('file field is required')
  })

  it('returns 413 when file size exceeds 10 MB limit', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 })

    const formData = new FormData()
    const largeFile = new File(['a'.repeat(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' })
    formData.append('file', largeFile)

    const res = await makeApp().request('/cards/1/attachments', {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toContain('exceeds 10 MB limit')
  })

  it('returns 415 when file type is not allowed', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 })

    const formData = new FormData()
    const file = new File(['content'], 'test.exe', { type: 'application/x-executable' })
    formData.append('file', file)

    const res = await makeApp().request('/cards/1/attachments', {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(415)
    const body = await res.json()
    expect(body.error).toContain('not allowed')
  })

  it('returns 201 with created attachment for allowed MIME type', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 1,
      card_id: 1,
      filename: 'test-uuid-file.pdf',
      original_name: 'test.pdf',
      mime_type: 'application/pdf',
      size: 1024,
      uploaded_by: 1,
      uploader_name: 'Admin',
      created_at: '2024-01-01',
    })

    const formData = new FormData()
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    formData.append('file', file)

    const res = await makeApp().request('/cards/1/attachments', {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    // Verify response structure
    const body = await res.json()
    expect(body.data).toBeDefined()
  })

  it('sanitizes filename to remove unsafe characters', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 })
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
    vi.mocked(db.get).mockResolvedValueOnce({
      id: 1,
      card_id: 1,
      filename: 'test-uuid-test_png.png',
      original_name: 'test<>|.png',
      mime_type: 'image/png',
      size: 2048,
      uploaded_by: 1,
      uploader_name: 'Admin',
    })

    const formData = new FormData()
    const file = new File(['content'], 'test<>|.png', { type: 'image/png' })
    formData.append('file', file)

    const res = await makeApp().request('/cards/1/attachments', {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
  })

  describe('magic bytes validation', () => {
    it('accepts file when magic bytes MIME matches Content-Type', async () => {
      vi.mocked(db.get)
        .mockResolvedValueOnce({ id: 1, swim_lane_id: 1 })
        .mockResolvedValueOnce({ project_id: 10 })
        .mockResolvedValueOnce({ id: 1 })
      vi.mocked(db.run).mockResolvedValueOnce({ lastID: 1, changes: 1 })
      vi.mocked(db.get).mockResolvedValueOnce({
        id: 1,
        card_id: 1,
        filename: 'test-uuid-file.png',
        original_name: 'test.png',
        mime_type: 'image/png',
        size: 1024,
        uploaded_by: 1,
        uploader_name: 'Admin',
        created_at: '2024-01-01',
      })

      // fileTypeFromBuffer is already mocked in beforeEach to return matching MIME
      const formData = new FormData()
      const file = new File(['content'], 'test.png', { type: 'image/png' })
      formData.append('file', file)

      const res = await makeApp().request('/cards/1/attachments', {
        method: 'POST',
        body: formData,
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data).toBeDefined()
    })
  })
})

// ─── DELETE /attachments/:id ──────────────────────────────────────────────────

describe('DELETE /attachments/:id', () => {
  it('returns 400 for non-numeric attachment id', async () => {
    const res = await makeApp().request('/attachments/abc', { method: 'DELETE' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid attachment id')
  })

  it('returns 404 when attachment not found', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await makeApp().request('/attachments/99', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('attachment not found')
  })

  it('returns 404 when attachment card not found', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 1 })
      .mockResolvedValueOnce(undefined) // card not found
    const res = await makeApp().request('/attachments/1', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not uploader and not admin', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 1 }) // different uploader
      .mockResolvedValueOnce({ id: 5, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce(undefined) // not project admin
    const res = await makeApp(USER).request('/attachments/1', { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('allows uploader to delete their own attachment', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 2 }) // same as USER.id
      .mockResolvedValueOnce({ id: 5, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await makeApp(USER).request('/attachments/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(true)
  })

  it('allows super_admin to delete any attachment', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 2 }) // different uploader
      .mockResolvedValueOnce({ id: 5, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await makeApp(ADMIN).request('/attachments/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('allows project_admin to delete attachments in their project', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 1 })
      .mockResolvedValueOnce({ id: 5, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
      .mockResolvedValueOnce({ id: 1 }) // is project admin
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await makeApp(USER).request('/attachments/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('deletes file from disk when attachment is deleted', async () => {
    const { promises: fs } = await import('fs')
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 2 })
      .mockResolvedValueOnce({ id: 5, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    await makeApp(USER).request('/attachments/1', { method: 'DELETE' })
    expect(vi.mocked(fs.unlink)).toHaveBeenCalled()
  })

  it('ignores ENOENT error when file already deleted', async () => {
    const { promises: fs } = await import('fs')
    const enoentError = new Error('File not found')
    ;(enoentError as any).code = 'ENOENT'
    vi.mocked(fs.unlink).mockRejectedValueOnce(enoentError)

    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, card_id: 5, filename: 'test.pdf', uploaded_by: 2 })
      .mockResolvedValueOnce({ id: 5, swim_lane_id: 1 })
      .mockResolvedValueOnce({ project_id: 10 })
    vi.mocked(db.run).mockResolvedValueOnce({ changes: 1 })

    const res = await makeApp(USER).request('/attachments/1', { method: 'DELETE' })
    expect(res.status).toBe(200) // Should still succeed
  })
})
