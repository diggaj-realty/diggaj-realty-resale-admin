import jwt from 'jsonwebtoken'
import type { UserRole } from '@/types'

if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET must be set')
const SECRET: string = process.env.NEXTAUTH_SECRET

export interface ApiTokenPayload {
  id: string
  role: UserRole
}

export function signApiToken(payload: ApiTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' })
}

export function verifyApiToken(token: string): ApiTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as ApiTokenPayload
  } catch {
    return null
  }
}
