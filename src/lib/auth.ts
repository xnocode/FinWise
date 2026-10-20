// Shared helper for extracting user email from API requests
// The frontend sends the logged-in user's email via X-User-Email header
// Falls back to demo@example.com for backward compatibility
import { NextRequest } from 'next/server'

export function getUserEmail(req?: NextRequest): string {
  if (req) {
    const email = req.headers.get('x-user-email')
    if (email) return email
  }
  // Fallback: check cookies
  if (req) {
    const cookieEmail = req.cookies.get('finwise_email')?.value
    if (cookieEmail) return cookieEmail
  }
  return 'demo@example.com'
}
