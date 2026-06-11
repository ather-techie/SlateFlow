import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
import { api as apiImport } from '../api/index'
import { useAuthStore } from '../store/authStore'
import { useFeatureFlagStore } from '../store/featureFlagStore'
import toast from 'react-hot-toast'

vi.mock('../api/index', () => ({
  api: {
    auth: {
      login: vi.fn(),
      me: vi.fn(),
    },
  },
}))

vi.mock('react-hot-toast')

describe('LoginPage', () => {
  // the vi.mock factory above replaces the module, so this import is the mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = apiImport as any
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    display_name: 'Test User',
    role: 'global_reader' as const,
    created_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(toast.error as any).mockClear()
    useAuthStore.setState({ user: null, loading: false })
    useFeatureFlagStore.setState({
      loading: false,
      features: {
        ai: false,
        retrospective: false,
        calendar: false,
        auth_password: true,
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
      },
    })
  })

  const renderLoginPage = () => {
    return render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )
  }

  describe('auth method rendering', () => {
    it('renders email/password form when auth_password is enabled', () => {
      renderLoginPage()
      expect(screen.getByPlaceholderText('admin@flow.local')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    })

    it('does not render email/password form when auth_password is disabled', () => {
      useFeatureFlagStore.setState((state) => ({
        features: { ...state.features, auth_password: false },
      }))
      renderLoginPage()
      expect(screen.queryByPlaceholderText('admin@flow.local')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
    })

    it('renders Google OAuth button when auth_google is enabled', () => {
      useFeatureFlagStore.setState((state) => ({
        features: { ...state.features, auth_google: true },
      }))
      renderLoginPage()
      expect(screen.getByRole('link', { name: /google/i })).toBeInTheDocument()
    })

    it('does not render Google button when auth_google is disabled', () => {
      renderLoginPage()
      expect(screen.queryByRole('link', { name: /google/i })).not.toBeInTheDocument()
    })

    it('renders GitHub OAuth button when auth_github is enabled', () => {
      useFeatureFlagStore.setState((state) => ({
        features: { ...state.features, auth_github: true },
      }))
      renderLoginPage()
      expect(screen.getByRole('link', { name: /github/i })).toBeInTheDocument()
    })

    it('does not render GitHub button when auth_github is disabled', () => {
      renderLoginPage()
      expect(screen.queryByRole('link', { name: /github/i })).not.toBeInTheDocument()
    })

    it('renders divider when both OAuth and password are enabled', () => {
      useFeatureFlagStore.setState((state) => ({
        features: {
          ...state.features,
          auth_password: true,
          auth_google: true,
        },
      }))
      renderLoginPage()
      expect(screen.getByText('or')).toBeInTheDocument()
    })

    it('does not render divider when only password is enabled', () => {
      useFeatureFlagStore.setState((state) => ({
        features: {
          ...state.features,
          auth_password: true,
          auth_google: false,
          auth_github: false,
        },
      }))
      renderLoginPage()
      expect(screen.queryByText('or')).not.toBeInTheDocument()
    })

    it('does not render divider when only OAuth is enabled', () => {
      useFeatureFlagStore.setState((state) => ({
        features: {
          ...state.features,
          auth_password: false,
          auth_google: true,
        },
      }))
      renderLoginPage()
      expect(screen.queryByText('or')).not.toBeInTheDocument()
    })

    it('renders warning when no login methods are enabled', () => {
      useFeatureFlagStore.setState((state) => ({
        loading: false,
        features: {
          ...state.features,
          auth_password: false,
          auth_google: false,
          auth_github: false,
        },
      }))
      renderLoginPage()
      expect(screen.getByText(/no login methods/i)).toBeInTheDocument()
    })
  })

  describe('form submission', () => {
    it('calls api.auth.login with email and password on submit', async () => {
      const user = userEvent.setup()
      api.auth.login.mockResolvedValue({ token: 'token' })
      api.auth.me.mockResolvedValue(mockUser)
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(api.auth.login).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        })
      })
    })

    it('calls api.auth.me after successful login', async () => {
      const user = userEvent.setup()
      api.auth.login.mockResolvedValue({ token: 'token' })
      api.auth.me.mockResolvedValue(mockUser)
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(api.auth.me).toHaveBeenCalled()
      })
    })

    it('calls setUser with the returned user data', async () => {
      const user = userEvent.setup()
      const setUserSpy = vi.spyOn(useAuthStore.getState(), 'setUser')
      api.auth.login.mockResolvedValue({ token: 'token' })
      api.auth.me.mockResolvedValue(mockUser)
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(setUserSpy).toHaveBeenCalledWith(mockUser)
      })
      setUserSpy.mockRestore()
    })

    it('shows error toast when login fails', async () => {
      const user = userEvent.setup()
      api.auth.login.mockRejectedValue(new Error('Invalid credentials'))
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'wrong')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Sign in failed'))
      })
    })

    it('shows error toast when me() fails', async () => {
      const user = userEvent.setup()
      api.auth.login.mockResolvedValue({ token: 'token' })
      api.auth.me.mockRejectedValue(new Error('Network error'))
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Sign in failed'))
      })
    })
  })

  describe('password visibility toggle', () => {
    it('renders password input as type="password" initially', () => {
      renderLoginPage()
      const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement
      expect(passwordInput.type).toBe('password')
    })

    it('toggles password input type when show password button is clicked', async () => {
      const user = userEvent.setup()
      renderLoginPage()
      const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement
      const toggleBtn = screen.getByRole('button', { name: /show|hide/i })

      expect(passwordInput.type).toBe('password')
      await user.click(toggleBtn)
      expect(passwordInput.type).toBe('text')
      await user.click(toggleBtn)
      expect(passwordInput.type).toBe('password')
    })

    it('switches input type back to password after clicking toggle', async () => {
      const user = userEvent.setup()
      renderLoginPage()
      const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement
      const toggleBtn = screen.getByRole('button', { name: /show|hide/i })

      await user.click(toggleBtn)
      expect(passwordInput.type).toBe('text')
      await user.click(toggleBtn)
      expect(passwordInput.type).toBe('password')
    })
  })

  describe('loading state', () => {
    it('shows "Signing in…" text on submit button while loading', async () => {
      const user = userEvent.setup()
      // Keep the promise pending
      const loginPromise = new Promise(() => {})
      api.auth.login.mockReturnValue(loginPromise)
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      const submitBtn = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument()
      })
    })

    it('disables submit button while loading', async () => {
      const user = userEvent.setup()
      const loginPromise = new Promise(() => {})
      api.auth.login.mockReturnValue(loginPromise)
      renderLoginPage()

      await user.type(screen.getByPlaceholderText('admin@flow.local'), 'test@example.com')
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123')
      const submitBtn = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitBtn)

      await waitFor(() => {
        const signingBtn = screen.getByRole('button', { name: /signing in/i })
        expect(signingBtn).toBeDisabled()
      })
    })
  })

  describe('error query parameter handling', () => {
    it('shows error toast for email_not_verified query param', async () => {
      render(
        <MemoryRouter initialEntries={['/login?error=email_not_verified']}>
          <LoginPage />
        </MemoryRouter>
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Your provider did not verify your email address')
        )
      })
    })

    it('removes error query param after showing toast', async () => {
      render(
        <MemoryRouter initialEntries={['/login?error=email_not_verified']}>
          <LoginPage />
        </MemoryRouter>
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
      // The URL should be cleaned (error param removed)
      expect(window.location.search).not.toContain('error')
    })

    it('shows error toast for oauth_failed query param', async () => {
      render(
        <MemoryRouter initialEntries={['/login?error=oauth_failed']}>
          <LoginPage />
        </MemoryRouter>
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('OAuth sign-in failed')
        )
      })
    })

    it('shows generic error message for unknown error param', async () => {
      render(
        <MemoryRouter initialEntries={['/login?error=unknown_error']}>
          <LoginPage />
        </MemoryRouter>
      )
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Sign-in failed')
        )
      })
    })
  })

  describe('flags loading state', () => {
    it('does not render login methods when flags are loading', () => {
      useFeatureFlagStore.setState({ loading: true })
      renderLoginPage()
      // When loading, no login method should be shown (including the "no methods" warning)
      expect(screen.queryByPlaceholderText('admin@flow.local')).not.toBeInTheDocument()
      expect(screen.queryByText(/no login methods/i)).not.toBeInTheDocument()
    })

    it('renders login methods once flags finish loading', async () => {
      useFeatureFlagStore.setState({ loading: true })
      const { rerender } = render(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      )

      useFeatureFlagStore.setState({ loading: false })
      rerender(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('admin@flow.local')).toBeInTheDocument()
      })
    })
  })
})
