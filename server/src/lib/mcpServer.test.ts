import { describe, it, expect, beforeEach, vi } from 'vitest'

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
import { emitBoardEvent } from './eventBus.js'
import { logActivity } from './activityLog.js'
import { notifyAssignment } from './notifications.js'
import { closeGitHubIssues } from '../routes/cardLinks.js'
import { canWrite as canWriteEpic, canReadFeatureEpic } from './epicAccess.js'
import { canWrite as canWriteProject } from './projectAccess.js'
import { callTool, tools, type McpUser } from './mcpServer.js'

const READER: McpUser = { id: 1, email: 'reader@test.com', role: 'global_reader', display_name: 'Reader' }
const ADMIN: McpUser = { id: 2, email: 'admin@test.com', role: 'super_admin', display_name: 'Admin' }

function parse(result: Awaited<ReturnType<typeof callTool>>): any {
  return JSON.parse(result.content[0].text as string)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isEnabled).mockResolvedValue(true)
  vi.mocked(canWriteEpic).mockResolvedValue(true)
  vi.mocked(canReadFeatureEpic).mockResolvedValue(true)
  vi.mocked(canWriteProject).mockResolvedValue(true)
  vi.mocked(db.get).mockResolvedValue({ id: 1 })
  vi.mocked(db.all).mockResolvedValue([])
  vi.mocked(db.run).mockResolvedValue({ lastID: 1, changes: 1 })
  vi.mocked(db.transaction).mockImplementation((fn: () => Promise<unknown>) => async () => fn())
})

// ─── Tool inventory ───────────────────────────────────────────────────────────

describe('tool definitions', () => {
  it('declares exactly 29 tools', () => {
    expect(tools).toHaveLength(29)
  })

  it('groups tools into the five documented buckets', () => {
    const names = tools.map(t => t.name)
    const readTools = ['list_projects', 'list_sprints', 'list_epics', 'list_features', 'search_cards', 'get_card', 'list_test_suites', 'list_test_cases', 'get_test_case', 'get_calendar']
    const createTools = ['create_card', 'create_sprint', 'create_test_case', 'record_test_run', 'create_calendar_event']
    const updateTools = ['update_card', 'move_card', 'update_sprint', 'update_test_case', 'update_calendar_event']
    const deleteTools = ['delete_card', 'delete_sprint', 'delete_test_case', 'delete_calendar_event']
    const reportTools = ['get_velocity_report', 'get_cycle_time_report', 'get_capacity_report', 'get_dashboard_stats', 'get_dashboard_projects']
    for (const n of [...readTools, ...createTools, ...updateTools, ...deleteTools, ...reportTools]) {
      expect(names).toContain(n)
    }
  })

  it('rejects an unknown tool name', async () => {
    const result = await callTool(READER, 'not_a_real_tool', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('unknown tool: not_a_real_tool')
  })
})

// ─── Feature flag gating ──────────────────────────────────────────────────────

describe('feature flag gating', () => {
  it('blocks read tools when read_mcp is disabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag !== 'read_mcp')
    const result = await callTool(READER, 'list_projects', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('read_mcp feature is disabled')
  })

  it('blocks create tools when create_mcp is disabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag !== 'create_mcp')
    const result = await callTool(READER, 'create_card', { lane_id: 1, title: 'x' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('create_mcp feature is disabled')
  })

  it('blocks update tools when update_mcp is disabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag !== 'update_mcp')
    const result = await callTool(READER, 'update_card', { card_id: 1 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('update_mcp feature is disabled')
  })

  it('blocks delete tools when delete_mcp is disabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag !== 'delete_mcp')
    const result = await callTool(READER, 'delete_card', { card_id: 1 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('delete_mcp feature is disabled')
  })

  it('blocks report tools when report_mcp is disabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag !== 'report_mcp')
    const result = await callTool(READER, 'get_dashboard_stats', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('report_mcp feature is disabled')
  })
})

// ─── Calendar co-gate ─────────────────────────────────────────────────────────

describe('calendar flag co-gate', () => {
  it('blocks get_calendar when calendar is disabled even though read_mcp is enabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag === 'read_mcp')
    const result = await callTool(READER, 'get_calendar', { project_id: 1, from: '2024-01-01', to: '2024-01-31' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('calendar feature is disabled')
  })

  it('blocks get_calendar when read_mcp is disabled even though calendar is enabled', async () => {
    vi.mocked(isEnabled).mockImplementation(async (flag) => flag === 'calendar')
    const result = await callTool(READER, 'get_calendar', { project_id: 1, from: '2024-01-01', to: '2024-01-31' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('read_mcp feature is disabled')
  })

  it('allows get_calendar when both read_mcp and calendar are enabled', async () => {
    const result = await callTool(READER, 'get_calendar', { project_id: 1, from: '2024-01-01', to: '2024-01-31' })
    expect(result.isError).toBeUndefined()
    expect(parse(result)).toEqual({ sprints: [], epics: [], features: [], holidays: [], events: [], vacations: [] })
  })
})

// ─── Input validation ─────────────────────────────────────────────────────────

describe('zod input validation', () => {
  it('rejects create_card missing a required title', async () => {
    const result = await callTool(READER, 'create_card', { lane_id: 1 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('invalid input')
  })

  it('rejects a non-numeric project_id', async () => {
    const result = await callTool(READER, 'list_sprints', { project_id: 'abc' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('invalid input')
  })
})

// ─── Default-item filtering (MCP-only divergence from REST) ──────────────────

describe('default-item filtering', () => {
  it('list_epics excludes default epics via SQL filter', async () => {
    await callTool(ADMIN, 'list_epics', { project_id: 1 })
    const call = vi.mocked(db.all).mock.calls.find(c => (c[0] as string).includes('FROM epics'))
    expect(call?.[0]).toContain('is_default = 0')
  })

  it('list_features excludes default features via SQL filter', async () => {
    await callTool(ADMIN, 'list_features', { project_id: 1 })
    const call = vi.mocked(db.all).mock.calls.find(c => (c[0] as string).includes('FROM features'))
    expect(call?.[0]).toContain('is_default = 0')
  })
})

// ─── search_cards ─────────────────────────────────────────────────────────────

describe('search_cards', () => {
  it('returns [] without querying the db for a query under 2 characters', async () => {
    const result = await callTool(READER, 'search_cards', { project_id: 1, q: 'a' })
    expect(parse(result)).toEqual([])
    expect(db.all).not.toHaveBeenCalled()
  })

  it('escapes LIKE wildcards in the search term', async () => {
    await callTool(READER, 'search_cards', { project_id: 1, q: '50%_off' })
    const call = vi.mocked(db.all).mock.calls[0]
    expect(call[0]).toContain("ESCAPE '\\'")
    expect(call[call.length - 1]).toBe('%50\\%\\_off%')
  })
})

// ─── get_card ─────────────────────────────────────────────────────────────────

describe('get_card', () => {
  it('includes a tasks array alongside labels, comments, and activity', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 7, feature_id: 3, swim_lane_id: 1 })
    vi.mocked(db.all)
      .mockResolvedValueOnce([{ id: 1, name: 'bug' }])       // labels
      .mockResolvedValueOnce([{ id: 1, body: 'hi' }])        // comments
      .mockResolvedValueOnce([{ id: 1, action: 'create' }])  // activity
      .mockResolvedValueOnce([{ id: 1, title: 'subtask' }])  // tasks

    const result = await callTool(READER, 'get_card', { card_id: 7 })
    const data = parse(result)
    expect(data.tasks).toEqual([{ id: 1, title: 'subtask' }])
    expect(data.labels).toEqual([{ id: 1, name: 'bug' }])
  })

  it('is forbidden when the caller cannot read the card\'s epic', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 7, feature_id: 3, swim_lane_id: 1 })
    vi.mocked(canReadFeatureEpic).mockResolvedValueOnce(false)
    const result = await callTool(READER, 'get_card', { card_id: 7 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('forbidden')
  })

  it('returns not-found for a missing card', async () => {
    vi.mocked(db.get).mockResolvedValueOnce(undefined)
    const result = await callTool(READER, 'get_card', { card_id: 999 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('card not found')
  })
})

// ─── RBAC on write tools (MCP-only — REST has no equivalent check) ───────────

describe('create_card RBAC', () => {
  it('is forbidden when the caller cannot write to the target feature\'s epic', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 5 })   // lane
      .mockResolvedValueOnce({ epic_id: 9 })              // feature -> epic_id
    vi.mocked(canWriteEpic).mockResolvedValueOnce(false)

    const result = await callTool(READER, 'create_card', { lane_id: 1, title: 'New', feature_id: 3 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('forbidden')
  })

  it('super_admin bypasses the epic RBAC check and the card is created', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, project_id: 5 })                 // lane
      .mockResolvedValueOnce({ m: -1 })                                 // max position
      .mockResolvedValueOnce({ id: 10, title: 'New', assignee: 'Bob' }) // select after insert
    vi.mocked(db.run).mockResolvedValueOnce({ lastID: 10, changes: 1 })

    const result = await callTool(ADMIN, 'create_card', {
      lane_id: 1, title: 'New', feature_id: 3, sprint_id: 2, assignee: 'Bob',
    })

    expect(result.isError).toBeUndefined()
    expect(canWriteEpic).not.toHaveBeenCalled()
    expect(logActivity).toHaveBeenCalledWith(10, 'create', { swim_lane_id: 1 }, ADMIN.id)
    expect(notifyAssignment).toHaveBeenCalledWith(expect.objectContaining({ assigneeName: 'Bob', assignedByName: 'Admin' }))
    expect(emitBoardEvent).toHaveBeenCalledWith({ type: 'card:created', projectId: 5, data: { id: 10, title: 'New', assignee: 'Bob' } })
  })
})

describe('create_sprint RBAC', () => {
  it('is forbidden when the caller cannot write to the project', async () => {
    vi.mocked(canWriteProject).mockResolvedValueOnce(false)
    const result = await callTool(READER, 'create_sprint', {
      project_id: 1, name: 'Sprint 1', start_date: '2024-01-01', end_date: '2024-01-14',
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('forbidden')
    expect(db.run).not.toHaveBeenCalled()
  })
})

describe('move_card', () => {
  it('closes linked GitHub issues when moved into a done lane', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 2, feature_id: null }) // card
      .mockResolvedValueOnce({ id: 5 })                                    // target lane exists
    vi.mocked(db.all).mockResolvedValueOnce([])                            // siblings
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 5 })                   // moved card
      .mockResolvedValueOnce({ project_id: 9, is_done_col: 1 })            // moved lane

    await callTool(ADMIN, 'move_card', { card_id: 1, lane_id: 5 })
    expect(closeGitHubIssues).toHaveBeenCalledWith(1)
  })
})

describe('update_card', () => {
  it('notifies the new assignee when assignee changes', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, title: 'Story', assignee: 'Alice', feature_id: null })
      .mockResolvedValueOnce({ id: 1, title: 'Story', assignee: 'Bob', swim_lane_id: null })

    await callTool(ADMIN, 'update_card', { card_id: 1, assignee: 'Bob' })
    expect(notifyAssignment).toHaveBeenCalledWith(expect.objectContaining({ assigneeName: 'Bob', assignedByName: 'Admin' }))
  })
})

describe('delete_card RBAC', () => {
  it('is forbidden when the caller cannot write to the card\'s epic', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ id: 1, swim_lane_id: 2, feature_id: 3 }) // card
      .mockResolvedValueOnce({ epic_id: 9 })                             // feature -> epic_id
    vi.mocked(canWriteEpic).mockResolvedValueOnce(false)
    const result = await callTool(READER, 'delete_card', { card_id: 1 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('forbidden')
    expect(db.run).not.toHaveBeenCalled()
  })
})

// ─── delete_sprint (default protection + REST's null-out behavior) ──────────

describe('delete_sprint', () => {
  it('refuses to delete the Default Sprint', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1, is_default: 1, project_id: 5 })
    const result = await callTool(ADMIN, 'delete_sprint', { sprint_id: 1 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Default Sprint')
  })

  it('nulls out card sprint_id rather than reassigning to the Default Sprint', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 5, is_default: 0, project_id: 1 })
    await callTool(ADMIN, 'delete_sprint', { sprint_id: 5 })

    const runCalls = vi.mocked(db.run).mock.calls
    expect(runCalls.some(c => (c[0] as string).includes('UPDATE cards SET sprint_id = NULL'))).toBe(true)
    expect(runCalls.some(c => (c[0] as string).includes('DELETE FROM sprints'))).toBe(true)
  })
})

// ─── Report tools ─────────────────────────────────────────────────────────────

describe('report tools', () => {
  it('get_dashboard_stats aggregates global counts', async () => {
    vi.mocked(db.get)
      .mockResolvedValueOnce({ n: 3 })  // total_projects
      .mockResolvedValueOnce({ n: 1 })  // active_sprints
      .mockResolvedValueOnce({ n: 4 })  // open_cards
      .mockResolvedValueOnce({ n: 10 }) // test_cases_total
      .mockResolvedValueOnce({ n: 6 })  // test_cases_passed
      .mockResolvedValueOnce({ n: 2 })  // test_cases_failed
      .mockResolvedValueOnce({ n: 2 })  // test_cases_untested

    const result = await callTool(ADMIN, 'get_dashboard_stats', {})
    expect(parse(result)).toEqual({
      total_projects: 3, active_sprints: 1, open_cards: 4,
      test_cases_total: 10, test_cases_passed: 6, test_cases_failed: 2, test_cases_untested: 2,
      user_role: 'super_admin',
    })
  })

  it('get_velocity_report delegates to shared reportData helpers for non-completed sprints', async () => {
    vi.mocked(db.get).mockResolvedValueOnce({ id: 1 }) // project exists
    vi.mocked(db.all).mockResolvedValueOnce([
      { id: 2, name: 'S1', status: 'active', start_date: '2024-01-01', end_date: '2024-01-14', velocity_completed_points: 0, velocity_total_points: 0, velocity_completed_stories: 0, velocity_total_stories: 0 },
    ])
    vi.mocked(db.get)
      .mockResolvedValueOnce({ pts: 5 })  // total points
      .mockResolvedValueOnce({ pts: 2 })  // completed points
      .mockResolvedValueOnce({ n: 3 })    // total stories
      .mockResolvedValueOnce({ n: 1 })    // completed stories

    const result = await callTool(ADMIN, 'get_velocity_report', { project_id: 1 })
    expect(parse(result)).toEqual([
      { sprint_id: 2, sprint_name: 'S1', status: 'active', start_date: '2024-01-01', end_date: '2024-01-14', total_points: 5, completed_points: 2, total_stories: 3, completed_stories: 1 },
    ])
  })
})
