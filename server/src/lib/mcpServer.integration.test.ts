import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

vi.mock('../db/index.js', () => ({
  db: {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: () => Promise<unknown>) => async () => fn()),
  },
}))

vi.mock('./featureFlags.js', () => ({ isEnabled: vi.fn() }))
vi.mock('./eventBus.js', () => ({ emitBoardEvent: vi.fn() }))
vi.mock('./activityLog.js', () => ({ logActivity: vi.fn() }))
vi.mock('./notifications.js', () => ({ notifyAssignment: vi.fn() }))
vi.mock('../routes/cardLinks.js', () => ({ closeGitHubIssues: vi.fn() }))
vi.mock('./epicAccess.js', () => ({ canWrite: vi.fn(), canReadFeatureEpic: vi.fn() }))
vi.mock('./projectAccess.js', () => ({ canWrite: vi.fn() }))

import { db } from '../db/index.js'
import { isEnabled } from './featureFlags.js'
import { createMcpServer, type McpUser } from './mcpServer.js'

const ADMIN: McpUser = { id: 1, email: 'admin@test.com', role: 'super_admin', display_name: 'Admin' }

let client: Client

async function connect(user: McpUser) {
  const server = createMcpServer(user)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return { server }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isEnabled).mockResolvedValue(true)
  vi.mocked(db.get).mockResolvedValue({ id: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

afterEach(async () => {
  await client?.close()
})

describe('MCP server end-to-end (in-memory transport)', () => {
  it('lists all 29 tools over a real JSON-RPC round trip', async () => {
    await connect(ADMIN)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(29)
    expect(tools.map(t => t.name)).toContain('list_projects')
  })

  it('calls list_projects and returns real (mocked) db rows through the full transport', async () => {
    vi.mocked(db.all).mockResolvedValueOnce([{ id: 1, name: 'Demo', lane_count: 3 }])
    await connect(ADMIN)

    const result = await client.callTool({ name: 'list_projects', arguments: {} })
    expect(result.isError).toBeFalsy()
    const content = result.content as Array<{ type: string; text: string }>
    expect(JSON.parse(content[0].text)).toEqual([{ id: 1, name: 'Demo', lane_count: 3 }])
  })

  it('threads the real authenticated user through to callTool, not a placeholder', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag !== 'report_mcp')
    await connect(ADMIN)

    const result = await client.callTool({ name: 'get_dashboard_stats', arguments: {} })
    expect(result.isError).toBe(true)
    const content = result.content as Array<{ type: string; text: string }>
    expect(content[0].text).toBe('report_mcp feature is disabled')
  })

  it('surfaces tool errors as isError results rather than throwing over the wire', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    await connect(ADMIN)

    const result = await client.callTool({ name: 'get_card', arguments: { card_id: 999 } })
    expect(result.isError).toBe(true)
    const content = result.content as Array<{ type: string; text: string }>
    expect(content[0].text).toBe('card not found')
  })
})
