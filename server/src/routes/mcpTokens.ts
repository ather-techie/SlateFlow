import { Hono } from 'hono'
import { createHash, randomBytes } from 'crypto'
import { db } from '../db/index.js'
import { ok, err, parseId } from '../lib/response.js'

const mcpTokens = new Hono()

mcpTokens.get('/mcp/tokens', async (c) => {
  const user = c.get('user')
  const rows = await db.all<{ id: number; name: string; created_at: string; last_used_at: string | null }>(
    `SELECT id, name, created_at, last_used_at FROM mcp_tokens WHERE user_id = ? ORDER BY created_at DESC`,
    user.id
  )
  return ok(c, rows)
})

mcpTokens.post('/mcp/tokens', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!name || name.length === 0 || name.length > 100) {
    return err(c, 'name is required and must be 1-100 characters', 400)
  }

  // Generate token: sf_mcp_ + 32 hex chars
  const randomPart = randomBytes(16).toString('hex')
  const rawToken = `sf_mcp_${randomPart}`

  // Hash for storage
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')

  try {
    const { lastID } = await db.run(
      `INSERT INTO mcp_tokens (user_id, name, token_hash) VALUES (?, ?, ?)`,
      user.id,
      name,
      tokenHash
    )

    return ok(c, {
      id: lastID,
      token: rawToken,
      name,
      created_at: new Date().toISOString(),
      message: 'Token created. This is the only time it will be displayed. Store it safely.'
    }, 201)
  } catch (e) {
    return err(c, 'failed to create token', 500)
  }
})

mcpTokens.delete('/mcp/tokens/:id', async (c) => {
  const user = c.get('user')
  const tokenId = parseId(c.req.param('id'))

  if (!tokenId) return err(c, 'invalid id', 400)

  // Check ownership (unless super_admin)
  const token = await db.get<{ user_id: number }>(
    `SELECT user_id FROM mcp_tokens WHERE id = ?`,
    tokenId
  )

  if (!token) return err(c, 'token not found', 404)

  if (token.user_id !== user.id && user.role !== 'super_admin') {
    return err(c, 'forbidden', 403)
  }

  await db.run(`DELETE FROM mcp_tokens WHERE id = ?`, tokenId)
  return ok(c, { id: tokenId })
})

export default mcpTokens
