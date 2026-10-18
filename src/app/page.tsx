'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send, Sparkles, Shield, ShieldCheck, ShieldAlert, Upload, Receipt, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, Target, MessageSquare, Bot, User,
  Check, X, Loader2, Zap, DollarSign, PieChart, Calendar, Lock, ChevronRight,
} from 'lucide-react'
import { fmt, fmtMonth } from '@/lib/format'
import {
  Treemap, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
  RadialBarChart, RadialBar, Cell,
} from 'recharts'
import { toast } from 'sonner'

type Tier = 'Viewer' | 'Editor' | 'Approver'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  mode?: string
  toolCalls?: any[]
}

type Txn = {
  id: string
  date: string
  merchantRaw: string
  amountCents: number
  direction: string
  category: { name: string; color: string }
  anomaly?: boolean
  recurring?: boolean
  source?: string
}

type BudgetItem = {
  id: string
  categoryId: string
  category: string
  color: string
  budgetCents: number
  spentCents: number
  remainingCents: number
  percentUsed: number
}

type RecItem = {
  id: string
  template: string
  title: string
  detail: string
  impactCents: number
  confidence: string
  status: string
}

type GoalItem = {
  id: string
  name: string
  targetCents: number
  savedCents: number
  monthlyContributionCents: number
  percentComplete: number
  remainingCents: number
  monthsToTarget: number | null
  targetDate: string | null
}

export default function Home() {
  // ─── State ────────────────────────────────────────────────────────────
  const [tier, setTier] = useState<Tier>('Editor')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi, I'm Maya — your money copilot. I can analyze your spending, manage budgets, run simulations, and recommend concrete next steps. Try asking \"How did this month go?\" or click one of the suggested prompts below.",
      mode: 'quick_qa',
    },
  ])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Dashboard
  const [txns, setTxns] = useState<Txn[]>([])
  const [byCategory, setByCategory] = useState<{ name: string; color: string; cents: number; count: number }[]>([])
  const [byMonth, setByMonth] = useState<{ month: string; spendCents: number; incomeCents: number }[]>([])
  const [totalSpend, setTotalSpend] = useState(0)
  const [totalIncome, setTotalIncome] = useState(0)
  const [budgets, setBudgets] = useState<BudgetItem[]>([])

  // Goals + recs
  const [goals, setGoals] = useState<GoalItem[]>([])
  const [recs, setRecs] = useState<RecItem[]>([])

  // ─── Data loaders ─────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    const [txRes, budRes, goalRes, recRes] = await Promise.all([
      fetch('/api/transactions?range=6m'),
      fetch('/api/budget'),
      fetch('/api/goals'),
      fetch('/api/recommendations'),
    ])
    if (txRes.ok) {
      const d = await txRes.json()
      setTxns(d.transactions)
      setByCategory(d.byCategory)
      setByMonth(d.byMonth)
      setTotalSpend(d.totalSpendCents)
      setTotalIncome(d.totalIncomeCents)
    }
    if (budRes.ok) {
      const d = await budRes.json()
      setBudgets(d.budgets)
    }
    if (goalRes.ok) {
      const d = await goalRes.json()
      setGoals(d.goals)
    }
    if (recRes.ok) {
      const d = await recRes.json()
      setRecs(d.recommendations)
    }
  }, [])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const d = await res.json()
      if (d.ok) {
        toast.success(`Generated ${d.transactionCount} transactions, ${d.goalCount} goals, ${d.recommendationCount} recommendations`)
        setSeeded(true)
        await loadDashboard()
      } else {
        toast.error(d.error || 'Seed failed')
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSeeding(false)
    }
  }

  // Auto-seed on first mount
  useEffect(() => {
    handleSeed()
  }, [])

  // Refresh data when tier changes (permissions might affect what's visible)
  useEffect(() => {
    if (seeded) loadDashboard()
  }, [seeded, loadDashboard])

  // ─── Chat ─────────────────────────────────────────────────────────────
  const sendChat = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || chatLoading) return
    setInput('')
    const newMsgs: ChatMessage[] = [
      ...messages,
      { role: 'user', content: msg },
    ]
    setMessages(newMsgs)
    setChatLoading(true)

    // Scroll to bottom
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, 50)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          privacyMode,
          tier,
        }),
      })
      const d = await res.json()
      if (d.ok) {
        setMessages([
          ...newMsgs,
          { role: 'assistant', content: d.response, mode: d.mode, toolCalls: d.toolCalls },
        ])
      } else {
        setMessages([
          ...newMsgs,
          { role: 'assistant', content: `Error: ${d.error || 'unknown'}` },
        ])
      }
    } catch (err: any) {
      setMessages([
        ...newMsgs,
        { role: 'assistant', content: `Network error: ${err.message}` },
      ])
    } finally {
      setChatLoading(false)
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 50)
    }
  }

  const quickPrompts = [
    { label: 'Monthly review', text: 'How did this month go?' },
    { label: 'Why overspend?', text: 'Why did I overspend this month?' },
    { label: 'Run simulation', text: 'If I cut dining by 20%, when can I afford the Japan trip?' },
    { label: 'Cancel subs', text: 'Which subscriptions should I cancel?' },
  ]

  // ─── CSV upload ───────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/transactions', { method: 'POST', body: fd })
      const d = await res.json()
      if (d.ok) {
        toast.success(`Imported ${d.imported} transactions from CSV`)
        await loadDashboard()
      } else {
        toast.error(d.error || 'Upload failed')
      }
    } catch (err: any) {
      toast.error(err.message)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Receipt OCR (simulated) ──────────────────────────────────────────
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (d.ok) {
        toast.success(`Receipt parsed: ${d.merchant} - ${fmt(d.totalCents)}`)
        await loadDashboard()
      } else {
        toast.error(d.error || 'Receipt parse failed')
      }
    } catch (err: any) {
      toast.error(err.message)
    }
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  // ─── Recommendation accept/dismiss ────────────────────────────────────
  const updateRec = async (id: string, status: 'accepted' | 'dismissed') => {
    setRecs(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    try {
      await fetch('/api/recommendations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      toast.success(status === 'accepted' ? 'Recommendation accepted' : 'Recommendation dismissed')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                Maya<span className="text-emerald-600 dark:text-emerald-400"> · </span>
                <span className="text-slate-500 dark:text-slate-400 font-normal">Personal Finance Copilot</span>
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                PBCSF International Track · Topic A · v0.8
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Privacy toggle */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <Lock className={`h-3.5 w-3.5 ${privacyMode ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Privacy</span>
              <Switch
                checked={privacyMode}
                onCheckedChange={setPrivacyMode}
                className="scale-75"
              />
            </div>

            {/* Permission tier */}
            <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
              <SelectTrigger className="w-[120px] h-8 text-xs border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Viewer">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                    <span>Viewer</span>
                  </div>
                </SelectItem>
                <SelectItem value="Editor">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Editor</span>
                  </div>
                </SelectItem>
                <SelectItem value="Approver">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                    <span>Approver</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeed}
              disabled={seeding}
              className="h-8 text-xs"
            >
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline ml-1">Reset data</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main 3-column layout */}
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">

          {/* ═══ LEFT: Chat Panel (4 cols) ═══ */}
          <section className="lg:col-span-4 xl:col-span-4">
            <Card className="h-[calc(100vh-9rem)] min-h-[600px] flex flex-col overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">Chat with Maya</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 gap-1">
                    {privacyMode ? (
                      <>
                        <Lock className="h-2.5 w-2.5" />
                        <span>Local</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-2.5 w-2.5" />
                        <span>Cloud</span>
                      </>
                    )}
                  </Badge>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((m, i) => (
                    <MessageBubble key={i} m={m} />
                  ))}
                  {chatLoading && (
                    <div className="flex items-start gap-3">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                        <span className="text-xs text-slate-500">Maya is analyzing your data...</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Quick prompts */}
              {messages.length <= 1 && (
                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Suggested prompts</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {quickPrompts.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => sendChat(p.text)}
                        className="text-left text-xs px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors text-slate-700 dark:text-slate-300"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendChat()
                      }
                    }}
                    placeholder="Ask Maya about your finances..."
                    className="flex-1 h-9 text-sm"
                    disabled={chatLoading}
                  />
                  <Button
                    onClick={() => sendChat()}
                    disabled={chatLoading || !input.trim()}
                    size="sm"
                    className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          {/* ═══ CENTER: Dashboard (5 cols) ═══ */}
          <section className="lg:col-span-5 xl:col-span-5 space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-3">
              <KpiCard
                label="Income (6m)"
                value={fmt(totalIncome, { compact: true })}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                accent="emerald"
              />
              <KpiCard
                label="Spend (6m)"
                value={fmt(totalSpend, { compact: true })}
                icon={<TrendingDown className="h-3.5 w-3.5" />}
                accent="rose"
              />
              <KpiCard
                label="Net (6m)"
                value={fmt(totalIncome - totalSpend, { sign: true, compact: true })}
                icon={<DollarSign className="h-3.5 w-3.5" />}
                accent={totalIncome - totalSpend >= 0 ? 'emerald' : 'rose'}
              />
            </div>

            {/* Budget status */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Budget Status</h3>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Badge>
              </div>

              <div className="space-y-2.5">
                {budgets.slice(0, 6).map((b) => (
                  <BudgetRow key={b.id} b={b} tier={tier} onUpdate={() => loadDashboard()} />
                ))}
                {budgets.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Loading budgets...
                  </div>
                )}
              </div>
            </Card>

            {/* Spending treemap */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Spending by Category</h3>
                </div>
                <span className="text-[10px] text-slate-400">
                  6-month total: <span className="font-mono">{fmt(byCategory.reduce((s, c) => s + c.cents, 0), { compact: true })}</span>
                </span>
              </div>
              <div className="h-64">
                {byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={byCategory.map(c => ({
                        name: c.name,
                        size: c.cents,
                        color: c.color,
                      }))}
                      dataKey="size"
                      stroke="#fff"
                      content={<TreemapContent />}
                    >
                      <RTooltip
                        formatter={(value: any) => typeof value === 'number' && !isNaN(value) ? fmt(value) : ''}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '6px 10px' }}
                      />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                  </div>
                )}
              </div>
            </Card>

            {/* Monthly trend */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Monthly Trend</h3>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-slate-500">Income</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-slate-500">Spend</span>
                  </span>
                </div>
              </div>
              <div className="h-48">
                {byMonth.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byMonth.map(m => ({ ...m, label: fmtMonth(m.month) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => fmt(v, { compact: true })} />
                      <Tooltip
                        formatter={(value: any) => typeof value === 'number' && !isNaN(value) ? fmt(value) : ''}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '6px 10px' }}
                      />
                      <Line type="monotone" dataKey="incomeCents" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} name="Income" />
                      <Line type="monotone" dataKey="spendCents" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} name="Spend" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
                  </div>
                )}
              </div>
            </Card>

            {/* Recent transactions */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Recent Transactions</h3>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleReceipt}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => receiptInputRef.current?.click()}
                  >
                    <Receipt className="h-3 w-3 mr-1" /> Receipt OCR
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3 mr-1" /> CSV
                  </Button>
                </div>
              </div>
              <ScrollArea className="max-h-80">
                <div className="space-y-1">
                  {txns.slice(0, 30).map((t) => (
                    <TxnRow key={t.id} t={t} />
                  ))}
                  {txns.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading transactions...
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </section>

          {/* ═══ RIGHT: Goals + Recs (3 cols) ═══ */}
          <section className="lg:col-span-3 xl:col-span-3 space-y-4">
            {/* Goals */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Savings Goals</h3>
                </div>
              </div>
              <div className="space-y-4">
                {goals.map((g) => (
                  <GoalCard key={g.id} g={g} />
                ))}
                {goals.length === 0 && (
                  <div className="text-center py-4 text-xs text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading...
                  </div>
                )}
              </div>
            </Card>

            {/* Recommendations */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Recommendations</h3>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {fmt(recs.filter(r => r.status === 'pending').reduce((s, r) => s + r.impactCents, 0), { compact: true })}/yr
                </Badge>
              </div>
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {recs.map((r) => (
                    <RecCard key={r.id} r={r} tier={tier} onAction={updateRec} />
                  ))}
                  {recs.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading...
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>

            {/* Architecture note */}
            <Card className="p-4 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Agent Architecture</span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span>Supervisor</span>
                  <Badge variant="outline" className="text-[9px] h-4">LangGraph-style</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Workers</span>
                  <span className="font-mono">4 (Budget/Analyst/Advisor/Sim)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>LLM</span>
                  <span className="font-mono">Z.ai Chat</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>PII mode</span>
                  <Badge variant="outline" className={`text-[9px] h-4 ${privacyMode ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {privacyMode ? 'Scrubbed' : 'Standard'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Permission</span>
                  <Badge variant="outline" className={`text-[9px] h-4 ${
                    tier === 'Viewer' ? 'text-slate-400' :
                    tier === 'Editor' ? 'text-emerald-500' : 'text-amber-500'
                  }`}>{tier}</Badge>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3 text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Built for PBCSF International Track · Topic A · Personal Finance Assistant AI Agent
          </span>
          <span>
            Supervisor-Worker pattern · Monte Carlo · Privacy-preserving · 4 sub-agents
          </span>
        </div>
      </footer>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

function MessageBubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === 'user'
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-slate-200 dark:bg-slate-700'
          : 'bg-gradient-to-br from-emerald-500 to-teal-600'
      }`}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-white" />
        )}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-xs sm:text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${
          isUser
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-tr-sm'
            : 'bg-emerald-50 dark:bg-emerald-950/40 text-slate-900 dark:text-slate-100 rounded-tl-sm border border-emerald-100 dark:border-emerald-900/50'
        }`}>
          <FormattedContent content={m.content} />
        </div>
        {!isUser && m.toolCalls && m.toolCalls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.toolCalls.map((tc, i) => (
              <Badge key={i} variant="outline" className="text-[9px] h-4 font-mono gap-1 bg-white/50 dark:bg-slate-900/50">
                <Zap className="h-2 w-2" />
                {tc.name}
              </Badge>
            ))}
          </div>
        )}
        {!isUser && m.mode && (
          <div className="text-[10px] text-slate-400 mt-1 ml-1">
            Mode: {m.mode.replace('_', ' ')}
          </div>
        )}
      </div>
    </div>
  )
}

function FormattedContent({ content }: { content: string }) {
  // Simple markdown-ish formatter: **bold**, ## headings, - bullets
  const lines = content.split('\n')
  return (
    <div className="text-left">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <div key={i} className="font-bold text-sm mt-2 mb-1">{line.slice(3)}</div>
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <div key={i} className="font-semibold mt-1">{line.slice(2, -2)}</div>
        }
        if (line.startsWith('- ')) {
          return <div key={i} className="ml-3 before:content-['•'] before:mr-1.5 before:text-slate-400">{line.slice(2)}</div>
        }
        if (line.startsWith('_') && line.endsWith('_')) {
          return <div key={i} className="italic text-slate-500 text-xs mt-1">{line.slice(1, -1)}</div>
        }
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <div key={i}>{line}</div>
      })}
    </div>
  )
}

function KpiCard({ label, value, icon, accent }: {
  label: string; value: string; icon: React.ReactNode; accent: 'emerald' | 'rose'
}) {
  return (
    <Card className={`p-3 border shadow-sm ${
      accent === 'emerald'
        ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10'
        : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/10'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={accent === 'emerald' ? 'text-emerald-500' : 'text-rose-500'}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      </div>
      <div className={`font-bold text-base sm:text-lg ${accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
        {value}
      </div>
    </Card>
  )
}

function BudgetRow({ b, tier, onUpdate }: { b: BudgetItem; tier: Tier; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState((b.budgetCents / 100).toString())
  const overBudget = b.percentUsed > 100

  const save = async () => {
    const newVal = parseFloat(value)
    if (isNaN(newVal) || tier === 'Viewer') {
      setEditing(false)
      return
    }
    try {
      await fetch('/api/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: b.categoryId, amountCents: Math.round(newVal * 100) }),
      })
      toast.success(`Updated ${b.category} budget to $${newVal}`)
      onUpdate()
    } catch (err: any) {
      toast.error(err.message)
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{b.category}</span>
          <span className={`font-mono ${overBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
            {fmt(b.spentCents)} / {fmt(b.budgetCents)}
          </span>
        </div>
        <div className="mt-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overBudget ? 'bg-rose-500' : b.percentUsed > 80 ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, b.percentUsed)}%` }}
          />
        </div>
      </div>
      {tier !== 'Viewer' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-slate-400 hover:text-slate-700"
          onClick={() => setEditing(!editing)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-lg p-4 w-72" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-medium mb-2">Edit {b.category} budget</div>
            <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="mb-3" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TxnRow({ t }: { t: Txn }) {
  const isCredit = t.direction === 'credit'
  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div
        className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white"
        style={{ backgroundColor: t.category.color }}
      >
        {t.category.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{t.merchantRaw}</span>
          {t.anomaly && (
            <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
          )}
          {t.recurring && (
            <Badge variant="outline" className="text-[9px] h-3.5 px-1">RECURRING</Badge>
          )}
        </div>
        <div className="text-[10px] text-slate-400">
          {t.category.name} · {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div className={`text-xs font-mono font-medium flex-shrink-0 ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {isCredit ? '+' : '-'}{fmt(t.amountCents)}
      </div>
    </div>
  )
}

function GoalCard({ g }: { g: GoalItem }) {
  const pct = Math.min(100, g.percentComplete)
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#6366f1'
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={[{ value: pct, fill: color }]}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar background={{ fill: '#e2e8f0' }} dataKey="value" cornerRadius={10} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300">
          {pct}%
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{g.name}</div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400">
          {fmt(g.savedCents, { compact: true })} / {fmt(g.targetCents, { compact: true })}
        </div>
        {g.monthsToTarget !== null && (
          <div className="text-[10px] text-slate-400">
            {g.monthsToTarget} mo to target
          </div>
        )}
      </div>
    </div>
  )
}

function RecCard({ r, tier, onAction }: {
  r: RecItem; tier: Tier; onAction: (id: string, status: 'accepted' | 'dismissed') => void
}) {
  const isPending = r.status === 'pending'
  const isAccepted = r.status === 'accepted'
  const isDismissed = r.status === 'dismissed'

  return (
    <div className={`p-2.5 rounded-lg border text-xs transition-all ${
      isAccepted
        ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50'
        : isDismissed
        ? 'border-slate-200 bg-slate-50/50 dark:bg-slate-900/30 dark:border-slate-800 opacity-60'
        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">{r.title}</div>
        <Badge variant="outline" className={`text-[9px] h-4 flex-shrink-0 ${
          r.confidence === 'high' ? 'text-emerald-500' :
          r.confidence === 'medium' ? 'text-amber-500' : 'text-slate-400'
        }`}>
          {r.confidence}
        </Badge>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">{r.detail}</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
          +{fmt(r.impactCents)}/yr
        </span>
        {isPending && tier !== 'Viewer' && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => onAction(r.id, 'accepted')}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              onClick={() => onAction(r.id, 'dismissed')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {isAccepted && (
          <Badge variant="outline" className="text-[9px] h-4 text-emerald-600 border-emerald-200">
            <Check className="h-2.5 w-2.5 mr-0.5" /> Accepted
          </Badge>
        )}
        {isDismissed && (
          <Badge variant="outline" className="text-[9px] h-4 text-slate-400">
            Dismissed
          </Badge>
        )}
      </div>
    </div>
  )
}

// Recharts custom treemap cell
function TreemapContent(props: any) {
  const { x, y, width, height, name, color, size } = props
  if (width < 30 || height < 20) return null
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ fill: color || '#94a3b8', stroke: '#fff', strokeWidth: 2 }}
      />
      {width > 60 && height > 30 && (
        <>
          <text
            x={x + 8}
            y={y + 18}
            fill="#fff"
            fontSize={11}
            fontWeight={600}
          >
            {name}
          </text>
          <text
            x={x + 8}
            y={y + 32}
            fill="#fff"
            fontSize={10}
            opacity={0.9}
          >
            {typeof size === 'number' && !isNaN(size) ? fmt(size, { compact: true }) : ''}
          </text>
        </>
      )}
    </g>
  )
}
