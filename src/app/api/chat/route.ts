import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgent, routeIntent, WRITE_TOOL_NAMES, type ToolContext } from '@/lib/agent'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    const body = await req.json()
    const { message, history = [], confirmed = false } = body
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 })
    }

    const ctx: ToolContext = {
      userId: user.id,
      privacyMode: Boolean(user.privacyMode),
      tier: (user.tier as 'Viewer' | 'Editor' | 'Approver') || 'Editor',
    }

    const routed = await routeIntent(message, ctx)
    const pendingWrites = routed.tools.filter((t) => WRITE_TOOL_NAMES.includes(t.name))
    if (pendingWrites.length > 0 && user.settings?.agentConfirmWrites && !confirmed) {
      return NextResponse.json({
        ok: true,
        needsConfirmation: true,
        mode: routed.mode,
        pendingWrites: pendingWrites.map((t) => ({ name: t.name, args: t.args })),
        response: 'This will change your data. Confirm to continue.',
        toolCalls: [],
        dataChanged: false,
      })
    }

    const result = await runAgent(ctx, message, history, {
      skipLlm: Boolean(user.privacyMode),
    })

    let conv = await db.conversation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    })
    if (!conv) {
      conv = await db.conversation.create({
        data: { userId: user.id, title: message.slice(0, 60), mode: result.mode },
      })
    }
    await db.message.createMany({
      data: [
        { conversationId: conv.id, role: 'user', content: message },
        {
          conversationId: conv.id,
          role: 'assistant',
          content: result.response,
          toolCalls: JSON.stringify(result.toolCalls),
        },
      ],
    })

    const triggeredWrites = result.toolCalls.some(
      (tc: any) => WRITE_TOOL_NAMES.includes(tc.name) && tc.success !== false
    )

    return NextResponse.json({
      ok: true,
      response: result.response,
      mode: result.mode,
      toolCalls: result.toolCalls,
      dataChanged: triggeredWrites,
      privacyMode: user.privacyMode,
    })
  } catch (err: any) {
    console.error('Chat error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
