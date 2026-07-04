import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema, Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { db } from '../db/index.js'
import { isEnabled } from './featureFlags.js'
import { canWrite } from './projectAccess.js'
import { canWrite as canWriteEpic, canReadFeatureEpic } from './epicAccess.js'
import { resolveDefaultFeature, resolveDefaultSprint } from './defaults.js'
import { buildUpdate } from './buildUpdate.js'
import { emitBoardEvent } from './eventBus.js'
import { logActivity } from './activityLog.js'
import { notifyAssignment } from './notifications.js'
import { getSprintPointTotals, getProjectCycleTime, getSprintCapacity } from './reportData.js'
import { dateSchema, optionalDateSchema } from './validators.js'
import { closeGitHubIssues } from '../routes/cardLinks.js'

export interface McpUser {
  id: number
  email: string
  role: 'super_admin' | 'global_reader'
  display_name: string
}

export const tools: Tool[] = [
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
    description: 'Delete a sprint (cards in it are unassigned from any sprint, not moved to the Default Sprint)',
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

// ── Dispatch tables ──────────────────────────────────────────────────────────

type ToolBucket = 'read' | 'create' | 'update' | 'delete' | 'report'

const TOOL_FLAG_BUCKET: Record<string, ToolBucket> = {
  list_projects: 'read', list_sprints: 'read', list_epics: 'read', list_features: 'read',
  search_cards: 'read', get_card: 'read', list_test_suites: 'read', list_test_cases: 'read',
  get_test_case: 'read', get_calendar: 'read',
  create_card: 'create', create_sprint: 'create', create_test_case: 'create',
  record_test_run: 'create', create_calendar_event: 'create',
  update_card: 'update', move_card: 'update', update_sprint: 'update',
  update_test_case: 'update', update_calendar_event: 'update',
  delete_card: 'delete', delete_sprint: 'delete', delete_test_case: 'delete', delete_calendar_event: 'delete',
  get_velocity_report: 'report', get_cycle_time_report: 'report', get_capacity_report: 'report',
  get_dashboard_stats: 'report', get_dashboard_projects: 'report',
}

const CALENDAR_TOOLS = new Set(['get_calendar', 'create_calendar_event', 'update_calendar_event', 'delete_calendar_event'])

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

function toContent(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

// ── Zod schemas — one per tool, mirroring each tool's declared inputSchema ──

const numberId = z.number().int().positive()
const priorityEnum = z.enum(['p0', 'p1', 'p2', 'p3'])
const testPriorityEnum = z.enum(['critical', 'high', 'medium', 'low'])
const testTypeEnum = z.enum(['manual', 'automated'])
const testRunStatusEnum = z.enum(['passed', 'failed', 'blocked', 'skipped'])
const testCaseStatusEnum = z.enum(['untested', 'passed', 'failed', 'blocked', 'skipped'])
const sprintStatusEnum = z.enum(['planned', 'active', 'completed'])
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'color must be a hex value')

const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  list_sprints: z.object({ project_id: numberId }),
  list_epics: z.object({ project_id: numberId }),
  list_features: z.object({ project_id: numberId, epic_id: numberId.optional() }),
  search_cards: z.object({ project_id: numberId, q: z.string() }),
  get_card: z.object({ card_id: numberId }),
  list_test_suites: z.object({ project_id: numberId }),
  list_test_cases: z.object({ card_id: numberId }),
  get_test_case: z.object({ test_case_id: numberId }),
  get_calendar: z.object({ project_id: numberId, from: dateSchema, to: dateSchema }),

  create_card: z.object({
    lane_id: numberId,
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional().default(''),
    priority: priorityEnum.optional().default('p2'),
    story_points: z.number().int().min(0).max(999).nullable().optional(),
    assignee: z.string().max(200).nullable().optional(),
    sprint_id: numberId.nullable().optional(),
    feature_id: numberId.nullable().optional(),
  }),
  create_sprint: z.object({
    project_id: numberId,
    name: z.string().min(1).max(200),
    start_date: dateSchema,
    end_date: dateSchema,
    goal: z.string().max(2000).optional().default(''),
    status: sprintStatusEnum.optional().default('planned'),
  }),
  create_test_case: z.object({
    card_id: numberId,
    title: z.string().min(1),
    description: z.string().optional(),
    suite_id: numberId.optional(),
    priority: testPriorityEnum.optional().default('medium'),
    test_type: testTypeEnum.optional().default('manual'),
    preconditions: z.string().optional(),
    expected_result: z.string().optional(),
    assigned_to: z.string().optional(),
  }),
  record_test_run: z.object({
    test_case_id: numberId,
    status: testRunStatusEnum,
    notes: z.string().optional(),
    run_by: z.string().optional(),
  }),
  create_calendar_event: z.object({
    project_id: numberId,
    title: z.string().min(1).max(300),
    start_date: dateSchema,
    end_date: dateSchema,
    description: z.string().max(2000).nullable().optional(),
    color: hexColor.nullable().optional(),
  }),

  update_card: z.object({
    card_id: numberId,
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    priority: priorityEnum.optional(),
    story_points: z.number().int().min(0).max(999).nullable().optional(),
    assignee: z.string().max(200).nullable().optional(),
    sprint_id: numberId.nullable().optional(),
    feature_id: numberId.nullable().optional(),
    due_date: optionalDateSchema,
  }),
  move_card: z.object({
    card_id: numberId,
    lane_id: numberId,
    position: z.number().int().min(0).optional(),
  }),
  update_sprint: z.object({
    sprint_id: numberId,
    name: z.string().min(1).max(200).optional(),
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional(),
    goal: z.string().max(2000).optional(),
    status: sprintStatusEnum.optional(),
  }),
  update_test_case: z.object({
    test_case_id: numberId,
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: testCaseStatusEnum.optional(),
    priority: testPriorityEnum.optional(),
    test_type: testTypeEnum.optional(),
  }),
  update_calendar_event: z.object({
    event_id: numberId,
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(2000).nullable().optional(),
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
    color: hexColor.nullable().optional(),
  }),

  delete_card: z.object({ card_id: numberId }),
  delete_sprint: z.object({ sprint_id: numberId }),
  delete_test_case: z.object({ test_case_id: numberId }),
  delete_calendar_event: z.object({ event_id: numberId }),

  get_velocity_report: z.object({ project_id: numberId }),
  get_cycle_time_report: z.object({ project_id: numberId }),
  get_capacity_report: z.object({ project_id: numberId, sprint_id: numberId }),
}

function validateInput(toolName: string, input: unknown): { ok: true; data: any } | { ok: false; message: string } {
  const schema = TOOL_SCHEMAS[toolName]
  if (!schema) return { ok: true, data: input }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map(i => i.message).join('; ') }
  return { ok: true, data: parsed.data }
}

// ── RBAC helpers shared across write handlers ───────────────────────────────

/** Resolves whether the user may write to the epic that owns the given feature (null feature/epic = unrestricted, matching canReadFeatureEpic's fallback). */
async function assertCanWriteFeature(user: McpUser, featureId: number | null): Promise<void> {
  if (user.role === 'super_admin' || !featureId) return
  const feature = await db.get<{ epic_id: number | null }>('SELECT epic_id FROM features WHERE id = ?', featureId)
  if (!feature?.epic_id) return
  if (!(await canWriteEpic(user.id, feature.epic_id, user.role))) throw new Error('forbidden')
}

async function getCardFeatureId(cardId: number): Promise<number | null> {
  const row = await db.get<{ feature_id: number | null }>('SELECT feature_id FROM cards WHERE id = ?', cardId)
  return row?.feature_id ?? null
}

async function assertProjectExists(projectId: number): Promise<void> {
  const row = await db.get('SELECT id FROM projects WHERE id = ?', projectId)
  if (!row) throw new Error('project not found')
}

// ── Read tool handlers ───────────────────────────────────────────────────────

async function listProjects(_user: McpUser, _input: Record<string, never>) {
  const rows = await db.all(
    `SELECT p.*, COUNT(sl.id) as lane_count
     FROM projects p
     LEFT JOIN swim_lanes sl ON sl.project_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
  )
  return toContent(rows)
}

async function listSprints(_user: McpUser, input: { project_id: number }) {
  await assertProjectExists(input.project_id)
  const rows = await db.all(
    'SELECT * FROM sprints WHERE project_id = ? AND is_default = 0 ORDER BY start_date DESC',
    input.project_id,
  )
  return toContent(rows)
}

async function listEpics(user: McpUser, input: { project_id: number }) {
  await assertProjectExists(input.project_id)

  let rows
  if (user.role === 'super_admin') {
    rows = await db.all(
      `SELECT e.*,
        (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
        (SELECT COUNT(*) FROM cards s JOIN features f ON f.id = s.feature_id WHERE f.epic_id = e.id) AS story_count
       FROM epics e WHERE e.project_id = ? AND e.is_default = 0 ORDER BY e.position, e.id`,
      input.project_id,
    )
  } else {
    rows = await db.all(
      `SELECT e.*,
        (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) AS feature_count,
        (SELECT COUNT(*) FROM cards s JOIN features f ON f.id = s.feature_id WHERE f.epic_id = e.id) AS story_count
       FROM epics e
       WHERE e.project_id = ?
         AND e.is_default = 0
         AND EXISTS (SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?)
       ORDER BY e.position, e.id`,
      input.project_id, user.id,
    )
  }
  return toContent(rows)
}

async function listFeatures(user: McpUser, input: { project_id: number; epic_id?: number }) {
  await assertProjectExists(input.project_id)

  const FEATURE_WITH_COUNTS = `
    SELECT f.*,
      (SELECT COUNT(*) FROM cards s WHERE s.feature_id = f.id) AS story_count,
      (SELECT COUNT(*) FROM cards s
         JOIN swim_lanes sl ON sl.id = s.swim_lane_id
         WHERE s.feature_id = f.id AND sl.is_done_col = 1) AS done_story_count
    FROM features f
  `

  let rows
  if (user.role === 'super_admin') {
    rows = input.epic_id
      ? await db.all(`${FEATURE_WITH_COUNTS} WHERE f.project_id = ? AND f.epic_id = ? AND f.is_default = 0 ORDER BY f.position, f.id`, input.project_id, input.epic_id)
      : await db.all(`${FEATURE_WITH_COUNTS} WHERE f.project_id = ? AND f.is_default = 0 ORDER BY f.position, f.id`, input.project_id)
  } else {
    const accessFilter = `(e.is_default = 1 OR EXISTS (SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?))`
    rows = input.epic_id
      ? await db.all(
          `${FEATURE_WITH_COUNTS}
           JOIN epics e ON e.id = f.epic_id
           WHERE f.project_id = ? AND f.epic_id = ? AND f.is_default = 0 AND ${accessFilter}
           ORDER BY f.position, f.id`,
          input.project_id, input.epic_id, user.id,
        )
      : await db.all(
          `${FEATURE_WITH_COUNTS}
           JOIN epics e ON e.id = f.epic_id
           WHERE f.project_id = ? AND f.is_default = 0 AND ${accessFilter}
           ORDER BY f.position, f.id`,
          input.project_id, user.id,
        )
  }
  return toContent(rows)
}

async function searchCards(_user: McpUser, input: { project_id: number; q: string }) {
  const q = input.q.trim()
  if (q.length < 2) return toContent([])

  const rows = await db.all(
    `SELECT c.id, c.title, c.priority, c.story_points, c.assignee, c.swim_lane_id, c.sprint_id
     FROM cards c
     LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
     LEFT JOIN sprints s ON s.id = c.sprint_id
     WHERE (sl.project_id = ? OR s.project_id = ?)
       AND c.title LIKE ? ESCAPE '\\'
     ORDER BY c.title
     LIMIT 20`,
    input.project_id, input.project_id, `%${q.replace(/[%_\\]/g, '\\$&')}%`,
  )
  return toContent(rows)
}

async function getCard(user: McpUser, input: { card_id: number }) {
  const card = await db.get<{ id: number; feature_id: number | null; swim_lane_id: number | null }>(
    'SELECT * FROM cards WHERE id = ?', input.card_id,
  )
  if (!card) throw new Error('card not found')
  if (!(await canReadFeatureEpic(user.id, card.feature_id, user.role))) throw new Error('forbidden')

  const [labels, comments, activity, tasks] = await Promise.all([
    db.all(
      `SELECT l.* FROM labels l
       JOIN card_labels cl ON cl.label_id = l.id
       WHERE cl.card_id = ?
       ORDER BY l.id`,
      input.card_id,
    ),
    db.all('SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC', input.card_id),
    db.all('SELECT * FROM activity_log WHERE card_id = ? ORDER BY created_at DESC', input.card_id),
    db.all('SELECT * FROM tasks WHERE story_id = ? ORDER BY position, id', input.card_id),
  ])

  return toContent({ ...(card as object), labels, comments, activity, tasks })
}

async function listTestSuites(_user: McpUser, input: { project_id: number }) {
  await assertProjectExists(input.project_id)
  return toContent(await db.all('SELECT * FROM test_suites WHERE project_id = ? ORDER BY id', input.project_id))
}

type TestCaseRow = {
  id: number; suite_id: number | null; card_id: number; project_id: number
  title: string; description: string | null; status: string; priority: string
  test_type: string; steps: string | null; preconditions: string | null
  expected_result: string | null; assigned_to: string | null
  position: number; created_at: string; updated_at: string
}

function withParsedSteps(tc: TestCaseRow) {
  let steps = null
  if (tc.steps) {
    try { steps = JSON.parse(tc.steps) } catch { steps = null }
  }
  return { ...tc, steps }
}

async function listTestCases(_user: McpUser, input: { card_id: number }) {
  const card = await db.get('SELECT id FROM cards WHERE id = ?', input.card_id)
  if (!card) throw new Error('card not found')

  type RowWithRun = TestCaseRow & {
    latest_run_id: number | null; latest_run_status: string | null
    latest_run_notes: string | null; latest_run_by: string | null; latest_run_at: string | null
  }

  const rows = await db.all<RowWithRun>(`
    SELECT tc.*,
      tr.id     as latest_run_id,     tr.status as latest_run_status,
      tr.notes  as latest_run_notes,  tr.run_by as latest_run_by,
      tr.run_at as latest_run_at
    FROM test_cases tc
    LEFT JOIN test_runs tr ON tr.id = (
      SELECT id FROM test_runs WHERE test_case_id = tc.id ORDER BY run_at DESC, id DESC LIMIT 1
    )
    WHERE tc.card_id = ?
    ORDER BY tc.position, tc.id
  `, input.card_id)

  const cases = rows.map(({ latest_run_id, latest_run_status, latest_run_notes, latest_run_by, latest_run_at, ...tc }) => ({
    ...withParsedSteps(tc as TestCaseRow),
    latest_run: latest_run_id
      ? { id: latest_run_id, status: latest_run_status, notes: latest_run_notes, run_by: latest_run_by, run_at: latest_run_at }
      : null,
  }))

  const summary = {
    total: cases.length,
    passed: cases.filter(r => r.status === 'passed').length,
    failed: cases.filter(r => r.status === 'failed').length,
    untested: cases.filter(r => r.status === 'untested').length,
    blocked: cases.filter(r => r.status === 'blocked').length,
    skipped: cases.filter(r => r.status === 'skipped').length,
  }

  return toContent({ cases, summary })
}

async function getTestCase(_user: McpUser, input: { test_case_id: number }) {
  const tc = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', input.test_case_id)
  if (!tc) throw new Error('test case not found')
  const runs = await db.all('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY run_at DESC, id DESC', input.test_case_id)
  return toContent({ ...withParsedSteps(tc), runs })
}

async function getCalendar(user: McpUser, input: { project_id: number; from: string; to: string }) {
  await assertProjectExists(input.project_id)
  const { project_id: projectId, from, to } = input

  const sprints = await db.all(
    `SELECT id, name, start_date, end_date, status
       FROM sprints
      WHERE project_id = ? AND is_default = 0 AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    projectId, to, from,
  )

  let epics
  if (user.role === 'super_admin') {
    epics = await db.all(
      `SELECT id, title, start_date, end_date, status, priority
         FROM epics
        WHERE project_id = ? AND is_default = 0
          AND start_date IS NOT NULL AND end_date IS NOT NULL
          AND start_date <= ? AND end_date >= ?
        ORDER BY start_date`,
      projectId, to, from,
    )
  } else {
    epics = await db.all(
      `SELECT id, title, start_date, end_date, status, priority
         FROM epics e
        WHERE e.project_id = ? AND e.is_default = 0
          AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
          AND e.start_date <= ? AND e.end_date >= ?
          AND EXISTS (SELECT 1 FROM epic_access ea WHERE ea.epic_id = e.id AND ea.user_id = ?)
        ORDER BY e.start_date`,
      projectId, to, from, user.id,
    )
  }

  const features = await db.all(
    `SELECT id, title, start_date, end_date, status, priority, epic_id
       FROM features
      WHERE project_id = ? AND is_default = 0
        AND start_date IS NOT NULL AND end_date IS NOT NULL
        AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    projectId, to, from,
  )

  const holidays = await db.all(
    `SELECT id, title, description, start_date, end_date, color, created_by, created_at
       FROM calendar_entries
      WHERE kind = 'holiday' AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    to, from,
  )

  const events = await db.all(
    `SELECT id, project_id, title, description, start_date, end_date, color, created_by, created_at
       FROM calendar_entries
      WHERE kind = 'event' AND project_id = ? AND start_date <= ? AND end_date >= ?
      ORDER BY start_date`,
    projectId, to, from,
  )

  const vacations = await db.all(
    `SELECT ce.id, ce.user_id, ce.title, ce.description, ce.start_date, ce.end_date,
            ce.color, ce.created_by, ce.created_at,
            u.display_name AS user_display_name, u.email AS user_email
       FROM calendar_entries ce
       LEFT JOIN users u ON u.id = ce.user_id
      WHERE ce.kind = 'vacation' AND ce.start_date <= ? AND ce.end_date >= ?
      ORDER BY ce.start_date`,
    to, from,
  )

  return toContent({ sprints, epics, features, holidays, events, vacations })
}

// ── Create tool handlers ─────────────────────────────────────────────────────

async function createCard(user: McpUser, input: {
  lane_id: number; title: string; description: string; priority: string
  story_points?: number | null; assignee?: string | null
  sprint_id?: number | null; feature_id?: number | null
}) {
  const lane = await db.get<{ id: number; project_id: number }>('SELECT id, project_id FROM swim_lanes WHERE id = ?', input.lane_id)
  if (!lane) throw new Error('lane not found')

  const resolvedFeatureId = input.feature_id ?? await resolveDefaultFeature(lane.project_id)
  await assertCanWriteFeature(user, resolvedFeatureId)

  const resolvedSprintId = input.sprint_id ?? await resolveDefaultSprint(lane.project_id)
  const maxPosRow = await db.get<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE swim_lane_id = ?', input.lane_id)

  const created = await db.transaction(async () => {
    const { lastID } = await db.run(
      `INSERT INTO cards
         (swim_lane_id, sprint_id, feature_id, title, description, priority, story_points, assignee, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.lane_id, resolvedSprintId, resolvedFeatureId, input.title, input.description, input.priority,
      input.story_points ?? null, input.assignee ?? null, (maxPosRow?.m ?? -1) + 1,
    )

    await logActivity(lastID, 'create', { swim_lane_id: input.lane_id }, user.id)

    if (input.assignee) {
      await notifyAssignment({
        assigneeName: input.assignee,
        assignedById: user.id,
        assignedByName: user.display_name,
        entityType: 'card',
        entityId: lastID,
        entityTitle: input.title,
      })
    }

    return db.get('SELECT * FROM cards WHERE id = ?', lastID)
  })()

  emitBoardEvent({ type: 'card:created', projectId: lane.project_id, data: created })
  return toContent(created)
}

async function createSprint(user: McpUser, input: {
  project_id: number; name: string; start_date: string; end_date: string; goal: string; status: string
}) {
  if (!(await canWrite(user.id, input.project_id, user.role))) throw new Error('forbidden')
  await assertProjectExists(input.project_id)

  const { lastID } = await db.run(
    'INSERT INTO sprints (project_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
    input.project_id, input.name, input.goal, input.start_date, input.end_date, input.status,
  )
  return toContent(await db.get('SELECT * FROM sprints WHERE id = ?', lastID))
}

async function createTestCase(user: McpUser, input: {
  card_id: number; title: string; description?: string; suite_id?: number
  priority: string; test_type: string
  preconditions?: string; expected_result?: string; assigned_to?: string
}) {
  const card = await db.get<{ id: number; swim_lane_id: number | null; column_id: number | null; feature_id: number | null }>(
    'SELECT id, swim_lane_id, column_id, feature_id FROM cards WHERE id = ?', input.card_id,
  )
  if (!card) throw new Error('card not found')
  await assertCanWriteFeature(user, card.feature_id)

  const projectId = card.swim_lane_id
    ? (await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', card.swim_lane_id))?.project_id ?? null
    : card.column_id
      ? (await db.get<{ project_id: number }>('SELECT project_id FROM columns WHERE id = ?', card.column_id))?.project_id ?? null
      : null
  if (!projectId) throw new Error('cannot determine project for card')

  if (input.suite_id) {
    const suite = await db.get('SELECT id FROM test_suites WHERE id = ? AND project_id = ?', input.suite_id, projectId)
    if (!suite) throw new Error('test suite not found in this project')
  }

  const maxPosRow = await db.get<{ m: number }>('SELECT COALESCE(MAX(position), -1) as m FROM test_cases WHERE card_id = ?', input.card_id)

  const { lastID } = await db.run(`
    INSERT INTO test_cases
      (suite_id, card_id, project_id, title, description, priority, test_type,
       steps, preconditions, expected_result, assigned_to, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    input.suite_id ?? null, input.card_id, projectId, input.title,
    input.description ?? null, input.priority, input.test_type,
    null, input.preconditions ?? null, input.expected_result ?? null, input.assigned_to ?? null, (maxPosRow?.m ?? -1) + 1,
  )

  const row = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', lastID)
  return toContent(withParsedSteps(row!))
}

async function recordTestRun(user: McpUser, input: { test_case_id: number; status: string; notes?: string; run_by?: string }) {
  const tc = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', input.test_case_id)
  if (!tc) throw new Error('test case not found')
  await assertCanWriteFeature(user, await getCardFeatureId(tc.card_id))

  const run = await db.transaction(async () => {
    const { lastID } = await db.run(
      'INSERT INTO test_runs (test_case_id, card_id, status, notes, run_by) VALUES (?, ?, ?, ?, ?)',
      input.test_case_id, tc.card_id, input.status, input.notes ?? null, input.run_by ?? null,
    )
    await db.run("UPDATE test_cases SET status = ?, updated_at = datetime('now') WHERE id = ?", input.status, input.test_case_id)
    await logActivity(tc.card_id, 'test_run', { title: tc.title, status: input.status, run_by: input.run_by ?? null }, user.id)
    return db.get('SELECT * FROM test_runs WHERE id = ?', lastID)
  })()

  return toContent(run)
}

async function createCalendarEvent(user: McpUser, input: {
  project_id: number; title: string; start_date: string; end_date: string
  description?: string | null; color?: string | null
}) {
  await assertProjectExists(input.project_id)
  if (!(await canWrite(user.id, input.project_id, user.role))) throw new Error('forbidden')
  if (input.start_date > input.end_date) throw new Error('end_date must be on or after start_date')

  const { lastID } = await db.run(
    `INSERT INTO calendar_entries (kind, project_id, title, description, start_date, end_date, color, created_by)
     VALUES ('event', ?, ?, ?, ?, ?, ?, ?)`,
    input.project_id, input.title, input.description ?? null, input.start_date, input.end_date, input.color ?? null, user.id,
  )

  const entry = await db.get('SELECT * FROM calendar_entries WHERE id = ?', lastID)
  emitBoardEvent({ type: 'calendar:entry:created', projectId: input.project_id, data: entry })
  return toContent(entry)
}

// ── Update tool handlers ─────────────────────────────────────────────────────

async function updateCard(user: McpUser, input: {
  card_id: number; title?: string; description?: string; priority?: string
  story_points?: number | null; assignee?: string | null
  sprint_id?: number | null; feature_id?: number | null; due_date?: string | null
}) {
  const { card_id, ...fields } = input
  const existing = await db.get<Record<string, unknown>>('SELECT * FROM cards WHERE id = ?', card_id)
  if (!existing) throw new Error('card not found')
  await assertCanWriteFeature(user, existing.feature_id as number | null)

  const allowed = ['title', 'description', 'priority', 'story_points', 'assignee', 'sprint_id', 'feature_id', 'due_date'] as const
  const upd = buildUpdate(fields, allowed)
  if (!upd) throw new Error('no fields to update')

  upd.params.push(card_id)
  await db.run(`UPDATE cards SET ${upd.sql} WHERE id = ?`, ...upd.params)

  for (const key of allowed) {
    if (key in fields) {
      await logActivity(card_id, 'field_changed', { field: key, from: existing[key] ?? null, to: (fields as Record<string, unknown>)[key] ?? null }, user.id)
    }
  }

  if ('assignee' in fields && fields.assignee && fields.assignee !== existing.assignee) {
    await notifyAssignment({
      assigneeName: fields.assignee,
      assignedById: user.id,
      assignedByName: user.display_name,
      entityType: 'card',
      entityId: card_id,
      entityTitle: existing.title as string,
    })
  }

  const updated = await db.get<{ swim_lane_id?: number }>('SELECT * FROM cards WHERE id = ?', card_id)
  if (updated) {
    const laneRow = updated.swim_lane_id
      ? await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', updated.swim_lane_id)
      : undefined
    if (laneRow) emitBoardEvent({ type: 'card:updated', projectId: laneRow.project_id, data: updated })
  }
  return toContent(updated)
}

async function moveCard(user: McpUser, input: { card_id: number; lane_id: number; position?: number }) {
  const card = await db.get<{ id: number; swim_lane_id: number | null; feature_id: number | null }>('SELECT * FROM cards WHERE id = ?', input.card_id)
  if (!card) throw new Error('card not found')
  await assertCanWriteFeature(user, card.feature_id)

  const lane = await db.get('SELECT id FROM swim_lanes WHERE id = ?', input.lane_id)
  if (!lane) throw new Error('lane not found')

  await db.transaction(async () => {
    const siblings = await db.all<{ id: number }>(
      'SELECT id FROM cards WHERE swim_lane_id = ? AND id != ? ORDER BY position, id',
      input.lane_id, input.card_id,
    )
    const ids = siblings.map(r => r.id)
    const targetPos = input.position !== undefined ? Math.max(0, Math.min(input.position, ids.length)) : ids.length
    ids.splice(targetPos, 0, input.card_id)

    for (let i = 0; i < ids.length; i++) {
      await db.run('UPDATE cards SET position = ? WHERE id = ?', i, ids[i])
    }
    await db.run("UPDATE cards SET swim_lane_id = ?, updated_at = datetime('now') WHERE id = ?", input.lane_id, input.card_id)
    await logActivity(input.card_id, 'move', { from_lane_id: card.swim_lane_id, to_lane_id: input.lane_id, position: targetPos }, user.id)
  })()

  const movedCard = await db.get('SELECT * FROM cards WHERE id = ?', input.card_id)
  const movedLane = await db.get<{ project_id: number; is_done_col: number }>('SELECT project_id, is_done_col FROM swim_lanes WHERE id = ?', input.lane_id)
  if (movedLane) emitBoardEvent({ type: 'card:moved', projectId: movedLane.project_id, data: movedCard })

  if (movedLane?.is_done_col) {
    Promise.resolve(closeGitHubIssues(input.card_id)).catch((e) => console.error('[mcpServer] closeGitHubIssues failed:', e))
  }

  return toContent(movedCard)
}

async function updateSprint(user: McpUser, input: {
  sprint_id: number; name?: string; start_date?: string; end_date?: string; goal?: string; status?: string
}) {
  const { sprint_id, ...fields } = input
  const sprint = await db.get<{ id: number; project_id: number }>('SELECT * FROM sprints WHERE id = ?', sprint_id)
  if (!sprint) throw new Error('sprint not found')
  if (!(await canWrite(user.id, sprint.project_id, user.role))) throw new Error('forbidden')

  const allowed = Object.keys(fields) as (keyof typeof fields)[]
  const upd = buildUpdate(fields, allowed, { withTimestamp: false })
  if (!upd) throw new Error('no fields to update')

  upd.params.push(sprint_id)
  await db.run(`UPDATE sprints SET ${upd.sql} WHERE id = ?`, ...upd.params)
  return toContent(await db.get('SELECT * FROM sprints WHERE id = ?', sprint_id))
}

async function updateTestCase(user: McpUser, input: {
  test_case_id: number; title?: string; description?: string; status?: string; priority?: string; test_type?: string
}) {
  const { test_case_id, ...fields } = input
  const tc = await db.get<{ id: number; card_id: number }>('SELECT id, card_id FROM test_cases WHERE id = ?', test_case_id)
  if (!tc) throw new Error('test case not found')
  await assertCanWriteFeature(user, await getCardFeatureId(tc.card_id))

  const upd = buildUpdate(fields, ['title', 'description', 'status', 'priority', 'test_type'])
  if (!upd) throw new Error('no fields to update')

  upd.params.push(test_case_id)
  await db.run(`UPDATE test_cases SET ${upd.sql} WHERE id = ?`, ...upd.params)

  const updated = await db.get<TestCaseRow>('SELECT * FROM test_cases WHERE id = ?', test_case_id)
  return toContent(withParsedSteps(updated!))
}

async function updateCalendarEvent(user: McpUser, input: {
  event_id: number; title?: string; description?: string | null; start_date?: string | null; end_date?: string | null; color?: string | null
}) {
  const { event_id, ...fields } = input
  const existing = await db.get<{ id: number; project_id: number | null; start_date: string; end_date: string }>(
    "SELECT * FROM calendar_entries WHERE id = ? AND kind = 'event'", event_id,
  )
  if (!existing || existing.project_id === null) throw new Error('event not found')
  if (!(await canWrite(user.id, existing.project_id, user.role))) throw new Error('forbidden')

  const merged = {
    start_date: fields.start_date ?? existing.start_date,
    end_date: fields.end_date ?? existing.end_date,
  }
  if (merged.start_date > merged.end_date) throw new Error('end_date must be on or after start_date')

  const sets: string[] = ["updated_at = datetime('now')"]
  const vals: unknown[] = []
  for (const k of ['title', 'description', 'start_date', 'end_date', 'color'] as const) {
    if (k in fields) {
      sets.push(`${k} = ?`)
      vals.push((fields as Record<string, unknown>)[k] ?? null)
    }
  }
  if (sets.length === 1) throw new Error('no fields to update')

  vals.push(event_id)
  await db.run(`UPDATE calendar_entries SET ${sets.join(', ')} WHERE id = ?`, ...vals)

  const entry = await db.get('SELECT * FROM calendar_entries WHERE id = ?', event_id)
  emitBoardEvent({ type: 'calendar:entry:updated', projectId: existing.project_id, data: entry })
  return toContent(entry)
}

// ── Delete tool handlers ─────────────────────────────────────────────────────

async function deleteCard(user: McpUser, input: { card_id: number }) {
  const card = await db.get<{ id: number; swim_lane_id: number | null; feature_id: number | null }>(
    'SELECT id, swim_lane_id, feature_id FROM cards WHERE id = ?', input.card_id,
  )
  if (!card) throw new Error('card not found')
  await assertCanWriteFeature(user, card.feature_id)

  const laneRow = card.swim_lane_id
    ? await db.get<{ project_id: number }>('SELECT project_id FROM swim_lanes WHERE id = ?', card.swim_lane_id)
    : undefined

  await db.run('DELETE FROM cards WHERE id = ?', input.card_id)

  if (laneRow) emitBoardEvent({ type: 'card:deleted', projectId: laneRow.project_id, data: { id: input.card_id } })
  return toContent({ id: input.card_id })
}

async function deleteSprint(user: McpUser, input: { sprint_id: number }) {
  const sprint = await db.get<{ id: number; is_default: number; project_id: number }>(
    'SELECT id, is_default, project_id FROM sprints WHERE id = ?', input.sprint_id,
  )
  if (!sprint) throw new Error('sprint not found')
  if (sprint.is_default) throw new Error('Cannot delete the Default Sprint')
  if (!(await canWrite(user.id, sprint.project_id, user.role))) throw new Error('forbidden')

  await db.transaction(async () => {
    await db.run("UPDATE cards SET sprint_id = NULL, updated_at = datetime('now') WHERE sprint_id = ?", input.sprint_id)
    await db.run('DELETE FROM sprints WHERE id = ?', input.sprint_id)
  })()

  return toContent({ id: input.sprint_id })
}

async function deleteTestCase(user: McpUser, input: { test_case_id: number }) {
  const tc = await db.get<{ id: number; card_id: number }>('SELECT id, card_id FROM test_cases WHERE id = ?', input.test_case_id)
  if (!tc) throw new Error('test case not found')
  await assertCanWriteFeature(user, await getCardFeatureId(tc.card_id))

  await db.run('DELETE FROM test_cases WHERE id = ?', input.test_case_id)
  return toContent({ id: input.test_case_id })
}

async function deleteCalendarEvent(user: McpUser, input: { event_id: number }) {
  const existing = await db.get<{ id: number; project_id: number | null }>(
    "SELECT id, project_id FROM calendar_entries WHERE id = ? AND kind = 'event'", input.event_id,
  )
  if (!existing || existing.project_id === null) throw new Error('event not found')
  if (!(await canWrite(user.id, existing.project_id, user.role))) throw new Error('forbidden')

  await db.run('DELETE FROM calendar_entries WHERE id = ?', input.event_id)
  emitBoardEvent({ type: 'calendar:entry:deleted', projectId: existing.project_id, data: { id: input.event_id, kind: 'event' } })
  return toContent({ id: input.event_id })
}

// ── Report tool handlers ─────────────────────────────────────────────────────

async function getVelocityReport(_user: McpUser, input: { project_id: number }) {
  await assertProjectExists(input.project_id)

  const sprints = await db.all<{
    id: number; name: string; status: string; start_date: string; end_date: string
    velocity_completed_points: number; velocity_total_points: number
    velocity_completed_stories: number; velocity_total_stories: number
  }>(
    `SELECT id, name, status, start_date, end_date,
            velocity_completed_points, velocity_total_points,
            velocity_completed_stories, velocity_total_stories
     FROM sprints WHERE project_id = ? AND is_default = 0 ORDER BY start_date, id`,
    input.project_id,
  )

  const result = await Promise.all(sprints.map(async (sprint) => {
    if (sprint.status === 'completed') {
      return {
        sprint_id: sprint.id, sprint_name: sprint.name, status: sprint.status,
        start_date: sprint.start_date, end_date: sprint.end_date,
        total_points: sprint.velocity_total_points, completed_points: sprint.velocity_completed_points,
        total_stories: sprint.velocity_total_stories, completed_stories: sprint.velocity_completed_stories,
      }
    }
    const totals = await getSprintPointTotals(sprint.id)
    return {
      sprint_id: sprint.id, sprint_name: sprint.name, status: sprint.status,
      start_date: sprint.start_date, end_date: sprint.end_date, ...totals,
    }
  }))

  return toContent(result)
}

async function getCycleTimeReport(_user: McpUser, input: { project_id: number }) {
  await assertProjectExists(input.project_id)
  return toContent(await getProjectCycleTime(input.project_id))
}

async function getCapacityReport(_user: McpUser, input: { project_id: number; sprint_id: number }) {
  await assertProjectExists(input.project_id)
  const sprint = await db.get('SELECT id FROM sprints WHERE id = ? AND project_id = ?', input.sprint_id, input.project_id)
  if (!sprint) throw new Error('sprint not found')
  return toContent(await getSprintCapacity(input.project_id, input.sprint_id))
}

async function getDashboardStats(user: McpUser, _input: Record<string, never>) {
  const [totalRow, activeRow, openRow, tcTotalRow, tcPassRow, tcFailRow, tcUnRow] = await Promise.all([
    db.get<{ n: number }>('SELECT COUNT(*) as n FROM projects'),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM sprints WHERE status = 'active'"),
    db.get<{ n: number }>(`SELECT COUNT(*) as n FROM cards c
      LEFT JOIN swim_lanes sl ON sl.id = c.swim_lane_id
      WHERE sl.is_done_col IS NULL OR sl.is_done_col = 0`),
    db.get<{ n: number }>('SELECT COUNT(*) as n FROM test_cases'),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM test_cases WHERE status = 'passed'"),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM test_cases WHERE status = 'failed'"),
    db.get<{ n: number }>("SELECT COUNT(*) as n FROM test_cases WHERE status = 'untested'"),
  ])

  return toContent({
    total_projects: totalRow?.n ?? 0,
    active_sprints: activeRow?.n ?? 0,
    open_cards: openRow?.n ?? 0,
    test_cases_total: tcTotalRow?.n ?? 0,
    test_cases_passed: tcPassRow?.n ?? 0,
    test_cases_failed: tcFailRow?.n ?? 0,
    test_cases_untested: tcUnRow?.n ?? 0,
    user_role: user.role,
  })
}

async function getDashboardProjects(_user: McpUser, _input: Record<string, never>) {
  const projects = await db.all<{ id: number; name: string; description: string; color: string; created_at: string }>(
    'SELECT * FROM projects ORDER BY created_at DESC',
  )

  const result = await Promise.all(projects.map(async (project) => {
    type LaneRow = { id: number; name: string; color: string; position: number; is_done_col: number; card_count: number }

    let lanes = await db.all<LaneRow>(
      `SELECT sl.id, sl.name, sl.color, sl.position, sl.is_done_col, COUNT(c.id) as card_count
       FROM swim_lanes sl
       LEFT JOIN cards c ON c.swim_lane_id = sl.id
       WHERE sl.project_id = ?
       GROUP BY sl.id
       ORDER BY sl.position, sl.id`,
      project.id,
    )

    if (lanes.length === 0) {
      lanes = await db.all<LaneRow>(
        `SELECT col.id, col.name, col.color, col.position,
                CASE WHEN col.position = (
                  SELECT MAX(c2.position) FROM columns c2 WHERE c2.project_id = col.project_id
                ) THEN 1 ELSE 0 END as is_done_col,
                COUNT(c.id) as card_count
         FROM columns col
         LEFT JOIN cards c ON c.column_id = col.id
         WHERE col.project_id = ?
         GROUP BY col.id
         ORDER BY col.position, col.id`,
        project.id,
      )
    }

    const total_cards = lanes.reduce((sum, l) => sum + l.card_count, 0)
    const open_cards = lanes.filter(l => !l.is_done_col).reduce((sum, l) => sum + l.card_count, 0)

    const active_sprint = await db.get(
      "SELECT * FROM sprints WHERE project_id = ? AND status = 'active' LIMIT 1", project.id,
    ) ?? null

    const testStats = await db.get<{
      test_cases_total: number; test_cases_passed: number; test_cases_failed: number; test_cases_untested: number
    }>(
      `SELECT COUNT(*) as test_cases_total,
        SUM(CASE WHEN status = 'passed'   THEN 1 ELSE 0 END) as test_cases_passed,
        SUM(CASE WHEN status = 'failed'   THEN 1 ELSE 0 END) as test_cases_failed,
        SUM(CASE WHEN status = 'untested' THEN 1 ELSE 0 END) as test_cases_untested
       FROM test_cases WHERE project_id = ?`,
      project.id,
    )

    return { ...project, lanes, total_cards, open_cards, active_sprint, ...testStats }
  }))

  return toContent(result)
}

// ── Handler registry + dispatcher ────────────────────────────────────────────

type ToolHandler = (user: McpUser, input: any) => Promise<CallToolResult>

const handlers: Record<string, ToolHandler> = {
  list_projects: listProjects,
  list_sprints: listSprints,
  list_epics: listEpics,
  list_features: listFeatures,
  search_cards: searchCards,
  get_card: getCard,
  list_test_suites: listTestSuites,
  list_test_cases: listTestCases,
  get_test_case: getTestCase,
  get_calendar: getCalendar,

  create_card: createCard,
  create_sprint: createSprint,
  create_test_case: createTestCase,
  record_test_run: recordTestRun,
  create_calendar_event: createCalendarEvent,

  update_card: updateCard,
  move_card: moveCard,
  update_sprint: updateSprint,
  update_test_case: updateTestCase,
  update_calendar_event: updateCalendarEvent,

  delete_card: deleteCard,
  delete_sprint: deleteSprint,
  delete_test_case: deleteTestCase,
  delete_calendar_event: deleteCalendarEvent,

  get_velocity_report: getVelocityReport,
  get_cycle_time_report: getCycleTimeReport,
  get_capacity_report: getCapacityReport,
  get_dashboard_stats: getDashboardStats,
  get_dashboard_projects: getDashboardProjects,
}

export async function callTool(user: McpUser, toolName: string, toolInput: Record<string, unknown>): Promise<CallToolResult> {
  const bucket = TOOL_FLAG_BUCKET[toolName]
  if (!bucket) return errorResult(`unknown tool: ${toolName}`)

  const flagName = `${bucket}_mcp` as const
  if (!(await isEnabled(flagName))) {
    return errorResult(`${flagName} feature is disabled`)
  }
  if (CALENDAR_TOOLS.has(toolName) && !(await isEnabled('calendar'))) {
    return errorResult('calendar feature is disabled')
  }

  const parsed = validateInput(toolName, toolInput)
  if (!parsed.ok) return errorResult(`invalid input: ${parsed.message}`)

  try {
    return await handlers[toolName](user, parsed.data)
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : 'internal error')
  }
}

export function createMcpServer(user: McpUser) {
  const server = new Server({ name: 'slateflow-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name
    const toolInput = (request.params.arguments ?? {}) as Record<string, unknown>
    return await callTool(user, toolName, toolInput)
  })

  return server
}
