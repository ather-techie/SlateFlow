// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from '../store/authStore'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: false })
  })

  const renderProtected = (children: React.ReactNode = <div>Protected content</div>) => {
    return render(
      <MemoryRouter>
        <ProtectedRoute>{children}</ProtectedRoute>
      </MemoryRouter>
    )
  }

  it('renders loading spinner when loading is true', () => {
    useAuthStore.setState({ loading: true, user: null })
    renderProtected()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows animate-pulse class on loading spinner', () => {
    useAuthStore.setState({ loading: true, user: null })
    const { container } = renderProtected()
    const loadingSpan = container.querySelector('span.animate-pulse')
    expect(loadingSpan).toBeInTheDocument()
  })

  it('does not render children when loading is true', () => {
    useAuthStore.setState({ loading: true, user: null })
    renderProtected()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('does not render children when user is null and loading is false', () => {
    useAuthStore.setState({ loading: false, user: null })
    renderProtected()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders children when user is set and loading is false', () => {
    useAuthStore.setState({
      loading: false,
      user: {
        id: 1,
        email: 'test@example.com',
        display_name: 'Test User',
        role: 'global_reader',
        created_at: new Date().toISOString(),
      },
    })
    renderProtected()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('renders nested children correctly', () => {
    useAuthStore.setState({
      loading: false,
      user: {
        id: 1,
        email: 'test@example.com',
        display_name: 'Test User',
        role: 'global_reader',
        created_at: new Date().toISOString(),
      },
    })
    renderProtected(
      <div>
        <h1 data-testid="nested-header">Welcome</h1>
        <p>This is protected</p>
      </div>
    )
    expect(screen.getByTestId('nested-header')).toBeInTheDocument()
    expect(screen.getByText('This is protected')).toBeInTheDocument()
  })
})
