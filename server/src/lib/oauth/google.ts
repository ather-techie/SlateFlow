import type { OAuthProfile, OAuthProvider } from './types.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

function redirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`
}

function clientId(): string {
  const id = process.env.OAUTH_GOOGLE_CLIENT_ID
  if (!id) throw new Error('OAUTH_GOOGLE_CLIENT_ID is not set')
  return id
}

function clientSecret(): string {
  const secret = process.env.OAUTH_GOOGLE_CLIENT_SECRET
  if (!secret) throw new Error('OAUTH_GOOGLE_CLIENT_SECRET is not set')
  return secret
}

function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function exchangeCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) throw new Error(`google token exchange failed (${tokenRes.status})`)
  const token = await tokenRes.json() as { access_token?: string }
  if (!token.access_token) throw new Error('google token response missing access_token')

  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userRes.ok) throw new Error(`google userinfo failed (${userRes.status})`)
  const profile = await userRes.json() as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
  }

  if (!profile.sub) throw new Error('google profile missing sub')
  if (!profile.email) throw new Error('google profile missing email')

  return {
    providerUserId: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified === true,
    displayName: profile.name?.trim() || profile.email,
  }
}

function isConfigured(): boolean {
  return !!process.env.OAUTH_GOOGLE_CLIENT_ID && !!process.env.OAUTH_GOOGLE_CLIENT_SECRET
}

export const google: OAuthProvider = { name: 'google', buildAuthUrl, exchangeCode, isConfigured }
