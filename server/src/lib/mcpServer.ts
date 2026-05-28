import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js'
import { db } from '../db/index.js'
import { isEnabled } from './featureFlags.js'
import { canRead, canWrite } from './projectAccess.js'
import { getUserEpicRole } from './epicAccess.js'

interface User {
  id: number
  email: string
  role: 'super_admin' | 'global_reader'
}

const tools: Tool[] = [
  // ── Read tools ────────────────────────────────────────────────────────────
  {
    name: 'list_projects',
    description: 'List all projects the user has access to',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_sprints',
    description: 'List sprints in a project (excludes default sprint)',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'number', description: 'Project ID' } },
      required: ['project_id']
    }
  },
  {
    name: 'list_epics',
    description: 'List epics in a project (excludes default epic)',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'number', description: 'Project ID' } },
      required: ['project_id']
    }
  },
  {
    name: 'list_features',
    description: 'List features in a project, optionally filtered by epic',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        epic_id: { type: 'number', description: 'Optional epic ID to filter by' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'search_cards',
    description: 'Search story cards by title (returns up to 20 results)',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        q: { type: 'string', description: 'Search query (minimum 2 characters)' }
      },
      required: ['project_id', 'q']
    }
  },
  {
    name: 'get_card',
    description: 'Get full details of a story card including labels, comments, and tasks',
    inputSchema: {
      type: 'object',
      properties: { card_id: { type: 'number', description: 'Card ID' } },
      required: ['card_id']
    }
  },
  {
    name: 'list_test_suites',
    description: 'List test suites in a project',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'number', description: 'Project ID' } },
      required: ['project_id']
    }
  },
  {
    name: 'list_test_cases',
    description: 'List test cases for a story card with summary counts',
    inputSchema: {
      type: 'object',
      properties: { card_id: { type: 'number', description: 'Card ID' } },
      required: ['card_id']
    }
  },
  {
    name: 'get_test_case',
    description: 'Get full details of a test case including full run history',
    inputSchema: {
      type: 'object',
      properties: { test_case_id: { type: 'number', description: 'Test case ID' } },
      required: ['test_case_id']
    }
  },
  {
    name: 'get_calendar',
    description: 'Get calendar entries (sprints, epics, features, holidays, events, vacations) for a date range',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD)' }
      },
      required: ['project_id', 'from', 'to']
    }
  },

  // ── Create tools ──────────────────────────────────────────────────────────
  {
    name: 'create_card',
    description: 'Create a new story card in a swim lane',
    inputSchema: {
      type: 'object',
      properties: {
        lane_id: { type: 'number', description: 'Swim lane ID' },
        title: { type: 'string', description: 'Card title' },
        description: { type: 'string', description: 'Optional description' },
        priority: { type: 'string', enum: ['p0', 'p1', 'p2', 'p3'], description: 'Optional priority (default: p2)' },
        story_points: { type: 'number', description: 'Optional story points (0-999)' },
        assignee: { type: 'string', description: 'Optional assignee (user display name or email)' },
        sprint_id: { type: 'number', description: 'Optional sprint ID (defaults to project Default Sprint)' },
        feature_id: { type: 'number', description: 'Optional feature ID (defaults to project Default Feature)' }
      },
      required: ['lane_id', 'title']
    }
  },
  {
    name: 'create_sprint',
    description: 'Create a new sprint in a project',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        name: { type: 'string', description: 'Sprint name' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        goal: { type: 'string', description: 'Optional sprint goal' },
        status: { type: 'string', enum: ['planned', 'active', 'completed'], description: 'Optional status (default: planned)' }
      },
      required: ['project_id', 'name', 'start_date', 'end_date']
    }
  },
  {
    name: 'create_test_case',
    description: 'Create a new test case for a story card',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Card ID' },
        title: { type: 'string', description: 'Test case title' },
        description: { type: 'string', description: 'Optional description' },
        suite_id: { type: 'number', description: 'Optional test suite ID' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Optional priority (default: medium)' },
        test_type: { type: 'string', enum: ['manual', 'automated'], description: 'Optional test type (default: manual)' },
        preconditions: { type: 'string', description: 'Optional preconditions' },
        expected_result: { type: 'string', description: 'Optional expected result' },
        assigned_to: { type: 'string', description: 'Optional assignee' }
      },
      required: ['card_id', 'title']
    }
  },
  {
    name: 'record_test_run',
    description: 'Record a test run result for a test case',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_id: { type: 'number', description: 'Test case ID' },
        status: { type: 'string', enum: ['passed', 'failed', 'blocked', 'skipped'], description: 'Test result status' },
        notes: { type: 'string', description: 'Optional notes' },
        run_by: { type: 'string', description: 'Optional run-by user' }
      },
      required: ['test_case_id', 'status']
    }
  },
  {
    name: 'create_calendar_event',
    description: 'Create a calendar event (requires calendar feature enabled)',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        title: { type: 'string', description: 'Event title' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        description: { type: 'string', description: 'Optional description' },
        color: { type: 'string', description: 'Optional color (#rrggbb)' }
      },
      required: ['project_id', 'title', 'start_date', 'end_date']
    }
  },

  // ── Update tools ──────────────────────────────────────────────────────────
  {
    name: 'update_card',
    description: 'Update a story card',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Card ID' },
        title: { type: 'string', description: 'Optional new title' },
        description: { type: 'string', description: 'Optional new description' },
        priority: { type: 'string', enum: ['p0', 'p1', 'p2', 'p3'] },
        story_points: { type: 'number' },
        assignee: { type: 'string' },
        sprint_id: { type: 'number' },
        feature_id: { type: 'number' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD) or null' }
      },
      required: ['card_id']
    }
  },
  {
    name: 'move_card',
    description: 'Move a card to a different swim lane',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'number', description: 'Card ID' },
        lane_id: { type: 'number', description: 'Target lane ID' },
        position: { type: 'number', description: 'Optional position in the new lane' }
      },
      required: ['card_id', 'lane_id']
    }
  },
  {
    name: 'update_sprint',
    description: 'Update a sprint',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_id: { type: 'number', description: 'Sprint ID' },
        name: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        goal: { type: 'string' },
        status: { type: 'string', enum: ['planned', 'active', 'completed'] }
      },
      required: ['sprint_id']
    }
  },
  {
    name: 'update_test_case',
    description: 'Update a test case',
    inputSchema: {
      type: 'object',
      properties: {
        test_case_id: { type: 'number', description: 'Test case ID' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['untested', 'passed', 'failed', 'blocked', 'skipped'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        test_type: { type: 'string', enum: ['manual', 'automated'] }
      },
      required: ['test_case_id']
    }
  },
  {
    name: 'update_calendar_event',
    description: 'Update a calendar event (requires calendar feature enabled)',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'number', description: 'Event ID' },
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        color: { type: 'string', description: '#rrggbb' }
      },
      required: ['event_id']
    }
  },

  // ── Delete tools ──────────────────────────────────────────────────────────
  {
    name: 'delete_card',
    description: 'Delete a story card',
    inputSchema: {
      type: 'object',
      properties: { card_id: { type: 'number', description: 'Card ID' } },
      required: ['card_id']
    }
  },
  {
    name: 'delete_sprint',
    description: 'Delete a sprint (moves cards to default sprint)',
    inputSchema: {
      type: 'object',
      properties: { sprint_id: { type: 'number', description: 'Sprint ID' } },
      required: ['sprint_id']
    }
  },
  {
    name: 'delete_test_case',
    description: 'Delete a test case',
    inputSchema: {
      type: 'object',
      properties: { test_case_id: { type: 'number', description: 'Test case ID' } },
      required: ['test_case_id']
    }
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event (requires calendar feature enabled)',
    inputSchema: {
      type: 'object',
      properties: { event_id: { type: 'number', description: 'Event ID' } },
      required: ['event_id']
    }
  },

  // ── Report tools ──────────────────────────────────────────────────────────
  {
    name: 'get_velocity_report',
    description: 'Get velocity data per sprint (completed vs total story points and story counts)',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'number', description: 'Project ID' } },
      required: ['project_id']
    }
  },
  {
    name: 'get_cycle_time_report',
    description: 'Get average cycle time per swim lane',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'number', description: 'Project ID' } },
      required: ['project_id']
    }
  },
  {
    name: 'get_capacity_report',
    description: 'Get per-assignee capacity data for a sprint',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Project ID' },
        sprint_id: { type: 'number', description: 'Sprint ID' }
      },
      required: ['project_id', 'sprint_id']
    }
  },
  {
    name: 'get_dashboard_stats',
    description: 'Get global dashboard stats (projects, active sprints, cards, tests)',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_dashboard_projects',
    description: 'Get per-project dashboard summary with lane and test stats',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }
]

async function callTool(user: User, toolName: string, toolInput: Record<string, unknown>): Promise<unknown> {
  // Validate feature flags
  const readFlags = ['list_projects', 'list_sprints', 'list_epics', 'list_features', 'search_cards', 'get_card', 'list_test_suites', 'list_test_cases', 'get_test_case', 'get_calendar']
  const createFlags = ['create_card', 'create_sprint', 'create_test_case', 'record_test_run', 'create_calendar_event']
  const updateFlags = ['update_card', 'move_card', 'update_sprint', 'update_test_case', 'update_calendar_event']
  const deleteFlags = ['delete_card', 'delete_sprint', 'delete_test_case', 'delete_calendar_event']
  const reportFlags = ['get_velocity_report', 'get_cycle_time_report', 'get_capacity_report', 'get_dashboard_stats', 'get_dashboard_projects']

  if (readFlags.includes(toolName) && !(await isEnabled('read_mcp'))) {
    return { isError: true, content: [{ type: 'text', text: 'read_mcp feature is disabled' }] }
  }
  if (createFlags.includes(toolName) && !(await isEnabled('create_mcp'))) {
    return { isError: true, content: [{ type: 'text', text: 'create_mcp feature is disabled' }] }
  }
  if (updateFlags.includes(toolName) && !(await isEnabled('update_mcp'))) {
    return { isError: true, content: [{ type: 'text', text: 'update_mcp feature is disabled' }] }
  }
  if (deleteFlags.includes(toolName) && !(await isEnabled('delete_mcp'))) {
    return { isError: true, content: [{ type: 'text', text: 'delete_mcp feature is disabled' }] }
  }
  if (reportFlags.includes(toolName) && !(await isEnabled('report_mcp'))) {
    return { isError: true, content: [{ type: 'text', text: 'report_mcp feature is disabled' }] }
  }

  // Placeholder implementations for now
  return {
    content: [{ type: 'text', text: `${toolName} not yet implemented` }]
  }
}

export function createMcpServer() {
  const server = new Server({ name: 'slateflow-mcp', version: '0.1.0' })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const toolName = request.params.name
    const toolInput = request.params.arguments as Record<string, unknown>
    // TODO: extract user from context and pass to callTool
    return await callTool({ id: 0, email: '', role: 'global_reader' }, toolName, toolInput)
  })

  return server
}
