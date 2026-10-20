// Utility: ensure default spending categories exist in the database.
// This is NOT a data-seeding script — it contains no demo users or
// transactions. It is called at runtime (e.g. on CSV upload) to
// guarantee the category rows are present before we need them.

import { db } from '@/lib/db'

const DEFAULT_CATEGORIES = [
  { name: 'Housing',       color: '#6366f1', icon: '🏠' },
  { name: 'Food & Dining', color: '#f59e0b', icon: '🍽️' },
  { name: 'Transport',     color: '#10b981', icon: '🚗' },
  { name: 'Shopping',      color: '#ec4899', icon: '🛍️' },
  { name: 'Healthcare',    color: '#ef4444', icon: '🏥' },
  { name: 'Entertainment', color: '#8b5cf6', icon: '🎬' },
  { name: 'Education',     color: '#3b82f6', icon: '📚' },
  { name: 'Savings',       color: '#14b8a6', icon: '💰' },
  { name: 'Income',        color: '#22c55e', icon: '💵' },
  { name: 'Utilities',     color: '#64748b', icon: '⚡' },
  { name: 'Travel',        color: '#f97316', icon: '✈️' },
  { name: 'Personal Care', color: '#a855f7', icon: '💆' },
  { name: 'Subscriptions', color: '#0ea5e9', icon: '📱' },
  { name: 'Other',         color: '#94a3b8', icon: '📦' },
]

export async function ensureDefaultCategories() {
  const existing = await db.category.findMany()
  if (existing.length > 0) return existing

  await db.category.createMany({
    data: DEFAULT_CATEGORIES,
    skipDuplicates: true,
  })

  return db.category.findMany()
}
