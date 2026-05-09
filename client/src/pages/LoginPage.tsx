import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useFeatureFlagStore } from '../store/featureFlagStore'

const ERROR_MESSAGES: Record<string, string> = {
  email_not_verified: 'Your provider did not verify your email address. Sign in with password first to link the account.',
  oauth_state_mismatch: 'Login session expired. Please try again.',
  oauth_failed: 'OAuth sign-in failed. Please try again or use a different method.',
  oauth_misconfigured: 'OAuth provider is not configured. Contact your administrator.',
  account_inactive: 'This account is inactive. Contact your administrator.',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const isEnabled = useFeatureFlagStore(s => s.isEnabled)
  const flagsLoading = useFeatureFlagStore(s => s.loading)
  const passwordEnabled = isEnabled('auth_password')
  const googleEnabled = isEnabled('auth_google')
  const githubEnabled = isEnabled('auth_github')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const error = searchParams.get('error')
    if (!error) return
    toast.error(ERROR_MESSAGES[error] ?? 'Sign-in failed. Please try again.')
    const next = new URLSearchParams(searchParams)
    next.delete('error')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
        return
      }
      const meRes = await fetch('/api/auth/me', { credentials: 'include' })
      const me = await meRes.json()
      setUser(me.data)
      navigate('/', { replace: true })
    } catch {
      toast.error('Unable to connect to server')
    } finally {
      setLoading(false)
    }
  }

  const anyOAuth = googleEnabled || githubEnabled
  const noLoginMethods = !flagsLoading && !passwordEnabled && !anyOAuth

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z"/>
              </svg>
            </div>
            <span className="text-xl font-semibold text-slate-100 tracking-tight">SlateFlow</span>
          </div>
          <p className="text-slate-400 text-sm">Sign in to your workspace</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          {noLoginMethods && (
            <p className="text-sm text-amber-400 text-center">
              No login methods are enabled. Contact your administrator.
            </p>
          )}

          {googleEnabled && (
            <a
              href="/api/auth/google/start"
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-medium rounded-lg py-2 text-sm transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Continue with Google
            </a>
          )}

          {githubEnabled && (
            <a
              href="/api/auth/github/start"
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded-lg py-2 text-sm transition-colors border border-slate-700"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.73.5.99 5.24.99 11.51c0 4.85 3.14 8.96 7.5 10.41.55.1.75-.24.75-.53 0-.26-.01-.95-.01-1.86-3.05.66-3.69-1.47-3.69-1.47-.5-1.27-1.21-1.61-1.21-1.61-.99-.68.07-.66.07-.66 1.1.08 1.68 1.13 1.68 1.13.97 1.67 2.55 1.19 3.18.91.1-.71.38-1.19.69-1.46-2.43-.28-4.99-1.21-4.99-5.39 0-1.19.43-2.16 1.13-2.92-.11-.28-.49-1.39.11-2.89 0 0 .92-.29 3.02 1.12.88-.24 1.81-.36 2.74-.37.93.01 1.87.13 2.74.37 2.1-1.41 3.02-1.12 3.02-1.12.6 1.5.22 2.61.11 2.89.7.76 1.13 1.73 1.13 2.92 0 4.19-2.56 5.11-5 5.38.39.34.74 1 .74 2.02 0 1.46-.01 2.63-.01 2.99 0 .29.2.64.76.53 4.36-1.45 7.49-5.56 7.49-10.41C23.01 5.24 18.27.5 12 .5z"/>
              </svg>
              Continue with GitHub
            </a>
          )}

          {anyOAuth && passwordEnabled && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
          )}

          {passwordEnabled && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@flow.local"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7a10.05 10.05 0 011.875.175M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.364-4.364l-14.728 14.728" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2 text-sm transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
