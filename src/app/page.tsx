'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send, Sparkles, Shield, ShieldCheck, ShieldAlert, Upload, Receipt, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, Target, Bot, User,
  Check, X, Loader2, Lock, ChevronRight, ArrowUpRight, ArrowDownRight,
  Activity, BarChart3, Settings2, Cpu, Database, Zap, FileText,
  LayoutDashboard, ListFilter, PiggyBank, Lightbulb, X as XIcon,
  Search, Filter, Play, RefreshCw, Bell, Command,
} from 'lucide-react'
import { fmt, fmtMonth } from '@/lib/format'
import {
  Treemap, ResponsiveContainer, Tooltip as RTooltip,
  Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip,
  RadialBarChart, RadialBar, Cell, BarChart, Bar,
} from 'recharts'
import { toast } from 'sonner'

type Tier = 'Viewer' | 'Editor' | 'Approver'
type View = 'overview' | 'transactions' | 'budgets' | 'goals' | 'insights'

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
  memo?: string | null
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

type Anomaly = {
  id: string
  date: string
  merchant: string
  amountCents: number
  category: string
  color: string
  score: number | null
}

type MoMDelta = {
  category: string
  color: string
  thisMonthCents: number
  lastMonthCents: number
  percentChange: number
  trend: 'up' | 'down' | 'flat'
}

type TopMerchant = {
  merchant: string
  category: string
  color: string
  cents: number
  count: number
}

type Subscription = {
  merchant: string
  category: string
  color: string
  cents: number
  monthsActive: number
  monthlyAverageCents: number
  lastDate: string
}

export default function Home() {
  const [view, setView] = useState<View>('overview')
  const [tier, setTier] = useState<Tier>('Editor')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Welcome to FinWise. I'm your AI finance copilot — I analyze transactions, monitor budgets, run simulations, and surface recommendations. Ask me anything or try a suggested prompt below.",
      mode: 'quick_qa',
    },
  ])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [txns, setTxns] = useState<Txn[]>([])
  const [byCategory, setByCategory] = useState<{ name: string; color: string; cents: number; count: number }[]>([])
  const [byMonth, setByMonth] = useState<{ month: string; spendCents: number; incomeCents: number }[]>([])
  const [totalSpend, setTotalSpend] = useState(0)
  const [totalIncome, setTotalIncome] = useState(0)
  const [budgets, setBudgets] = useState<BudgetItem[]>([])
  const [goals, setGoals] = useState<GoalItem[]>([])
  const [recs, setRecs] = useState<RecItem[]>([])

  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [momDeltas, setMomDeltas] = useState<MoMDelta[]>([])
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  const loadDashboard = useCallback(async () => {
    const [txRes, budRes, goalRes, recRes, insRes] = await Promise.all([
      fetch('/api/transactions?range=6m'),
      fetch('/api/budget'),
      fetch('/api/goals'),
      fetch('/api/recommendations'),
      fetch('/api/insights'),
    ])
    if (txRes.ok) {
      const d = await txRes.json()
      setTxns(d.transactions)
      setByCategory(d.byCategory)
      setByMonth(d.byMonth)
      setTotalSpend(d.totalSpendCents)
      setTotalIncome(d.totalIncomeCents)
    }
    if (budRes.ok) { const d = await budRes.json(); setBudgets(d.budgets) }
    if (goalRes.ok) { const d = await goalRes.json(); setGoals(d.goals) }
    if (recRes.ok) { const d = await recRes.json(); setRecs(d.recommendations) }
    if (insRes.ok) {
      const d = await insRes.json()
      setAnomalies(d.anomalies)
      setMomDeltas(d.monthOverMonth)
      setTopMerchants(d.topMerchants)
      setSubscriptions(d.recurringSubscriptions)
    }
  }, [])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      const d = await res.json()
      if (d.ok) {
        toast.success('Dataset regenerated', {
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

  useEffect(() => { handleSeed() }, [])
  useEffect(() => { if (seeded) loadDashboard() }, [seeded, loadDashboard])

  const sendChat = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || chatLoading) return
    setInput('')
    const newMsgs: ChatMessage[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMsgs)
    setChatLoading(true)
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          privacyMode, tier,
        }),
      })
      const d = await res.json()
      if (d.ok) {
        setMessages([...newMsgs, { role: 'assistant', content: d.response, mode: d.mode, toolCalls: d.toolCalls }])
      } else {
        setMessages([...newMsgs, { role: 'assistant', content: `Error: ${d.error || 'unknown'}` }])
      }
    } catch (err: any) {
      setMessages([...newMsgs, { role: 'assistant', content: `Network error: ${err.message}` }])
    } finally {
      setChatLoading(false)
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)
    }
  }

  const quickPrompts = [
    { label: 'Monthly review', text: 'How did this month go?' },
    { label: 'Spending anomaly', text: 'Why did I overspend this month?' },
    { label: 'Run simulation', text: 'If I cut dining by 20%, when can I afford the Japan trip?' },
    { label: 'Cancel subscriptions', text: 'Which subscriptions should I cancel?' },
  ]

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
        toast.success(`Imported ${d.imported} transactions`, { description: file.name })
        await loadDashboard()
      } else { toast.error(d.error || 'Upload failed') }
    } catch (err: any) { toast.error(err.message) }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
        toast.success('Receipt parsed', { description: `${d.merchant} · ${fmt(d.totalCents)} · ${d.itemCount} items` })
        await loadDashboard()
      } else { toast.error(d.error || 'Receipt parse failed') }
    } catch (err: any) { toast.error(err.message) }
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  const updateRec = async (id: string, status: 'accepted' | 'dismissed') => {
    setRecs(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    try {
      await fetch('/api/recommendations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      toast.success(status === 'accepted' ? 'Recommendation accepted' : 'Recommendation dismissed')
    } catch (err: any) { toast.error(err.message) }
  }

  const netSavings = totalIncome - totalSpend
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0
  const totalPendingRecs = recs.filter(r => r.status === 'pending').reduce((s, r) => s + r.impactCents, 0)
  const overBudgetCount = budgets.filter(b => b.percentUsed > 100).length
  const pendingRecCount = recs.filter(r => r.status === 'pending').length

  const navItems: { id: View; label: string; icon: any; badge?: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: ListFilter },
    { id: 'budgets', label: 'Budgets', icon: Wallet, badge: overBudgetCount > 0 ? String(overBudgetCount) : undefined },
    { id: 'goals', label: 'Goals', icon: PiggyBank },
    { id: 'insights', label: 'Insights', icon: Lightbulb, badge: anomalies.length > 0 ? String(anomalies.length) : undefined },
  ]

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--fw-bg)] text-[var(--fw-text)]">
      {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 z-40 border-b border-[var(--fw-border)] fw-glass">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 rounded-[10px] bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                  <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M7 14l3-4 3 3 5-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[15px] font-semibold tracking-tight">FinWise</span>
                <span className="text-[9px] text-[var(--fw-text-4)] tracking-[0.18em] uppercase font-medium">
                  Finance Intelligence
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fw-positive-soft)] border border-[var(--fw-positive-border)] ml-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--fw-positive)] fw-pulse" />
              <span className="text-[11px] text-[var(--fw-positive)] font-semibold">Live</span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <button className="hidden sm:flex relative h-8 w-8 items-center justify-center rounded-lg border border-[var(--fw-border)] bg-[var(--fw-surface)] hover:bg-[var(--fw-surface-2)] hover:border-[var(--fw-border-strong)] transition-all fw-focus">
              <Bell className="h-3.5 w-3.5 text-[var(--fw-text-2)]" />
              {pendingRecCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[var(--fw-accent)] text-[9px] font-bold text-white flex items-center justify-center">
                  {pendingRecCount}
                </span>
              )}
            </button>

            {/* Privacy toggle */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setPrivacyMode(!privacyMode)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPrivacyMode(!privacyMode) } }}
              className={`flex items-center gap-2 px-3 h-8 rounded-lg border transition-all fw-focus cursor-pointer ${
                privacyMode
                  ? 'bg-[var(--fw-accent-soft)] border-[var(--fw-accent-border)]'
                  : 'bg-[var(--fw-surface)] border-[var(--fw-border)] hover:border-[var(--fw-border-strong)]'
              }`}
            >
              {privacyMode ? (
                <Lock className="h-3.5 w-3.5 text-[var(--fw-accent)]" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-[var(--fw-text-3)]" />
              )}
              <span className={`text-[11px] font-medium hidden sm:inline ${privacyMode ? 'text-[var(--fw-accent)]' : 'text-[var(--fw-text-2)]'}`}>
                {privacyMode ? 'Local' : 'Cloud'}
              </span>
              <Switch checked={privacyMode} onCheckedChange={setPrivacyMode} className="scale-75 data-[state=checked]:bg-[var(--fw-accent)] pointer-events-none" />
            </div>

            {/* Permission tier */}
            <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
              <SelectTrigger className="w-[110px] h-8 text-[11px] font-medium border-[var(--fw-border)] bg-[var(--fw-surface)] hover:border-[var(--fw-border-strong)] rounded-lg">
                <div className="flex items-center gap-1.5">
                  {tier === 'Viewer' && <Shield className="h-3 w-3 text-[var(--fw-text-3)]" />}
                  {tier === 'Editor' && <ShieldCheck className="h-3 w-3 text-[var(--fw-accent)]" />}
                  {tier === 'Approver' && <ShieldAlert className="h-3 w-3 text-[var(--fw-warning)]" />}
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
                    <ShieldAlert className="h-3.5 w-3.5 text-[var(--fw-warning)]" />
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
              className="h-8 text-[11px] font-medium border-[var(--fw-border)] hover:border-[var(--fw-border-strong)] rounded-lg"
            >
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline ml-1.5">Reset</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ─── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:flex w-60 flex-shrink-0 border-r border-[var(--fw-border)] bg-[var(--fw-surface)] flex-col h-full overflow-y-auto fw-scroll">
          <nav className="flex-1 p-3 space-y-0.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-4)] font-semibold px-2.5 mb-2">
              Workspace
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all fw-focus ${
                  view === item.id
                    ? 'bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)]'
                    : 'text-[var(--fw-text-2)] hover:bg-[var(--fw-surface-2)] hover:text-[var(--fw-text)] border border-transparent'
                }`}
              >
                <item.icon className={`h-4 w-4 ${view === item.id ? 'text-[var(--fw-accent)]' : 'text-[var(--fw-text-3)]'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* AI Agent card */}
          <div className="p-3">
            <div className="rounded-xl border border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-accent-soft)] to-[var(--fw-surface)] p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[12px] font-semibold">FinWise Agent</span>
              </div>
              <div className="text-[10px] text-[var(--fw-text-3)] mb-2.5 leading-relaxed">
                Supervisor-Worker pattern with 4 specialized sub-agents and 7 tools.
              </div>
              <Button
                onClick={() => setChatOpen(true)}
                size="sm"
                className="w-full h-7 text-[11px] font-medium bg-[var(--fw-text)] hover:bg-[var(--fw-text-2)] text-[var(--fw-surface)] rounded-md"
              >
                <Sparkles className="h-3 w-3 mr-1" /> Open chat
              </Button>
            </div>
          </div>

          {/* Sidebar footer: System status */}
          <div className="p-3 border-t border-[var(--fw-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-3 w-3 text-[var(--fw-text-3)]" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-4)] font-semibold">
                System
              </span>
            </div>
            <div className="space-y-1 text-[10px]">
              <SystemRow icon={Database} label="DB" value="SQLite · Prisma" />
              <SystemRow icon={Cpu} label="Workers" value="4 active" />
              <SystemRow icon={Zap} label="LLM" value="Z.ai Chat" />
              <SystemRow icon={Lock} label="PII" value={privacyMode ? 'Scrubbed' : 'Standard'} highlight={privacyMode} />
              <SystemRow icon={Activity} label="Latency" value="~1.5s" />
            </div>
          </div>
        </aside>

        {/* ─── Main Content ────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden fw-scroll h-full">
          {view === 'overview' && (
            <OverviewView
              txns={txns} byCategory={byCategory} byMonth={byMonth}
              totalSpend={totalSpend} totalIncome={totalIncome}
              netSavings={netSavings} savingsRate={savingsRate}
              budgets={budgets} overBudgetCount={overBudgetCount}
              goals={goals} recs={recs} totalPendingRecs={totalPendingRecs}
              tier={tier} onUpdateRec={updateRec} onRefresh={loadDashboard}
              fileInputRef={fileInputRef} receiptInputRef={receiptInputRef}
            />
          )}
          {view === 'transactions' && <TransactionsView txns={txns} byCategory={byCategory} />}
          {view === 'budgets' && <BudgetsView budgets={budgets} tier={tier} onUpdate={loadDashboard} />}
          {view === 'goals' && <GoalsView goals={goals} />}
          {view === 'insights' && (
            <InsightsView
              anomalies={anomalies} momDeltas={momDeltas}
              topMerchants={topMerchants} subscriptions={subscriptions}
              recs={recs} tier={tier} onUpdateRec={updateRec}
            />
          )}
        </main>

        {/* ─── Chat Slide-over ────────────────────────────────────────── */}
        {chatOpen && (
          <aside className="hidden xl:flex w-[400px] flex-shrink-0 border-l border-[var(--fw-border)] bg-[var(--fw-surface)] flex-col h-full">
            <ChatPanel
              messages={messages} input={input} setInput={setInput}
              chatLoading={chatLoading} sendChat={sendChat}
              scrollRef={scrollRef} quickPrompts={quickPrompts}
              privacyMode={privacyMode} onClose={() => setChatOpen(false)}
            />
          </aside>
        )}
      </div>

      {/* Floating chat toggle */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] shadow-[var(--fw-shadow-lg)] hover:shadow-[var(--fw-shadow-glow)] flex items-center justify-center hover:scale-105 transition-all"
        >
          <Bot className="h-5 w-5 text-white" />
        </button>
      )}

      {/* Mobile chat overlay */}
      {chatOpen && (
        <div className="xl:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setChatOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-[var(--fw-surface)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <ChatPanel
              messages={messages} input={input} setInput={setInput}
              chatLoading={chatLoading} sendChat={sendChat}
              scrollRef={scrollRef} quickPrompts={quickPrompts}
              privacyMode={privacyMode} onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
      <input ref={receiptInputRef} type="file" accept="image/*" onChange={handleReceipt} className="hidden" />

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="flex-shrink-0 border-t border-[var(--fw-border)] bg-[var(--fw-surface)]">
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-3 text-[var(--fw-text-3)]">
            <span className="font-medium text-[var(--fw-text-2)]">FinWise</span>
            <span>·</span>
            <span>PBCSF International Track · Topic A</span>
          </div>
          <div className="flex items-center gap-3 text-[var(--fw-text-3)]">
            <span className="flex items-center gap-1"><Database className="h-3 w-3" /> SQLite · Prisma</span>
            <span>·</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 4-layer architecture</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> GDPR · CCPA · PIPL</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ═══ View: Overview ═══════════════════════════════════════════════════
function OverviewView(props: {
  txns: Txn[]
  byCategory: { name: string; color: string; cents: number; count: number }[]
  byMonth: { month: string; spendCents: number; incomeCents: number }[]
  totalSpend: number
  totalIncome: number
  netSavings: number
  savingsRate: number
  budgets: BudgetItem[]
  overBudgetCount: number
  goals: GoalItem[]
  recs: RecItem[]
  totalPendingRecs: number
  tier: Tier
  onUpdateRec: (id: string, status: 'accepted' | 'dismissed') => void
  onRefresh: () => void
  fileInputRef: React.RefObject<HTMLInputElement>
  receiptInputRef: React.RefObject<HTMLInputElement>
}) {
  const { txns, byCategory, byMonth, totalSpend, totalIncome, netSavings, savingsRate,
          budgets, overBudgetCount, goals, recs, totalPendingRecs, tier, onUpdateRec,
          fileInputRef, receiptInputRef } = props

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1200px]">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Overview</h1>
          <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
            Last 6 months · <span className="text-[var(--fw-text-2)] font-medium">{txns.length}</span> transactions · <span className="text-[var(--fw-text-2)] font-medium">{goals.length}</span> active goals
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-[var(--fw-border)] hover:border-[var(--fw-border-strong)]" onClick={() => receiptInputRef.current?.click()}>
            <Receipt className="h-3.5 w-3.5 mr-1.5" /> Receipt OCR
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg border-[var(--fw-border)] hover:border-[var(--fw-border-strong)]" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Income"
          value={fmt(totalIncome, { compact: true })}
          delta="+12.4%"
          deltaDirection="up"
          icon={<ArrowDownRight className="h-3.5 w-3.5" />}
          accent="positive"
        />
        <KpiCard
          label="Spend"
          value={fmt(totalSpend, { compact: true })}
          delta="+4.2%"
          deltaDirection="up"
          negative
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          accent="negative"
        />
        <KpiCard
          label="Net Savings"
          value={fmt(netSavings, { sign: true, compact: true })}
          delta={`${savingsRate}% rate`}
          deltaDirection={netSavings >= 0 ? 'up' : 'down'}
          highlight
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--fw-text-2)]" />
              <h2 className="text-[14px] font-semibold">Spending by Category</h2>
            </div>
            <span className="text-[11px] text-[var(--fw-text-3)]">
              Total: <span className="font-mono tnum text-[var(--fw-text)] font-semibold">
                {fmt(byCategory.reduce((s, c) => s + c.cents, 0), { compact: true })}
              </span>
            </span>
          </div>
          <div className="h-56 -mx-2">
            {byCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={byCategory.map(c => ({ name: c.name, size: c.cents, color: c.color }))}
                  dataKey="size"
                  stroke="#fff"
                  content={<TreemapContent />}
                >
                  <RTooltip
                    formatter={(value: any) => typeof value === 'number' && !isNaN(value) ? fmt(value) : ''}
                    contentStyle={{
                      fontSize: '11px', borderRadius: '8px', padding: '8px 12px',
                      border: '1px solid var(--fw-border)', background: 'var(--fw-surface)',
                      color: 'var(--fw-text)', boxShadow: 'var(--fw-shadow-md)',
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            ) : <Loading />}
          </div>
        </Card>

        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--fw-text-2)]" />
              <h2 className="text-[14px] font-semibold">Monthly Trend</h2>
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
          <div className="h-56 -mx-2">
            {byMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={byMonth.map(m => ({ ...m, label: fmtMonth(m.month) }))}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--fw-positive)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--fw-positive)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--fw-negative)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--fw-negative)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.6} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} stroke="var(--fw-border)" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, { compact: true })} />
                  <Tooltip
                    formatter={(value: any) => typeof value === 'number' && !isNaN(value) ? fmt(value) : ''}
                    contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '8px 12px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)', boxShadow: 'var(--fw-shadow-md)' }}
                  />
                  <Area type="monotone" dataKey="incomeCents" stroke="var(--fw-positive)" strokeWidth={2} fill="url(#incomeGrad)" name="Income" />
                  <Area type="monotone" dataKey="spendCents" stroke="var(--fw-negative)" strokeWidth={2} fill="url(#spendGrad)" name="Spend" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Loading />}
          </div>
        </Card>
      </div>

      {/* Budget status + top recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--fw-text-2)]" />
              <h2 className="text-[14px] font-semibold">Budget Status</h2>
            </div>
            <div className="flex items-center gap-2">
              {overBudgetCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-negative-soft)] text-[var(--fw-negative)] border border-[var(--fw-negative-border)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {overBudgetCount} over
                </span>
              )}
              <span className="text-[10px] text-[var(--fw-text-3)] font-medium">
                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {budgets.slice(0, 6).map((b) => <BudgetRow key={b.id} b={b} tier={tier} onUpdate={() => props.onRefresh()} />)}
            {budgets.length === 0 && <Loading />}
          </div>
        </Card>

        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--fw-warning)]" />
              <h2 className="text-[14px] font-semibold">Recommendations</h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]">
              +{fmt(totalPendingRecs, { compact: true })}/yr
            </span>
          </div>
          <div className="space-y-2">
            {recs.filter(r => r.status === 'pending').slice(0, 3).map((r) => (
              <RecCard key={r.id} r={r} tier={tier} onAction={onUpdateRec} />
            ))}
            {recs.length === 0 && <Loading />}
          </div>
        </Card>
      </div>

      {/* Goals mini-strip + Recent transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Savings Goals</h2>
          </div>
          <div className="space-y-4">
            {goals.slice(0, 3).map((g) => <GoalCard key={g.id} g={g} />)}
            {goals.length === 0 && <Loading />}
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[var(--fw-text-2)]" />
              <h2 className="text-[14px] font-semibold">Recent Transactions</h2>
            </div>
            <span className="text-[10px] text-[var(--fw-text-3)]">{txns.length} total</span>
          </div>
          <div className="max-h-80 overflow-y-auto fw-scroll -mx-2">
            <div className="space-y-0.5 px-2">
              {txns.slice(0, 25).map((t) => <TxnRow key={t.id} t={t} />)}
              {txns.length === 0 && <Loading />}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ═══ View: Transactions ═══════════════════════════════════════════════
function TransactionsView({ txns, byCategory }: {
  txns: Txn[]
  byCategory: { name: string; color: string; cents: number; count: number }[]
}) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filtered = txns.filter(t => {
    if (categoryFilter !== 'all' && t.category.name !== categoryFilter) return false
    if (search && !t.merchantRaw.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalSpend = filtered.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const totalIncome = filtered.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Transactions</h1>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          <span className="text-[var(--fw-text-2)] font-medium">{filtered.length}</span> of {txns.length} · <span className="text-[var(--fw-text-2)] font-medium">{fmt(totalSpend)}</span> spend · <span className="text-[var(--fw-text-2)] font-medium">{fmt(totalIncome)}</span> income
        </p>
      </div>

      {/* Filter bar */}
      <Card className="p-3 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--fw-text-3)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchants..."
              className="pl-9 h-9 text-[13px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px] h-9 text-[12px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3 w-3 text-[var(--fw-text-3)]" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {byCategory.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || categoryFilter !== 'all') && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(''); setCategoryFilter('all') }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Transactions table */}
      <Card className="border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--fw-border)] bg-[var(--fw-surface-2)]/50">
                <th className="text-left font-semibold text-[var(--fw-text-2)] px-4 py-2.5 text-[11px] uppercase tracking-wider">Date</th>
                <th className="text-left font-semibold text-[var(--fw-text-2)] px-4 py-2.5 text-[11px] uppercase tracking-wider">Merchant</th>
                <th className="text-left font-semibold text-[var(--fw-text-2)] px-4 py-2.5 text-[11px] uppercase tracking-wider">Category</th>
                <th className="text-left font-semibold text-[var(--fw-text-2)] px-4 py-2.5 text-[11px] uppercase tracking-wider">Source</th>
                <th className="text-right font-semibold text-[var(--fw-text-2)] px-4 py-2.5 text-[11px] uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((t) => (
                <tr key={t.id} className="border-b border-[var(--fw-border)] last:border-0 hover:bg-[var(--fw-surface-2)]/50 transition-colors">
                  <td className="px-4 py-2.5 text-[var(--fw-text-2)] tnum whitespace-nowrap">
                    {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ backgroundColor: t.category.color }}>
                        {t.category.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-[var(--fw-text)] truncate">{t.merchantRaw}</span>
                        {t.anomaly && <AlertTriangle className="h-3 w-3 text-[var(--fw-warning)] flex-shrink-0" />}
                        {t.recurring && <span className="text-[8px] font-medium uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)]">Recurring</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[var(--fw-text-2)]">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.category.color }} />
                      {t.category.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--fw-text-3)]">{t.source}</span>
                  </td>
                  <td className={`px-4 py-2.5 text-right tnum font-semibold whitespace-nowrap ${t.direction === 'credit' ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-text)]'}`}>
                    {t.direction === 'credit' ? '+' : '-'}{fmt(t.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Search className="h-8 w-8 text-[var(--fw-text-3)] mx-auto mb-3" />
            <div className="text-sm font-medium text-[var(--fw-text-2)]">No transactions found</div>
            <div className="text-xs text-[var(--fw-text-3)] mt-1">Try adjusting your search or filter</div>
          </div>
        )}
        {filtered.length > 50 && (
          <div className="px-4 py-2.5 border-t border-[var(--fw-border)] bg-[var(--fw-surface-2)]/30 text-[11px] text-[var(--fw-text-3)] text-center">
            Showing 50 of {filtered.length} transactions
          </div>
        )}
      </Card>
    </div>
  )
}

// ═══ View: Budgets ════════════════════════════════════════════════════
function BudgetsView({ budgets, tier, onUpdate }: { budgets: BudgetItem[]; tier: Tier; onUpdate: () => void }) {
  const totalBudget = budgets.reduce((s, b) => s + b.budgetCents, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spentCents, 0)
  const totalRemaining = totalBudget - totalSpent
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Budgets</h1>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          <span className="text-[var(--fw-text-2)] font-medium">{budgets.length}</span> envelopes · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Summary card */}
      <Card className="p-6 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1.5">Allocated</div>
            <div className="text-[28px] font-semibold tnum tracking-tight">{fmt(totalBudget, { compact: true })}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1.5">Spent</div>
            <div className="text-[28px] font-semibold tnum tracking-tight text-[var(--fw-negative)]">{fmt(totalSpent, { compact: true })}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1.5">Remaining</div>
            <div className={`text-[28px] font-semibold tnum tracking-tight ${totalRemaining >= 0 ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-negative)]'}`}>
              {fmt(totalRemaining, { sign: true, compact: true })}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-[var(--fw-text-2)] font-medium">{pctUsed}% of total budget used</span>
            <span className="text-[var(--fw-text-3)] tnum">{fmt(totalSpent)} / {fmt(totalBudget)}</span>
          </div>
          <div className="h-2 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pctUsed > 100 ? 'bg-[var(--fw-negative)]' : 'bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)]'}`}
              style={{ width: `${Math.min(100, pctUsed)}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Envelope grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {budgets.map((b) => <BudgetDetailCard key={b.id} b={b} tier={tier} onUpdate={onUpdate} />)}
        {budgets.length === 0 && <Loading />}
      </div>

      {tier === 'Viewer' && (
        <div className="text-[11px] text-[var(--fw-text-3)] flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> Viewer tier — budget modifications disabled
        </div>
      )}
    </div>
  )
}

function BudgetDetailCard({ b, tier, onUpdate }: { b: BudgetItem; tier: Tier; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState((b.budgetCents / 100).toString())
  const overBudget = b.percentUsed > 100
  const nearLimit = b.percentUsed > 80 && !overBudget

  const save = async () => {
    const newVal = parseFloat(value)
    if (isNaN(newVal) || tier === 'Viewer') { setEditing(false); return }
    try {
      await fetch('/api/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: b.categoryId, amountCents: Math.round(newVal * 100) }),
      })
      toast.success(`Updated ${b.category} budget to $${newVal}`)
      onUpdate()
    } catch (err: any) { toast.error(err.message) }
    setEditing(false)
  }

  return (
    <Card className={`p-4 border shadow-[var(--fw-shadow-sm)] rounded-xl fw-card ${
      overBudget ? 'border-[var(--fw-negative-border)] bg-[var(--fw-negative-soft)]' : 'border-[var(--fw-border)] bg-[var(--fw-surface)]'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: b.color }}>
            <Wallet className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-[13px] font-semibold">{b.category}</div>
            <div className="text-[10px] text-[var(--fw-text-3)] tnum">
              {b.percentUsed}% used · {b.percentUsed > 100 ? `${fmt(b.spentCents - b.budgetCents)} over` : `${fmt(b.budgetCents - b.spentCents)} left`}
            </div>
          </div>
        </div>
        {tier !== 'Viewer' && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[var(--fw-text-3)] hover:bg-[var(--fw-surface-2)]" onClick={() => setEditing(!editing)}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Spent</span>
          <span className="text-xl font-semibold tnum">{fmt(b.spentCents)}</span>
        </div>
        <div className="h-1.5 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overBudget ? 'bg-[var(--fw-negative)]' : nearLimit ? 'bg-[var(--fw-warning)]' : 'bg-[var(--fw-positive)]'}`}
            style={{ width: `${Math.min(100, b.percentUsed)}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-[var(--fw-text-3)]">Budget</span>
          <span className="tnum text-[var(--fw-text-2)] font-medium">{fmt(b.budgetCents)}</span>
        </div>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditing(false)}>
          <div className="bg-[var(--fw-surface)] rounded-xl p-5 w-80 border border-[var(--fw-border)] shadow-[var(--fw-shadow-lg)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-1">Edit {b.category} budget</div>
            <div className="text-[11px] text-[var(--fw-text-3)] mb-3">Set monthly envelope allocation</div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fw-text-3)] text-sm">$</span>
              <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="pl-7" autoFocus />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-[var(--fw-text)] hover:bg-[var(--fw-text-2)] text-[var(--fw-surface)] rounded-lg" onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ═══ View: Goals ══════════════════════════════════════════════════════
function GoalsView({ goals }: { goals: GoalItem[] }) {
  const [simulating, setSimulating] = useState<string | null>(null)
  const [simResult, setSimResult] = useState<any>(null)

  const runSim = async (goalId: string, additionalMonthlyCents = 0) => {
    setSimulating(goalId)
    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, additionalMonthlyCents, trials: 1000 }),
      })
      const d = await res.json()
      if (d.ok) {
        setSimResult(d)
        toast.success('Monte Carlo simulation complete', {
          description: `Median: ${d.medianMonths} months · 80% CI: ${d.p10Months}-${d.p90Months}`,
        })
      } else { toast.error(d.error || 'Simulation failed') }
    } catch (err: any) { toast.error(err.message) }
    finally { setSimulating(null) }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Savings Goals</h1>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          <span className="text-[var(--fw-text-2)] font-medium">{goals.length}</span> active goals · Click "Run simulation" to project completion dates with Monte Carlo
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {goals.map((g) => (
          <Card key={g.id} className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
            <div className="flex items-start gap-4 mb-4">
              <div className="relative h-16 w-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="72%" outerRadius="100%"
                    data={[{ value: g.percentComplete, fill: g.percentComplete >= 80 ? 'var(--fw-positive)' : g.percentComplete >= 50 ? 'var(--fw-warning)' : 'var(--fw-accent)' }]}
                    startAngle={90} endAngle={-270}
                  >
                    <RadialBar background={{ fill: 'var(--fw-surface-2)' }} dataKey="value" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tnum">{g.percentComplete}%</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold">{g.name}</div>
                <div className="text-[12px] text-[var(--fw-text-2)] tnum mt-0.5">
                  {fmt(g.savedCents, { compact: true })} <span className="text-[var(--fw-text-3)]">of {fmt(g.targetCents, { compact: true })}</span>
                </div>
                <div className="text-[11px] text-[var(--fw-text-3)] mt-1">
                  {fmt(g.remainingCents)} remaining · {fmt(g.monthlyContributionCents)}/mo contribution
                </div>
                {g.monthsToTarget !== null && (
                  <div className="text-[11px] text-[var(--fw-text-3)] mt-0.5">Target: {g.monthsToTarget} months out</div>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-[11px] font-medium border-[var(--fw-border)] hover:border-[var(--fw-accent-border)] hover:bg-[var(--fw-accent-soft)] hover:text-[var(--fw-accent)] rounded-lg"
              onClick={() => runSim(g.id)}
              disabled={simulating === g.id}
            >
              {simulating === g.id ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Running 1000 trials...</>
              ) : (
                <><Play className="h-3.5 w-3.5 mr-1.5" /> Run Monte Carlo simulation</>
              )}
            </Button>
          </Card>
        ))}
        {goals.length === 0 && <Loading />}
      </div>

      {simResult && (
        <Card className="p-5 border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-accent-soft)] to-[var(--fw-surface)] shadow-[var(--fw-shadow-md)] rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-[14px] font-semibold">Simulation Result · {simResult.goalName}</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSimResult(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1">Median</div>
              <div className="text-2xl font-semibold tnum text-[var(--fw-accent)]">{simResult.medianMonths} mo</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1">80% CI</div>
              <div className="text-2xl font-semibold tnum">{simResult.p10Months}-{simResult.p90Months}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1">Projected Date</div>
              <div className="text-base font-semibold tnum">{simResult.projectedDate}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-1">Success Probability</div>
              <div className="text-2xl font-semibold tnum text-[var(--fw-positive)]">{simResult.successProbability}%</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--fw-text-2)] mb-2 uppercase tracking-[0.12em]">Sensitivity scenarios</div>
            <div className="space-y-1.5">
              {simResult.scenarios.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[12px] py-2 px-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
                  <span className="text-[var(--fw-text-2)] font-medium">{s.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-[var(--fw-text-3)]">{s.newMonthlyCents >= 100000 ? fmt(s.newMonthlyCents, { compact: true }) : fmt(s.newMonthlyCents)}/mo</span>
                    <span className="tnum font-medium text-[var(--fw-text)]">{s.baseMonths} mo</span>
                    {s.daysSaved > 0 && (
                      <span className="tnum text-[var(--fw-positive)] font-semibold">-{s.daysSaved}d</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ═══ View: Insights ═══════════════════════════════════════════════════
function InsightsView({ anomalies, momDeltas, topMerchants, subscriptions, recs, tier, onUpdateRec }: {
  anomalies: Anomaly[]
  momDeltas: MoMDelta[]
  topMerchants: TopMerchant[]
  subscriptions: Subscription[]
  recs: RecItem[]
  tier: Tier
  onUpdateRec: (id: string, status: 'accepted' | 'dismissed') => void
}) {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Insights</h1>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          <span className="text-[var(--fw-text-2)] font-medium">{anomalies.length}</span> anomalies · <span className="text-[var(--fw-text-2)] font-medium">{momDeltas.length}</span> categories tracked · <span className="text-[var(--fw-text-2)] font-medium">{subscriptions.length}</span> recurring subscriptions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-[var(--fw-warning)]" />
            <h2 className="text-[14px] font-semibold">Anomaly Detection</h2>
            <span className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]">
              {anomalies.length} flagged
            </span>
          </div>
          <div className="space-y-2">
            {anomalies.length === 0 ? (
              <div className="text-center py-8 text-[var(--fw-text-3)] text-xs">No anomalies detected</div>
            ) : (
              anomalies.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--fw-warning-soft)] border border-[var(--fw-warning-border)]">
                  <div className="h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: a.color }}>
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium">{a.merchant}</div>
                    <div className="text-[10px] text-[var(--fw-text-3)]">
                      {a.category} · {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] font-semibold tnum">{fmt(a.amountCents)}</div>
                    {a.score && <div className="text-[9px] text-[var(--fw-warning)] font-mono">score: {a.score.toFixed(2)}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Month-over-Month</h2>
          </div>
          <div className="space-y-2">
            {momDeltas.slice(0, 8).map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">{d.category}</div>
                  <div className="text-[10px] text-[var(--fw-text-3)] tnum">
                    {fmt(d.thisMonthCents, { compact: true })} vs {fmt(d.lastMonthCents, { compact: true })} last mo
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-[12px] font-semibold tnum ${
                  d.trend === 'up' ? 'text-[var(--fw-negative)]' : d.trend === 'down' ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-text-3)]'
                }`}>
                  {d.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                  {d.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                  {d.percentChange > 0 ? '+' : ''}{d.percentChange}%
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Top Merchants (3 months)</h2>
          </div>
          <div className="h-64 -mx-2">
            {topMerchants.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMerchants} layout="vertical" margin={{ left: 90, right: 10, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.6} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, { compact: true })} />
                  <YAxis type="category" dataKey="merchant" tick={{ fontSize: 10, fill: 'var(--fw-text-2)' }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip
                    formatter={(value: any) => typeof value === 'number' && !isNaN(value) ? fmt(value) : ''}
                    contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '8px 12px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)', boxShadow: 'var(--fw-shadow-md)' }}
                  />
                  <Bar dataKey="cents" radius={[0, 6, 6, 0]}>
                    {topMerchants.map((m, i) => <Cell key={i} fill={m.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Loading />}
          </div>
        </Card>

        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Recurring Subscriptions</h2>
          </div>
          <div className="space-y-1.5">
            {subscriptions.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[var(--fw-surface-2)]/50 transition-colors">
                <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.color }}>
                  <RefreshCw className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{s.merchant}</div>
                  <div className="text-[10px] text-[var(--fw-text-3)]">{s.category} · {s.monthsActive} mo active</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-semibold tnum">{fmt(s.monthlyAverageCents)}/mo</div>
                  <div className="text-[9px] text-[var(--fw-text-3)] tnum">{fmt(s.cents)} total</div>
                </div>
              </div>
            ))}
            {subscriptions.length === 0 && <Loading />}
          </div>
        </Card>
      </div>

      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--fw-warning)]" />
            <h2 className="text-[14px] font-semibold">Recommendations</h2>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]">
            +{fmt(recs.filter(r => r.status === 'pending').reduce((s, r) => s + r.impactCents, 0))}/yr potential
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recs.map((r) => <RecCard key={r.id} r={r} tier={tier} onAction={onUpdateRec} />)}
          {recs.length === 0 && <Loading />}
        </div>
      </Card>
    </div>
  )
}

// ═══ Chat Panel ═══════════════════════════════════════════════════════
function ChatPanel(props: {
  messages: ChatMessage[]
  input: string
  setInput: (s: string) => void
  chatLoading: boolean
  sendChat: (text?: string) => void
  scrollRef: React.RefObject<HTMLDivElement>
  quickPrompts: { label: string; text: string }[]
  privacyMode: boolean
  onClose: () => void
}) {
  const { messages, input, setInput, chatLoading, sendChat, scrollRef, quickPrompts, privacyMode, onClose } = props
  return (
    <>
      <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--fw-border)] bg-[var(--fw-surface)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)]">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-semibold">FinWise Agent</span>
            <span className="text-[10px] text-[var(--fw-text-3)]">Supervisor-Worker · 7 tools</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${privacyMode ? 'bg-[var(--fw-accent)]' : 'bg-[var(--fw-positive)]'} fw-pulse`} />
          <span className="text-[10px] font-medium text-[var(--fw-text-2)] mr-1.5">{privacyMode ? 'Local' : 'Cloud'}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-[var(--fw-surface-2)]" onClick={onClose}>
            <XIcon className="h-3.5 w-3.5 text-[var(--fw-text-3)]" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto fw-scroll px-4 py-4 min-h-0">
        <div className="space-y-5">
          {messages.map((m, i) => <MessageBubble key={i} m={m} />)}
          {chatLoading && (
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center flex-shrink-0">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-[var(--fw-surface-2)] rounded-lg rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2 border border-[var(--fw-border)]">
                <Loader2 className="h-3 w-3 animate-spin text-[var(--fw-text-3)]" />
                <span className="text-[11px] text-[var(--fw-text-2)]">Analyzing your data...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="px-4 py-3 border-t border-[var(--fw-border)] bg-[var(--fw-surface-2)]/30 flex-shrink-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-2">Suggested Prompts</div>
          <div className="grid grid-cols-2 gap-1.5">
            {quickPrompts.map((p) => (
              <button
                key={p.label}
                onClick={() => sendChat(p.text)}
                className="text-left text-[11px] px-2.5 py-2 rounded-lg bg-[var(--fw-surface)] hover:bg-[var(--fw-accent-soft)] border border-[var(--fw-border)] hover:border-[var(--fw-accent-border)] hover:text-[var(--fw-accent)] transition-all fw-focus text-[var(--fw-text-2)] leading-tight"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-t border-[var(--fw-border)] bg-[var(--fw-surface)] flex-shrink-0">
        <div className="flex gap-2 items-center">
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
            className="flex-1 h-10 text-[13px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] placeholder:text-[var(--fw-text-3)] rounded-lg focus-visible:border-[var(--fw-accent)]"
            disabled={chatLoading}
          />
          <Button
            onClick={() => sendChat()}
            disabled={chatLoading || !input.trim()}
            size="sm"
            className="h-10 px-4 bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] hover:opacity-90 text-white rounded-lg shadow-[var(--fw-shadow-glow)] font-medium text-[12px] gap-1.5"
          >
            {chatLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>Send</span>
          </Button>
        </div>
        <div className="text-[10px] text-[var(--fw-text-4)] mt-1.5 px-1 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--fw-surface-2)] border border-[var(--fw-border)] font-mono text-[9px]">Enter</kbd>
            <span>to send</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--fw-surface-2)] border border-[var(--fw-border)] font-mono text-[9px]">Shift+Enter</kbd>
            <span>for new line</span>
          </span>
        </div>
      </div>
    </>
  )
}

// ─── Shared sub-components ──────────────────────────────────────────────

function Loading() {
  return (
    <div className="text-center py-8">
      <Loader2 className="h-4 w-4 animate-spin mx-auto text-[var(--fw-text-3)]" />
    </div>
  )
}

function MessageBubble({ m }: { m: ChatMessage }) {
  const isUser = m.role === 'user'
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-[var(--fw-surface-2)] border border-[var(--fw-border)]'
          : 'bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] shadow-[var(--fw-shadow-glow)]'
      }`}>
        {isUser ? <User className="h-3.5 w-3.5 text-[var(--fw-text-2)]" /> : <Bot className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className={`max-w-[88%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-[13px] leading-relaxed px-3.5 py-2.5 rounded-xl ${
          isUser
            ? 'bg-[var(--fw-text)] text-[var(--fw-surface)] rounded-tr-sm'
            : 'bg-[var(--fw-surface-2)] text-[var(--fw-text)] rounded-tl-sm border border-[var(--fw-border)]'
        }`}>
          <FormattedContent content={m.content} />
        </div>
        {!isUser && m.toolCalls && m.toolCalls.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.toolCalls.map((tc, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--fw-accent-soft)] border border-[var(--fw-accent-border)] text-[var(--fw-accent)]">
                <Zap className="h-2 w-2" />
                {tc.name}
              </span>
            ))}
          </div>
        )}
        {!isUser && m.mode && (
          <div className="text-[10px] text-[var(--fw-text-3)] mt-1 ml-1 font-mono uppercase tracking-[0.1em]">
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
          return <div key={i} className="font-semibold text-[13px] mt-2 mb-1">{line.slice(3)}</div>
        }
        if (line.startsWith('**') && line.endsWith('**') && !line.includes('**', 2)) {
          return <div key={i} className="font-semibold mt-1">{line.slice(2, -2)}</div>
        }
        if (line.startsWith('- ')) {
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

function KpiCard({ label, value, delta, deltaDirection, icon, negative, highlight, accent }: {
  label: string
  value: string
  delta: string
  deltaDirection: 'up' | 'down'
  icon: React.ReactNode
  negative?: boolean
  highlight?: boolean
  accent?: 'positive' | 'negative' | 'accent'
}) {
  return (
    <Card className={`p-5 border shadow-[var(--fw-shadow-sm)] rounded-xl fw-card ${
      highlight ? 'border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-accent-soft)] to-[var(--fw-surface)]' : 'border-[var(--fw-border)] bg-[var(--fw-surface)]'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--fw-text-3)]">{label}</span>
        <span className={`h-7 w-7 rounded-md flex items-center justify-center ${
          accent === 'positive' ? 'bg-[var(--fw-positive-soft)] text-[var(--fw-positive)]' :
          accent === 'negative' ? 'bg-[var(--fw-negative-soft)] text-[var(--fw-negative)]' :
          highlight ? 'bg-[var(--fw-accent)] text-white' : 'bg-[var(--fw-surface-2)] text-[var(--fw-text-3)]'
        }`}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-[26px] font-semibold tnum tracking-tight ${highlight ? 'text-[var(--fw-accent)]' : 'text-[var(--fw-text)]'}`}>{value}</span>
      </div>
      <div className="flex items-center gap-1 mt-2">
        {deltaDirection === 'up' ? (
          <TrendingUp className={`h-3 w-3 ${negative ? 'text-[var(--fw-negative)]' : 'text-[var(--fw-positive)]'}`} />
        ) : (
          <TrendingDown className="h-3 w-3 text-[var(--fw-negative)]" />
        )}
        <span className={`text-[11px] font-medium ${negative ? 'text-[var(--fw-negative)]' : 'text-[var(--fw-text-2)]'}`}>{delta}</span>
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
    if (isNaN(newVal) || tier === 'Viewer') { setEditing(false); return }
    try {
      await fetch('/api/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: b.categoryId, amountCents: Math.round(newVal * 100) }),
      })
      toast.success(`Updated ${b.category} budget to $${newVal}`)
      onUpdate()
    } catch (err: any) { toast.error(err.message) }
    setEditing(false)
  }

  return (
    <div className="group flex items-center gap-3 py-1">
      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-[12px] mb-1">
          <span className="font-medium">{b.category}</span>
          <div className="flex items-baseline gap-1.5">
            <span className={`tnum font-semibold ${overBudget ? 'text-[var(--fw-negative)]' : ''}`}>{fmt(b.spentCents)}</span>
            <span className="tnum text-[10px] text-[var(--fw-text-3)]">/ {fmt(b.budgetCents)}</span>
          </div>
        </div>
        <div className="h-1 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overBudget ? 'bg-[var(--fw-negative)]' : nearLimit ? 'bg-[var(--fw-warning)]' : 'bg-[var(--fw-positive)]'}`}
            style={{ width: `${Math.min(100, b.percentUsed)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-[var(--fw-text-3)] tnum">{b.percentUsed}% used</span>
          <span className={`text-[10px] tnum font-medium ${overBudget ? 'text-[var(--fw-negative)]' : 'text-[var(--fw-text-3)]'}`}>
            {overBudget ? `${fmt(b.remainingCents, { sign: true })} over` : `${fmt(b.remainingCents)} left`}
          </span>
        </div>
      </div>
      {tier !== 'Viewer' && (
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-[var(--fw-text-3)] hover:bg-[var(--fw-surface-2)]" onClick={() => setEditing(!editing)}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditing(false)}>
          <div className="bg-[var(--fw-surface)] rounded-xl p-5 w-80 border border-[var(--fw-border)] shadow-[var(--fw-shadow-lg)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-1">Edit {b.category} budget</div>
            <div className="text-[11px] text-[var(--fw-text-3)] mb-3">Set monthly envelope allocation</div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fw-text-3)] text-sm">$</span>
              <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="pl-7" autoFocus />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-[var(--fw-text)] hover:bg-[var(--fw-text-2)] text-[var(--fw-surface)] rounded-lg" onClick={save}>Save</Button>
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
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[var(--fw-surface-2)] transition-colors">
      <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white" style={{ backgroundColor: t.category.color }}>
        {t.category.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium truncate">{t.merchantRaw}</span>
          {t.anomaly && <AlertTriangle className="h-3 w-3 text-[var(--fw-warning)] flex-shrink-0" />}
          {t.recurring && <span className="text-[8px] font-medium uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)]">Recurring</span>}
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
  const color = pct >= 80 ? 'var(--fw-positive)' : pct >= 50 ? 'var(--fw-warning)' : 'var(--fw-accent)'
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: pct, fill: color }]} startAngle={90} endAngle={-270}>
            <RadialBar background={{ fill: 'var(--fw-surface-2)' }} dataKey="value" cornerRadius={10} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tnum">{pct}%</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold truncate">{g.name}</div>
        <div className="text-[10px] text-[var(--fw-text-2)] tnum mt-0.5">
          {fmt(g.savedCents, { compact: true })} <span className="text-[var(--fw-text-3)]">/ {fmt(g.targetCents, { compact: true })}</span>
        </div>
        {g.monthsToTarget !== null && <div className="text-[10px] text-[var(--fw-text-3)] mt-0.5">{g.monthsToTarget} mo to target</div>}
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
    <div className={`p-3 rounded-xl border text-[12px] transition-all ${
      isAccepted
        ? 'border-[var(--fw-positive-border)] bg-[var(--fw-positive-soft)]'
        : isDismissed
        ? 'border-[var(--fw-border)] bg-[var(--fw-surface-2)] opacity-60'
        : 'border-[var(--fw-border)] bg-[var(--fw-surface)] hover:border-[var(--fw-border-strong)]'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="font-semibold leading-tight text-[12px]">{r.title}</div>
        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
          r.confidence === 'high' ? 'bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]' :
          r.confidence === 'medium' ? 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]' :
          'bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)]'
        }`}>{r.confidence}</span>
      </div>
      <div className="text-[11px] text-[var(--fw-text-2)] mb-2 leading-relaxed">{r.detail}</div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono tnum font-semibold text-[var(--fw-positive)]">+{fmt(r.impactCents)}/yr</span>
        {isPending && tier !== 'Viewer' && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[var(--fw-positive)] hover:bg-[var(--fw-positive-soft)]" onClick={() => onAction(r.id, 'accepted')}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[var(--fw-text-3)] hover:bg-[var(--fw-surface-2)]" onClick={() => onAction(r.id, 'dismissed')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {isAccepted && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--fw-positive)]"><Check className="h-3 w-3" /> Accepted</span>}
        {isDismissed && <span className="text-[10px] text-[var(--fw-text-3)]">Dismissed</span>}
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

function TreemapContent(props: any) {
  const { x, y, width, height, name, color, size } = props
  if (width < 30 || height < 20) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill: color || '#94a3b8', stroke: '#fff', strokeWidth: 2 }} />
      {width > 60 && height > 30 && (
        <>
          <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>{name}</text>
          <text x={x + 8} y={y + 32} fill="#fff" fontSize={10} opacity={0.9}>
            {typeof size === 'number' && !isNaN(size) ? fmt(size, { compact: true }) : ''}
          </text>
        </>
      )}
    </g>
  )
}
