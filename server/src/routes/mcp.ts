import { Hono } from 'hono'
import { createHash } from 'crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { db } from '../db/index.js'
import { err } from '../lib/response.js'
import { createMcpServer, type McpUser } from '../lib/mcpServer.js'

const mcp = new Hono()

// Simple token validation middleware
async function validateMcpToken(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return err(c, 'missing or invalid authorization', 401)
  }

  const token = authHeader.slice(7)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const row = await db.get<{ user_id: number }>(
    `SELECT user_id FROM mcp_tokens WHERE token_hash = ?`,
    tokenHash
  )

  if (!row) {
    return err(c, 'invalid token', 401)
  }

  const user = await db.get<McpUser>(
    `SELECT id, email, role, display_name FROM users WHERE id = ? AND is_active = 1`,
    row.user_id
  )

  if (!user) {
    return err(c, 'user not found or inactive', 401)
  }

  // Update last_used_at (fire-and-forget)
  db.run(`UPDATE mcp_tokens SET last_used_at = datetime('now') WHERE token_hash = ?`, tokenHash).catch(() => {})

  c.set('user', user)
  await next()
}

mcp.use('*', validateMcpToken)

// Stateless mode: every request gets a fresh Server + transport pair closing
// over the authenticated user, so callTool() always sees the real caller and
// tool calls stay independent, per-request RBAC-checked operations with no
// session lifecycle to manage.
mcp.post('/', async (c) => {
  const user = c.get('user') as McpUser
  const server = createMcpServer(user)
  // enableJsonResponse: true makes handleRequest() resolve only once the JSON-RPC
  // response is fully computed, instead of returning a live SSE stream — required
  // here since we close the transport/server immediately in `finally` below and a
  // still-open SSE stream would be torn down before its data reached the client.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(c.req.raw)
  } finally {
    await transport.close()
    await server.close()
  }
})

// Stateless mode has no server-initiated stream, so there's nothing for a
// GET to return.
mcp.get('/', async (c) => {
  return err(c, 'method not allowed: this MCP server is stateless and does not support server-initiated streams', 405)
})

// Stateless mode issues no session id, so there is no session to tear down.
mcp.delete('/', async (c) => {
  return c.body(null, 204)
})

export default mcp
