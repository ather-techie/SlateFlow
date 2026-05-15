import { create } from 'zustand'

export type FeatureFlag =
  | 'ai'
  | 'retrospective'
  | 'calendar'
  | 'auth_password'
  | 'auth_google'
  | 'auth_github'
  | 'github_integration'
  | 'gitlab_integration'

interface Features {
  ai: boolean
  retrospective: boolean
  calendar: boolean
  auth_password: boolean
  auth_google: boolean
  auth_github: boolean
  github_integration: boolean
  gitlab_integration: boolean
}

interface FeatureFlagState {
  features: Features
  loading: boolean
  setFlags: (features: Features) => void
  setLoading: (loading: boolean) => void
  isEnabled: (flag: FeatureFlag) => boolean
}

export const useFeatureFlagStore = create<FeatureFlagState>((set, get) => ({
  features: {
    ai: false,
    retrospective: false,
    calendar: false,
    auth_password: true,
    auth_google: false,
    auth_github: false,
    github_integration: false,
    gitlab_integration: false,
  },
  loading: true,
  setFlags: (features) => set({ features, loading: false }),
  setLoading: (loading) => set({ loading }),
  isEnabled: (flag) => get().features[flag] === true,
}))
