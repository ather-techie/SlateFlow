import { Hono } from 'hono'
import { createHash } from 'crypto'
import { db } from '../db/index.js'
import { err } from '../lib/response.js'

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

  const user = await db.get(
    `SELECT id, email, role FROM users WHERE id = ? AND is_active = 1`,
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

// Stub endpoints for MCP transport
// In production, use StreamableHTTPServerTransport from @modelcontextprotocol/sdk
mcp.post('/', async (c) => {
  // TODO: implement JSON-RPC message handling via MCP transport
  return c.json({ error: 'MCP transport not yet fully implemented' }, 501)
})

mcp.get('/', async (c) => {
  // TODO: implement SSE stream for server → client messages
  return err(c, 'MCP SSE stream not yet implemented', 501)
})

export default mcp
