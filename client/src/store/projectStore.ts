import { create } from 'zustand'
import { api } from '../api/index'
import type { Project } from '../types'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
  fetchProjects: () => Promise<void>
}

export const useProjectStore = create<ProjectState>(set => ({
  projects: [],
  currentProject: null,
  setCurrentProject: project => set({ currentProject: project }),
  fetchProjects: async () => {
    const projects = await api.projects.list()
    set({ projects })
  },
}))
