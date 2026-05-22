import axios from 'axios'
import toast from 'react-hot-toast'
import type {
  ActivityItem,
  CalendarEvent,
  CalendarHoliday,
  CalendarRange,
  CalendarVacation,
  Card,
  CardLink,
  Comment,
  DashboardStats,
  Epic,
  Feature,
  Lane,
  Project,
  ProjectSummary,
  RetroCategory,
  RetroItem,
  Retrospective,
  Sprint,
  Task,
  TestCase,
  TestCaseSummary,
  TestRun,
  TestSuite,
} from '../types'

type Priority = 'low' | 'medium' | 'high' | 'critical'

export type ParsedIntent =
  | { type: 'epic' | 'feature'; payload: { title: string; description: string; priority: Priority; assignee: string | null } }
  | { type: 'story'; payload: { title: string; description: string; priority: Priority; assignee: string | null; estimate: number | null } }
  | { type: 'task'; payload: { title: string; description: string; assignee: string | null } }
  | { type: 'project'; payload: { name: string; description: string } }
  | { type: 'sprint'; payload: { name: string; goal: string; start_date: string; end_date: string } }
  | { type: 'calendar'; payload: { title: string; description: string; start_date: string; end_date: string } }
  | { type: 'unknown'; reason: string }

export type NLAllowedType = 'epic' | 'feature' | 'story' | 'task' | 'project' | 'sprint' | 'calendar'

export const http = axios.create({ baseURL: '/api', withCredentials: true })

http.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      // Defer import to avoid circular dep at module load time
      import('../store/authStore').then(({ useAuthStore }) => {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      })
      return Promise.reject(err)
    }
    const msg =
      (err.response?.data as { error?: string } | undefined)?.error ??
      err.message ??
      'Something went wrong'
    toast.error(msg)
    return Promise.reject(err)
  },
)

function unwrap<T>(p: Promise<{ data: { data: T } }>): Promise<T> {
  return p.then(r => r.data.data)
}

// Backward-compatible helper for lane card creation
function createLaneCard(
  laneId: number,
  data: { title: string; priority?: Card['priority']; assignee?: string | null; sprint_id?: number | null },
): Promise<Card> {
  return http.post(`/lanes/${laneId}/cards`, data).then(r => r.data.data)
}

export const api = {
  createLaneCard,
  projects: {
    list: () => unwrap<Project[]>(http.get('/projects')),
    get: (id: number) => unwrap<Project>(http.get(`/projects/${id}`)),
    create: (data: {
      name: string
      description?: string
      color?: string
      preset_id?: number
      custom_lanes?: string[]
    }) => unwrap<Project>(http.post('/projects', data)),
    update: (id: number, data: { name?: string; description?: string; color?: string }) =>
      unwrap<Project>(http.patch(`/projects/${id}`, data)),
    delete: (id: number) => unwrap<{ id: number }>(http.delete(`/projects/${id}`)),
  },
  lanes: {
    list: (projectId: number) => unwrap<Lane[]>(http.get(`/projects/${projectId}/lanes`)),
    create: (projectId: number, data: { name: string; color?: string }) =>
      unwrap<Lane>(http.post(`/projects/${projectId}/lanes`, data)),
    update: (laneId: number, data: { name?: string; color?: string; is_done_col?: boolean }) =>
      unwrap<Lane>(http.patch(`/lanes/${laneId}`, data)),
    delete: (laneId: number) => unwrap<{ id: number }>(http.delete(`/lanes/${laneId}`)),
    reorder: (projectId: number, ordered_ids: number[]) =>
      unwrap<Lane[]>(http.post(`/projects/${projectId}/lanes/reorder`, { ordered_ids })),
  },
  cards: {
    listByLane: (laneId: number) => unwrap<Card[]>(http.get(`/lanes/${laneId}/cards`)),
    get: (cardId: number) => unwrap<Card>(http.get(`/cards/${cardId}`)),
    create: (
      laneId: number,
      data: { title: string; priority?: Card['priority']; assignee?: string | null; feature_id?: number | null; sprint_id?: number | null },
    ) => unwrap<Card>(http.post(`/lanes/${laneId}/cards`, data)),
    update: (
      cardId: number,
      data: Partial<
        Pick<Card, 'title' | 'description' | 'priority' | 'story_points' | 'assignee' | 'sprint_id' | 'feature_id'>
      >,
    ) => unwrap<Card>(http.patch(`/cards/${cardId}`, data)),
    delete: (cardId: number) => unwrap<{ id: number }>(http.delete(`/cards/${cardId}`)),
    move: (cardId: number, data: { lane_id: number; position?: number }) =>
      unwrap<Card>(http.patch(`/cards/${cardId}/move`, data)),
    listTasks: (cardId: number) => unwrap<Task[]>(http.get(`/cards/${cardId}/tasks`)),
    createTask: (cardId: number, data: { title: string; description?: string; status?: Task['status']; assignee?: string | null }) =>
      unwrap<Task>(http.post(`/cards/${cardId}/tasks`, data)),
    updateTask: (taskId: number, data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'assignee'>>) =>
      unwrap<Task>(http.patch(`/tasks/${taskId}`, data)),
    deleteTask: (taskId: number) => unwrap<{ id: number }>(http.delete(`/tasks/${taskId}`)),
    reorderTasks: (cardId: number, ids: number[]) => unwrap<Task[]>(http.post(`/cards/${cardId}/tasks/reorder`, { ids })),
    listProjectTasks: (projectId: number) => unwrap<(Task & { story_title: string })[]>(http.get(`/projects/${projectId}/tasks`)),
  },
  epics: {
    list: (projectId: number) => unwrap<Epic[]>(http.get(`/projects/${projectId}/epics`)),
    get: (id: number) => unwrap<Epic>(http.get(`/epics/${id}`)),
    create: (projectId: number, data: { title: string; description?: string; priority?: Epic['priority']; status?: Epic['status']; assignee?: string | null }) =>
      unwrap<Epic>(http.post(`/projects/${projectId}/epics`, data)),
    update: (id: number, data: Partial<Pick<Epic, 'title' | 'description' | 'priority' | 'status' | 'assignee'>>) =>
      unwrap<Epic>(http.patch(`/epics/${id}`, data)),
    delete: (id: number) => unwrap<{ id: number }>(http.delete(`/epics/${id}`)),
  },
  features: {
    list: (projectId: number, epicId?: number) =>
      unwrap<Feature[]>(http.get(`/projects/${projectId}/features`, { params: epicId ? { epic_id: epicId } : undefined })),
    get: (id: number) => unwrap<Feature>(http.get(`/features/${id}`)),
    create: (projectId: number, data: { title: string; description?: string; epic_id?: number | null; priority?: Feature['priority']; status?: Feature['status']; assignee?: string | null }) =>
      unwrap<Feature>(http.post(`/projects/${projectId}/features`, data)),
    update: (id: number, data: Partial<Pick<Feature, 'title' | 'description' | 'epic_id' | 'priority' | 'status' | 'assignee'>>) =>
      unwrap<Feature>(http.patch(`/features/${id}`, data)),
    delete: (id: number) => unwrap<{ id: number }>(http.delete(`/features/${id}`)),
    listStories: (featureId: number) => unwrap<Card[]>(http.get(`/features/${featureId}/stories`)),
  },
  sprints: {
    list: (projectId: number) => unwrap<Sprint[]>(http.get(`/projects/${projectId}/sprints`)),
    get: (id: number) => unwrap<Sprint>(http.get(`/sprints/${id}`)),
    create: (projectId: number, data: { name: string; goal?: string; start_date: string; end_date: string; status?: Sprint['status'] }) =>
      unwrap<Sprint>(http.post(`/projects/${projectId}/sprints`, data)),
    update: (id: number, data: Partial<Pick<Sprint, 'name' | 'goal' | 'start_date' | 'end_date' | 'status'>>) =>
      unwrap<Sprint>(http.patch(`/sprints/${id}`, data)),
    delete: (id: number) => unwrap<{ id: number }>(http.delete(`/sprints/${id}`)),
  },
  comments: {
    list: (cardId: number) => unwrap<Comment[]>(http.get(`/cards/${cardId}/comments`)),
    create: (cardId: number, data: { author: string; body: string }) =>
      unwrap<Comment>(http.post(`/cards/${cardId}/comments`, data)),
    delete: (commentId: number) => unwrap<{ id: number }>(http.delete(`/comments/${commentId}`)),
  },
  dashboard: {
    stats: () => unwrap<DashboardStats>(http.get('/dashboard/stats')),
    projects: () => unwrap<ProjectSummary[]>(http.get('/dashboard/projects')),
    activity: () => unwrap<ActivityItem[]>(http.get('/dashboard/activity')),
  },
  testSuites: {
    listByProject: (projectId: number) =>
      unwrap<TestSuite[]>(http.get(`/projects/${projectId}/test-suites`)),
    create: (projectId: number, data: { name: string; description?: string }) =>
      unwrap<TestSuite>(http.post(`/projects/${projectId}/test-suites`, data)),
    update: (id: number, data: { name?: string; description?: string }) =>
      unwrap<TestSuite>(http.patch(`/test-suites/${id}`, data)),
    delete: (id: number) => unwrap<{ id: number }>(http.delete(`/test-suites/${id}`)),
  },
  testCases: {
    listByCard: (cardId: number) =>
      unwrap<{ cases: TestCase[]; summary: TestCaseSummary }>(http.get(`/cards/${cardId}/test-cases`)),
    listByProject: (projectId: number, params?: { suite_id?: number; status?: string; priority?: string; test_type?: string }) =>
      unwrap<TestCase[]>(http.get(`/projects/${projectId}/test-cases`, { params })),
    create: (cardId: number, data: {
      title: string; description?: string; suite_id?: number | null
      priority?: string; test_type?: string
      steps?: { step: string; expected: string }[]
      preconditions?: string; expected_result?: string; assigned_to?: string
    }) => unwrap<TestCase>(http.post(`/cards/${cardId}/test-cases`, data)),
    get: (id: number) => unwrap<TestCase & { runs: TestRun[] }>(http.get(`/test-cases/${id}`)),
    update: (id: number, data: Partial<Pick<TestCase, 'title' | 'description' | 'suite_id' | 'status' | 'priority' | 'test_type' | 'preconditions' | 'expected_result' | 'assigned_to'>> & { steps?: { step: string; expected: string }[] | null }) =>
      unwrap<TestCase>(http.patch(`/test-cases/${id}`, data)),
    delete: (id: number) => unwrap<{ id: number }>(http.delete(`/test-cases/${id}`)),
    reorder: (cardId: number, ordered_ids: number[]) =>
      unwrap<TestCase[]>(http.post(`/cards/${cardId}/test-cases/reorder`, { ordered_ids })),
    bulkStatus: (cardId: number, ids: number[], status: string) =>
      unwrap<TestCase[]>(http.patch(`/cards/${cardId}/test-cases/bulk-status`, { ids, status })),
    listRuns: (id: number) => unwrap<TestRun[]>(http.get(`/test-cases/${id}/runs`)),
    addRun: (id: number, data: { status: string; notes?: string; run_by?: string }) =>
      unwrap<TestRun>(http.post(`/test-cases/${id}/runs`, data)),
  },
  retrospectives: {
    getBySprint: (sprintId: number) =>
      unwrap<{ retrospective: Retrospective; items: RetroItem[] }>(http.get(`/sprints/${sprintId}/retrospective`)),
    addItem: (retroId: number, data: { category: RetroCategory; body: string }) =>
      unwrap<RetroItem>(http.post(`/retrospectives/${retroId}/items`, data)),
    updateItem: (itemId: number, data: { body?: string; category?: RetroCategory; position?: number }) =>
      unwrap<RetroItem>(http.patch(`/retrospective-items/${itemId}`, data)),
    deleteItem: (itemId: number) =>
      unwrap<{ id: number }>(http.delete(`/retrospective-items/${itemId}`)),
    reorder: (retroId: number, category: RetroCategory, item_ids: number[]) =>
      unwrap<RetroItem[]>(http.post(`/retrospectives/${retroId}/reorder`, { category, item_ids })),
  },
  calendar: {
    get: (projectId: number, from: string, to: string) =>
      unwrap<CalendarRange>(http.get(`/projects/${projectId}/calendar`, { params: { from, to } })),
    events: {
      create: (projectId: number, data: { title: string; description?: string | null; start_date: string; end_date: string; color?: string | null }) =>
        unwrap<CalendarEvent>(http.post(`/projects/${projectId}/calendar/events`, data)),
      update: (id: number, data: Partial<{ title: string; description: string | null; start_date: string; end_date: string; color: string | null }>) =>
        unwrap<CalendarEvent>(http.patch(`/calendar/events/${id}`, data)),
      delete: (id: number) => unwrap<{ id: number }>(http.delete(`/calendar/events/${id}`)),
    },
    vacations: {
      create: (data: { user_id?: number; title?: string; description?: string | null; start_date: string; end_date: string; color?: string | null }) =>
        unwrap<CalendarVacation>(http.post('/vacations', data)),
      update: (id: number, data: Partial<{ title: string; description: string | null; start_date: string; end_date: string; color: string | null }>) =>
        unwrap<CalendarVacation>(http.patch(`/vacations/${id}`, data)),
      delete: (id: number) => unwrap<{ id: number }>(http.delete(`/vacations/${id}`)),
    },
    holidays: {
      list: (params?: { country?: string; state_province?: string }) =>
        unwrap<CalendarHoliday[]>(http.get('/admin/holidays', { params })),
      create: (data: { title: string; description?: string | null; start_date: string; end_date: string; color?: string | null; country?: string | null; state_province?: string | null }) =>
        unwrap<CalendarHoliday>(http.post('/admin/holidays', data)),
      update: (id: number, data: Partial<{ title: string; description: string | null; start_date: string; end_date: string; color: string | null; country: string | null; state_province: string | null }>) =>
        unwrap<CalendarHoliday>(http.patch(`/admin/holidays/${id}`, data)),
      delete: (id: number) => unwrap<{ id: number }>(http.delete(`/admin/holidays/${id}`)),
    },
  },
  ai: {
    parseItem: (data: { input: string; context?: { projectId?: number; epicId?: number; laneId?: number; allowedTypes?: NLAllowedType[] } }) =>
      unwrap<ParsedIntent>(http.post('/ai/parse-item', data)),
    generateTestCases: (cardId: number) =>
      http.post(`/ai/cards/${cardId}/generate-test-cases`).then(r => r.data),
    generateStories: (featureId: number) =>
      http.post(`/ai/features/${featureId}/generate-stories`).then(r => r.data),
  },
  cardLinks: {
    list: (cardId: number) => unwrap<CardLink[]>(http.get(`/cards/${cardId}/links`)),
    add: (cardId: number, data: { url: string }) => unwrap<CardLink>(http.post(`/cards/${cardId}/links`, data)),
    remove: (cardId: number, linkId: number) => unwrap<{ id: number }>(http.delete(`/cards/${cardId}/links/${linkId}`)),
  },
}
