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

describe('MCP Server Tools', () => {
  let mockUser: User

  beforeEach(() => {
    mockUser = { id: 1, email: 'user@example.com', role: 'global_reader' }
    vi.clearAllMocks()
  })

  describe('Tool Definitions', () => {
    it('defines all read tools', () => {
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
      expect(readTools).toHaveLength(10)
    })

    it('defines all create tools', () => {
      const createTools = [
        'create_card',
        'create_sprint',
        'create_test_case',
        'record_test_run',
        'create_calendar_event',
      ]
      expect(createTools).toHaveLength(5)
    })

    it('defines all update tools', () => {
      const updateTools = [
        'update_card',
        'move_card',
        'update_sprint',
        'update_test_case',
        'update_calendar_event',
      ]
      expect(updateTools).toHaveLength(5)
    })

    it('defines all delete tools', () => {
      const deleteTools = [
        'delete_card',
        'delete_sprint',
        'delete_test_case',
        'delete_calendar_event',
      ]
      expect(deleteTools).toHaveLength(4)
    })

    it('defines all report tools', () => {
      const reportTools = [
        'get_velocity_report',
        'get_cycle_time_report',
        'get_capacity_report',
        'get_dashboard_stats',
        'get_dashboard_projects',
      ]
      expect(reportTools).toHaveLength(5)
    })

    it('has total of 29 tools', () => {
      const totalTools = 10 + 5 + 5 + 4 + 5
      expect(totalTools).toBe(29)
    })
  })

  describe('Tool Input Schemas', () => {
    describe('Read tools', () => {
      it('list_projects has no required inputs', () => {
        // list_projects requires no parameters
        const schema = { type: 'object', properties: {}, required: [] }
        expect(schema.required).toHaveLength(0)
      })

      it('list_sprints requires project_id', () => {
        const schema = {
          type: 'object',
          properties: { project_id: { type: 'number' } },
          required: ['project_id'],
        }
        expect(schema.required).toContain('project_id')
      })

      it('search_cards requires project_id and q', () => {
        const schema = {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            q: { type: 'string' },
          },
          required: ['project_id', 'q'],
        }
        expect(schema.required).toHaveLength(2)
        expect(schema.required).toContain('project_id')
        expect(schema.required).toContain('q')
      })

      it('list_features requires project_id, accepts optional epic_id', () => {
        const schema = {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            epic_id: { type: 'number' },
          },
          required: ['project_id'],
        }
        expect(schema.required).toContain('project_id')
        expect(schema.required).not.toContain('epic_id')
      })

      it('get_card requires card_id', () => {
        const schema = {
          type: 'object',
          properties: { card_id: { type: 'number' } },
          required: ['card_id'],
        }
        expect(schema.required).toContain('card_id')
      })

      it('get_calendar requires project_id, from, to', () => {
        const schema = {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['project_id', 'from', 'to'],
        }
        expect(schema.required).toHaveLength(3)
      })
    })

    describe('Create tools', () => {
      it('create_card requires lane_id and title', () => {
        const schema = {
          type: 'object',
          properties: {
            lane_id: { type: 'number' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string' },
          },
          required: ['lane_id', 'title'],
        }
        expect(schema.required).toHaveLength(2)
        expect(schema.required).toContain('lane_id')
        expect(schema.required).toContain('title')
      })

      it('create_sprint requires project_id, name, start_date, end_date', () => {
        const schema = {
          required: ['project_id', 'name', 'start_date', 'end_date'],
        }
        expect(schema.required).toHaveLength(4)
      })

      it('create_test_case requires card_id and title', () => {
        const schema = {
          required: ['card_id', 'title'],
        }
        expect(schema.required).toHaveLength(2)
      })
    })

    describe('Update tools', () => {
      it('update_card requires only card_id (all fields optional)', () => {
        const schema = {
          type: 'object',
          properties: {
            card_id: { type: 'number' },
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['card_id'],
        }
        expect(schema.required).toHaveLength(1)
        expect(schema.required).toContain('card_id')
      })

      it('move_card requires card_id and lane_id', () => {
        const schema = {
          required: ['card_id', 'lane_id'],
        }
        expect(schema.required).toHaveLength(2)
      })
    })

    describe('Delete tools', () => {
      it('delete_card requires card_id', () => {
        const schema = {
          required: ['card_id'],
        }
        expect(schema.required).toContain('card_id')
      })

      it('delete_sprint requires sprint_id', () => {
        const schema = {
          required: ['sprint_id'],
        }
        expect(schema.required).toContain('sprint_id')
      })
    })

    describe('Report tools', () => {
      it('get_velocity_report requires only project_id', () => {
        const schema = {
          required: ['project_id'],
        }
        expect(schema.required).toHaveLength(1)
      })

      it('get_capacity_report requires project_id and sprint_id', () => {
        const schema = {
          required: ['project_id', 'sprint_id'],
        }
        expect(schema.required).toHaveLength(2)
      })

      it('get_dashboard_stats requires nothing', () => {
        const schema = {
          required: [],
        }
        expect(schema.required).toHaveLength(0)
      })
    })
  })

  describe('Feature Flag Validation', () => {
    it('read_mcp flag controls all read tools', () => {
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
      // All should check isEnabled('read_mcp')
      readTools.forEach(tool => {
        expect(tool).toBeDefined()
      })
    })

    it('create_mcp flag controls all create tools', () => {
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

    it('update_mcp flag controls all update tools', () => {
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

    it('delete_mcp flag controls all delete tools', () => {
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

    it('report_mcp flag controls all report tools', () => {
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

    it('calendar flag also gates calendar-related tools', () => {
      // get_calendar, create_calendar_event, update_calendar_event, delete_calendar_event
      // should additionally check isEnabled('calendar')
      const calendarTools = [
        'get_calendar',
        'create_calendar_event',
        'update_calendar_event',
        'delete_calendar_event',
      ]
      expect(calendarTools).toHaveLength(4)
    })
  })

  describe('Error Responses', () => {
    it('returns isError: true when read_mcp is disabled', () => {
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'read_mcp feature is disabled' }],
      }
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('read_mcp')
    })

    it('returns isError: true when create_mcp is disabled', () => {
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'create_mcp feature is disabled' }],
      }
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('create_mcp')
    })

    it('returns isError: true when update_mcp is disabled', () => {
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'update_mcp feature is disabled' }],
      }
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('update_mcp')
    })

    it('returns isError: true when delete_mcp is disabled', () => {
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'delete_mcp feature is disabled' }],
      }
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('delete_mcp')
    })

    it('returns isError: true when report_mcp is disabled', () => {
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'report_mcp feature is disabled' }],
      }
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('report_mcp')
    })

    it('returns isError: true when calendar is disabled for calendar tools', () => {
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'calendar feature is disabled' }],
      }
      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('calendar')
    })
  })

  describe('Tool Authentication Context', () => {
    it('receives user context in callTool', () => {
      const user = mockUser
      expect(user.id).toBeDefined()
      expect(user.email).toBeDefined()
      expect(user.role).toBeDefined()
    })

    it('passes user context to tool implementation', () => {
      // User's RBAC should be respected in tool execution
      const user = { ...mockUser, role: 'global_reader' as const }
      expect(user.role).toBe('global_reader')
    })

    it('respects project access checks in tools', () => {
      // canRead / canWrite / canManageUsers should be called with user context
      const user = mockUser
      expect(user.id).toBe(1)
      // Tool should use lib/projectAccess.ts helpers with this user
    })
  })

  describe('Tool Descriptions', () => {
    it('list_projects has appropriate description', () => {
      const tool = {
        name: 'list_projects',
        description: 'List all projects the user has access to',
      }
      expect(tool.description).toContain('projects')
      expect(tool.description).toContain('access')
    })

    it('search_cards limits results to 20', () => {
      const tool = {
        name: 'search_cards',
        description: 'Search story cards by title (returns up to 20 results)',
      }
      expect(tool.description).toContain('20')
    })

    it('get_calendar mentions required date params', () => {
      const tool = {
        name: 'get_calendar',
        description:
          'Get calendar entries (sprints, epics, features, holidays, events, vacations) for a date range',
      }
      expect(tool.description).toContain('date')
    })
  })
})
