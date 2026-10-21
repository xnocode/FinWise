import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from './db'
import type { User, UserSettings } from '@prisma/client'

const AUTH_SECRET = process.env.AUTH_SECRET || 'finwise-dev-only-change-AUTH_SECRET'

export type AuthedUser = User & { settings: UserSettings | null }

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!storedHash) return false
  try {
    const [salt, key] = storedHash.split(':')
    if (!salt || !key) return false
    const keyBuffer = Buffer.from(key, 'hex')
    const derivedKey = crypto.scryptSync(password, salt, 64)
    if (keyBuffer.length !== derivedKey.length) return false
    return crypto.timingSafeEqual(keyBuffer, derivedKey)
  } catch {
    return false
  }
}

export function createSessionToken(userId: string, email: string): string {
  const payload = JSON.stringify({
    userId,
    email: email.toLowerCase().trim(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  })
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}.${signature}`).toString('base64url')
}

export function verifySessionToken(token?: string | null): { userId: string; email: string } | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const lastDot = raw.lastIndexOf('.')
    if (lastDot === -1) return null
    const payloadStr = raw.slice(0, lastDot)
    const signature = raw.slice(lastDot + 1)
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('hex')
    const sigBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expectedSig)
    if (sigBuf.length !== expectedBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null
    const data = JSON.parse(payloadStr)
    if (Date.now() > data.exp) return null
    return { userId: data.userId, email: data.email }
  } catch {
    return null
  }
}

function readSessionToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  const headerToken = req.headers.get('x-session-token')
  if (headerToken) return headerToken
  return req.cookies.get('finwise_session')?.value || null
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === 'production',
  }
}

export function publicSettings(settings: UserSettings | null) {
  if (!settings) return null
  const key = (settings as any).llmApiKey || ''
  return {
    ...settings,
    llmApiKey: key ? `••••${key.slice(-4)}` : '',
    llmApiKeySet: Boolean(key),
  }
}

export async function requireUser(req: NextRequest): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const token = readSessionToken(req)
  const session = verifySessionToken(token)
  if (!session) {
    return {
      error: NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 }),
    }
  }
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { settings: true },
  })
  if (!user) {
    return {
      error: NextResponse.json({ ok: false, error: 'Account not found' }, { status: 401 }),
    }
  }
  return { user }
}
