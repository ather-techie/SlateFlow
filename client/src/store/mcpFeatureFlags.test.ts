import { describe, it, expect, beforeEach } from 'vitest'
import { useFeatureFlagStore } from './featureFlagStore'
import type { Features } from './featureFlagStore'

describe('MCP Feature Flags', () => {
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

  describe('MCP Flag Existence', () => {
    it('read_mcp flag exists in store', () => {
      const features = useFeatureFlagStore.getState().features
      expect(features.read_mcp).toBeDefined()
    })

    it('create_mcp flag exists in store', () => {
      const features = useFeatureFlagStore.getState().features
      expect(features.create_mcp).toBeDefined()
    })

    it('update_mcp flag exists in store', () => {
      const features = useFeatureFlagStore.getState().features
      expect(features.update_mcp).toBeDefined()
    })

    it('delete_mcp flag exists in store', () => {
      const features = useFeatureFlagStore.getState().features
      expect(features.delete_mcp).toBeDefined()
    })

    it('report_mcp flag exists in store', () => {
      const features = useFeatureFlagStore.getState().features
      expect(features.report_mcp).toBeDefined()
    })
  })

  describe('MCP Flag Initial Values', () => {
    it('read_mcp defaults to false', () => {
      const state = useFeatureFlagStore.getState()
      expect(state.features.read_mcp).toBe(false)
    })

    it('create_mcp defaults to false', () => {
      const state = useFeatureFlagStore.getState()
      expect(state.features.create_mcp).toBe(false)
    })

    it('update_mcp defaults to false', () => {
      const state = useFeatureFlagStore.getState()
      expect(state.features.update_mcp).toBe(false)
    })

    it('delete_mcp defaults to false', () => {
      const state = useFeatureFlagStore.getState()
      expect(state.features.delete_mcp).toBe(false)
    })

    it('report_mcp defaults to false', () => {
      const state = useFeatureFlagStore.getState()
      expect(state.features.report_mcp).toBe(false)
    })
  })

  describe('MCP Flag Updates via setFlags', () => {
    it('enables read_mcp via setFlags', () => {
      const features: Features = {
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
        read_mcp: true,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(true)
    })

    it('enables create_mcp via setFlags', () => {
      const features: Features = {
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
        create_mcp: true,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.create_mcp).toBe(true)
    })

    it('enables update_mcp via setFlags', () => {
      const features: Features = {
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
        update_mcp: true,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.update_mcp).toBe(true)
    })

    it('enables delete_mcp via setFlags', () => {
      const features: Features = {
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
        delete_mcp: true,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.delete_mcp).toBe(true)
    })

    it('enables report_mcp via setFlags', () => {
      const features: Features = {
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
        report_mcp: true,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.report_mcp).toBe(true)
    })
  })

  describe('MCP Flag Granular Control', () => {
    it('can enable read_mcp without enabling create_mcp', () => {
      const features: Features = {
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
        read_mcp: true,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.create_mcp).toBe(false)
    })

    it('can enable update_mcp without enabling delete_mcp', () => {
      const features: Features = {
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
        update_mcp: true,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.update_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.delete_mcp).toBe(false)
    })

    it('can enable all MCP flags independently', () => {
      const features: Features = {
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
        read_mcp: true,
        create_mcp: true,
        update_mcp: true,
        delete_mcp: true,
        report_mcp: true,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.create_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.update_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.delete_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.report_mcp).toBe(true)
    })
  })

  describe('MCP Flag isEnabled Checks', () => {
    it('isEnabled("read_mcp") returns false by default', () => {
      expect(useFeatureFlagStore.getState().isEnabled('read_mcp')).toBe(false)
    })

    it('isEnabled("read_mcp") returns true when enabled', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, read_mcp: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('read_mcp')).toBe(true)
    })

    it('isEnabled("create_mcp") returns false by default', () => {
      expect(useFeatureFlagStore.getState().isEnabled('create_mcp')).toBe(false)
    })

    it('isEnabled("create_mcp") returns true when enabled', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, create_mcp: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('create_mcp')).toBe(true)
    })

    it('isEnabled("update_mcp") returns false by default', () => {
      expect(useFeatureFlagStore.getState().isEnabled('update_mcp')).toBe(false)
    })

    it('isEnabled("update_mcp") returns true when enabled', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, update_mcp: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('update_mcp')).toBe(true)
    })

    it('isEnabled("delete_mcp") returns false by default', () => {
      expect(useFeatureFlagStore.getState().isEnabled('delete_mcp')).toBe(false)
    })

    it('isEnabled("delete_mcp") returns true when enabled', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, delete_mcp: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('delete_mcp')).toBe(true)
    })

    it('isEnabled("report_mcp") returns false by default', () => {
      expect(useFeatureFlagStore.getState().isEnabled('report_mcp')).toBe(false)
    })

    it('isEnabled("report_mcp") returns true when enabled', () => {
      useFeatureFlagStore.setState({
        features: { ...useFeatureFlagStore.getState().features, report_mcp: true },
      })

      expect(useFeatureFlagStore.getState().isEnabled('report_mcp')).toBe(true)
    })
  })

  describe('MCP Flags with Other Features', () => {
    it('can disable read_mcp while keeping other flags enabled', () => {
      const features: Features = {
        ai: false,
        auto_test_case_generation_ai: false,
        auto_story_generation_ai: false,
        retrospective: true,
        calendar: true,
        auth_password: true,
        auth_google: true,
        auth_github: false,
        github_integration: false,
        gitlab_integration: false,
        email_notifications: true,
        card_attachments: true,
        read_mcp: false,
        create_mcp: true,
        update_mcp: true,
        delete_mcp: true,
        report_mcp: true,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(false)
      expect(useFeatureFlagStore.getState().features.create_mcp).toBe(true)
      expect(useFeatureFlagStore.getState().features.calendar).toBe(true)
      expect(useFeatureFlagStore.getState().features.retrospective).toBe(true)
    })

    it('MCP flags work independently from auth flags', () => {
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
        read_mcp: true,
        create_mcp: true,
        update_mcp: true,
        delete_mcp: true,
        report_mcp: true,
      }

      useFeatureFlagStore.getState().setFlags(features)

      expect(useFeatureFlagStore.getState().features.auth_password).toBe(false)
      expect(useFeatureFlagStore.getState().features.auth_google).toBe(true)
      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(true)
    })
  })

  describe('Type Safety', () => {
    it('Features interface includes all MCP flags', () => {
      const features: Features = {
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
      }
      expect(features).toBeDefined()
    })

    it('FeatureFlag type includes all MCP flags', () => {
      const flags: Array<'read_mcp' | 'create_mcp' | 'update_mcp' | 'delete_mcp' | 'report_mcp'> = [
        'read_mcp',
        'create_mcp',
        'update_mcp',
        'delete_mcp',
        'report_mcp',
      ]
      expect(flags).toHaveLength(5)
    })
  })

  describe('MCP Flags Disable/Re-enable Cycle', () => {
    it('can disable and re-enable read_mcp', () => {
      const enabledFeatures: Features = {
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
        read_mcp: true,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(enabledFeatures)
      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(true)

      const disabledFeatures: Features = {
        ...enabledFeatures,
        read_mcp: false,
      }
      useFeatureFlagStore.getState().setFlags(disabledFeatures)
      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(false)

      useFeatureFlagStore.getState().setFlags(enabledFeatures)
      expect(useFeatureFlagStore.getState().features.read_mcp).toBe(true)
    })

    it('preserves other flags when toggling MCP flags', () => {
      const initialFeatures: Features = {
        ai: true,
        auto_test_case_generation_ai: true,
        auto_story_generation_ai: false,
        retrospective: true,
        calendar: false,
        auth_password: true,
        auth_google: true,
        auth_github: false,
        github_integration: true,
        gitlab_integration: false,
        email_notifications: true,
        card_attachments: false,
        read_mcp: false,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
      }

      useFeatureFlagStore.getState().setFlags(initialFeatures)

      const withMcpEnabled: Features = {
        ...initialFeatures,
        read_mcp: true,
        create_mcp: true,
      }
      useFeatureFlagStore.getState().setFlags(withMcpEnabled)

      const state = useFeatureFlagStore.getState()
      expect(state.features.ai).toBe(true)
      expect(state.features.retrospective).toBe(true)
      expect(state.features.auth_password).toBe(true)
      expect(state.features.read_mcp).toBe(true)
      expect(state.features.create_mcp).toBe(true)
    })
  })
})
