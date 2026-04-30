import type { ActivityLog, BacklogCard, Card, Column, Comment, Label, Project, Sprint } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
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
    data: Partial<Pick<Card, 'title' | 'description' | 'priority' | 'story_points' | 'assignee' | 'sprint_id'>>,
  ) => request<Card>(`/cards/${cardId}`, { method: 'PATCH', ...json(data) }),

  moveCard: (cardId: number, data: { column_id: number; position?: number }) =>
    request<Card>(`/cards/${cardId}/move`, { method: 'PATCH', ...json(data) }),

  createComment: (cardId: number, data: { author: string; body: string }) =>
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
}
