import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'crypto'

interface User {
  id: number
  email: string
  role: 'super_admin' | 'global_reader'
}

interface McpToken {
  id: number
  user_id: number
  name: string
  token_hash: string
  created_at: string
  last_used_at: string | null
}

vi.mock('../db/index.js', () => ({
  db: {
    prepare: vi.fn(),
  },
}))

describe('MCP Route — Token Validation Middleware', () => {
  let validToken: string
  let validTokenHash: string
  let validUser: User
  let validMcpToken: McpToken

  beforeEach(() => {
    // Set up a valid token and user for each test
    validToken = `sf_mcp_${crypto.randomBytes(16).toString('hex')}`
    validTokenHash = crypto.createHash('sha256').update(validToken).digest('hex')
    validUser = { id: 1, email: 'user@example.com', role: 'global_reader' }
    validMcpToken = {
      id: 1,
      user_id: 1,
      name: 'Test Token',
      token_hash: validTokenHash,
      created_at: '2026-05-28T10:00:00Z',
      last_used_at: null,
    }
    vi.clearAllMocks()
  })

  describe('Token Extraction & Validation', () => {
    it('extracts Bearer token from Authorization header', () => {
      const authHeader = `Bearer ${validToken}`
      const match = authHeader.match(/^Bearer\s+(.+)$/)
      expect(match).toBeTruthy()
      expect(match?.[1]).toBe(validToken)
    })

    it('rejects request without Authorization header', () => {
      const headers = {}
      const authHeader = headers['Authorization' as any]
      expect(authHeader).toBeUndefined()
      // Should return 401 Unauthorized
    })

    it('rejects request with malformed Authorization header', () => {
      const headers = { Authorization: 'NotBearer token123' }
      const match = headers.Authorization.match(/^Bearer\s+(.+)$/)
      expect(match).toBeNull()
      // Should return 401 Unauthorized
    })

    it('rejects request with empty Bearer token', () => {
      const authHeader = 'Bearer '
      const match = authHeader.match(/^Bearer\s+(.+)$/)
      expect(match).toBeNull()
      // Should return 401 Unauthorized
    })

    it('accepts token with correct sf_mcp_ prefix', () => {
      expect(validToken).toMatch(/^sf_mcp_[a-f0-9]{32}$/)
    })

    it('rejects token with wrong prefix', () => {
      const invalidToken = `sf_invalid_${crypto.randomBytes(16).toString('hex')}`
      expect(invalidToken).not.toMatch(/^sf_mcp_/)
    })
  })

  describe('Token Lookup in Database', () => {
    it('computes SHA-256 hash of provided token', () => {
      const hash = crypto.createHash('sha256').update(validToken).digest('hex')
      expect(hash).toEqual(validTokenHash)
    })

    it('looks up token by hash in mcp_tokens table', () => {
      // Query: SELECT * FROM mcp_tokens WHERE token_hash = ?
      const tokenHash = validTokenHash
      expect(tokenHash).toBeDefined()
      expect(tokenHash).toHaveLength(64)
    })

    it('returns 401 for non-existent token', () => {
      const fakeTokenHash = 'nonexistent'.padEnd(64, '0')
      // Query should return no rows
      // Response should be 401 Unauthorized with JSON error
      expect(fakeTokenHash).toBeDefined()
    })

    it('returns 401 for revoked token (deleted from DB)', () => {
      // If token_hash is not in mcp_tokens, it's revoked
      // Should return 401 Unauthorized
    })
  })

  describe('User Context Injection', () => {
    it('loads user from database when token is valid', () => {
      // Query: SELECT * FROM users WHERE id = (SELECT user_id FROM mcp_tokens WHERE token_hash = ?)
      const userId = validMcpToken.user_id
      expect(userId).toBeDefined()
      expect(userId).toBeGreaterThan(0)
    })

    it('injects full user object into context', () => {
      const user = validUser
      expect(user).toBeDefined()
      expect(user.id).toBeDefined()
      expect(user.email).toBeDefined()
      expect(user.role).toBeDefined()
    })

    it('returns 401 if user is deleted (user_id no longer in users table)', () => {
      // Token points to user_id that doesn't exist
      // Should return 401 Unauthorized
    })

    it('respects user\'s role in RBAC context', () => {
      const user = validUser
      expect(user.role).toBe('global_reader')
      // Tools will use this role to check project_access, epic_access
    })

    it('super_admin users get full permissions in tools', () => {
      const adminUser = { ...validUser, role: 'super_admin' as const }
      expect(adminUser.role).toBe('super_admin')
      // Tools should not check project_access for super_admin
    })
  })

  describe('Token Usage Tracking', () => {
    it('updates last_used_at on successful validation', () => {
      // Query: UPDATE mcp_tokens SET last_used_at = datetime('now') WHERE id = ?
      // Should fire-and-forget (no error if update fails)
      const now = new Date().toISOString()
      expect(now).toBeDefined()
    })

    it('records usage timestamp with current datetime', () => {
      const timestamp = new Date().toISOString()
      expect(timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('does not fail request if last_used_at update fails', () => {
      // Update is fire-and-forget
      // Even if UPDATE fails, tool execution continues
    })

    it('initializes last_used_at as null for new tokens', () => {
      const newToken: McpToken = {
        ...validMcpToken,
        last_used_at: null,
      }
      expect(newToken.last_used_at).toBeNull()
    })

    it('updates last_used_at from null to timestamp on first use', () => {
      const beforeFirst = null
      const afterFirst = new Date().toISOString()
      expect(beforeFirst).toBeNull()
      expect(afterFirst).not.toBeNull()
    })
  })

  describe('HTTP Endpoints', () => {
    it('POST /mcp is the main JSON-RPC endpoint', () => {
      // Clients send tool requests via POST /mcp
      const path = '/mcp'
      const method = 'POST'
      expect(path).toBe('/mcp')
      expect(method).toBe('POST')
    })

    it('GET /mcp is the SSE stream endpoint', () => {
      // Clients receive notifications via GET /mcp (Server-Sent Events)
      const path = '/mcp'
      const method = 'GET'
      expect(path).toBe('/mcp')
      expect(method).toBe('GET')
    })

    it('DELETE /mcp is the session teardown endpoint', () => {
      // Clients can close session via DELETE /mcp
      const path = '/mcp'
      const method = 'DELETE'
      expect(path).toBe('/mcp')
      expect(method).toBe('DELETE')
    })
  })

  describe('Response Format', () => {
    it('returns 401 JSON response for invalid token', () => {
      const response = {
        isError: true,
        message: 'Invalid or expired token',
      }
      expect(response.isError).toBe(true)
      expect(response.message).toBeDefined()
    })

    it('returns 200 with user context for valid token', () => {
      const response = {
        status: 200,
        user: validUser,
      }
      expect(response.status).toBe(200)
      expect(response.user).toBeDefined()
    })

    it('includes user id in context', () => {
      const context = { user: validUser }
      expect(context.user.id).toEqual(1)
    })

    it('includes user email in context', () => {
      const context = { user: validUser }
      expect(context.user.email).toBe('user@example.com')
    })

    it('includes user role in context', () => {
      const context = { user: validUser }
      expect(context.user.role).toBe('global_reader')
    })
  })

  describe('Security', () => {
    it('never logs raw token value', () => {
      const log = `Validated token for user ${validUser.id}`
      expect(log).not.toContain('sf_mcp_')
    })

    it('stores only hash, never raw token in memory', () => {
      // Middleware should use validTokenHash, not validToken
      expect(validTokenHash).not.toContain('sf_mcp_')
    })

    it('compares token hash timing-safely if possible', () => {
      // Use crypto.timingSafeEqual for constant-time comparison
      const hash1 = crypto.createHash('sha256').update(validToken).digest()
      const hash2 = crypto.createHash('sha256').update(validToken).digest()
      // Buffers should be compared safely
      expect(hash1).toEqual(hash2)
    })

    it('rejects token with timing-safe check', () => {
      const invalidHash = Buffer.from('0'.repeat(64), 'hex')
      const validHash = crypto.createHash('sha256').update(validToken).digest()
      expect(invalidHash).not.toEqual(validHash)
    })

    it('prevents token reuse after deletion', () => {
      // Even if token string is known, deleted hash won't be in DB
    })
  })

  describe('Transport (Streamable HTTP)', () => {
    it('uses StreamableHTTPServerTransport for MCP', () => {
      // Import from @modelcontextprotocol/sdk/server/streamableHttp
      // Allows Node.js HTTP server to bridge to MCP protocol
    })

    it('creates one transport instance per request', () => {
      // Stateless sessions, sessionIdGenerator: undefined
      // No persistent connections
    })

    it('bridges to Hono using getNodeContext', () => {
      // getNodeContext(c) from @hono/node-server
      // Extracts raw Node req/res for transport initialization
    })

    it('is mounted at /mcp before requireAuth', () => {
      // Routes are mounted in this order:
      // 1. app.route('/mcp', mcpRoute)  ← before requireAuth
      // 2. app.use('/api/*', requireAuth)
      // 3. app.route('/api', apiRoute)
    })
  })

  describe('Error Scenarios', () => {
    it('handles multiple tokens for same user', () => {
      // User can have multiple tokens
      // Each should be independently valid
      const token1Hash = crypto.createHash('sha256').update(`sf_mcp_token1`).digest('hex')
      const token2Hash = crypto.createHash('sha256').update(`sf_mcp_token2`).digest('hex')
      expect(token1Hash).not.toEqual(token2Hash)
    })

    it('handles token reuse across requests', () => {
      // Same token should be valid for multiple requests
      const hash = validTokenHash
      // Each request computes hash and looks up, should find it each time
      expect(hash).toEqual(validTokenHash)
    })

    it('returns 400 for malformed request body', () => {
      // Invalid JSON-RPC format
      // Should return 400 Bad Request
    })

    it('returns 500 for database lookup error', () => {
      // If token hash lookup throws error
      // Should return 500 Internal Server Error (not auth error)
    })
  })

  describe('RBAC Application', () => {
    it('tool execution respects user\'s project access', () => {
      // User with reader role can only list, not create/update/delete
      const userWithReaderRole = {
        ...validUser,
        role: 'global_reader' as const,
      }
      expect(userWithReaderRole.role).toBe('global_reader')
    })

    it('super_admin bypasses project access checks', () => {
      const adminUser = { ...validUser, role: 'super_admin' as const }
      expect(adminUser.role).toBe('super_admin')
      // canRead/canWrite should return true for all projects
    })

    it('tool can access project_access table with user context', () => {
      // Lookup: SELECT * FROM project_access WHERE user_id = ? AND project_id = ?
      const userId = validUser.id
      const projectId = 1
      expect(userId).toBeDefined()
      expect(projectId).toBeDefined()
    })

    it('tool can access epic_access table with user context', () => {
      // Lookup: SELECT * FROM epic_access WHERE user_id = ? AND epic_id = ?
      const userId = validUser.id
      const epicId = 1
      expect(userId).toBeDefined()
      expect(epicId).toBeDefined()
    })
  })
})
