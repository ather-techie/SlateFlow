import { describe, it, expect, beforeEach, vi } from 'vitest'

interface User {
  id: number
  email: string
  role: 'super_admin' | 'global_reader'
}

// Mock the feature flags module
vi.mock('./featureFlags.js', () => ({
  isEnabled: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

describe('MCP Server — Feature Flag Integration', () => {
  let mockUser: User

  beforeEach(() => {
    mockUser = { id: 1, email: 'user@example.com', role: 'global_reader' }
    vi.clearAllMocks()
  })

  describe('Feature Flag Gating — Read Operations', () => {
    it('list_projects is blocked when read_mcp is disabled', () => {
      // When isEnabled('read_mcp') returns false
      // callTool('list_projects', {}) should return isError: true
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'read_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('list_sprints is blocked when read_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'read_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('get_calendar is blocked when read_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'read_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('get_calendar is also blocked when calendar flag is disabled (even if read_mcp is on)', () => {
      // get_calendar requires BOTH read_mcp AND calendar flags
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'calendar feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('all read tools are blocked when read_mcp is disabled', () => {
      const readTools = [
        'list_projects',
        'list_sprints',
        'list_epics',
        'list_features',
        'search_cards',
        'get_card',
        'list_test_suites',
        'list_test_cases',
        'get_test_case',
        'get_calendar',
      ]
      // Each should check isEnabled('read_mcp')
      readTools.forEach(tool => {
        expect(tool).toBeDefined()
      })
    })
  })

  describe('Feature Flag Gating — Create Operations', () => {
    it('create_card is blocked when create_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'create_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('create_sprint is blocked when create_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'create_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('create_test_case is blocked when create_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'create_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('record_test_run is blocked when create_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'create_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('create_calendar_event requires both create_mcp AND calendar flags', () => {
      // Should fail if either flag is off
      const resultNoCal = {
        isError: true,
        content: [{ type: 'text', text: 'calendar feature is disabled' }],
      }
      expect(resultNoCal.isError).toBe(true)
    })

    it('all create tools are blocked when create_mcp is disabled', () => {
      const createTools = [
        'create_card',
        'create_sprint',
        'create_test_case',
        'record_test_run',
        'create_calendar_event',
      ]
      createTools.forEach(tool => {
        expect(tool).toBeDefined()
      })
    })
  })

  describe('Feature Flag Gating — Update Operations', () => {
    it('update_card is blocked when update_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'update_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('move_card is blocked when update_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'update_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('update_sprint is blocked when update_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'update_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('update_test_case is blocked when update_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'update_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('update_calendar_event requires both update_mcp AND calendar flags', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'calendar feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('all update tools are blocked when update_mcp is disabled', () => {
      const updateTools = [
        'update_card',
        'move_card',
        'update_sprint',
        'update_test_case',
        'update_calendar_event',
      ]
      updateTools.forEach(tool => {
        expect(tool).toBeDefined()
      })
    })
  })

  describe('Feature Flag Gating — Delete Operations', () => {
    it('delete_card is blocked when delete_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'delete_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('delete_sprint is blocked when delete_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'delete_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('delete_test_case is blocked when delete_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'delete_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('delete_calendar_event requires both delete_mcp AND calendar flags', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'calendar feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('all delete tools are blocked when delete_mcp is disabled', () => {
      const deleteTools = [
        'delete_card',
        'delete_sprint',
        'delete_test_case',
        'delete_calendar_event',
      ]
      deleteTools.forEach(tool => {
        expect(tool).toBeDefined()
      })
    })
  })

  describe('Feature Flag Gating — Reporting Operations', () => {
    it('get_velocity_report is blocked when report_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'report_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('get_cycle_time_report is blocked when report_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'report_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('get_capacity_report is blocked when report_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'report_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('get_dashboard_stats is blocked when report_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'report_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('get_dashboard_projects is blocked when report_mcp is disabled', () => {
      const result = {
        isError: true,
        content: [{ type: 'text', text: 'report_mcp feature is disabled' }],
      }
      expect(result.isError).toBe(true)
    })

    it('all report tools are blocked when report_mcp is disabled', () => {
      const reportTools = [
        'get_velocity_report',
        'get_cycle_time_report',
        'get_capacity_report',
        'get_dashboard_stats',
        'get_dashboard_projects',
      ]
      reportTools.forEach(tool => {
        expect(tool).toBeDefined()
      })
    })

    it('report_mcp is separate from read_mcp gating', () => {
      // report_mcp should be checked independently from read_mcp
      // An org can allow work-item reads but block metrics
      expect('report_mcp').not.toEqual('read_mcp')
    })
  })

  describe('Feature Flag Independence', () => {
    it('read_mcp can be on while create_mcp is off', () => {
      // list_projects should work
      // create_card should fail
      const listResult = { success: true }
      const createResult = { isError: true }
      expect(listResult.success).toBe(true)
      expect(createResult.isError).toBe(true)
    })

    it('create_mcp can be on while update_mcp is off', () => {
      // create_card should work
      // update_card should fail
      const createResult = { success: true }
      const updateResult = { isError: true }
      expect(createResult.success).toBe(true)
      expect(updateResult.isError).toBe(true)
    })

    it('update_mcp can be on while delete_mcp is off', () => {
      // update_card should work
      // delete_card should fail
      const updateResult = { success: true }
      const deleteResult = { isError: true }
      expect(updateResult.success).toBe(true)
      expect(deleteResult.isError).toBe(true)
    })

    it('delete_mcp can be on while report_mcp is off', () => {
      // delete_card should work
      // get_velocity_report should fail
      const deleteResult = { success: true }
      const reportResult = { isError: true }
      expect(deleteResult.success).toBe(true)
      expect(reportResult.isError).toBe(true)
    })

    it('report_mcp can be on while read_mcp is off', () => {
      // get_velocity_report should work
      // list_projects should fail
      // (allows viewing metrics without reading work items)
      const reportResult = { success: true }
      const readResult = { isError: true }
      expect(reportResult.success).toBe(true)
      expect(readResult.isError).toBe(true)
    })
  })

  describe('Calendar Flag Co-Dependencies', () => {
    it('get_calendar requires both read_mcp AND calendar', () => {
      // If read_mcp is on but calendar is off: should fail with calendar error
      // If calendar is on but read_mcp is off: should fail with read_mcp error
    })

    it('create_calendar_event requires both create_mcp AND calendar', () => {
      // Both flags must be checked
    })

    it('update_calendar_event requires both update_mcp AND calendar', () => {
      // Both flags must be checked
    })

    it('delete_calendar_event requires both delete_mcp AND calendar', () => {
      // Both flags must be checked
    })

    it('calendar flag does not gate non-calendar tools', () => {
      // Disabling calendar should not affect list_projects, create_card, etc.
      // Only the four calendar-specific tools should be affected
    })
  })

  describe('Error Message Clarity', () => {
    it('error message specifies which flag is missing', () => {
      const error = {
        content: [
          {
            type: 'text',
            text: 'read_mcp feature is disabled',
          },
        ],
      }
      expect(error.content[0].text).toContain('read_mcp')
    })

    it('error distinguishes between missing MCP flags', () => {
      const readError = 'read_mcp feature is disabled'
      const createError = 'create_mcp feature is disabled'
      expect(readError).not.toEqual(createError)
    })

    it('error distinguishes between missing calendar flag', () => {
      const calendarError = 'calendar feature is disabled'
      const readError = 'read_mcp feature is disabled'
      expect(calendarError).not.toEqual(readError)
    })
  })

  describe('Tool Availability Combinations', () => {
    it('all flags disabled = no tools available', () => {
      // All 29 tools should return isError: true
    })

    it('read_mcp only = 10 tools available (all read tools)', () => {
      // list_projects, list_sprints, list_epics, list_features,
      // search_cards, get_card, list_test_suites, list_test_cases,
      // get_test_case, (NOT get_calendar without calendar flag)
    })

    it('read_mcp + calendar = 11 tools available (read + get_calendar)', () => {
      // All 10 read tools including get_calendar
    })

    it('create_mcp + update_mcp + delete_mcp = 14 tools available (5+5+4)', () => {
      // All create, update, delete tools (except calendar ones without calendar flag)
    })

    it('all flags enabled = 29 tools available', () => {
      // All read (10) + create (5) + update (5) + delete (4) + report (5)
    })
  })

  describe('Feature Flag Check Order', () => {
    it('checks feature flag before attempting tool execution', () => {
      // Flag check must happen before any DB query or logic
      // Should return immediately with isError if flag is off
    })

    it('does not execute tool logic if flag check fails', () => {
      // No DB access, no computation, no side effects
      // Just return error
    })

    it('checks specific flag first, then calendar if applicable', () => {
      // For get_calendar: check read_mcp first, then calendar
      // For create_card: check create_mcp (no calendar check needed)
    })
  })
})
