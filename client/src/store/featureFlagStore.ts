import { create } from 'zustand'

export type FeatureFlag =
  | 'ai'
  | 'auto_test_case_generation_ai'
  | 'auto_story_generation_ai'
  | 'retrospective'
  | 'calendar'
  | 'auth_password'
  | 'auth_google'
  | 'auth_github'
  | 'github_integration'
  | 'gitlab_integration'
  | 'email_notifications'
  | 'card_attachments'
  | 'read_mcp'
  | 'create_mcp'
  | 'update_mcp'
  | 'delete_mcp'
  | 'report_mcp'

export interface Features {
  ai: boolean
  auto_test_case_generation_ai: boolean
  auto_story_generation_ai: boolean
  retrospective: boolean
  calendar: boolean
  auth_password: boolean
  auth_google: boolean
  auth_github: boolean
  github_integration: boolean
  gitlab_integration: boolean
  email_notifications: boolean
  card_attachments: boolean
  read_mcp: boolean
  create_mcp: boolean
  update_mcp: boolean
  delete_mcp: boolean
  report_mcp: boolean
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
    auto_test_case_generation_ai: false,
    auto_story_generation_ai: false,
    retrospective: false,
    calendar: false,
    auth_password: true,
    auth_google: false,
    auth_github: false,
    github_integration: false,
    gitlab_integration: false,
    email_notifications: false,
    card_attachments: false,
    read_mcp: false,
    create_mcp: false,
    update_mcp: false,
    delete_mcp: false,
    report_mcp: false,
  },
  loading: true,
  setFlags: (features) => set({ features, loading: false }),
  setLoading: (loading) => set({ loading }),
  isEnabled: (flag) => get().features[flag] === true,
}))
