import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHash } from 'crypto'
import { Hono } from 'hono'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: () => Promise<unknown>) => async () => fn()),
  },
}))

vi.mock('../lib/mcpServer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/mcpServer.js')>()
  return { ...actual, createMcpServer: vi.fn(actual.createMcpServer) }
})

import { db } from '../db/index.js'
import { createMcpServer } from '../lib/mcpServer.js'
import mcp from './mcp'

const RAW_TOKEN = 'sf_mcp_deadbeefdeadbeefdeadbeefdeadbeef'
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex')
const USER = { id: 7, email: 'alice@test.com', role: 'super_admin' as const, display_name: 'Alice' }

function makeApp() {
  const app = new Hono()
  app.route('/', mcp)
  return app
}

function authedRequest(path: string, init: RequestInit = {}) {
  return makeApp().request(path, {
    ...init,
    headers: { Authorization: `Bearer ${RAW_TOKEN}`, ...(init.headers ?? {}) },
  })
}

function mockValidAuth() {
  vi.mocked(db.get)
    .mockResolvedValueOnce({ user_id: USER.id })
    .mockResolvedValueOnce(USER)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.run).mockResolvedValue({ lastID: 0, changes: 1 })
})

describe('validateMcpToken', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeApp().request('/', { method: 'POST' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('missing or invalid authorization')
  })

  it('401s with a non-Bearer Authorization header', async () => {
    const res = await makeApp().request('/', { method: 'POST', headers: { Authorization: 'Basic xyz' } })
    expect(res.status).toBe(401)
  })

  it('401s for an unrecognized token', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const res = await authedRequest('/', { method: 'POST' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('invalid token')
  })

  it('401s when the token is valid but the user is inactive or deleted', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ user_id: USER.id })
      .mockResolvedValueOnce(undefined)
    const res = await authedRequest('/', { method: 'POST' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('user not found or inactive')
  })

  it('looks up mcp_tokens by the sha256 hash of the raw token', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    await authedRequest('/', { method: 'POST' })
    const call = vi.mocked(db.get).mock.calls[0]
    expect(call[0]).toContain('FROM mcp_tokens')
    expect(call[1]).toBe(TOKEN_HASH)
  })

  it('threads the full user object — including display_name — into createMcpServer', async () => {
    mockValidAuth()
    await authedRequest('/', { method: 'POST', body: JSON.stringify({}) })
    expect(createMcpServer).toHaveBeenCalledWith(USER)
  })
})

describe('POST /', () => {
  it('reaches the transport once authenticated', async () => {
    mockValidAuth()
    const res = await authedRequest('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    // Reaching the transport at all (not 401) proves auth -> createMcpServer -> handleRequest wiring works.
    expect(res.status).not.toBe(401)
    expect(createMcpServer).toHaveBeenCalledTimes(1)
  })
})

describe('GET /', () => {
  it('returns 405 — stateless mode has no server-initiated stream', async () => {
    mockValidAuth()
    const res = await authedRequest('/', { method: 'GET' })
    expect(res.status).toBe(405)
  })
})

describe('DELETE /', () => {
  it('returns 204 — stateless mode has no session to tear down', async () => {
    mockValidAuth()
    const res = await authedRequest('/', { method: 'DELETE' })
    expect(res.status).toBe(204)
  })
})
