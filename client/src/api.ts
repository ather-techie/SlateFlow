import type { ActivityLog, ActivityItem, AuthUser, BacklogCard, CapacityEntry, Card, Column, Comment, CycleTimeEntry, DashboardStats, Dependency, DependencyList, Epic, ProjectAccessEntry, Feature, Label, Lane, LanePreset, Notification, Project, ProjectSummary, RoadmapEpic, Sprint, Task, TestCase, TestCaseSummary, TestRun, TestSuite, User, VelocityEntry } from './types'
import { useAuthStore } from './store/authStore'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, credentials: 'include' })
  if (res.status === 401) {
    useAuthStore.getState().logout()
    window.location.href = '/login'
    throw new Error('session expired')
  }
  const json: { data: T; error: string | null } = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  getProjects: () => request<Project[]>('/projects'),
  getProject: (id: number) => request<Project>(`/projects/${id}`),
  getColumns: (projectId: number) => request<Column[]>(`/projects/${projectId}/columns`),
  getCards: (columnId: number) => request<Card[]>(`/columns/${columnId}/cards`),
  getSprints: (projectId: number) => request<Sprint[]>(`/projects/${projectId}/sprints`),
  getComments: (cardId: number) => request<Comment[]>(`/cards/${cardId}/comments`),

  createCard: (columnId: number, data: { title: string; priority?: Card['priority'] }) =>
    request<Card>(`/columns/${columnId}/cards`, { method: 'POST', ...json(data) }),

  updateCard: (
    cardId: number,
    data: Partial<Pick<Card, 'title' | 'description' | 'priority' | 'story_points' | 'assignee' | 'sprint_id' | 'feature_id'>>,
  ) => request<Card>(`/cards/${cardId}`, { method: 'PATCH', ...json(data) }),

  moveCard: (cardId: number, data: { column_id: number; position?: number }) =>
    request<Card>(`/cards/${cardId}/move`, { method: 'PATCH', ...json(data) }),

  createComment: (cardId: number, data: { body: string }) =>
    request<Comment>(`/cards/${cardId}/comments`, { method: 'POST', ...json(data) }),

  getLabels: (projectId: number) => request<Label[]>(`/projects/${projectId}/labels`),
  createLabel: (projectId: number, data: { name: string; color?: string }) =>
    request<Label>(`/projects/${projectId}/labels`, { method: 'POST', ...json(data) }),
  getCardLabels: (cardId: number) => request<Label[]>(`/cards/${cardId}/labels`),
  addCardLabel: (cardId: number, labelId: number) =>
    request<{ card_id: number; label_id: number }>(`/cards/${cardId}/labels`, { method: 'POST', ...json({ label_id: labelId }) }),
  removeCardLabel: (cardId: number, labelId: number) =>
    request<{ card_id: number; label_id: number }>(`/cards/${cardId}/labels/${labelId}`, { method: 'DELETE' }),

  getActivityLog: (cardId: number) => request<ActivityLog[]>(`/cards/${cardId}/activity`),
  getCard: (cardId: number) => request<Card>(`/cards/${cardId}`),
  deleteCard: (cardId: number) => request<{ id: number }>(`/cards/${cardId}`, { method: 'DELETE' }),

  getBacklog: (projectId: number) => request<BacklogCard[]>(`/projects/${projectId}/backlog`),
  getSprintCards: (sprintId: number) => request<Card[]>(`/sprints/${sprintId}/cards`),
  createSprint: (
    projectId: number,
    data: { name: string; goal?: string; start_date: string; end_date: string; status?: Sprint['status'] },
  ) => request<Sprint>(`/projects/${projectId}/sprints`, { method: 'POST', ...json(data) }),
  updateSprint: (sprintId: number, data: Partial<Pick<Sprint, 'name' | 'goal' | 'start_date' | 'end_date' | 'status'>>) =>
    request<Sprint>(`/sprints/${sprintId}`, { method: 'PATCH', ...json(data) }),
  completeSprint: (sprintId: number) => request<Sprint>(`/sprints/${sprintId}/complete`, { method: 'POST' }),
  deleteSprint: (sprintId: number) => request<{ id: number }>(`/sprints/${sprintId}`, { method: 'DELETE' }),

  getDashboardStats: () => request<DashboardStats>('/dashboard/stats'),
  getDashboardProjects: () => request<ProjectSummary[]>('/dashboard/projects'),
  getDashboardActivity: () => request<ActivityItem[]>('/dashboard/activity'),

  updateProject: (id: number, data: { name?: string; description?: string; color?: string }) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', ...json(data) }),
  deleteProject: (id: number) => request<{ id: number }>(`/projects/${id}`, { method: 'DELETE' }),

  getLanes: (projectId: number) => request<Lane[]>(`/projects/${projectId}/lanes`),
  getLaneCards: (laneId: number) => request<Card[]>(`/lanes/${laneId}/cards`),
  createLaneCard: (
    laneId: number,
    data: { title: string; priority?: Card['priority']; assignee?: string | null; sprint_id?: number | null },
  ) => request<Card>(`/lanes/${laneId}/cards`, { method: 'POST', ...json(data) }),
  moveLaneCard: (cardId: number, data: { lane_id: number; position?: number }) =>
    request<Card>(`/cards/${cardId}/move`, { method: 'PATCH', ...json(data) }),
  createLane: (projectId: number, data: { name: string; color?: string }) =>
    request<Lane>(`/projects/${projectId}/lanes`, { method: 'POST', ...json(data) }),
  updateLane: (laneId: number, data: { name?: string; color?: string; is_done_col?: boolean }) =>
    request<Lane>(`/lanes/${laneId}`, { method: 'PATCH', ...json(data) }),
  deleteLane: (laneId: number) => request<{ id: number }>(`/lanes/${laneId}`, { method: 'DELETE' }),
  reorderLanes: (projectId: number, ordered_ids: number[]) =>
    request<Lane[]>(`/projects/${projectId}/lanes/reorder`, { method: 'POST', ...json({ ordered_ids }) }),

  getLanePresets: () => request<LanePreset[]>('/lane-presets'),
  createProject: (data: {
    name: string
    description?: string
    color?: string
    preset_id?: number
    custom_lanes?: string[]
  }) => request<Project>('/projects', { method: 'POST', ...json(data) }),

  // ── Test Suites ──────────────────────────────────────────────────────────────
  getTestSuites: (projectId: number) =>
    request<TestSuite[]>(`/projects/${projectId}/test-suites`),
  createTestSuite: (projectId: number, data: { name: string; description?: string }) =>
    request<TestSuite>(`/projects/${projectId}/test-suites`, { method: 'POST', ...json(data) }),

  // ── Test Cases ───────────────────────────────────────────────────────────────
  getTestCases: (cardId: number) =>
    request<{ cases: TestCase[]; summary: TestCaseSummary }>(`/cards/${cardId}/test-cases`),
  getProjectTestCases: (projectId: number, params?: { suite_id?: number; status?: string; priority?: string; test_type?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : ''
    return request<TestCase[]>(`/projects/${projectId}/test-cases${qs}`)
  },
  createTestCase: (cardId: number, data: {
    title: string
    description?: string
    suite_id?: number | null
    priority?: string
    test_type?: string
    steps?: { step: string; expected: string }[]
    preconditions?: string
    expected_result?: string
    assigned_to?: string
  }) => request<TestCase>(`/cards/${cardId}/test-cases`, { method: 'POST', ...json(data) }),
  updateTestCase: (id: number, data: Partial<Omit<TestCase, 'id' | 'card_id' | 'project_id' | 'created_at'>> & { steps?: { step: string; expected: string }[] | null }) =>
    request<TestCase>(`/test-cases/${id}`, { method: 'PATCH', ...json(data) }),
  deleteTestCase: (id: number) =>
    request<{ id: number }>(`/test-cases/${id}`, { method: 'DELETE' }),
  reorderTestCases: (cardId: number, ordered_ids: number[]) =>
    request<TestCase[]>(`/cards/${cardId}/test-cases/reorder`, { method: 'POST', ...json({ ordered_ids }) }),
  bulkStatusTestCases: (cardId: number, ids: number[], status: string) =>
    request<TestCase[]>(`/cards/${cardId}/test-cases/bulk-status`, { method: 'PATCH', ...json({ ids, status }) }),

  // ── Test Runs ────────────────────────────────────────────────────────────────
  addTestRun: (testCaseId: number, data: { status: string; notes?: string; run_by?: string }) =>
    request<TestRun>(`/test-cases/${testCaseId}/runs`, { method: 'POST', ...json(data) }),
  getTestRuns: (testCaseId: number) =>
    request<TestRun[]>(`/test-cases/${testCaseId}/runs`),

  // ── Epics ────────────────────────────────────────────────────────────────────
  epics: {
    list: (projectId: number) => request<Epic[]>(`/projects/${projectId}/epics`),
    get: (id: number) => request<Epic>(`/epics/${id}`),
    create: (projectId: number, data: { title: string; description?: string; priority?: Epic['priority']; status?: Epic['status']; assignee?: string | null }) =>
      request<Epic>(`/projects/${projectId}/epics`, { method: 'POST', ...json(data) }),
    update: (id: number, data: Partial<Pick<Epic, 'title' | 'description' | 'priority' | 'status' | 'assignee' | 'start_date' | 'end_date'>>) =>
      request<Epic>(`/epics/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) => request<{ id: number }>(`/epics/${id}`, { method: 'DELETE' }),
  },

  // ── Features ─────────────────────────────────────────────────────────────────
  features: {
    list: (projectId: number, epicId?: number) =>
      request<Feature[]>(`/projects/${projectId}/features${epicId ? `?epic_id=${epicId}` : ''}`),
    get: (id: number) => request<Feature>(`/features/${id}`),
    create: (projectId: number, data: { title: string; description?: string; epic_id?: number | null; priority?: Feature['priority']; status?: Feature['status']; assignee?: string | null }) =>
      request<Feature>(`/projects/${projectId}/features`, { method: 'POST', ...json(data) }),
    update: (id: number, data: Partial<Pick<Feature, 'title' | 'description' | 'epic_id' | 'priority' | 'status' | 'assignee' | 'start_date' | 'end_date'>>) =>
      request<Feature>(`/features/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) => request<{ id: number }>(`/features/${id}`, { method: 'DELETE' }),
    listStories: (featureId: number) => request<Card[]>(`/features/${featureId}/stories`),
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  cards: {
    listTasks: (storyId: number) => request<Task[]>(`/cards/${storyId}/tasks`),
    createTask: (storyId: number, data: { title: string; description?: string; status?: Task['status']; assignee?: string | null }) =>
      request<Task>(`/cards/${storyId}/tasks`, { method: 'POST', ...json(data) }),
    updateTask: (taskId: number, data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'assignee'>>) =>
      request<Task>(`/tasks/${taskId}`, { method: 'PATCH', ...json(data) }),
    deleteTask: (taskId: number) => request<{ id: number }>(`/tasks/${taskId}`, { method: 'DELETE' }),
    reorderTasks: (storyId: number, ids: number[]) => request<Task[]>(`/cards/${storyId}/tasks/reorder`, { method: 'POST', ...json({ ids }) }),
    create: (laneId: number, data: { title: string; description?: string; priority?: Card['priority']; assignee?: string | null; feature_id?: number | null }) =>
      request<Card>(`/lanes/${laneId}/cards`, { method: 'POST', ...json(data) }),
    listProjectTasks: (projectId: number) => request<(Task & { story_title: string })[]>(`/projects/${projectId}/tasks`),
    searchStories: (projectId: number, q: string) =>
      request<Pick<Card, 'id' | 'title' | 'priority' | 'story_points' | 'assignee' | 'swim_lane_id'>[]>(
        `/projects/${projectId}/stories/search?q=${encodeURIComponent(q)}`
      ),
  },

  // ── Lanes (namespaced alias for EpicsPage) ───────────────────────────────────
  lanes: {
    list: (projectId: number) => request<Lane[]>(`/projects/${projectId}/lanes`),
  },

  // ── Auth ─────────────────────────────────────────────────────────────────────
  auth: {
    login: (data: { email: string; password: string }) =>
      request<AuthUser>('/auth/login', { method: 'POST', ...json(data) }),
    logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
    me: () => request<AuthUser & { project_access: ProjectAccessEntry[] }>('/auth/me'),
    updateMe: (data: { display_name?: string; current_password?: string; new_password?: string }) =>
      request<AuthUser>('/auth/me', { method: 'PATCH', ...json(data) }),
    updateProfile: (data: { email_notifications?: boolean }) =>
      request<AuthUser>('/auth/me', { method: 'PATCH', ...json(data) }),
  },

  // ── Users (super_admin only) ──────────────────────────────────────────────────
  users: {
    list: () => request<User[]>('/users'),
    search: (q: string) => request<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
    create: (data: { email: string; display_name: string; password: string; role?: string }) =>
      request<User>('/users', { method: 'POST', ...json(data) }),
    update: (id: number, data: { display_name?: string; role?: string; is_active?: boolean; new_password?: string }) =>
      request<User>(`/users/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) => request<{ id: number }>(`/users/${id}`, { method: 'DELETE' }),
    projectAccess: (userId: number) =>
      request<{ project_id: number; project_name: string; role: 'project_admin' | 'contributor' | 'reader' | null }[]>(
        `/users/${userId}/project-access`
      ),
  },

  // ── Project Access ────────────────────────────────────────────────────────────
  projectAccess: {
    list: (projectId: number) => request<ProjectAccessEntry[]>(`/projects/${projectId}/access`),
    grant: (projectId: number, data: { user_id: number; role: string }) =>
      request<ProjectAccessEntry>(`/projects/${projectId}/access`, { method: 'POST', ...json(data) }),
    update: (projectId: number, userId: number, data: { role: string }) =>
      request<ProjectAccessEntry>(`/projects/${projectId}/access/${userId}`, { method: 'PATCH', ...json(data) }),
    revoke: (projectId: number, userId: number) =>
      request<{ user_id: number; project_id: number }>(`/projects/${projectId}/access/${userId}`, { method: 'DELETE' }),
  },

  // ── Notifications ─────────────────────────────────────────────────────────────
  notifications: {
    list: (unreadOnly?: boolean) =>
      request<Notification[]>(`/notifications${unreadOnly ? '?unread_only=1' : ''}`),
    markRead: (id: number) => request<{ id: number }>(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request<{ count: number }>('/notifications/read-all', { method: 'PATCH' }),
  },

  // ── Roadmap ──────────────────────────────────────────────────────────────────
  roadmap: {
    get: (projectId: number) => request<RoadmapEpic[]>(`/projects/${projectId}/roadmap`),
  },

  // ── Reports ──────────────────────────────────────────────────────────────────
  reports: {
    velocity: (projectId: number) => request<VelocityEntry[]>(`/projects/${projectId}/velocity`),
    cycleTime: (projectId: number) => request<CycleTimeEntry[]>(`/projects/${projectId}/cycle-time`),
    capacity: (projectId: number, sprintId: number) =>
      request<CapacityEntry[]>(`/projects/${projectId}/capacity?sprint_id=${sprintId}`),
    exportUrl: (projectId: number, type: 'backlog' | 'sprint' | 'full', sprintId?: number) => {
      const base = `/api/projects/${projectId}/export/csv?type=${type}`
      return sprintId ? `${base}&sprint_id=${sprintId}` : base
    },
  },

  // ── Dependencies ─────────────────────────────────────────────────────────────
  dependencies: {
    list: (cardId: number) => request<DependencyList>(`/cards/${cardId}/dependencies`),
    add: (cardId: number, target_id: number, type: 'blocks' | 'blocked_by') =>
      request<Dependency>(`/cards/${cardId}/dependencies`, { method: 'POST', ...json({ target_id, type }) }),
    remove: (depId: number) => request<{ id: number }>(`/dependencies/${depId}`, { method: 'DELETE' }),
  },
}
