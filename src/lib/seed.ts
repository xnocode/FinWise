// Synthetic transaction data generator
// Produces 12 months of realistic transactions for a demo persona
import { db } from '@/lib/db'

const CATEGORIES = [
  { name: 'Groceries', color: '#16a34a', icon: 'ShoppingCart' },
  { name: 'Dining', color: '#ea580c', icon: 'UtensilsCrossed' },
  { name: 'Transport', color: '#0891b2', icon: 'Car' },
  { name: 'Rent', color: '#7c3aed', icon: 'Home' },
  { name: 'Utilities', color: '#ca8a04', icon: 'Plug' },
  { name: 'Entertainment', color: '#db2777', icon: 'Clapperboard' },
  { name: 'Shopping', color: '#9333ea', icon: 'ShoppingBag' },
  { name: 'Health', color: '#dc2626', icon: 'HeartPulse' },
  { name: 'Subscriptions', color: '#2563eb', icon: 'Repeat' },
  { name: 'Income', color: '#15803d', icon: 'TrendingUp' },
]

const MERCHANTS: Record<string, string[]> = {
  Groceries: ['Trader Joe\'s', 'Whole Foods', 'Safeway', 'Kroger', 'Costco', 'Local Market'],
  Dining: ['Blue Bottle Coffee', 'Sweetgreen', 'Chipotle', 'Sushi Bar', 'Pizza Place', 'Thai Kitchen', 'Burger Joint', 'Taco Stand'],
  Transport: ['Uber', 'Lyft', 'Shell Gas', 'Chevron', 'BART', 'Caltrain', 'Parking Meter'],
  Rent: ['Property Management Co'],
  Utilities: ['PG&E', 'Comcast', 'AT&T', 'Water District', 'Internet Provider'],
  Entertainment: ['AMC Theaters', 'Netflix', 'Spotify Premium', 'Steam', 'Bowling Alley', 'Concert Tickets'],
  Shopping: ['Amazon', 'Target', 'Uniqlo', 'Nike', 'Apple Store', 'IKEA', 'Best Buy'],
  Health: ['CVS Pharmacy', 'Walgreens', 'Dental Office', 'Gym Membership', 'Yoga Studio'],
  Subscriptions: ['iCloud', 'NYTimes', 'Notion Plus', 'Figma Pro', 'ChatGPT Plus', 'Adobe CC'],
  Income: ['Payroll', 'Freelance Client A', 'Freelance Client B'],
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomAmount(minCents: number, maxCents: number): number {
  // Input is in CENTS (not dollars). Returns integer cents.
  return Math.round(Math.random() * (maxCents - minCents) + minCents)
}

function formatDate(d: Date): string {
  return d.toISOString()
}

// Generate a single transaction
function genTx(
  userId: string,
  categoryId: string,
  categoryName: string,
  date: Date,
  overrides: Partial<{ merchant: string; amount: number; direction: string; memo: string }> = {}
) {
  const merchant = overrides.merchant || pick(MERCHANTS[categoryName] || [categoryName])
  const amount = overrides.amount ?? randomAmount(
    categoryName === 'Rent' ? 180000 : categoryName === 'Income' ? 400000 : 800,
    categoryName === 'Rent' ? 220000 : categoryName === 'Income' ? 550000 : 8000
  )
  return {
    userId,
    categoryId,
    date,
    amountCents: amount,
    direction: overrides.direction || (categoryName === 'Income' ? 'credit' : 'debit'),
    currency: 'USD',
    merchantRaw: merchant,
    merchantNorm: merchant.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    memo: overrides.memo || null,
    source: 'csv',
    confidence: 0.92 + Math.random() * 0.08,
    recurring: ['Rent', 'Utilities', 'Subscriptions'].includes(categoryName),
    anomaly: false,
    anomalyScore: null,
  }
}

export async function seedUserData(userEmail: string) {
  // Get or create user
  let user = await db.user.findUnique({ where: { email: userEmail } })
  if (!user) {
    user = await db.user.create({
      data: { email: userEmail, name: 'Demo User', tier: 'Editor', privacyMode: false },
    })
  }

  // Delete ONLY this user's data (not global categories)
  await db.transaction.deleteMany({ where: { userId: user.id } })
  await db.budget.deleteMany({ where: { userId: user.id } })
  await db.recommendation.deleteMany({ where: { userId: user.id } })
  await db.goal.deleteMany({ where: { userId: user.id } })

  // Get or create categories (don't delete existing — they're shared)
  const categoryMap: Record<string, { id: string; color: string }> = {}
  for (const c of CATEGORIES) {
    // Try to find existing category first
    let cat = await db.category.findFirst({ where: { name: c.name } })
    if (!cat) {
      cat = await db.category.create({ data: { name: c.name, color: c.color, icon: c.icon } })
    }
    categoryMap[c.name] = { id: cat.id, color: c.color }
  }

  // Generate 12 months of transactions
  const now = new Date()
  const transactions: any[] = []

  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0, 23, 59, 59)

    // Income: monthly payroll + occasional freelance
    transactions.push({
      ...genTx(user.id, categoryMap.Income.id, 'Income',
        new Date(monthStart.getTime() + 86400000 * 1),
        { merchant: 'Payroll', amount: 480000 }),
      recurring: true,
    })

    if (Math.random() > 0.4) {
      // Freelance income
      transactions.push({
        ...genTx(user.id, categoryMap.Income.id, 'Income',
          new Date(monthStart.getTime() + 86400000 * (10 + Math.floor(Math.random() * 10))),
          { merchant: pick(['Freelance Client A', 'Freelance Client B']),
            amount: randomAmount(40000, 180000) }),
      })
    }

    // Rent (1st of month)
    transactions.push({
      ...genTx(user.id, categoryMap.Rent.id, 'Rent',
        new Date(monthStart.getTime() + 86400000 * 1),
        { merchant: 'Property Management Co', amount: 195000 }),
      recurring: true,
    })

    // Utilities (varies)
    transactions.push({
      ...genTx(user.id, categoryMap.Utilities.id, 'Utilities',
        new Date(monthStart.getTime() + 86400000 * 5),
        { merchant: 'PG&E', amount: randomAmount(8000, 14000) }),
      recurring: true,
    })
    transactions.push({
      ...genTx(user.id, categoryMap.Utilities.id, 'Utilities',
        new Date(monthStart.getTime() + 86400000 * 8),
        { merchant: 'Comcast', amount: 7999 }),
      recurring: true,
    })

    // Subscriptions (recurring)
    for (const sub of ['Netflix', 'Spotify Premium', 'iCloud', 'ChatGPT Plus', 'NYTimes']) {
      transactions.push({
        ...genTx(user.id, categoryMap.Subscriptions.id, 'Subscriptions',
          new Date(monthStart.getTime() + 86400000 * (3 + Math.floor(Math.random() * 5))),
          { merchant: sub, amount: randomAmount(499, 1999) }),
        recurring: true,
      })
    }

    // Groceries: 6-10 trips per month
    const groceryTrips = 6 + Math.floor(Math.random() * 5)
    for (let i = 0; i < groceryTrips; i++) {
      const day = 1 + Math.floor(Math.random() * 28)
      transactions.push({
        ...genTx(user.id, categoryMap.Groceries.id, 'Groceries',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day,
            10 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60)),
          { amount: randomAmount(2500, 9500) }),
      })
    }

    // Dining: 10-18 meals per month
    const diningTrips = 10 + Math.floor(Math.random() * 9)
    for (let i = 0; i < diningTrips; i++) {
      const day = 1 + Math.floor(Math.random() * 28)
      const isWeekend = new Date(monthStart.getFullYear(), monthStart.getMonth(), day).getDay() % 6 === 0
      transactions.push({
        ...genTx(user.id, categoryMap.Dining.id, 'Dining',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day,
            11 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60)),
          { amount: isWeekend ? randomAmount(4500, 9500) : randomAmount(1200, 2800) }),
      })
    }

    // Transport: 4-8 trips per month
    const transportTrips = 4 + Math.floor(Math.random() * 5)
    for (let i = 0; i < transportTrips; i++) {
      const day = 1 + Math.floor(Math.random() * 28)
      transactions.push({
        ...genTx(user.id, categoryMap.Transport.id, 'Transport',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day,
            7 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60)),
          { merchant: pick(['Uber', 'Lyft', 'Shell Gas', 'BART']),
            amount: randomAmount(1200, 6500) }),
      })
    }

    // Entertainment: 1-3 events per month
    const entEvents = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < entEvents; i++) {
      const day = 1 + Math.floor(Math.random() * 28)
      transactions.push({
        ...genTx(user.id, categoryMap.Entertainment.id, 'Entertainment',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day,
            18 + Math.floor(Math.random() * 4), 0),
          { amount: randomAmount(1500, 12000) }),
      })
    }

    // Shopping: 2-5 purchases per month
    const shoppingTrips = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < shoppingTrips; i++) {
      const day = 1 + Math.floor(Math.random() * 28)
      transactions.push({
        ...genTx(user.id, categoryMap.Shopping.id, 'Shopping',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day,
            10 + Math.floor(Math.random() * 10), 0),
          { amount: randomAmount(2500, 28000) }),
      })
    }

    // Health: 1-3 visits
    const healthVisits = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < healthVisits; i++) {
      const day = 1 + Math.floor(Math.random() * 28)
      transactions.push({
        ...genTx(user.id, categoryMap.Health.id, 'Health',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day,
            9 + Math.floor(Math.random() * 10), 0),
          { amount: randomAmount(2500, 18000) }),
      })
    }

    // Anomaly injection: 5% chance of large unusual purchase
    if (monthOffset <= 2 && Math.random() > 0.6) {
      const day = 5 + Math.floor(Math.random() * 20)
      transactions.push({
        ...genTx(user.id, categoryMap.Shopping.id, 'Shopping',
          new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 14, 30),
          { merchant: 'Tokyo Airlines', amount: 41200, memo: 'Anomaly: large unusual purchase' }),
        anomaly: true,
        anomalyScore: 0.93,
      })
    }
  }

  // Bulk insert transactions
  await db.transaction.createMany({ data: transactions })

  // Create budgets (current month) — realistic allocations in cents
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const budgetAllocations: Record<string, number> = {
    Groceries: 40000,   // $400/mo
    Dining: 35000,      // $350/mo
    Transport: 12000,   // $120/mo
    Rent: 195000,       // $1,950/mo (matches actual rent)
    Utilities: 18000,   // $180/mo
    Entertainment: 8000, // $80/mo
    Shopping: 15000,    // $150/mo
    Health: 6000,       // $60/mo
    Subscriptions: 5000, // $50/mo
  }
  for (const [cat, amount] of Object.entries(budgetAllocations)) {
    if (categoryMap[cat]) {
      await db.budget.create({
        data: {
          userId: user.id,
          categoryId: categoryMap[cat].id,
          amountCents: amount,
          month: currentMonth,
        },
      })
    }
  }

  // Create goals
  await db.goal.create({
    data: {
      userId: user.id,
      name: 'Trip to Japan',
      targetCents: 500000,
      savedCents: 185000,
      monthlyContributionCents: 30000,
      targetDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
    },
  })
  await db.goal.create({
    data: {
      userId: user.id,
      name: 'Emergency Fund',
      targetCents: 300000,
      savedCents: 220000,
      monthlyContributionCents: 5000,
      targetDate: new Date(now.getFullYear(), now.getMonth() + 3, 1),
    },
  })
  await db.goal.create({
    data: {
      userId: user.id,
      name: 'New Laptop',
      targetCents: 240000,
      savedCents: 90000,
      monthlyContributionCents: 10000,
      targetDate: new Date(now.getFullYear(), now.getMonth() + 5, 1),
    },
  })

  // Create recommendations
  const recs = [
    {
      template: 'cancel_subscription',
      title: 'Cancel unused ChatGPT Plus subscription',
      detail: 'You have not opened ChatGPT in 92 days. Canceling the $20/month subscription saves $240/year.',
      impactCents: 24000, confidence: 'high',
      evidence: JSON.stringify({ merchant: 'ChatGPT Plus', lastUsed: '92 days ago', monthlyCost: 2000 }),
    },
    {
      template: 'cancel_subscription',
      title: 'Cancel NYTimes subscription',
      detail: 'Your NYTimes subscription ($1.25/week) has not seen article opens in 45 days. Cancel to save $65/year.',
      impactCents: 6500, confidence: 'medium',
      evidence: JSON.stringify({ merchant: 'NYTimes', lastUsed: '45 days ago' }),
    },
    {
      template: 'rebalance_budget',
      title: 'Move $200 from Dining to Savings',
      detail: 'You are 38% over dining budget this month with 8 days remaining. Reallocating $200 keeps month-end positive.',
      impactCents: 24000, confidence: 'high',
      evidence: JSON.stringify({ overBudgetCategory: 'Dining', percent: 38 }),
    },
    {
      template: 'defer_purchase',
      title: 'Defer Tokyo Airlines follow-up trip',
      detail: 'A second $412 airline purchase this quarter would push shopping 85% over budget. Consider deferring by 2 months.',
      impactCents: 41200, confidence: 'medium',
      evidence: JSON.stringify({ merchant: 'Tokyo Airlines', amountCents: 41200 }),
    },
    {
      template: 'increase_savings',
      title: 'Increase Emergency Fund contribution',
      detail: 'At current rate, Emergency Fund reaches goal in 16 months. Adding $50/month brings it to 9 months.',
      impactCents: 60000, confidence: 'high',
      evidence: JSON.stringify({ goal: 'Emergency Fund', monthsRemaining: 16 }),
    },
  ]
  for (const r of recs) {
    await db.recommendation.create({
      data: { ...r, userId: user.id, status: 'pending' },
    })
  }

  return {
    user,
    transactionCount: transactions.length,
    goalCount: 3,
    recommendationCount: recs.length,
  }
}

export { CATEGORIES }
