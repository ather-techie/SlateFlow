import axios from 'axios'
import toast from 'react-hot-toast'
import type {
  ActivityItem,
  Card,
  Comment,
  DashboardStats,
  Lane,
  Project,
  ProjectSummary,
} from '../types'

export const http = axios.create({ baseURL: '/api' })

http.interceptors.response.use(
  res => res,
  err => {
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

export const api = {
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
      data: { title: string; priority?: Card['priority']; assignee?: string | null },
    ) => unwrap<Card>(http.post(`/lanes/${laneId}/cards`, data)),
    update: (
      cardId: number,
      data: Partial<
        Pick<Card, 'title' | 'description' | 'priority' | 'story_points' | 'assignee' | 'sprint_id'>
      >,
    ) => unwrap<Card>(http.patch(`/cards/${cardId}`, data)),
    delete: (cardId: number) => unwrap<{ id: number }>(http.delete(`/cards/${cardId}`)),
    move: (cardId: number, data: { lane_id: number; position?: number }) =>
      unwrap<Card>(http.patch(`/cards/${cardId}/move`, data)),
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
}
