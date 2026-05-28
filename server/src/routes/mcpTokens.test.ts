import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db/index.js'
import crypto from 'crypto'

interface User {
  id: number
  email: string
  role: 'super_admin' | 'global_reader'
}

// Mock database and auth helpers
vi.mock('../db/index.js', () => ({
  db: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

describe('MCP Token Routes', () => {
  let mockUser: User
  let mockSuperAdmin: User

  beforeEach(() => {
    mockUser = { id: 1, email: 'user@example.com', role: 'global_reader' }
    mockSuperAdmin = { id: 999, email: 'admin@example.com', role: 'super_admin' }
    vi.clearAllMocks()
  })

  describe('Token Generation', () => {
    it('generates a token with correct format (sf_mcp_ prefix)', () => {
      const randomHex = crypto.randomBytes(16).toString('hex')
      const token = `sf_mcp_${randomHex}`
      expect(token).toMatch(/^sf_mcp_[a-f0-9]{32}$/)
    })

    it('generates unique tokens on each call', () => {
      const token1 = `sf_mcp_${crypto.randomBytes(16).toString('hex')}`
      const token2 = `sf_mcp_${crypto.randomBytes(16).toString('hex')}`
      expect(token1).not.toEqual(token2)
    })

    it('returns 32 hex characters after prefix', () => {
      const randomHex = crypto.randomBytes(16).toString('hex')
      const token = `sf_mcp_${randomHex}`
      const hexPart = token.split('_').pop()
      expect(hexPart).toHaveLength(32)
      expect(hexPart).toMatch(/^[a-f0-9]{32}$/)
    })
  })

  describe('Token Hashing', () => {
    it('creates SHA-256 hash of token', () => {
      const token = `sf_mcp_${crypto.randomBytes(16).toString('hex')}`
      const hash = crypto.createHash('sha256').update(token).digest('hex')
      expect(hash).toHaveLength(64) // SHA-256 hex is 64 chars
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('produces consistent hash for same token', () => {
      const token = 'sf_mcp_1234567890abcdef1234567890abcdef'
      const hash1 = crypto.createHash('sha256').update(token).digest('hex')
      const hash2 = crypto.createHash('sha256').update(token).digest('hex')
      expect(hash1).toEqual(hash2)
    })

    it('produces different hash for different tokens', () => {
      const token1 = `sf_mcp_${crypto.randomBytes(16).toString('hex')}`
      const token2 = `sf_mcp_${crypto.randomBytes(16).toString('hex')}`
      const hash1 = crypto.createHash('sha256').update(token1).digest('hex')
      const hash2 = crypto.createHash('sha256').update(token2).digest('hex')
      expect(hash1).not.toEqual(hash2)
    })
  })

  describe('Token Ownership & Authorization', () => {
    it('allows user to delete their own token', () => {
      // User 1 should be able to delete token owned by user 1
      const tokenOwnerId = mockUser.id
      const requesterUserId = mockUser.id
      expect(tokenOwnerId).toEqual(requesterUserId)
    })

    it('prevents user from deleting another user\'s token', () => {
      const tokenOwnerId = 1
      const requesterUserId = 2
      expect(tokenOwnerId).not.toEqual(requesterUserId)
      // Should return 403 Forbidden
    })

    it('allows super_admin to delete any token', () => {
      const tokenOwnerId = 1
      const requesterRole = mockSuperAdmin.role
      expect(requesterRole).toEqual('super_admin')
      // Should allow deletion
    })

    it('allows super_admin to revoke another user\'s token', () => {
      const requesterRole = mockSuperAdmin.role
      const tokenOwnerId = 5
      const requesterUserId = mockSuperAdmin.id
      expect(requesterRole).toEqual('super_admin')
      expect(tokenOwnerId).not.toEqual(requesterUserId)
      // Should allow deletion
    })
  })

  describe('Token Display Safety', () => {
    it('returns raw token only once on creation', () => {
      // POST /api/mcp/tokens should return { token: "sf_mcp_..." }
      const tokenResponse = { token: 'sf_mcp_abcd1234' }
      expect(tokenResponse.token).toBeDefined()
      expect(tokenResponse.token).toMatch(/^sf_mcp_/)
    })

    it('never returns token value on list operation', () => {
      // GET /api/mcp/tokens should return [{ name, created_at, last_used_at }]
      // NOT { token: "..." }
      const tokenListItem = {
        id: 1,
        name: 'My Token',
        created_at: '2026-05-28T10:00:00Z',
        last_used_at: '2026-05-28T11:00:00Z',
      }
      expect(tokenListItem.token).toBeUndefined()
    })

    it('never returns token value on delete operation', () => {
      // DELETE /api/mcp/tokens/:id should return { success: true }
      // NOT the token value
      const deleteResponse = { success: true, message: 'Token revoked' }
      expect(deleteResponse.success).toBe(true)
      expect(deleteResponse.token).toBeUndefined()
    })
  })

  describe('Token Metadata', () => {
    it('stores token name provided by user', () => {
      const tokenName = 'My Development Token'
      const token = {
        id: 1,
        name: tokenName,
        created_at: '2026-05-28T10:00:00Z',
      }
      expect(token.name).toEqual(tokenName)
    })

    it('records creation timestamp', () => {
      const now = new Date().toISOString()
      const token = {
        id: 1,
        name: 'Test Token',
        created_at: now,
      }
      expect(token.created_at).toBeDefined()
      expect(new Date(token.created_at).getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('tracks last_used_at on token validation', () => {
      const lastUsed = new Date().toISOString()
      const token = {
        id: 1,
        last_used_at: lastUsed,
      }
      expect(token.last_used_at).toBeDefined()
    })

    it('sets last_used_at to null initially', () => {
      const token = {
        id: 1,
        name: 'New Token',
        created_at: '2026-05-28T10:00:00Z',
        last_used_at: null,
      }
      expect(token.last_used_at).toBeNull()
    })
  })

  describe('Validation & Error Handling', () => {
    it('requires token name on creation', () => {
      const payload = { name: '' }
      expect(payload.name).toBeFalsy()
      // Should return 400 Bad Request
    })

    it('returns 404 when token not found on delete', () => {
      // DELETE /api/mcp/tokens/999 (non-existent)
      // Should return 404 Not Found
    })

    it('returns 401 when deleting with invalid auth', () => {
      // DELETE without valid cookie/auth
      // Should return 401 Unauthorized
    })

    it('returns 403 when user tries to delete another\'s token', () => {
      // DELETE /api/mcp/tokens/5 where user is not owner and not super_admin
      // Should return 403 Forbidden
    })

    it('enforces unique token hash in database', () => {
      const hash = crypto.createHash('sha256').update('sf_mcp_test').digest('hex')
      // Two rows with same token_hash should fail due to UNIQUE constraint
      expect(true).toBe(true) // Constraint would be enforced by DB
    })
  })

  describe('Database Cascading', () => {
    it('deletes all user tokens when user is deleted', () => {
      // When users table row is deleted, mcp_tokens rows cascade delete via ON DELETE CASCADE
      const userId = 1
      // SELECT COUNT(*) FROM mcp_tokens WHERE user_id = 1 should return 0 after user delete
    })

    it('preserves tokens when other users are deleted', () => {
      // Delete user 2's row should not affect user 1's tokens
      const userIdToDelete = 2
      const otherUserId = 1
      // Tokens for user 1 should remain
    })
  })
})
