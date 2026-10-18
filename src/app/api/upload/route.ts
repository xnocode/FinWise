// Receipt OCR upload (simulated) — parses receipt photo and extracts transactions
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 })

    const user = await db.user.findUnique({ where: { email: 'demo@example.com' } })
    if (!user) return NextResponse.json({ ok: false, error: 'No user. Seed first.' }, { status: 404 })

    // Simulated OCR — generate a plausible receipt
    const merchants = [
      { name: 'Trader Joe\'s', category: 'Groceries', totalRange: [25, 95] },
      { name: 'Blue Bottle Coffee', category: 'Dining', totalRange: [4, 18] },
      { name: 'Sweetgreen', category: 'Dining', totalRange: [12, 24] },
      { name: 'Target', category: 'Shopping', totalRange: [15, 180] },
      { name: 'CVS Pharmacy', category: 'Health', totalRange: [8, 65] },
    ]
    const merchant = merchants[Math.floor(Math.random() * merchants.length)]
    const total = Math.round(
      (Math.random() * (merchant.totalRange[1] - merchant.totalRange[0]) + merchant.totalRange[0]) * 100
    )
    const itemCount = 3 + Math.floor(Math.random() * 8)

    // Generate line items
    const lineItems = Array.from({ length: itemCount }, (_, i) => ({
      name: `Item ${i + 1}`,
      amountCents: Math.round(total / itemCount * (0.5 + Math.random())),
    }))
    const lineTotal = lineItems.reduce((s, l) => s + l.amountCents, 0)
    const tax = Math.round(lineTotal * 0.0875)
    const finalTotal = lineTotal + tax

    // Save as transaction
    const category = await db.category.findFirst({ where: { name: merchant.category } })
    if (!category) return NextResponse.json({ ok: false, error: 'Category missing' }, { status: 500 })

    const tx = await db.transaction.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        date: new Date(),
        amountCents: finalTotal,
        direction: 'debit',
        currency: 'USD',
        merchantRaw: merchant.name,
        merchantNorm: merchant.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        source: 'ocr',
        confidence: 0.94,
        memo: `Receipt OCR: ${itemCount} items`,
      },
      include: { category: true },
    })

    return NextResponse.json({
      ok: true,
      merchant: merchant.name,
      category: merchant.category,
      itemCount,
      lineItems,
      subtotalCents: lineTotal,
      taxCents: tax,
      totalCents: finalTotal,
      transaction: tx,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
