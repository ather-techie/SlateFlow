import type { OAuthProfile, OAuthProvider } from './types.js'

const AUTH_URL = 'https://github.com/login/oauth/authorize'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'
const EMAILS_URL = 'https://api.github.com/user/emails'

function redirectUri(): string {
  const base = process.env.OAUTH_REDIRECT_BASE_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/auth/github/callback`
}

function clientId(): string {
  const id = process.env.OAUTH_GITHUB_CLIENT_ID
  if (!id) throw new Error('OAUTH_GITHUB_CLIENT_ID is not set')
  return id
}

function clientSecret(): string {
  const secret = process.env.OAUTH_GITHUB_CLIENT_SECRET
  if (!secret) throw new Error('OAUTH_GITHUB_CLIENT_SECRET is not set')
  return secret
}

function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: 'read:user user:email',
    state,
    allow_signup: 'true',
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function exchangeCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
    }),
  })
  if (!tokenRes.ok) throw new Error(`github token exchange failed (${tokenRes.status})`)
  const token = await tokenRes.json() as { access_token?: string; error?: string }
  if (!token.access_token) throw new Error(`github token response missing access_token: ${token.error ?? 'unknown'}`)

  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'slateflow',
  }

  const userRes = await fetch(USER_URL, { headers })
  if (!userRes.ok) throw new Error(`github user lookup failed (${userRes.status})`)
  const user = await userRes.json() as {
    id?: number
    login?: string
    name?: string | null
    email?: string | null
  }
  if (!user.id) throw new Error('github profile missing id')

  const emailsRes = await fetch(EMAILS_URL, { headers })
  if (!emailsRes.ok) throw new Error(`github emails lookup failed (${emailsRes.status})`)
  const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>

  const primary = emails.find(e => e.primary && e.verified)
  const fallback = primary ?? emails.find(e => e.verified) ?? emails[0]
  if (!fallback) throw new Error('github account has no usable email')

  return {
    providerUserId: String(user.id),
    email: fallback.email,
    emailVerified: fallback.verified === true,
    displayName: (user.name?.trim()) || user.login || fallback.email,
  }
}

function isConfigured(): boolean {
  return !!process.env.OAUTH_GITHUB_CLIENT_ID && !!process.env.OAUTH_GITHUB_CLIENT_SECRET
}

export const github: OAuthProvider = { name: 'github', buildAuthUrl, exchangeCode, isConfigured }
