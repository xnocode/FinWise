// Chat endpoint — runs the Maya agent and returns the response
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgent, type ToolContext } from '@/lib/agent'
import { getUserEmail } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history = [], privacyMode = false, tier = 'Editor' } = body
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 })
    }

    // Get or create the demo user
    let user = await db.user.findUnique({ where: { email: getUserEmail(req) } })
    if (!user) {
      user = await db.user.create({
        data: { email: getUserEmail(req), name: 'Demo User', tier, privacyMode },
      })
    }

    const ctx: ToolContext = {
      userId: user.id,
      privacyMode: Boolean(privacyMode),
      tier: tier as 'Viewer' | 'Editor' | 'Approver',
    }

    const result = await runAgent(ctx, message, history)

    // Persist conversation
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

    // Detect if any write tool was called AND succeeded — flag for client refresh
    const writeTools = ['add_transaction', 'create_goal', 'update_budget', 'delete_transaction', 'categorize_merchant']
    const triggeredWrites = result.toolCalls.some((tc: any) => writeTools.includes(tc.name) && tc.success !== false)

    return NextResponse.json({
      ok: true,
      response: result.response,
      mode: result.mode,
      toolCalls: result.toolCalls,
      dataChanged: triggeredWrites,  // client uses this to refresh dashboards
    })
  } catch (err: any) {
    console.error('Chat error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
