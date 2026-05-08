import { create } from 'zustand'

export type FeatureFlag = 'ai' | 'retrospective' | 'calendar'

interface Features {
  ai: boolean
  retrospective: boolean
  calendar: boolean
}

interface FeatureFlagState {
  features: Features
  loading: boolean
  setFlags: (features: Features) => void
  setLoading: (loading: boolean) => void
  isEnabled: (flag: FeatureFlag) => boolean
}

export const useFeatureFlagStore = create<FeatureFlagState>((set, get) => ({
  features: { ai: false, retrospective: false, calendar: false },
  loading: true,
  setFlags: (features) => set({ features, loading: false }),
  setLoading: (loading) => set({ loading }),
  isEnabled: (flag) => get().features[flag] === true,
}))
