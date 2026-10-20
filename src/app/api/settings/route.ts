// Settings endpoint — GET current settings, PATCH to update
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, publicSettings } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user
  if (!user) return NextResponse.json({ ok: false, error: 'No user' }, { status: 404 })

  // Create default settings if none exist
  let settings = user.settings
  if (!settings) {
    settings = await db.userSettings.create({ data: { userId: user.id } })
  }

  return NextResponse.json({
    ok: true,
    settings: publicSettings(settings),
    user: { email: user.email, name: user.name, tier: user.tier, privacyMode: user.privacyMode },
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    // Ensure settings record exists
    let settings = await db.userSettings.findUnique({ where: { userId: user.id } })
    if (!settings) {
      settings = await db.userSettings.create({ data: { userId: user.id } })
    }

    // Build update object from allowed fields
    const allowedFields = [
      'displayName', 'avatarColor',
      'theme', 'density',
      'currency', 'dateFormat', 'numberFormat', 'firstDayOfWeek',
      'notifInsights', 'notifBills', 'notifAnomalies', 'notifRecommendations', 'notifBudgetAlerts', 'notifWeeklyDigest',
      'agentResponseStyle', 'agentDefaultMode', 'agentAutoRefresh', 'agentConfirmWrites',
      'analyticsReturnRate', 'analyticsInflation', 'analyticsVolatility',
      'shareAggregates',
      'llmProvider', 'llmApiKey', 'llmModel', 'llmBaseUrl',
      'onboardingState', 'currentAge',
    ]

    const updateData: any = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key]
      }
    }
    if (typeof updateData.llmApiKey === 'string' && (updateData.llmApiKey.startsWith('•') || updateData.llmApiKey.includes('****'))) {
      delete updateData.llmApiKey
    }

    // Also update user-level fields (tier, privacyMode, name)
    const userUpdate: any = {}
    if (body.tier === 'Viewer' || body.tier === 'Editor') userUpdate.tier = body.tier
    if (body.privacyMode !== undefined) userUpdate.privacyMode = body.privacyMode
    if (body.name !== undefined) userUpdate.name = body.name

    if (Object.keys(userUpdate).length > 0) {
      await db.user.update({ where: { id: user.id }, data: userUpdate })
    }

    if (Object.keys(updateData).length > 0) {
      settings = await db.userSettings.update({ where: { userId: user.id }, data: updateData })
    }

    return NextResponse.json({ ok: true, settings: publicSettings(settings) })
  } catch (err: any) {
    console.error('Settings update error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
