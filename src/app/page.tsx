'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send, Sparkles, Shield, ShieldCheck, ShieldAlert, Upload, Receipt, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, Target, Bot, User,
  Check, X, Loader2, Lock, ChevronRight, ArrowUpRight, ArrowDownRight,
  Activity, BarChart3, Settings2, Cpu, Database, Zap, FileText,
} from 'lucide-react'
import { fmt, fmtMonth } from '@/lib/format'
import {
  Treemap, ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
  RadialBarChart, RadialBar, Cell, Area, AreaChart,
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
      content: "Welcome to FinWise. I'm your AI finance copilot — I analyze your transactions, monitor budgets, run savings simulations, and surface actionable recommendations. Ask me anything, or try one of the suggested prompts below.",
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
        toast.success('FinWise dataset regenerated', {
          description: `${d.transactionCount} transactions · ${d.goalCount} goals · ${d.recommendationCount} recommendations`,
        })
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

  // Refresh data when tier changes
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
    { label: 'Monthly review', text: 'How did this month go?', icon: BarChart3 },
    { label: 'Spending anomaly', text: 'Why did I overspend this month?', icon: AlertTriangle },
    { label: 'Run simulation', text: 'If I cut dining by 20%, when can I afford the Japan trip?', icon: Target },
    { label: 'Cancel subscriptions', text: 'Which subscriptions should I cancel?', icon: Receipt },
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
        toast.success(`Imported ${d.imported} transactions`, {
          description: file.name,
        })
        await loadDashboard()
      } else {
        toast.error(d.error || 'Upload failed')
      }
    } catch (err: any) {
      toast.error(err.message)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Receipt OCR ──────────────────────────────────────────────────────
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
        toast.success('Receipt parsed', {
          description: `${d.merchant} · ${fmt(d.totalCents)} · ${d.itemCount} items`,
        })
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

  // Derived values
  const netSavings = totalIncome - totalSpend
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0
  const totalPendingRecs = recs.filter(r => r.status === 'pending').reduce((s, r) => s + r.impactCents, 0)
  const overBudgetCount = budgets.filter(b => b.percentUsed > 100).length

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[var(--fw-bg)] text-[var(--fw-text)]">
      {/* ─── Top Navigation Bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--fw-border)] bg-[var(--fw-surface)]/95 backdrop-blur-md">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[var(--fw-text)] flex items-center justify-center shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[var(--fw-surface)]">
                    <path d="M4 4h16v3H4zM4 9h10v3H4zM4 14h16v3H4zM4 19h7v1H4z" fill="currentColor"/>
                  </svg>
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-[15px] font-semibold tracking-tight text-[var(--fw-text)]">
                    FinWise
                  </span>
                  <span className="text-[10px] text-[var(--fw-text-3)] tracking-wide uppercase">
                    Personal Finance Intelligence
                  </span>
                </div>
              </div>

              {/* Status pill */}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] text-[var(--fw-text-2)] font-medium">Agent Online</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Privacy */}
              <button
                onClick={() => setPrivacyMode(!privacyMode)}
                className="flex items-center gap-2 px-3 h-8 rounded-md border border-[var(--fw-border)] bg-[var(--fw-surface)] hover:bg-[var(--fw-surface-2)] transition-colors fw-focus"
                title="Toggle privacy mode"
              >
                {privacyMode ? (
                  <Lock className="h-3.5 w-3.5 text-[var(--fw-accent)]" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-[var(--fw-text-3)]" />
                )}
                <span className="text-[11px] font-medium text-[var(--fw-text-2)] hidden sm:inline">
                  {privacyMode ? 'Local Mode' : 'Cloud Mode'}
                </span>
                <Switch checked={privacyMode} onCheckedChange={setPrivacyMode} className="scale-75 data-[state=checked]:bg-[var(--fw-accent)]" />
              </button>

              {/* Permission tier */}
              <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                <SelectTrigger className="w-[110px] h-8 text-[11px] font-medium border-[var(--fw-border)] bg-[var(--fw-surface)]">
                  <div className="flex items-center gap-1.5">
                    {tier === 'Viewer' && <Shield className="h-3 w-3 text-[var(--fw-text-3)]" />}
                    {tier === 'Editor' && <ShieldCheck className="h-3 w-3 text-[var(--fw-accent)]" />}
                    {tier === 'Approver' && <ShieldAlert className="h-3 w-3 text-amber-500" />}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Viewer">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-[var(--fw-text-3)]" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">Viewer</span>
                        <span className="text-[10px] text-[var(--fw-text-3)]">Read-only</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="Editor">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-[var(--fw-accent)]" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">Editor</span>
                        <span className="text-[10px] text-[var(--fw-text-3)]">Modify budgets</span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="Approver">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">Approver</span>
                        <span className="text-[10px] text-[var(--fw-text-3)]">Execute transfers</span>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Reset */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeed}
                disabled={seeding}
                className="h-8 text-[11px] font-medium border-[var(--fw-border)]"
              >
                {seeding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Settings2 className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline ml-1.5">Reset</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main 3-Column Workspace ────────────────────────────────────── */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ═══ LEFT: Chat Panel (4 cols) ═══ */}
          <section className="lg:col-span-4 xl:col-span-4">
            <div className="lg:h-[calc(100vh-7.5rem)] lg:sticky lg:top-20 flex flex-col rounded-xl border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-md)] overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--fw-border)] bg-[var(--fw-surface-2)]/50">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-[var(--fw-text)] flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-[var(--fw-surface)]" />
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-xs font-semibold text-[var(--fw-text)]">FinWise Agent</span>
                    <span className="text-[10px] text-[var(--fw-text-3)]">Supervisor-Worker · 7 tools</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${privacyMode ? 'bg-[var(--fw-accent)]' : 'bg-emerald-500'}`} />
                  <span className="text-[10px] font-medium text-[var(--fw-text-2)]">
                    {privacyMode ? 'Local' : 'Cloud'}
                  </span>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto fw-scroll px-4 py-4">
                <div className="space-y-5">
                  {messages.map((m, i) => (
                    <MessageBubble key={i} m={m} />
                  ))}
                  {chatLoading && (
                    <div className="flex items-start gap-3">
                      <div className="h-7 w-7 rounded-md bg-[var(--fw-text)] flex items-center justify-center flex-shrink-0">
                        <Bot className="h-3.5 w-3.5 text-[var(--fw-surface)]" />
                      </div>
                      <div className="bg-[var(--fw-surface-2)] rounded-lg rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2 border border-[var(--fw-border)]">
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--fw-text-3)]" />
                        <span className="text-[11px] text-[var(--fw-text-2)]">Analyzing your data...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick prompts */}
              {messages.length <= 1 && (
                <div className="px-4 py-3 border-t border-[var(--fw-border)] bg-[var(--fw-surface-2)]/30">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">
                    Suggested Prompts
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {quickPrompts.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => sendChat(p.text)}
                        className="flex items-start gap-1.5 text-left text-[11px] px-2.5 py-2 rounded-md bg-[var(--fw-surface)] hover:bg-[var(--fw-accent-soft)] border border-[var(--fw-border)] hover:border-[var(--fw-accent)] transition-all fw-focus"
                      >
                        <p.icon className="h-3 w-3 mt-0.5 text-[var(--fw-text-3)] flex-shrink-0" />
                        <span className="text-[var(--fw-text-2)] leading-tight">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-[var(--fw-border)] bg-[var(--fw-surface)]">
                <div className="flex gap-2 items-end">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendChat()
                      }
                    }}
                    placeholder="Ask FinWise about your finances..."
                    className="flex-1 h-9 text-[13px] border-[var(--fw-border)] bg-[var(--fw-surface)] placeholder:text-[var(--fw-text-3)]"
                    disabled={chatLoading}
                  />
                  <Button
                    onClick={() => sendChat()}
                    disabled={chatLoading || !input.trim()}
                    size="sm"
                    className="h-9 px-3 bg-[var(--fw-text)] hover:bg-[var(--fw-text-2)] text-[var(--fw-surface)]"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ CENTER: Dashboard (5 cols) ═══ */}
          <section className="lg:col-span-5 xl:col-span-5 space-y-5">
            {/* Hero KPI strip */}
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-[var(--fw-text)]">Financial Overview</h1>
                  <p className="text-xs text-[var(--fw-text-3)] mt-0.5">Last 6 months · {txns.length} transactions</p>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium border-[var(--fw-border)] text-[var(--fw-text-2)]">
                  <Activity className="h-2.5 w-2.5 mr-1" />
                  Live
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <KpiCard
                  label="Income"
                  value={fmt(totalIncome, { compact: true })}
                  delta="+12.4%"
                  deltaDirection="up"
                  icon={<ArrowDownRight className="h-3 w-3" />}
                />
                <KpiCard
                  label="Spend"
                  value={fmt(totalSpend, { compact: true })}
                  delta="+4.2%"
                  deltaDirection="up"
                  negative
                  icon={<ArrowUpRight className="h-3 w-3" />}
                />
                <KpiCard
                  label="Net Savings"
                  value={fmt(netSavings, { sign: true, compact: true })}
                  delta={`${savingsRate}% rate`}
                  deltaDirection={netSavings >= 0 ? 'up' : 'down'}
                  highlight
                  icon={<TrendingUp className="h-3 w-3" />}
                />
              </div>
            </div>

            {/* Budget status */}
            <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[var(--fw-text-2)]" />
                  <h2 className="text-sm font-semibold text-[var(--fw-text)]">Budget Status</h2>
                </div>
                <div className="flex items-center gap-2">
                  {overBudgetCount > 0 && (
                    <Badge variant="outline" className="text-[10px] font-medium border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                      {overBudgetCount} over
                    </Badge>
                  )}
                  <span className="text-[10px] text-[var(--fw-text-3)] font-medium">
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {budgets.slice(0, 6).map((b) => (
                  <BudgetRow key={b.id} b={b} tier={tier} onUpdate={() => loadDashboard()} />
                ))}
                {budgets.length === 0 && (
                  <div className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-[var(--fw-text-3)]" />
                  </div>
                )}
              </div>
            </Card>

            {/* Spending treemap */}
            <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[var(--fw-text-2)]" />
                  <h2 className="text-sm font-semibold text-[var(--fw-text)]">Spending by Category</h2>
                </div>
                <span className="text-[10px] text-[var(--fw-text-3)]">
                  Total: <span className="font-mono tnum text-[var(--fw-text-2)] font-semibold">{fmt(byCategory.reduce((s, c) => s + c.cents, 0), { compact: true })}</span>
                </span>
              </div>
              <div className="h-60 -mx-2">
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
                        contentStyle={{
                          fontSize: '11px',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          border: '1px solid var(--fw-border)',
                          background: 'var(--fw-surface)',
                          color: 'var(--fw-text)',
                        }}
                      />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--fw-text-3)]" />
                  </div>
                )}
              </div>
            </Card>

            {/* Monthly trend */}
            <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--fw-text-2)]" />
                  <h2 className="text-sm font-semibold text-[var(--fw-text)]">Monthly Trend</h2>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-[var(--fw-positive)]" />
                    <span className="text-[var(--fw-text-2)] font-medium">Income</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-[var(--fw-negative)]" />
                    <span className="text-[var(--fw-text-2)] font-medium">Spend</span>
                  </span>
                </div>
              </div>
              <div className="h-44 -mx-2">
                {byMonth.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byMonth.map(m => ({ ...m, label: fmtMonth(m.month) }))}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#15803d" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#15803d" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.6} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }}
                        stroke="var(--fw-border)"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmt(v, { compact: true })}
                      />
                      <Tooltip
                        formatter={(value: any) => typeof value === 'number' && !isNaN(value) ? fmt(value) : ''}
                        contentStyle={{
                          fontSize: '11px',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          border: '1px solid var(--fw-border)',
                          background: 'var(--fw-surface)',
                        }}
                      />
                      <Area type="monotone" dataKey="incomeCents" stroke="#15803d" strokeWidth={1.5} fill="url(#incomeGrad)" name="Income" />
                      <Area type="monotone" dataKey="spendCents" stroke="#b91c1c" strokeWidth={1.5} fill="url(#spendGrad)" name="Spend" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--fw-text-3)]" />
                  </div>
                )}
              </div>
            </Card>

            {/* Recent transactions */}
            <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[var(--fw-text-2)]" />
                  <h2 className="text-sm font-semibold text-[var(--fw-text)]">Recent Transactions</h2>
                </div>
                <div className="flex gap-1.5">
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
                    className="h-7 text-[11px] font-medium border-[var(--fw-border)]"
                    onClick={() => receiptInputRef.current?.click()}
                  >
                    <Receipt className="h-3 w-3 mr-1" /> OCR
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
                    className="h-7 text-[11px] font-medium border-[var(--fw-border)]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3 mr-1" /> CSV
                  </Button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto fw-scroll -mx-2">
                <div className="space-y-0.5 px-2">
                  {txns.slice(0, 30).map((t) => (
                    <TxnRow key={t.id} t={t} />
                  ))}
                  {txns.length === 0 && (
                    <div className="text-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-[var(--fw-text-3)]" />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </section>

          {/* ═══ RIGHT: Goals + Recs (3 cols) ═══ */}
          <section className="lg:col-span-3 xl:col-span-3 space-y-5">
            {/* Goals */}
            <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-[var(--fw-text-2)]" />
                  <h2 className="text-sm font-semibold text-[var(--fw-text)]">Savings Goals</h2>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium border-[var(--fw-border)] text-[var(--fw-text-2)]">
                  {goals.length} active
                </Badge>
              </div>
              <div className="space-y-4">
                {goals.map((g) => (
                  <GoalCard key={g.id} g={g} />
                ))}
                {goals.length === 0 && (
                  <div className="text-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-[var(--fw-text-3)]" />
                  </div>
                )}
              </div>
            </Card>

            {/* Recommendations */}
            <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-[var(--fw-text)]">Recommendations</h2>
                </div>
                <Badge variant="outline" className="text-[10px] font-medium border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
                  +{fmt(totalPendingRecs, { compact: true })}/yr
                </Badge>
              </div>
              <div className="max-h-96 overflow-y-auto fw-scroll -mx-2">
                <div className="space-y-2 px-2">
                  {recs.map((r) => (
                    <RecCard key={r.id} r={r} tier={tier} onAction={updateRec} />
                  ))}
                  {recs.length === 0 && (
                    <div className="text-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-[var(--fw-text-3)]" />
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* System card */}
            <Card className="p-4 bg-[var(--fw-surface-2)] border-[var(--fw-border)] shadow-[var(--fw-shadow-sm)]">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="h-3.5 w-3.5 text-[var(--fw-text-2)]" />
                <span className="text-[11px] font-semibold text-[var(--fw-text)] uppercase tracking-wider">
                  System Status
                </span>
              </div>
              <div className="space-y-2 text-[11px]">
                <SystemRow icon={Bot} label="Architecture" value="Supervisor-Worker" />
                <SystemRow icon={Database} label="Workers" value="4 active" />
                <SystemRow icon={Cpu} label="LLM" value="Z.ai Chat" />
                <SystemRow icon={Lock} label="PII mode" value={privacyMode ? 'Scrubbed' : 'Standard'} highlight={privacyMode} />
                <SystemRow icon={Shield} label="Permission" value={tier} highlight={tier !== 'Viewer'} />
                <SystemRow icon={Activity} label="Latency" value="~1.5s" />
              </div>
            </Card>
          </section>
        </div>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--fw-border)] bg-[var(--fw-surface)] mt-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-3 text-[var(--fw-text-3)]">
            <span className="font-medium text-[var(--fw-text-2)]">FinWise</span>
            <span>·</span>
            <span>Personal Finance Intelligence</span>
            <span>·</span>
            <span>PBCSF International Track · Topic A</span>
          </div>
          <div className="flex items-center gap-3 text-[var(--fw-text-3)]">
            <span className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              SQLite · Prisma
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              4-layer architecture
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              GDPR · CCPA · PIPL
            </span>
          </div>
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
      <div className={`h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-[var(--fw-surface-2)] border border-[var(--fw-border)]'
          : 'bg-[var(--fw-text)]'
      }`}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-[var(--fw-text-2)]" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-[var(--fw-surface)]" />
        )}
      </div>
      <div className={`max-w-[88%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-[13px] leading-relaxed px-3.5 py-2.5 rounded-lg ${
          isUser
            ? 'bg-[var(--fw-text)] text-[var(--fw-surface)] rounded-tr-sm'
            : 'bg-[var(--fw-surface-2)] text-[var(--fw-text)] rounded-tl-sm border border-[var(--fw-border)]'
        }`}>
          <FormattedContent content={m.content} />
        </div>
        {!isUser && m.toolCalls && m.toolCalls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.toolCalls.map((tc, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--fw-surface-2)] border border-[var(--fw-border)] text-[var(--fw-text-2)]">
                <Zap className="h-2 w-2 text-[var(--fw-accent)]" />
                {tc.name}
              </span>
            ))}
          </div>
        )}
        {!isUser && m.mode && (
          <div className="text-[10px] text-[var(--fw-text-3)] mt-1 ml-1 font-mono uppercase tracking-wider">
            {m.mode.replace('_', ' ')}
          </div>
        )}
      </div>
    </div>
  )
}

function FormattedContent({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="text-left space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <div key={i} className="font-semibold text-[13px] mt-2 mb-1 text-[var(--fw-text)]">{line.slice(3)}</div>
        }
        if (line.startsWith('**') && line.endsWith('**') && !line.includes('**', 2)) {
          return <div key={i} className="font-semibold mt-1">{line.slice(2, -2)}</div>
        }
        if (line.startsWith('- ')) {
          // Inline **bold** support within bullet
          const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g)
          return (
            <div key={i} className="ml-3 flex gap-1.5">
              <span className="text-[var(--fw-text-3)]">•</span>
              <span>
                {parts.map((p, j) => {
                  if (p.startsWith('**') && p.endsWith('**')) {
                    return <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
                  }
                  return <span key={j}>{p}</span>
                })}
              </span>
            </div>
          )
        }
        if (line.startsWith('_') && line.endsWith('_')) {
          return <div key={i} className="italic text-[var(--fw-text-3)] text-[11px] mt-1">{line.slice(1, -1)}</div>
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />
        // Inline **bold** support within paragraph
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <div key={i}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
              }
              return <span key={j}>{p}</span>
            })}
          </div>
        )
      })}
    </div>
  )
}

function KpiCard({ label, value, delta, deltaDirection, icon, negative, highlight }: {
  label: string
  value: string
  delta: string
  deltaDirection: 'up' | 'down'
  icon: React.ReactNode
  negative?: boolean
  highlight?: boolean
}) {
  return (
    <Card className={`p-4 border shadow-[var(--fw-shadow-sm)] transition-shadow hover:shadow-[var(--fw-shadow-md)] ${
      highlight
        ? 'border-[var(--fw-text)] bg-[var(--fw-text)] text-[var(--fw-surface)]'
        : 'border-[var(--fw-border)] bg-[var(--fw-surface)]'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${highlight ? 'text-[var(--fw-surface)]/70' : 'text-[var(--fw-text-3)]'}`}>
          {label}
        </span>
        <span className={highlight ? 'text-[var(--fw-surface)]/70' : 'text-[var(--fw-text-3)]'}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-semibold tnum tracking-tight ${highlight ? 'text-[var(--fw-surface)]' : 'text-[var(--fw-text)]'}`}>
          {value}
        </span>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        {deltaDirection === 'up' ? (
          <TrendingUp className={`h-3 w-3 ${highlight ? 'text-[var(--fw-surface)]/70' : negative ? 'text-[var(--fw-negative)]' : 'text-[var(--fw-positive)]'}`} />
        ) : (
          <TrendingDown className={`h-3 w-3 ${highlight ? 'text-[var(--fw-surface)]/70' : 'text-[var(--fw-negative)]'}`} />
        )}
        <span className={`text-[10px] font-medium ${highlight ? 'text-[var(--fw-surface)]/70' : 'text-[var(--fw-text-2)]'}`}>
          {delta}
        </span>
      </div>
    </Card>
  )
}

function BudgetRow({ b, tier, onUpdate }: { b: BudgetItem; tier: Tier; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState((b.budgetCents / 100).toString())
  const overBudget = b.percentUsed > 100
  const nearLimit = b.percentUsed > 80 && !overBudget

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
    <div className="group flex items-center gap-3 py-1">
      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-[12px] mb-1">
          <span className="font-medium text-[var(--fw-text)]">{b.category}</span>
          <div className="flex items-baseline gap-1.5">
            <span className={`tnum font-semibold ${overBudget ? 'text-[var(--fw-negative)]' : 'text-[var(--fw-text)]'}`}>
              {fmt(b.spentCents)}
            </span>
            <span className="tnum text-[10px] text-[var(--fw-text-3)]">
              / {fmt(b.budgetCents)}
            </span>
          </div>
        </div>
        <div className="h-1 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overBudget ? 'bg-[var(--fw-negative)]' : nearLimit ? 'bg-amber-500' : 'bg-[var(--fw-positive)]'
            }`}
            style={{ width: `${Math.min(100, b.percentUsed)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-[var(--fw-text-3)] tnum">
            {b.percentUsed}% used
          </span>
          {overBudget && (
            <span className="text-[10px] text-[var(--fw-negative)] font-medium tnum">
              {fmt(b.remainingCents, { sign: true })} over
            </span>
          )}
          {!overBudget && (
            <span className="text-[10px] text-[var(--fw-text-3)] tnum">
              {fmt(b.remainingCents)} left
            </span>
          )}
        </div>
      </div>
      {tier !== 'Viewer' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-[var(--fw-text-3)] hover:text-[var(--fw-text)] hover:bg-[var(--fw-surface-2)]"
          onClick={() => setEditing(!editing)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditing(false)}>
          <div className="bg-[var(--fw-surface)] rounded-lg p-5 w-80 border border-[var(--fw-border)] shadow-[var(--fw-shadow-lg)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-1 text-[var(--fw-text)]">Edit {b.category} budget</div>
            <div className="text-[11px] text-[var(--fw-text-3)] mb-3">Set monthly envelope allocation</div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fw-text-3)] text-sm">$</span>
              <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="pl-7" autoFocus />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 border-[var(--fw-border)]" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-[var(--fw-text)] hover:bg-[var(--fw-text-2)] text-[var(--fw-surface)]" onClick={save}>Save</Button>
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
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-[var(--fw-surface-2)] transition-colors">
      <div
        className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white"
        style={{ backgroundColor: t.category.color }}
      >
        {t.category.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-[var(--fw-text)] truncate">{t.merchantRaw}</span>
          {t.anomaly && (
            <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
          )}
          {t.recurring && (
            <span className="text-[8px] font-medium uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)]">
              Recurring
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--fw-text-3)]">
          {t.category.name} · {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div className={`text-[12px] tnum font-semibold flex-shrink-0 ${isCredit ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-text)]'}`}>
        {isCredit ? '+' : '-'}{fmt(t.amountCents)}
      </div>
    </div>
  )
}

function GoalCard({ g }: { g: GoalItem }) {
  const pct = Math.min(100, g.percentComplete)
  const color = pct >= 80 ? '#15803d' : pct >= 50 ? '#b45309' : '#0f766e'
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={[{ value: pct, fill: color }]}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar background={{ fill: 'var(--fw-surface-2)' }} dataKey="value" cornerRadius={10} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tnum text-[var(--fw-text)]">
          {pct}%
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[var(--fw-text)] truncate">{g.name}</div>
        <div className="text-[10px] text-[var(--fw-text-2)] tnum mt-0.5">
          {fmt(g.savedCents, { compact: true })} <span className="text-[var(--fw-text-3)]">/ {fmt(g.targetCents, { compact: true })}</span>
        </div>
        {g.monthsToTarget !== null && (
          <div className="text-[10px] text-[var(--fw-text-3)] mt-0.5">
            {g.monthsToTarget} months to target
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
    <div className={`p-3 rounded-lg border text-[12px] transition-all ${
      isAccepted
        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
        : isDismissed
        ? 'border-[var(--fw-border)] bg-[var(--fw-surface-2)] opacity-60'
        : 'border-[var(--fw-border)] bg-[var(--fw-surface)] hover:border-[var(--fw-text-3)]'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="font-semibold text-[var(--fw-text)] leading-tight text-[12px]">{r.title}</div>
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
          r.confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
          r.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
          'bg-[var(--fw-surface-2)] text-[var(--fw-text-3)]'
        }`}>
          {r.confidence}
        </span>
      </div>
      <div className="text-[11px] text-[var(--fw-text-2)] mb-2 leading-relaxed">{r.detail}</div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono tnum font-semibold text-[var(--fw-positive)]">
          +{fmt(r.impactCents)}/yr
        </span>
        {isPending && tier !== 'Viewer' && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-[var(--fw-positive)] hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={() => onAction(r.id, 'accepted')}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-[var(--fw-text-3)] hover:bg-[var(--fw-surface-2)]"
              onClick={() => onAction(r.id, 'dismissed')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {isAccepted && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--fw-positive)]">
            <Check className="h-3 w-3" /> Accepted
          </span>
        )}
        {isDismissed && (
          <span className="text-[10px] text-[var(--fw-text-3)]">Dismissed</span>
        )}
      </div>
    </div>
  )
}

function SystemRow({ icon: Icon, label, value, highlight }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[var(--fw-text-3)]">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <span className={`font-mono tnum font-medium ${highlight ? 'text-[var(--fw-accent)]' : 'text-[var(--fw-text-2)]'}`}>
        {value}
      </span>
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
