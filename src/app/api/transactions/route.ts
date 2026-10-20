// Transactions endpoint — list, stats, and CSV upload
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { ensureDefaultCategories } from '@/lib/seed'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const range = url.searchParams.get('range') || '12m'
  const category = url.searchParams.get('category')

  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

  const now = new Date()
  const months = range === '6m' ? 6 : range === '3m' ? 3 : range === '1m' ? 1 : 12
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

  const where: any = { userId: user.id, date: { gte: startDate } }
  if (category) {
    const cat = await db.category.findFirst({ where: { name: category } })
    if (cat) where.categoryId = cat.id
  }

  const txs = await db.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
    take: 500,
  })

  // Aggregate stats
  const totalSpendCents = txs.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const totalIncomeCents = txs.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)

  // Spend by category
  const byCategory: Record<string, { name: string; color: string; cents: number; count: number }> = {}
  for (const t of txs) {
    if (t.direction !== 'debit') continue
    if (!byCategory[t.categoryId]) {
      byCategory[t.categoryId] = { name: t.category.name, color: t.category.color, cents: 0, count: 0 }
    }
    byCategory[t.categoryId].cents += t.amountCents
    byCategory[t.categoryId].count += 1
  }

  // Spend by month
  const byMonth: Record<string, { month: string; spendCents: number; incomeCents: number }> = {}
  for (const t of txs) {
    const m = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth[m]) byMonth[m] = { month: m, spendCents: 0, incomeCents: 0 }
    if (t.direction === 'debit') byMonth[m].spendCents += t.amountCents
    else byMonth[m].incomeCents += t.amountCents
  }

  return NextResponse.json({
    ok: true,
    totalTransactions: txs.length,
    totalSpendCents,
    totalIncomeCents,
    byCategory: Object.values(byCategory).sort((a, b) => b.cents - a.cents),
    byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    transactions: txs.slice(0, 100),
  })
}

// CSV upload endpoint
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    const auth = await requireUser(req)
    if (auth.error) return auth.error
    const user = auth.user

    // ─── Single transaction add (JSON body) ───
    if (contentType.includes('application/json')) {
      const body = await req.json()
      const { merchantRaw, amountCents, direction = 'debit', category, date } = body
      if (!merchantRaw || !amountCents || !category || !date) {
        return NextResponse.json({ ok: false, error: 'merchantRaw, amountCents, category and date are required' }, { status: 400 })
      }
      const cents = Math.abs(Math.round(Number(amountCents)))
      if (!cents) {
        return NextResponse.json({ ok: false, error: 'Amount must be greater than zero' }, { status: 400 })
      }
      const categories = await ensureDefaultCategories()
      let cat = categories.find(c => c.name.toLowerCase() === String(category).toLowerCase())
      if (!cat) {
        cat = await db.category.create({ data: { name: String(category), color: '#6366f1' } })
      }
      await db.transaction.create({
        data: {
          userId: user.id,
          categoryId: cat.id,
          date: new Date(String(date)),
          amountCents: cents,
          direction: String(direction),
          currency: 'USD',
          merchantRaw: String(merchantRaw),
          merchantNorm: String(merchantRaw).toLowerCase().replace(/[^a-z0-9]/g, '-'),
          source: 'manual',
          confidence: 1,
        },
      })
      return NextResponse.json({ ok: true })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })

    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return NextResponse.json({ ok: false, error: 'CSV must have header + data' }, { status: 400 })

    const header = lines[0].split(',').map(h => h.trim().toLowerCase())
    const dateIdx = header.findIndex(h => h.includes('date'))
    const amtIdx = header.findIndex(h => h.includes('amount') || h.includes('value'))
    const merIdx = header.findIndex(h => h.includes('merchant') || h.includes('description') || h.includes('name'))
    const catIdx = header.findIndex(h => h.includes('category'))

    if (dateIdx === -1 || amtIdx === -1) {
      return NextResponse.json({ ok: false, error: 'CSV must contain date and amount columns' }, { status: 400 })
    }

    const categories = await ensureDefaultCategories()
    const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const defaultCat = categories.find(c => c.name === 'Shopping') || categories[0]

    let imported = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const dateStr = cols[dateIdx]
      const amtStr = cols[amtIdx]
      if (!dateStr || !amtStr) continue
      const date = new Date(dateStr)
      const amount = parseFloat(amtStr.replace(/[$,]/g, ''))
      if (isNaN(date.getTime()) || isNaN(amount)) continue

      const merchant = merIdx >= 0 ? cols[merIdx] : 'Unknown'
      let category = catIdx >= 0 ? cols[catIdx] : 'Shopping'
      const catId = catMap.get(category.toLowerCase()) || defaultCat.id

      await db.transaction.create({
        data: {
          userId: user.id,
          categoryId: catId,
          date,
          amountCents: Math.abs(Math.round(amount * 100)),
          direction: amount < 0 ? 'debit' : 'credit',
          currency: 'USD',
          merchantRaw: merchant,
          merchantNorm: merchant.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          source: 'csv',
          confidence: 0.95,
        },
      })
      imported++
    }

    return NextResponse.json({ ok: true, imported })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
