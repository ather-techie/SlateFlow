import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore } from './projectStore'
import type { Project } from '../types'

vi.mock('../api/index', () => ({
  api: {
    projects: {
      list: vi.fn(),
    },
  },
}))

import { api } from '../api/index'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: 'Test Project',
    description: 'Test Description',
    color: '#FF0000',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useProjectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      currentProject: null,
    })
    vi.clearAllMocks()
  })

  describe('setCurrentProject', () => {
    it('sets current project when provided', () => {
      const project = makeProject({ id: 1 })

      useProjectStore.getState().setCurrentProject(project)

      expect(useProjectStore.getState().currentProject).toEqual(project)
    })

    it('sets current project to null', () => {
      const project = makeProject({ id: 1 })
      useProjectStore.setState({ currentProject: project })

      useProjectStore.getState().setCurrentProject(null)

      expect(useProjectStore.getState().currentProject).toBeNull()
    })

    it('replaces previous current project', () => {
      const project1 = makeProject({ id: 1, name: 'Project 1' })
      const project2 = makeProject({ id: 2, name: 'Project 2' })

      useProjectStore.getState().setCurrentProject(project1)
      expect(useProjectStore.getState().currentProject?.id).toBe(1)

      useProjectStore.getState().setCurrentProject(project2)
      expect(useProjectStore.getState().currentProject?.id).toBe(2)
    })
  })

  describe('fetchProjects', () => {
    it('fetches and stores projects', async () => {
      const projects = [
        makeProject({ id: 1, name: 'Project 1' }),
        makeProject({ id: 2, name: 'Project 2' }),
      ]
      vi.mocked(api.projects.list).mockResolvedValue(projects)

      await useProjectStore.getState().fetchProjects()

      const state = useProjectStore.getState()
      expect(state.projects).toEqual(projects)
      expect(state.projects).toHaveLength(2)
    })

    it('stores empty array when no projects', async () => {
      vi.mocked(api.projects.list).mockResolvedValue([])

      await useProjectStore.getState().fetchProjects()

      expect(useProjectStore.getState().projects).toEqual([])
    })

    it('replaces previous projects on refetch', async () => {
      const projects1 = [makeProject({ id: 1, name: 'Project 1' })]
      const projects2 = [makeProject({ id: 2, name: 'Project 2' })]

      vi.mocked(api.projects.list).mockResolvedValue(projects1)
      await useProjectStore.getState().fetchProjects()
      expect(useProjectStore.getState().projects).toHaveLength(1)

      vi.mocked(api.projects.list).mockResolvedValue(projects2)
      await useProjectStore.getState().fetchProjects()
      expect(useProjectStore.getState().projects).toHaveLength(1)
      expect(useProjectStore.getState().projects[0].id).toBe(2)
    })

    it('calls api.projects.list', async () => {
      vi.mocked(api.projects.list).mockResolvedValue([])

      await useProjectStore.getState().fetchProjects()

      expect(api.projects.list).toHaveBeenCalled()
    })
  })

  describe('initial state', () => {
    it('starts with empty projects array', () => {
      const state = useProjectStore.getState()
      expect(state.projects).toEqual([])
    })

    it('starts with no current project', () => {
      const state = useProjectStore.getState()
      expect(state.currentProject).toBeNull()
    })
  })
})
