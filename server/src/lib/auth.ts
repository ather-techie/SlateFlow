import { sign, verify } from 'hono/jwt'
import bcrypt from 'bcryptjs'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production — refusing to start with the default dev secret')
}
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'

export interface JwtPayload {
  sub: number
  email: string
  role: string
  iat: number
  exp: number
}

export async function signToken(payload: { sub: number; email: string; role: string }): Promise<string> {
  return sign(
    { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    JWT_SECRET,
    'HS256'
  )
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    return (await verify(token, JWT_SECRET, 'HS256')) as unknown as JwtPayload
  } catch {
    return null
  }
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12)
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash)
}
