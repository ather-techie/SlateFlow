import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeatureGate } from './FeatureGate'
import { useFeatureFlagStore } from '../../store/featureFlagStore'

describe('FeatureGate', () => {
  beforeEach(() => {
    useFeatureFlagStore.setState({
      loading: false,
      features: {
        ai: false,
        retrospective: false,
        calendar: false,
        auth_password: false,
        auth_google: false,
        auth_github: false,
        github_integration: false,
        gitlab_integration: false,
        email_notifications: false,
        auto_test_case_generation_ai: false,
        auto_story_generation_ai: false,
        card_attachments: false,
        read_mcp: false,
        create_mcp: false,
        update_mcp: false,
        delete_mcp: false,
        report_mcp: false,
        ai_ceremony_digests: false,
        ai_writing_assist: false,
        ai_planning_assist: false,
        ai_project_chat: false,
      },
    })
  })

  it('renders null when loading is true', () => {
    useFeatureFlagStore.setState({ loading: true })
    const { container } = render(<FeatureGate flag="ai">content</FeatureGate>)
    expect(container.firstChild).toBeNull()
  })

  it('renders children when flag is enabled', () => {
    useFeatureFlagStore.setState((state) => ({
      features: { ...state.features, ai: true },
    }))
    render(<FeatureGate flag="ai">AI content</FeatureGate>)
    expect(screen.getByText('AI content')).toBeInTheDocument()
  })

  it('renders null when flag is disabled', () => {
    useFeatureFlagStore.setState((state) => ({
      features: { ...state.features, ai: false },
    }))
    const { container } = render(<FeatureGate flag="ai">AI content</FeatureGate>)
    expect(screen.queryByText('AI content')).not.toBeInTheDocument()
    expect(container.firstChild).toBeNull()
  })

  it('renders fallback when flag is disabled and fallback is provided', () => {
    useFeatureFlagStore.setState((state) => ({
      features: { ...state.features, ai: false },
    }))
    render(
      <FeatureGate flag="ai" fallback={<div>Fallback content</div>}>
        AI content
      </FeatureGate>
    )
    expect(screen.getByText('Fallback content')).toBeInTheDocument()
    expect(screen.queryByText('AI content')).not.toBeInTheDocument()
  })

  it('does not render fallback when flag is enabled', () => {
    useFeatureFlagStore.setState((state) => ({
      features: { ...state.features, ai: true },
    }))
    render(
      <FeatureGate flag="ai" fallback={<div>Fallback content</div>}>
        AI content
      </FeatureGate>
    )
    expect(screen.getByText('AI content')).toBeInTheDocument()
    expect(screen.queryByText('Fallback content')).not.toBeInTheDocument()
  })

  it('renders nested children', () => {
    useFeatureFlagStore.setState((state) => ({
      features: { ...state.features, ai: true },
    }))
    render(
      <FeatureGate flag="ai">
        <div data-testid="child">Child element</div>
      </FeatureGate>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
