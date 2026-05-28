import { describe, it, expect, beforeEach } from 'vitest'
import { useFeatureFlagStore } from './featureFlagStore'
import type { Features } from './featureFlagStore'

describe('useFeatureFlagStore', () => {
  beforeEach(() => {
    useFeatureFlagStore.setState({
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
    })
  })

  describe('setFlags', () => {
    it('sets features and marks loading as false', () => {
      const features: Features = {
        ai: true,
        auto_test_case_generation_ai: true,
        auto_story_generation_ai: true,
        retrospective: true,
        calendar: true,
        auth_password: true,
        auth_google: true,
        auth_github: true,
        github_integration: true,
        gitlab_integration: true,
        email_notifications: true,
        card_attachments: true,
        read_mcp: true,
        create_mcp: true,
        update_mcp: true,
        delete_mcp: true,
        report_mcp: true,
      }

      useFeatureFlagStore.getState().setFlags(features)

      const state = useFeatureFlagStore.getState()
      expect(state.features).toEqual(features)
      expect(state.loading).toBe(false)
    })

    it('updates features while preserving previous values not in input', () => {
      const newFeatures: Features = {
        ai: true,
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
      }

      useFeatureFlagStore.getState().setFlags(newFeatures)

      expect(useFeatureFlagStore.getState().features.ai).toBe(true)
      expect(useFeatureFlagStore.getState().features.auth_password).toBe(true)
    })

    it('can disable auth_password flag', () => {
      const features: Features = {
        ai: false,
        auto_test_case_generation_ai: false,
        auto_story_generation_ai: false,
        retrospective: false,
        calendar: false,
        auth_password: false,
        auth_google: true,
        auth_github: true,
        github_integration: false,
        gitlab_integration: false,
        email_notifications: false,
        card_attachments: false,
        read_mcp: false,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.auth_password).toBe(false)
      expect(useFeatureFlagStore.getState().features.auth_google).toBe(true)
    })
  })

  describe('setLoading', () => {
    it('sets loading to true', () => {
      useFeatureFlagStore.getState().setLoading(true)

      expect(useFeatureFlagStore.getState().loading).toBe(true)
    })

    it('sets loading to false', () => {
      useFeatureFlagStore.getState().setLoading(false)

      expect(useFeatureFlagStore.getState().loading).toBe(false)
    })

    it('preserves features when setting loading', () => {
      const originalFeatures = useFeatureFlagStore.getState().features
      useFeatureFlagStore.getState().setLoading(false)

      expect(useFeatureFlagStore.getState().features).toEqual(originalFeatures)
    })
  })

  describe('isEnabled', () => {
    it('returns true for enabled flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, ai: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('ai')).toBe(true)
    })

    it('returns false for disabled flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, ai: false },
      })

      expect(useFeatureFlagStore.getState().isEnabled('ai')).toBe(false)
    })

    it('returns true for auth_password by default', () => {
      expect(useFeatureFlagStore.getState().isEnabled('auth_password')).toBe(true)
    })

    it('checks retrospective flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, retrospective: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('retrospective')).toBe(true)
    })

    it('checks calendar flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, calendar: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('calendar')).toBe(true)
    })

    it('checks email_notifications flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, email_notifications: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('email_notifications')).toBe(true)
    })

    it('checks card_attachments flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, card_attachments: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('card_attachments')).toBe(true)
    })

    it('checks github_integration flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, github_integration: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('github_integration')).toBe(true)
    })

    it('checks gitlab_integration flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, gitlab_integration: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('gitlab_integration')).toBe(true)
    })

    it('checks auth_google flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, auth_google: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('auth_google')).toBe(true)
    })

    it('checks auth_github flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, auth_github: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('auth_github')).toBe(true)
    })

    it('checks auto_test_case_generation_ai flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, auto_test_case_generation_ai: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('auto_test_case_generation_ai')).toBe(true)
    })

    it('checks auto_story_generation_ai flag', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, auto_story_generation_ai: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('auto_story_generation_ai')).toBe(true)
    })
  })

  describe('initial state', () => {
    it('starts with auth_password enabled', () => {
      expect(useFeatureFlagStore.getState().features.auth_password).toBe(true)
    })

    it('starts with most AI features disabled', () => {
      const state = useFeatureFlagStore.getState()
      expect(state.features.ai).toBe(false)
      expect(state.features.auto_test_case_generation_ai).toBe(false)
      expect(state.features.auto_story_generation_ai).toBe(false)
    })

    it('starts with loading as true', () => {
      const freshStore = useFeatureFlagStore.getState()
      expect(freshStore.loading).toBe(true)
    })
  })
})
