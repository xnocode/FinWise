import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  requireUser,
  sessionCookieOptions,
  publicSettings,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters' }
  if (password.length > 128) return { valid: false, message: 'Password is too long' }
  if (!/[a-zA-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one letter' }
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Password must contain at least one number' }
  return { valid: true }
}

// ─── Rate limiting ────────────────────────────────────────────────────
// In-memory sliding window. Resets on server restart, and is per-process —
// swap for a shared store (Redis/DB) if you run multiple instances.
const RATE_LIMITS: Record<'login' | 'signup', { windowMs: number; max: number }> = {
  login: { windowMs: 15 * 60 * 1000, max: 10 },  // 10 failed attempts / 15 min
  signup: { windowMs: 60 * 60 * 1000, max: 5 },   // 5 signups / hour / IP
}
const attempts: { key: string; kind: 'login' | 'signup'; at: number }[] = []
const MAX_TRACKED = 2000

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : 'local') || 'local'
}

function prune(now: number) {
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (now - attempts[i].at > Math.max(...Object.values(RATE_LIMITS).map(r => r.windowMs))) attempts.splice(i, 1)
  }
  if (attempts.length > MAX_TRACKED) attempts.splice(0, attempts.length - MAX_TRACKED)
}

/** Count of relevant attempts still inside the window. */
function recentCount(kind: 'login' | 'signup', key: string, includeAll = false): number {
  const now = Date.now()
  prune(now)
  const { windowMs } = RATE_LIMITS[kind]
  return attempts.filter(a => a.kind === kind && a.key === key && now - a.at < windowMs && (includeAll || kind === 'signup')).length
}

function tooMany(kind: 'login' | 'signup', key: string): boolean {
  return recentCount(kind, key, kind === 'login') >= RATE_LIMITS[kind].max
}

function recordAttempt(kind: 'login' | 'signup', key: string) {
  attempts.push({ key, kind, at: Date.now() })
}

function clearAttempts(kind: 'login' | 'signup', key: string) {
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].kind === kind && attempts[i].key === key) attempts.splice(i, 1)
  }
}

function rateLimited(res: NextResponse) {
  res.headers.set('Retry-After', String(Math.ceil(RATE_LIMITS.login.windowMs / 1000)))
  return res
}

function attachSession(res: NextResponse, token: string) {
  res.cookies.set('finwise_session', token, sessionCookieOptions())
  return res
}

function clearSession(res: NextResponse) {
  res.cookies.set('finwise_session', '', { ...sessionCookieOptions(), maxAge: 0 })
  res.cookies.set('finwise_email', '', { path: '/', maxAge: 0 })
  return res
}

function publicUser(user: { id: string; email: string; name: string | null; tier: string; privacyMode: boolean }) {
  return { id: user.id, email: user.email, name: user.name, tier: user.tier, privacyMode: user.privacyMode }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  return NextResponse.json({
    ok: true,
    user: publicUser(auth.user),
    settings: publicSettings(auth.user.settings),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, email, password, name, currency } = body
    const ip = clientKey(req)

    if (action === 'signup') {
      if (tooMany('signup', ip)) {
        return rateLimited(NextResponse.json({
          ok: false,
          error: 'Too many accounts created from this device. Please try again in an hour.',
        }, { status: 429 }))
      }
      if (!name || !String(name).trim()) {
        return NextResponse.json({ ok: false, error: 'Please enter your full name', field: 'name' }, { status: 400 })
      }
      if (!email || !String(email).trim()) {
        return NextResponse.json({ ok: false, error: 'Please enter your email address', field: 'email' }, { status: 400 })
      }
      if (!isValidEmail(email)) {
        return NextResponse.json({ ok: false, error: 'Please enter a valid email address', field: 'email' }, { status: 400 })
      }
      const pwCheck = validatePassword(password || '')
      if (!pwCheck.valid) {
        return NextResponse.json({ ok: false, error: pwCheck.message!, field: 'password' }, { status: 400 })
      }

      const normalizedEmail = email.toLowerCase().trim()
      const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
      if (existing) {
        return NextResponse.json({
          ok: false,
          error: 'This email is already registered. Please sign in instead.',
          field: 'email',
          code: 'EMAIL_EXISTS',
        }, { status: 409 })
      }

      const user = await db.user.create({
        data: {
          email: normalizedEmail,
          name: String(name).trim(),
          passwordHash: hashPassword(password),
          tier: 'Editor',
          privacyMode: false,
          settings: {
            create: {
              displayName: String(name).trim(),
              currency: typeof currency === 'string' && currency.length === 3 ? currency : 'USD',
              agentConfirmWrites: false,
            },
          },
        },
      })

      recordAttempt('signup', ip)
      const sessionToken = createSessionToken(user.id, user.email)
      const res = NextResponse.json({
        ok: true,
        user: publicUser(user),
        isNewUser: true,
      })
      return attachSession(res, sessionToken)
    }

    if (action === 'login') {
      if (!email || !password) {
        return NextResponse.json({ ok: false, error: 'Email and password are required' }, { status: 400 })
      }
      const loginKey = `${ip}|${String(email).toLowerCase().trim()}`
      if (tooMany('login', loginKey)) {
        return rateLimited(NextResponse.json({
          ok: false,
          error: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
          code: 'RATE_LIMITED',
        }, { status: 429 }))
      }
      const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        recordAttempt('login', loginKey)
        return NextResponse.json({
          ok: false,
          error: 'Incorrect email or password.',
          code: 'INVALID_CREDENTIALS',
        }, { status: 401 })
      }

      clearAttempts('login', loginKey)
      const sessionToken = createSessionToken(user.id, user.email)
      const res = NextResponse.json({
        ok: true,
        user: publicUser(user),
        isNewUser: false,
      })
      return attachSession(res, sessionToken)
    }

    if (action === 'logout') {
      return clearSession(NextResponse.json({ ok: true }))
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Auth error:', err)
    if (err.code === 'P2002') {
      return NextResponse.json({
        ok: false,
        error: 'This email is already registered. Please sign in instead.',
        field: 'email',
      }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred. Please try again.' }, { status: 500 })
  }
}
