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

    let bodyMessage = message.trim()
    let isConfirmed = confirmed

    // If user typed an affirmative confirmation word ("yes", "confirm", "proceed", "do it")
    const isAffirmative = /^(?:yes|y|yeah|yep|sure|confirm|confirmed|proceed|do it|ok|okay|approve|approved|apply)\b/i.test(bodyMessage)
    if (isAffirmative && !isConfirmed && Array.isArray(history) && history.length > 0) {
      // Find the last actual command user typed before this confirmation
      const lastUserEntry = [...history].reverse().find((m: any) => m.role === 'user' && !/^(?:yes|y|yeah|yep|sure|confirm|proceed|ok)\b/i.test(m.content))
      if (lastUserEntry?.content) {
        bodyMessage = lastUserEntry.content
        isConfirmed = true
      }
    }

    const ctx: ToolContext = {
      userId: user.id,
      privacyMode: Boolean(user.privacyMode),
      tier: (user.tier as 'Viewer' | 'Editor' | 'Approver') || 'Editor',
    }

    const routed = await routeIntent(bodyMessage, ctx)
    const pendingWrites = routed.tools.filter((t) => WRITE_TOOL_NAMES.includes(t.name))
    if (pendingWrites.length > 0 && user.settings?.agentConfirmWrites && !isConfirmed) {
      const descriptions = pendingWrites.map((t) => {
        if (t.name === 'add_transaction') {
          const sign = t.args.direction === 'credit' ? '+' : '-'
          const amt = t.args.displayAmount ? `${t.args.displayCurrency || 'USD'} ${t.args.displayAmount}` : `$${((t.args.amount || 0) / 100).toFixed(2)}`
          return `Record transaction: ${sign}${amt} for "${t.args.merchant}" (${t.args.category || 'General'})`
        }
        if (t.name === 'delete_transaction') {
          return `Delete transaction${t.args.merchant ? ` for "${t.args.merchant}"` : ''}${t.args.amountCents ? ` ($${(t.args.amountCents / 100).toFixed(2)})` : ''}`
        }
        if (t.name === 'update_transaction') {
          return `Update transaction: ${t.args.merchant || 'Expense'} to $${((t.args.amountCents || 0) / 100).toFixed(2)}`
        }
        if (t.name === 'update_budget') {
          return `Update ${t.args.category} monthly budget to $${((t.args.amountCents || 0) / 100).toFixed(2)}`
        }
        if (t.name === 'create_goal') {
          return `Create goal "${t.args.name}" targeting $${((t.args.targetCents || 0) / 100).toFixed(2)}`
        }
        return t.name.replace(/_/g, ' ')
      })

      return NextResponse.json({
        ok: true,
        needsConfirmation: true,
        mode: routed.mode,
        pendingWrites: pendingWrites.map((t) => ({ name: t.name, args: t.args })),
        response: `⚠️ **Confirmation Required**\n\n${descriptions.map(d => `• ${d}`).join('\n')}\n\nPlease click **Confirm** below or reply **"yes"** to apply this update to your records.`,
        toolCalls: [],
        dataChanged: false,
      })
    }

    const result = await runAgent(ctx, bodyMessage, history, {
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
