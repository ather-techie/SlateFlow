export interface OAuthProfile {
  providerUserId: string
  email: string
  emailVerified: boolean
  displayName: string
}

export type OAuthProviderName = 'google' | 'github'

export interface OAuthProvider {
  name: OAuthProviderName
  buildAuthUrl(state: string): string
  exchangeCode(code: string): Promise<OAuthProfile>
}
