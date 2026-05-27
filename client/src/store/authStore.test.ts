import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore, type AuthUser } from './authStore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid AuthUser with no project access. */
function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    email: 'user@example.com',
    display_name: 'Test User',
    role: 'global_reader',
    project_access: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Reset store state before every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAuthStore.setState({ user: null, loading: true })
})

// ---------------------------------------------------------------------------
// isSuperAdmin
// ---------------------------------------------------------------------------

describe('isSuperAdmin', () => {
  it('returns false when user is null', () => {
    // store starts with user: null after beforeEach
    expect(useAuthStore.getState().isSuperAdmin()).toBe(false)
  })

  it('returns true when role is super_admin', () => {
    useAuthStore.setState({ user: makeUser({ role: 'super_admin' }) })
    expect(useAuthStore.getState().isSuperAdmin()).toBe(true)
  })

  it('returns false when role is global_reader', () => {
    useAuthStore.setState({ user: makeUser({ role: 'global_reader' }) })
    expect(useAuthStore.getState().isSuperAdmin()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canWriteProject
// ---------------------------------------------------------------------------

describe('canWriteProject', () => {
  it('returns false when user is null', () => {
    expect(useAuthStore.getState().canWriteProject(42)).toBe(false)
  })

  it('returns true for super_admin on any project', () => {
    useAuthStore.setState({ user: makeUser({ role: 'super_admin' }) })
    expect(useAuthStore.getState().canWriteProject(99)).toBe(true)
  })

  it('returns true when user has contributor role on the project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'contributor' }],
      }),
    })
    expect(useAuthStore.getState().canWriteProject(10)).toBe(true)
  })

  it('returns true when user has project_admin role on the project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'project_admin' }],
      }),
    })
    expect(useAuthStore.getState().canWriteProject(10)).toBe(true)
  })

  it('returns false when user has reader role on the project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'reader' }],
      }),
    })
    expect(useAuthStore.getState().canWriteProject(10)).toBe(false)
  })

  it('returns false when user has access to a different project only', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'contributor' }],
      }),
    })
    expect(useAuthStore.getState().canWriteProject(99)).toBe(false)
  })

  it('returns false when project_access is empty', () => {
    useAuthStore.setState({ user: makeUser({ project_access: [] }) })
    expect(useAuthStore.getState().canWriteProject(10)).toBe(false)
  })

  it('returns correct access when user has multiple project entries', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [
          { project_id: 10, role: 'reader' },
          { project_id: 20, role: 'contributor' },
        ],
      }),
    })
    const { canWriteProject } = useAuthStore.getState()
    expect(canWriteProject(10)).toBe(false) // reader on 10
    expect(canWriteProject(20)).toBe(true) // contributor on 20
    expect(canWriteProject(30)).toBe(false) // no access on 30
  })
})

// ---------------------------------------------------------------------------
// canManageProject
// ---------------------------------------------------------------------------

describe('canManageProject', () => {
  it('returns false when user is null', () => {
    expect(useAuthStore.getState().canManageProject(42)).toBe(false)
  })

  it('returns true for super_admin on any project', () => {
    useAuthStore.setState({ user: makeUser({ role: 'super_admin' }) })
    expect(useAuthStore.getState().canManageProject(99)).toBe(true)
  })

  it('returns true when user has project_admin role on the project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'project_admin' }],
      }),
    })
    expect(useAuthStore.getState().canManageProject(10)).toBe(true)
  })

  it('returns false when user has contributor role on the project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'contributor' }],
      }),
    })
    expect(useAuthStore.getState().canManageProject(10)).toBe(false)
  })

  it('returns false when user has reader role on the project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'reader' }],
      }),
    })
    expect(useAuthStore.getState().canManageProject(10)).toBe(false)
  })

  it('returns false when user has project_admin role on a different project', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [{ project_id: 10, role: 'project_admin' }],
      }),
    })
    expect(useAuthStore.getState().canManageProject(99)).toBe(false)
  })

  it('returns false when project_access is empty', () => {
    useAuthStore.setState({ user: makeUser({ project_access: [] }) })
    expect(useAuthStore.getState().canManageProject(10)).toBe(false)
  })

  it('returns correct access when user is admin on one project and contributor on another', () => {
    useAuthStore.setState({
      user: makeUser({
        project_access: [
          { project_id: 10, role: 'project_admin' },
          { project_id: 20, role: 'contributor' },
        ],
      }),
    })
    const { canManageProject } = useAuthStore.getState()
    expect(canManageProject(10)).toBe(true) // project_admin on 10
    expect(canManageProject(20)).toBe(false) // contributor on 20 — not enough
    expect(canManageProject(30)).toBe(false) // no access on 30
  })
})
