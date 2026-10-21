'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Send, Sparkles, Shield, ShieldCheck, ShieldAlert, Upload, Receipt, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, Target, Bot, User,
  Check, X, Loader2, Lock, ChevronRight, ArrowUpRight, ArrowDownRight,
  Activity, BarChart3, Settings2, Cpu, Database, Zap, FileText,
  LayoutDashboard, ListFilter, PiggyBank, Lightbulb, X as XIcon,
  Search, Filter, Play, RefreshCw, Bell, Command, Brain, Gauge,
  LineChart as LineChartIcon, Sparkle, TrendingUp as TrendUp, Calculator,
  Calendar, CalendarClock, CreditCard, Download, AlertCircle, CheckCircle2,
  Info, Clock, DollarSign, Plus, Rocket, Dna, Sparkles as SparklesIcon,
  Hourglass, GitBranch, Award, Settings, Moon, Sun, Globe,
  Sliders, Trash2, Palette, User as UserIcon, Shield as ShieldIcon,
  LogOut, CheckCircle, Circle, ArrowRight, Mail, UserPlus,
  Sparkles as Sparkles2, TrendingUp as TrendingUpIcon,
  LayoutGrid, BarChart as BarChartIcon, PieChart, Brain as BrainIcon,
  Rocket as RocketIcon, HelpCircle, XCircle,
} from 'lucide-react'
import { fmt, fmtMonth, fmtCurrency, setGlobalCurrency, type CurrencyConfig } from '@/lib/format'
import {
  Treemap, ResponsiveContainer, Tooltip as RTooltip,
  Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip,
  RadialBarChart, RadialBar, Cell, BarChart, Bar,
  ComposedChart, Line, Scatter, Legend,
} from 'recharts'
import { toast } from 'sonner'

type Tier = 'Viewer' | 'Editor' | 'Approver'
type View = 'overview' | 'transactions' | 'budgets' | 'goals' | 'insights' | 'analytics' | 'analysis' | 'planning' | 'innovation' | 'settings'
type AppState = 'landing' | 'auth' | 'onboarding' | 'app'

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
  // ─── App state: landing → auth → onboarding → app ─────────────────────
  const [appState, setAppState] = useState<AppState>('landing')
  const [authUser, setAuthUser] = useState<{ id: string; email: string; name: string; tier: string } | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [authLoading, setAuthLoading] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [tier, setTier] = useState<Tier>('Editor')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; writes: { name: string; args: any }[] } | null>(null)
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; type: string; read: boolean; link?: string | null }[]>([])
  const [notifOpen, setNotifOpen] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Welcome to FinWise. I'm your AI finance copilot — I can **add transactions**, **create goals**, **update budgets**, and answer any financial question. Try \"I spent $50 on coffee at Blue Bottle\" or ask \"How did this month go?\"",
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

  // Analytics
  const [analytics, setAnalytics] = useState<any>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Planning
  const [debtData, setDebtData] = useState<any>(null)
  const [billsData, setBillsData] = useState<any>(null)
  const [smartInsights, setSmartInsights] = useState<any>(null)
  const [planningLoading, setPlanningLoading] = useState(false)

  // Innovation
  const [innovationData, setInnovationData] = useState<any>(null)
  const [innovationLoading, setInnovationLoading] = useState(false)

  // Settings
  const [settingsData, setSettingsData] = useState<any>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  // Currency — live conversion
  const [currencyConfig, setCurrencyConfig] = useState<CurrencyConfig | null>(null)
  const [currencyInfo, setCurrencyInfo] = useState<any>(null)

  // Helper: format cents using the selected currency (available to all views)
  const fmtC = useCallback((cents: number, opts?: { sign?: boolean; compact?: boolean }) => {
    return fmtCurrency(cents, currencyConfig, opts)
  }, [currencyConfig])

  // ─── Auth handlers ───────────────────────────────────────────────────
  const handleAuth = async (action: 'login' | 'signup', email?: string, password?: string, name?: string, currency?: string): Promise<{ ok: boolean; error?: string; field?: string }> => {
    setAuthLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, email, password, name, currency }),
      })
      const d = await res.json()
      if (d.ok) {
        setAuthUser(d.user)
        setTier((d.user.tier === 'Viewer' ? 'Viewer' : 'Editor') as Tier)
        setPrivacyMode(Boolean(d.user.privacyMode))
        if (action === 'signup') {
          loadDashboard()
          setAppState('onboarding')
          toast.success(`Account created. Welcome, ${d.user.name || d.user.email}`)
        } else {
          setAppState('app')
          loadDashboard()
          loadNotifications()
          toast.success(`Welcome back, ${d.user.name || d.user.email}`)
        }
        return { ok: true }
      }
      return { ok: false, error: d.error || 'Authentication failed', field: d.field }
    } catch (err: any) {
      return { ok: false, error: 'Could not reach the server. Please check your connection and try again.' }
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
    } catch {}
    setAuthUser(null)
    setAppState('landing')
    setCompletedTasks(new Set())
    setTxns([])
    setBudgets([])
    setGoals([])
    setRecs([])
    toast.success('Signed out')
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth', { credentials: 'include' })
        const d = await res.json()
        if (cancelled || !d.ok || !d.user) return
        setAuthUser(d.user)
        setTier((d.user.tier === 'Viewer' ? 'Viewer' : 'Editor') as Tier)
        setPrivacyMode(Boolean(d.user.privacyMode))
        setAppState('app')
        loadDashboard()
        loadNotifications()
        if (d.settings?.onboardingState) {
          try { setCompletedTasks(new Set(JSON.parse(d.settings.onboardingState))) } catch {}
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  // ─── Onboarding task tracking ────────────────────────────────────────
  const ONBOARDING_TASKS = [
    { id: 'explore_overview', label: 'Explore the Overview dashboard', desc: 'View your KPIs, treemap, and trends', icon: LayoutGrid, view: 'overview' as View },
    { id: 'chat_with_agent', label: 'Chat with the FinWise Agent', desc: 'Ask "How did this month go?"', icon: Bot, view: 'overview' as View },
    { id: 'add_transaction', label: 'Add a transaction via chat', desc: 'Type "I spent $25 on coffee at Blue Bottle"', icon: Receipt, view: 'overview' as View },
    { id: 'view_budgets', label: 'Review your budgets', desc: 'See which categories are over budget', icon: Wallet, view: 'budgets' as View },
    { id: 'run_simulation', label: 'Run a Monte Carlo simulation', desc: 'Visit Goals and run the simulation', icon: Target, view: 'goals' as View },
    { id: 'explore_analytics', label: 'Explore Advanced Analytics', desc: 'Check your Financial Health Score', icon: BrainIcon, view: 'analytics' as View },
    { id: 'visit_innovation', label: 'Discover Innovation Lab', desc: 'Find your Financial Personality DNA', icon: Dna, view: 'innovation' as View },
  ]

  const completeTask = (taskId: string) => {
    setCompletedTasks(prev => {
      const next = new Set(prev)
      next.add(taskId)
      fetch('/api/onboarding', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: Array.from(next) }),
      }).catch(() => {})
      return next
    })
  }

  // Track view visits for onboarding
  useEffect(() => {
    if (appState !== 'app') return
    const taskMap: Record<View, string> = {
      overview: 'explore_overview',
      budgets: 'view_budgets',
      goals: '',
      analytics: 'explore_analytics',
      analysis: 'explore_analysis',
      innovation: 'visit_innovation',
      transactions: '',
      insights: '',
      planning: '',
      settings: '',
    }
    const taskId = taskMap[view]
    if (taskId && !completedTasks.has(taskId)) {
      completeTask(taskId)
    }
  }, [view, appState])

  // Track agent chat for onboarding
  useEffect(() => {
    if (appState !== 'app') return
    if (messages.length > 1 && !completedTasks.has('chat_with_agent')) {
      completeTask('chat_with_agent')
    }
  }, [messages, appState])

  // Track transaction adds for onboarding
  useEffect(() => {
    if (appState !== 'app') return
    if (txns.some(t => t.source === 'agent') && !completedTasks.has('add_transaction')) {
      completeTask('add_transaction')
    }
  }, [txns, appState])

  // Check if all onboarding tasks are done
  const onboardingComplete = ONBOARDING_TASKS.every(t => completedTasks.has(t.id))
  const onboardingProgress = Math.round((completedTasks.size / ONBOARDING_TASKS.length) * 100)

  const loadDashboard = useCallback(async () => {
    const [txRes, budRes, goalRes, recRes, insRes] = await Promise.all([
      fetch('/api/transactions?range=6m', { credentials: 'include' }),
      fetch('/api/budget', { credentials: 'include' }),
      fetch('/api/goals', { credentials: 'include' }),
      fetch('/api/recommendations', { credentials: 'include' }),
      fetch('/api/insights', { credentials: 'include' }),
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

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' })
      const d = await res.json()
      if (d.ok) setNotifications(d.notifications || [])
    } catch {}
  }, [])

  const persistPrivacy = async (next: boolean) => {
    setPrivacyMode(next)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacyMode: next }),
      })
    } catch {}
  }

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const res = await fetch('/api/analytics', { credentials: 'include' })
      const d = await res.json()
      if (d.ok) setAnalytics(d)
    } catch (err) {
      console.error('Analytics load failed:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  const loadPlanning = useCallback(async () => {
    setPlanningLoading(true)
    try {
      const [debtRes, billsRes, insRes] = await Promise.all([
        fetch('/api/debt', { credentials: 'include' }),
        fetch('/api/bills', { credentials: 'include' }),
        fetch('/api/smart-insights', { credentials: 'include' }),
      ])
      const [debt, bills, ins] = await Promise.all([debtRes.json(), billsRes.json(), insRes.json()])
      if (debt.ok) setDebtData(debt)
      if (bills.ok) setBillsData(bills)
      if (ins.ok) setSmartInsights(ins)
    } catch (err) {
      console.error('Planning load failed:', err)
    } finally {
      setPlanningLoading(false)
    }
  }, [])

  const loadInnovation = useCallback(async () => {
    setInnovationLoading(true)
    try {
      const res = await fetch('/api/innovation', { credentials: 'include' })
      const d = await res.json()
      if (d.ok) setInnovationData(d)
    } catch (err) {
      console.error('Innovation load failed:', err)
    } finally {
      setInnovationLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/settings', { credentials: 'include' })
      const d = await res.json()
      if (d.ok) {
        setSettingsData(d)
        setDarkMode(d.settings?.theme === 'dark')
        if (d.settings?.theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
    } catch (err) {
      console.error('Settings load failed:', err)
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  const loadCurrency = useCallback(async () => {
    try {
      const res = await fetch('/api/currency', { credentials: 'include' })
      const d = await res.json()
      if (d.ok) {
        setCurrencyInfo(d)
        setCurrencyConfig({
          currency: d.target,
          rate: d.rate,
          meta: d.meta,
        })
      }
    } catch (err) {
      console.error('Currency load failed:', err)
    }
  }, [])

  const updateSettings = useCallback(async (updates: any) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const d = await res.json()
      if (d.ok) {
        setSettingsData(prev => ({ ...prev, settings: d.settings }))
        if (updates.theme !== undefined) {
          setDarkMode(updates.theme === 'dark')
          if (updates.theme === 'dark') {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
        }
        // If currency changed, reload exchange rates
        if (updates.currency !== undefined) {
          await loadCurrency()
        }
        toast.success('Settings updated')
        return true
      } else {
        toast.error(d.error || 'Failed to update settings')
        return false
      }
    } catch (err: any) {
      toast.error(err.message)
      return false
    }
  }, [loadCurrency])

  useEffect(() => { if (appState === 'app') loadDashboard() }, [appState, loadDashboard])
  useEffect(() => { if (view === 'analytics' && !analytics) loadAnalytics() }, [view, analytics, loadAnalytics])
  useEffect(() => { if (view === 'planning' && !debtData) loadPlanning() }, [view, debtData, loadPlanning])
  useEffect(() => { if (view === 'innovation' && !innovationData) loadInnovation() }, [view, innovationData, loadInnovation])
  useEffect(() => { if (view === 'settings' && !settingsData) loadSettings() }, [view, settingsData, loadSettings])
  useEffect(() => { if (appState === 'app') loadCurrency() }, [appState, loadCurrency])
  // Sync global currency state — so every fmt() call across all components uses live conversion
  useEffect(() => { setGlobalCurrency(currencyConfig) }, [currencyConfig])

  const sendChat = async (text?: string, confirmed = false) => {
    const msg = (text ?? input).trim()
    if (!msg || chatLoading) return
    setInput('')
    const newMsgs: ChatMessage[] = confirmed ? messages : [...messages, { role: 'user', content: msg }]
    if (!confirmed) setMessages(newMsgs)
    setChatLoading(true)
    setPendingConfirm(null)
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          confirmed,
        }),
      })
      const d = await res.json()
      if (d.ok && d.needsConfirmation) {
        setPendingConfirm({ message: msg, writes: d.pendingWrites || [] })
        setMessages([...newMsgs, {
          role: 'assistant',
          content: 'This will change your records. Confirm below to apply it.',
          mode: 'write',
        }])
      } else if (d.ok) {
        setMessages([...newMsgs, { role: 'assistant', content: d.response, mode: d.mode, toolCalls: d.toolCalls }])
        if (d.dataChanged) {
          toast.success('Data updated via agent', {
            description: 'Refreshing your dashboard...',
          })
          // Invalidate analytics + planning cache so they recompute next visit
          setAnalytics(null)
          setDebtData(null)
          setBillsData(null)
          setSmartInsights(null)
          setInnovationData(null)
          await loadDashboard()
        }
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
    { label: 'Add expense', text: 'Spent 20 BDT on coffee' },
    { label: 'Undo entry', text: 'Undo last transaction' },
    { label: 'Monthly review', text: 'How did this month go?' },
    { label: 'Update budget', text: 'Set my dining budget to $400' },
    { label: 'Create goal', text: 'Create a goal to save $5000 for a car' },
    { label: 'Export data', text: 'Export my transactions' },
  ]

  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/transactions', { method: 'POST', credentials: 'include', body: fd })
      const d = await res.json()
      if (d.ok) {
        toast.success(`Imported ${d.imported} transactions`, { description: file.name })
        await loadDashboard()
      } else { toast.error(d.error || 'Upload failed') }
    } catch (err: any) { toast.error(err.message) }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }


  const updateRec = async (id: string, status: 'accepted' | 'dismissed') => {
    setRecs(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    try {
      await fetch('/api/recommendations', {
        method: 'PATCH',
        credentials: 'include',
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
    { id: 'planning', label: 'Planning', icon: Rocket },
    { id: 'insights', label: 'Insights', icon: Lightbulb, badge: anomalies.length > 0 ? String(anomalies.length) : undefined },
    { id: 'analysis', label: 'Analysis', icon: PieChart },
    { id: 'analytics', label: 'Analytics', icon: Brain },
    { id: 'innovation', label: 'Innovation Lab', icon: Dna },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  // ─── LANDING PAGE ──────────────────────────────────────────────────────
  if (appState === 'landing') {
    return <LandingPage onGetStarted={() => { setAuthMode('signup'); setAppState('auth') }} onSignIn={() => { setAuthMode('login'); setAppState('auth') }} />
  }

  // ─── AUTH PAGE ─────────────────────────────────────────────────────────
  if (appState === 'auth') {
    return <AuthPage mode={authMode} setMode={setAuthMode} onAuth={handleAuth} loading={authLoading} onBack={() => setAppState('landing')} />
  }

  // ─── ONBOARDING PAGE ──────────────────────────────────────────────────
  if (appState === 'onboarding') {
    return (
      <OnboardingPage
        userName={authUser?.name || 'there'}
        tasks={ONBOARDING_TASKS}
        completedTasks={completedTasks}
        onComplete={() => {
          setAppState('app')
        }}
        onSkip={() => {
          setAppState('app')
        }}
      />
    )
  }

  // ─── MAIN APP ──────────────────────────────────────────────────────────
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
                  <path d="M11 12h4l-2 4h-2zM14 20l2-4 2 4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="8" r="1.6" fill="currentColor"/>
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[15px] font-semibold tracking-tight">FinWise</span>
                <span className="text-[9px] text-[var(--fw-text-4)] tracking-[0.18em] uppercase font-medium">
                  Finance Intelligence
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fw-surface-2)] border border-[var(--fw-border)] ml-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--fw-positive)]" />
              <span className="text-[11px] text-[var(--fw-text-2)] font-semibold">Signed in</span>
            </div>
            {/* Currency indicator */}
            {currencyConfig && currencyConfig.currency !== 'USD' && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--fw-accent-soft)] border border-[var(--fw-accent-border)] ml-1">
                <Globe className="h-3 w-3 text-[var(--fw-accent)]" />
                <span className="text-[11px] text-[var(--fw-accent)] font-semibold">
                  {currencyConfig.currency} · 1$ = {currencyConfig.meta.symbol}{currencyConfig.rate.toFixed(currencyConfig.meta.decimals === 0 ? 0 : 2)}
                </span>
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative h-8 w-8 flex items-center justify-center rounded-lg border border-[var(--fw-border)] bg-[var(--fw-surface)] hover:bg-[var(--fw-surface-2)] hover:border-[var(--fw-border-strong)] transition-all fw-focus"
                aria-label="Notifications"
              >
                <Bell className="h-3.5 w-3.5 text-[var(--fw-text-2)]" />
                {notifications.filter((n) => !n.read).length + pendingRecCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[var(--fw-accent)] text-[9px] font-bold text-white flex items-center justify-center">
                    {notifications.filter((n) => !n.read).length || pendingRecCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-lg)] p-2">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[11px] font-semibold">Notifications</span>
                    <button
                      className="text-[10px] text-[var(--fw-accent)]"
                      onClick={async () => {
                        await fetch('/api/notifications', {
                          method: 'PATCH',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ readAll: true }),
                        })
                        loadNotifications()
                      }}
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto fw-scroll">
                    {notifications.length === 0 && pendingRecCount === 0 && (
                      <div className="px-2 py-6 text-[11px] text-[var(--fw-text-3)] text-center">No notifications yet.</div>
                    )}
                    {pendingRecCount > 0 && (
                      <button
                        className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--fw-surface-2)]"
                        onClick={() => { setView('insights'); setNotifOpen(false) }}
                      >
                        <div className="text-[12px] font-medium">{pendingRecCount} pending recommendation{pendingRecCount === 1 ? '' : 's'}</div>
                        <div className="text-[10px] text-[var(--fw-text-3)]">Open Insights to accept or dismiss</div>
                      </button>
                    )}
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        className={`w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--fw-surface-2)] ${n.read ? 'opacity-70' : ''}`}
                        onClick={async () => {
                          await fetch('/api/notifications', {
                            method: 'PATCH',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: n.id }),
                          })
                          if (n.link) setView(n.link as View)
                          setNotifOpen(false)
                          loadNotifications()
                        }}
                      >
                        <div className="text-[12px] font-medium">{n.title}</div>
                        <div className="text-[10px] text-[var(--fw-text-3)]">{n.message}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Privacy toggle */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => persistPrivacy(!privacyMode)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); persistPrivacy(!privacyMode) } }}
              title="On-device answers skip the cloud LLM and use tool results only"
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
                {privacyMode ? 'On-device' : 'Cloud LLM'}
              </span>
              <Switch checked={privacyMode} onCheckedChange={persistPrivacy} className="scale-75 data-[state=checked]:bg-[var(--fw-accent)] pointer-events-none" />
            </div>

            {/* Permission tier */}
            <Select value={tier === 'Approver' ? 'Editor' : tier} onValueChange={(v) => {
              const next = v as Tier
              setTier(next)
              updateSettings({ tier: next })
            }}>
              <SelectTrigger className="w-[180px] h-8 text-[11px] font-medium border-[var(--fw-border)] bg-[var(--fw-surface)] hover:border-[var(--fw-border-strong)] rounded-lg">
                <div className="flex items-center gap-1.5 w-full">
                  {tier === 'Viewer' && <Shield className="h-3.5 w-3.5 text-[var(--fw-text-3)] flex-shrink-0" />}
                  {tier !== 'Viewer' && <ShieldCheck className="h-3.5 w-3.5 text-[var(--fw-accent)] flex-shrink-0" />}
                  <span className="font-medium">{tier === 'Viewer' ? 'Viewer' : 'Editor'}</span>
                  <span className="text-[10px] text-[var(--fw-text-3)] truncate">
                    {tier === 'Viewer' ? '· Read-only' : '· Can edit'}
                  </span>
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
                      <span className="text-[10px] text-[var(--fw-text-3)]">Add and edit records</span>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Onboarding progress (shows if incomplete) */}
            {!onboardingComplete && (
              <button
                onClick={() => setShowOnboardingChecklist(!showOnboardingChecklist)}
                className="hidden sm:flex relative h-8 px-3 items-center gap-1.5 rounded-lg border border-[var(--fw-accent-border)] bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] text-[11px] font-medium hover:bg-[var(--fw-accent-soft)] transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{onboardingProgress}% Setup</span>
              </button>
            )}

            {/* User menu / Logout */}
            {authUser && (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 px-2.5 h-8 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center text-[10px] font-bold text-white">
                    {authUser.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--fw-text-2)] max-w-[80px] truncate">{authUser.name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 w-8 p-0 text-[var(--fw-text-3)] hover:text-[var(--fw-text)] hover:bg-[var(--fw-surface-2)] rounded-lg">
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Onboarding checklist popup */}
      {showOnboardingChecklist && !onboardingComplete && (
        <div className="fixed top-16 right-4 z-50 w-80 rounded-xl bg-[var(--fw-surface)] border border-[var(--fw-border)] shadow-[var(--fw-shadow-lg)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-[var(--fw-accent)]" />
              <span className="text-[13px] font-semibold">Complete your setup</span>
            </div>
            <button onClick={() => setShowOnboardingChecklist(false)} className="text-[var(--fw-text-3)] hover:text-[var(--fw-text)]">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-[var(--fw-text-3)] mb-1">
              <span>{completedTasks.size} of {ONBOARDING_TASKS.length} tasks</span>
              <span>{onboardingProgress}%</span>
            </div>
            <div className="h-1.5 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] rounded-full transition-all" style={{ width: `${onboardingProgress}%` }} />
            </div>
          </div>
          <div className="space-y-1.5">
            {ONBOARDING_TASKS.map(task => {
              const done = completedTasks.has(task.id)
              return (
                <button
                  key={task.id}
                  onClick={() => { setView(task.view); setShowOnboardingChecklist(false) }}
                  className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--fw-surface-2)] transition-colors text-left"
                >
                  {done ? (
                    <CheckCircle className="h-4 w-4 text-[var(--fw-positive)] flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="h-4 w-4 text-[var(--fw-text-4)] flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] font-medium ${done ? 'text-[var(--fw-text-3)] line-through' : 'text-[var(--fw-text)]'}`}>{task.label}</div>
                    <div className="text-[10px] text-[var(--fw-text-3)]">{task.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                Supervisor-Worker pattern with 4 specialized sub-agents and 13 tools.
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
              <SystemRow icon={Zap} label="LLM" value={privacyMode ? 'On-device' : 'Cloud rewrite'} />
              <SystemRow icon={Lock} label="Mode" value={privacyMode ? 'No cloud LLM' : 'Cloud optional'} highlight={privacyMode} />
              <SystemRow icon={Activity} label="Auth" value="Signed in" />
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
              fileInputRef={fileInputRef}
            />
          )}
          {view === 'transactions' && <TransactionsView txns={txns} byCategory={byCategory} onRefresh={loadDashboard} />}
          {view === 'analysis' && <AnalysisView
            txns={txns}
            byCategory={byCategory}
            byMonth={byMonth}
            totalSpend={totalSpend}
            totalIncome={totalIncome}
/>}
          {view === 'budgets' && <BudgetsView budgets={budgets} tier={tier} onUpdate={loadDashboard} />}
          {view === 'goals' && <GoalsView goals={goals} onSimulationComplete={() => completeTask('run_simulation')} />}
          {view === 'insights' && (
            <InsightsView
              anomalies={anomalies} momDeltas={momDeltas}
              topMerchants={topMerchants} subscriptions={subscriptions}
              recs={recs} tier={tier} onUpdateRec={updateRec}
            />
          )}
          {view === 'analytics' && (
            <AnalyticsView
              data={analytics}
              loading={analyticsLoading}
              onRefresh={loadAnalytics}
            />
          )}
          {view === 'planning' && (
            <PlanningView
              debtData={debtData}
              billsData={billsData}
              smartInsights={smartInsights}
              loading={planningLoading}
              onRefresh={loadPlanning}
              onNavigate={setView}
            />
          )}
          {view === 'innovation' && (
            <InnovationView
              data={innovationData}
              loading={innovationLoading}
              onRefresh={loadInnovation}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              data={settingsData}
              loading={settingsLoading}
              onRefresh={loadSettings}
              onUpdate={updateSettings}
              tier={tier}
              setTier={setTier}
              privacyMode={privacyMode}
              setPrivacyMode={setPrivacyMode}
              currencyInfo={currencyInfo}
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
              pendingConfirm={pendingConfirm}
              onConfirm={() => pendingConfirm && sendChat(pendingConfirm.message, true)}
              onCancel={() => setPendingConfirm(null)}
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
              pendingConfirm={pendingConfirm}
              onConfirm={() => pendingConfirm && sendChat(pendingConfirm.message, true)}
              onCancel={() => setPendingConfirm(null)}
            />
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="flex-shrink-0 border-t border-[var(--fw-border)] bg-[var(--fw-surface)]">
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-3 text-[var(--fw-text-3)]">
            <span className="font-medium text-[var(--fw-text-2)]">FinWise</span>
            <span>·</span>
            <span>AI Personal Finance Copilot</span>
          </div>
          <div className="flex items-center gap-3 text-[var(--fw-text-3)]">
            <span className="flex items-center gap-1"><Database className="h-3 w-3" /> SQLite · Prisma</span>
            <span>·</span>
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> 4-layer architecture</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Session auth · local SQLite</span>
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
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { txns, byCategory, byMonth, totalSpend, totalIncome, netSavings, savingsRate,
          budgets, overBudgetCount, goals, recs, totalPendingRecs, tier, onUpdateRec,
          fileInputRef } = props

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
            ) : <EmptyState icon={BarChart3} title="No data yet" description="Add transactions via the agent chat to see your spending visualization here." />}
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
            ) : <EmptyState icon={BarChart3} title="No data yet" description="Add transactions via the agent chat to see your spending visualization here." />}
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
            {budgets.length === 0 && <EmptyState icon={Wallet} title="No budgets yet" description="Set up monthly budget envelopes for each spending category to track your spending limits." />}
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
            {recs.length === 0 && <EmptyState icon={Sparkles2} title="No recommendations yet" description="Add some transactions and the AI will generate personalized recommendations with dollar impact." />}
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
            {goals.length === 0 && <EmptyState icon={Target} title="No savings goals yet" description="Create a savings goal like 'Trip to Japan' or 'Emergency Fund' to start tracking your progress." />}
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
              {txns.length === 0 && <EmptyState icon={Receipt} title="No transactions yet" description={'Add your first transaction by typing "I spent $25 on coffee at Blue Bottle" in the agent chat on the right.'} />}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// ═══ View: Transactions ═══════════════════════════════════════════════
function TransactionsView({ txns, byCategory, onRefresh }: {
  txns: Txn[]
  byCategory: { name: string; color: string; cents: number; count: number }[]
  onRefresh: () => void
}) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'debit' | 'credit'>('debit')
  const [addAmount, setAddAmount] = useState('')
  const [addMerchant, setAddMerchant] = useState('')
  const [addCategory, setAddCategory] = useState<string>('')
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10))

  const filtered = txns.filter(t => {
    if (categoryFilter !== 'all' && t.category.name !== categoryFilter) return false
    if (search && !t.merchantRaw.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalSpend = filtered.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0)
  const totalIncome = filtered.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0)

  const handleAddTransaction = async () => {
    const amount = parseFloat(addAmount)
    const amountCents = Math.round(amount * 100)
    if (!addMerchant.trim() || !addCategory.trim() || isNaN(amount) || amountCents <= 0) {
      toast.error('Please enter a valid amount, merchant and category')
      return
    }
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantRaw: addMerchant.trim(),
          amountCents,
          direction: addType,
          category: addCategory.trim(),
          date: addDate,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed to add transaction')
      setAddOpen(false)
      setAddAmount('')
      setAddMerchant('')
      setAddCategory('')
      setAddDate(new Date().toISOString().slice(0, 10))
      toast.success('Transaction added')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add transaction')
    }
  }

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm('Remove this transaction?')) return
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed to delete transaction')
      toast.success('Transaction removed')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove transaction')
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Transactions</h1>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          <span className="text-[var(--fw-text-2)] font-medium">{filtered.length}</span> of {txns.length} · <span className="text-[var(--fw-text-2)] font-medium">{fmt(totalSpend)}</span> spend · <span className="text-[var(--fw-text-2)] font-medium">{fmt(totalIncome)}</span> income
        </p>
      </div>

      <div className="flex items-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Expense / Income
        </Button>
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
                <th className="text-right font-semibold text-[var(--fw-text-2)] px-4 py-2.5 text-[11px] uppercase tracking-wider\">Actions</th>
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
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTransaction(t.id)} className="text-[var(--fw-negative)] hover:bg-[var(--fw-negative-soft)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--fw-text)]/40 backdrop-blur-sm" onClick={() => setAddOpen(false)}>
          <div className="bg-[var(--fw-surface)] border border-[var(--fw-border)] rounded-2xl p-5 sm:p-6 w-full sm:w-[440px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add {addType === 'debit' ? 'Expense' : 'Income'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleAddTransaction() }} className="space-y-3">
              <div>
                <label className="text-[11px] uppercase text-[var(--fw-text-3)] font-medium block mb-1.5">Type</label>
                <Select value={addType} onValueChange={(v) => setAddType(v as 'debit' | 'credit')}>
                  <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Expense</SelectItem>
                    <SelectItem value="credit">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] uppercase text-[var(--fw-text-3)] font-medium block mb-1.5">Amount</label>
                <Input value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="0.00" className="h-9 text-[12px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-[var(--fw-text-3)] font-medium block mb-1.5">Merchant</label>
                <Input value={addMerchant} onChange={e => setAddMerchant(e.target.value)} placeholder="e.g. Grocery Store" className="h-9 text-[12px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-[var(--fw-text-3)] font-medium block mb-1.5">Category</label>
                <Input value={addCategory} onChange={e => setAddCategory(e.target.value)} list="add-cats" placeholder="e.g. Groceries" className="h-9 text-[12px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]" />
                <datalist id="add-cats">{byCategory.map(c => <option key={c.name} value={c.name} />)}</datalist>
              </div>
              <div>
                <label className="text-[11px] uppercase text-[var(--fw-text-3)] font-medium block mb-1.5">Date</label>
                <Input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} className="h-9 text-[12px] border-[var(--fw-border)] rounded-lg bg-[var(--fw-surface-2)]" />
              </div>
              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-[var(--fw-border)]/30">
                <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button disabled={!addMerchant.trim() || !addCategory.trim() || !addAmount || parseFloat(addAmount) <= 0} onClick={(e) => { e.preventDefault(); handleAddTransaction() }}>Add Transaction</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

// ═══ View: Analysis ════════════════════════════════════════════════════
function AnalysisView({ txns, byCategory, byMonth, totalSpend, totalIncome }: {
  txns: Txn[]
  byCategory: { name: string; color: string; cents: number; count: number }[]
  byMonth: { month: string; spendCents: number; incomeCents: number }[]
  totalSpend: number
  totalIncome: number
}) {
  const net = totalIncome - totalSpend
  const topCategories = byCategory.slice(0, 8)

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Spending Analysis</h1>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          Where your money goes and how it compares to what comes in
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-2">Total Spending</div>
          <div className="text-[28px] font-semibold tnum text-[var(--fw-negative)]">{fmt(totalSpend)}</div>
        </Card>
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-2">Total Income</div>
          <div className="text-[28px] font-semibold tnum text-[var(--fw-positive)]">{fmt(totalIncome)}</div>
        </Card>
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--fw-text-3)] font-semibold mb-2">Net Savings</div>
          <div className={`text-[28px] font-semibold tnum ${net >= 0 ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-negative)]'}`}>{fmt(net, { sign: true })}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend by category */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Spending by Category</h3>
            <span className="text-[10px] font-medium text-[var(--fw-text-3)]">{topCategories.length} categories</span>
          </div>
          <div className="space-y-2">
            {topCategories.map((c) => {
              const pct = totalSpend > 0 ? Math.round((c.cents / totalSpend) * 100) : 0
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 text-[12px] text-[var(--fw-text-2)] truncate">{c.name}</span>
                  <span className="w-20 text-right text-[12px] font-mono tnum">{fmt(c.cents)}</span>
                  <span className="w-12 text-[10px] text-[var(--fw-text-3)]">{pct}%</span>
                </div>
              )
            })}
            {topCategories.length === 0 && (
              <div className="py-4 text-center text-xs text-[var(--fw-text-3)]">No spending data yet. Add expenses to see analysis.</div>
            )}
          </div>
        </Card>

        {/* Monthly income vs spending trend */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Monthly Income vs Spending</h3>
          </div>
          <div className="h-48 w-full">
            {byMonth.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="spendCents" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="incomeCents" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--fw-text-3)]">No monthly data yet. Add transactions to see the trend.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ═══ View: Budgets ══════════════════════════════════════════════════════

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
        {budgets.length === 0 && <EmptyState icon={Wallet} title="No budgets yet" description="Set up monthly budget envelopes for each spending category to track your spending limits." />}
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
function GoalsView({ goals, onSimulationComplete }: { goals: GoalItem[]; onSimulationComplete?: () => void }) {
  const [simulating, setSimulating] = useState<string | null>(null)
  const [simResult, setSimResult] = useState<any>(null)

  const runSim = async (goalId: string, additionalMonthlyCents = 0) => {
    setSimulating(goalId)
    try {
      const res = await fetch('/api/simulation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, additionalMonthlyCents, trials: 1000 }),
      })
      const d = await res.json()
      if (d.ok) {
        setSimResult(d)
        onSimulationComplete?.()
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
        {goals.length === 0 && <EmptyState icon={Target} title="No savings goals yet" description="Create a savings goal like 'Trip to Japan' or 'Emergency Fund' to start tracking your progress." />}
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
            ) : <EmptyState icon={BarChart3} title="No data yet" description="Add transactions via the agent chat to see your spending visualization here." />}
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
            {subscriptions.length === 0 && <EmptyState icon={RefreshCw} title="No subscriptions detected" description="Recurring transactions will appear here once you add them via the agent chat." />}
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
          {recs.length === 0 && <EmptyState icon={Sparkles2} title="No recommendations yet" description="Add some transactions and the AI will generate personalized recommendations with dollar impact." />}
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
  sendChat: (text?: string, confirmed?: boolean) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  quickPrompts: { label: string; text: string }[]
  privacyMode: boolean
  onClose: () => void
  pendingConfirm: { message: string; writes: { name: string; args: any }[] } | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { messages, input, setInput, chatLoading, sendChat, scrollRef, quickPrompts, privacyMode, onClose, pendingConfirm, onConfirm, onCancel } = props
  return (
    <>
      <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--fw-border)] bg-[var(--fw-surface)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)]">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-semibold">FinWise Agent</span>
            <span className="text-[10px] text-[var(--fw-text-3)]">Supervisor-Worker · 13 tools</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${privacyMode ? 'bg-[var(--fw-accent)]' : 'bg-[var(--fw-positive)]'} fw-pulse`} />
          <span className="text-[10px] font-medium text-[var(--fw-text-2)] mr-1.5">{privacyMode ? 'On-device' : 'Cloud LLM'}</span>
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

      {pendingConfirm && (
        <div className="px-4 py-3 border-t border-[var(--fw-accent-border)] bg-[var(--fw-accent-soft)] flex-shrink-0">
          <div className="text-[12px] font-medium mb-1">Confirm this change</div>
          <div className="text-[11px] text-[var(--fw-text-3)] mb-2">
            {pendingConfirm.writes.map((w) => w.name.replace(/_/g, ' ')).join(', ') || 'Write'} — this updates your records.
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-[11px] rounded-lg bg-[var(--fw-accent)] text-white" onClick={onConfirm}>Confirm</Button>
            <Button size="sm" variant="outline" className="h-8 text-[11px] rounded-lg" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      )}

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

// Empty state for new users with no data
function EmptyState({ icon: Icon, title, description, action, actionLabel }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: () => void
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[var(--fw-accent-soft)] to-[var(--fw-surface)] border border-[var(--fw-accent-border)] flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-[var(--fw-accent)]" />
      </div>
      <h3 className="text-[14px] font-semibold text-[var(--fw-text)] mb-1.5">{title}</h3>
      <p className="text-[12px] text-[var(--fw-text-3)] max-w-[300px] leading-relaxed mb-4">{description}</p>
      {action && actionLabel && (
        <Button onClick={action} size="sm" className="h-8 px-4 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-lg text-[12px] font-medium shadow-[var(--fw-shadow-glow)]">
          {actionLabel} <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
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

// ═══ View: Analytics (Advanced features) ═══════════════════════════════
function AnalyticsView({ data, loading, onRefresh }: {
  data: any
  loading: boolean
  onRefresh: () => void
}) {
  // What-if scenario state
  const [savingsBoost, setSavingsBoost] = useState(0)        // extra $/mo
  const [expenseCut, setExpenseCut] = useState(0)             // % expense reduction
  const [returnRate, setReturnRate] = useState(7)             // % annual return

  if (loading || !data) {
    return (
      <div className="p-10 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--fw-accent)]" />
          <div className="text-sm text-[var(--fw-text-3)]">Computing advanced analytics...</div>
          <div className="text-[11px] text-[var(--fw-text-4)]">Running Holt-Winters forecast, Monte Carlo simulations, and compound projections</div>
        </div>
      </div>
    )
  }

  const { healthScore, spendVelocity, cashFlowForecast, goalsProjection, savingsTrajectory, assumptions } = data

  // What-if calculations
  const currentSavingsRate = healthScore.subscores.find((s: any) => s.label === 'Savings Rate')?.raw || 0
  const newSavingsRate = Math.min(1, currentSavingsRate + (savingsBoost / 10000) * 0.05)
  const healthLift = Math.round(((newSavingsRate - currentSavingsRate) / 0.2) * 30)

  // Calculate projected goal completion with new savings rate
  const goalProjectionsWithScenario = goalsProjection.map((g: any) => {
    const newMonthly = g.monthlyContributionCents + Math.round(savingsBoost * 100)
    const newMonthsToTarget = newMonthly > 0
      ? Math.ceil((g.targetCents - g.savedCents) / newMonthly)
      : 999
    const daysSaved = (g.monthsToTarget - newMonthsToTarget) * 30
    return { ...g, newMonthlyContributionCents: newMonthly, newMonthsToTarget, daysSaved }
  })

  // 30-year compound projection with current savings rate vs scenario
  const currentMonthlySavings = Math.round(savingsTrajectory[savingsTrajectory.length - 1]?.net || 0)
  const scenarioMonthlySavings = currentMonthlySavings + Math.round(savingsBoost * 100) + Math.round(currentMonthlySavings * expenseCut / 100)
  const thirtyYearCurrent = compoundGrowth(0, currentMonthlySavings, returnRate / 100, 360)
  const thirtyYearScenario = compoundGrowth(0, scenarioMonthlySavings, returnRate / 100, 360)
  const lifetimeGain = thirtyYearScenario - thirtyYearCurrent

  const scoreColor = healthScore.score >= 85 ? 'var(--fw-positive)' : healthScore.score >= 70 ? 'var(--fw-accent)' : healthScore.score >= 55 ? 'var(--fw-warning)' : 'var(--fw-negative)'

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-5 w-5 text-[var(--fw-accent)]" />
            <h1 className="text-[28px] font-semibold tracking-tight">Advanced Analytics</h1>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">
              AI-Powered
            </span>
          </div>
          <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
            Predictive forecasting · Monte Carlo · Compound growth modeling · What-if scenarios
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 text-xs rounded-lg border-[var(--fw-border)]">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Recompute
        </Button>
      </div>

      {/* ─── Hero: Financial Health Score ──────────────────────────── */}
      <Card className="overflow-hidden border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-md)] rounded-2xl">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fw-border)] bg-gradient-to-r from-[var(--fw-accent-soft)] to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)]">
              <Gauge className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold leading-tight">Financial Health Score</h2>
              <div className="text-[10px] text-[var(--fw-text-3)] mt-0.5">Composite weighted metric across 5 factors</div>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-[var(--fw-surface)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">
            AI-Powered
          </span>
        </div>

        {/* Body — gauge + breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          {/* Score gauge — 4 cols */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center">
            <div className="relative h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%" outerRadius="100%"
                  data={[{ value: healthScore.score, fill: scoreColor }]}
                  startAngle={90} endAngle={90 - (healthScore.score / 100) * 360}
                >
                  <RadialBar background={{ fill: 'var(--fw-surface-2)' }} dataKey="value" cornerRadius={20} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--fw-text-3)] font-semibold mb-1">Score</div>
                <div className="text-[48px] font-bold tnum tracking-tight leading-none" style={{ color: scoreColor }}>
                  {healthScore.score}
                </div>
                <div className="text-[11px] text-[var(--fw-text-3)] mt-1 tnum">out of 100</div>
                <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{
                  backgroundColor: `${scoreColor}20`,
                  color: scoreColor,
                  border: `1px solid ${scoreColor}40`,
                }}>
                  <Award className="h-3 w-3" />
                  {healthScore.grade}
                </div>
              </div>
            </div>
          </div>

          {/* Score breakdown — 8 cols */}
          <div className="lg:col-span-8">
            {/* Insight banner */}
            <div className="mb-4 p-3 rounded-xl bg-[var(--fw-surface-2)] border border-[var(--fw-border)] flex items-start gap-2.5">
              <Info className="h-4 w-4 text-[var(--fw-accent)] flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-[var(--fw-text-2)] leading-relaxed">{healthScore.insight}</p>
            </div>

            {/* Subscore grid — 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {healthScore.subscores.map((s: any, i: number) => {
                const color = s.value >= 75 ? 'var(--fw-positive)' : s.value >= 50 ? 'var(--fw-warning)' : 'var(--fw-negative)'
                const bgColor = s.value >= 75 ? 'var(--fw-positive-soft)' : s.value >= 50 ? 'var(--fw-warning-soft)' : 'var(--fw-negative-soft)'
                const borderColor = s.value >= 75 ? 'var(--fw-positive-border)' : s.value >= 50 ? 'var(--fw-warning-border)' : 'var(--fw-negative-border)'
                const statusLabel = s.value >= 75 ? 'Excellent' : s.value >= 50 ? 'Fair' : 'Needs work'
                return (
                  <div
                    key={i}
                    className="p-3 rounded-xl border bg-[var(--fw-surface)] hover:shadow-[var(--fw-shadow-sm)] transition-shadow"
                    style={{ borderColor: 'var(--fw-border)' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[12px] font-medium text-[var(--fw-text-2)]">{s.label}</span>
                      </div>
                      <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{
                        backgroundColor: bgColor,
                        color: color,
                        border: `1px solid ${borderColor}`,
                      }}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[22px] font-bold tnum" style={{ color: color }}>{s.value}</span>
                      <span className="text-[10px] text-[var(--fw-text-3)] font-mono">weight {s.weight}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fw-surface-2)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${s.value}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Row 2: Spend Velocity + Cash Flow Forecast ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Spend Velocity Gauge */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Spend Velocity</h2>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">
              Day {spendVelocity.dayOfMonth}/{spendVelocity.daysInMonth}
            </span>
          </div>

          <div className="space-y-4">
            {/* Dual bar comparison */}
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--fw-text-2)] font-medium">Ideal pace</span>
                  <span className="tnum font-mono text-[var(--fw-text-2)]">{spendVelocity.idealPace}%</span>
                </div>
                <div className="h-2 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--fw-text-3)] rounded-full" style={{ width: `${spendVelocity.idealPace}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--fw-text-2)] font-medium">Actual pace</span>
                  <span className={`tnum font-mono font-semibold ${spendVelocity.velocityDelta > 5 ? 'text-[var(--fw-negative)]' : spendVelocity.velocityDelta < -5 ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-text-2)]'}`}>
                    {spendVelocity.actualPace}%
                  </span>
                </div>
                <div className="h-2 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${spendVelocity.velocityDelta > 5 ? 'bg-[var(--fw-negative)]' : spendVelocity.velocityDelta < -5 ? 'bg-[var(--fw-positive)]' : 'bg-[var(--fw-accent)]'}`}
                    style={{ width: `${Math.min(100, spendVelocity.actualPace)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Delta indicator */}
            <div className={`p-3 rounded-lg border ${
              spendVelocity.velocityDelta > 5
                ? 'bg-[var(--fw-negative-soft)] border-[var(--fw-negative-border)]'
                : spendVelocity.velocityDelta < -5
                ? 'bg-[var(--fw-positive-soft)] border-[var(--fw-positive-border)]'
                : 'bg-[var(--fw-surface-2)] border-[var(--fw-border)]'
            }`}>
              <div className="flex items-center gap-2">
                {spendVelocity.velocityDelta > 5 ? (
                  <TrendingUp className="h-4 w-4 text-[var(--fw-negative)]" />
                ) : spendVelocity.velocityDelta < -5 ? (
                  <TrendingDown className="h-4 w-4 text-[var(--fw-positive)]" />
                ) : (
                  <Activity className="h-4 w-4 text-[var(--fw-text-2)]" />
                )}
                <div className="flex-1">
                  <div className={`text-[12px] font-semibold ${
                    spendVelocity.velocityDelta > 5 ? 'text-[var(--fw-negative)]' :
                    spendVelocity.velocityDelta < -5 ? 'text-[var(--fw-positive)]' : 'text-[var(--fw-text-2)]'
                  }`}>
                    {spendVelocity.velocityDelta > 0 ? '+' : ''}{spendVelocity.velocityDelta}% vs ideal pace
                  </div>
                  <div className="text-[10px] text-[var(--fw-text-3)] mt-0.5">
                    {spendVelocity.velocityDelta > 5
                      ? `Spending too fast — projected ${fmt(spendVelocity.projectedOverCents, { sign: true })} over budget`
                      : spendVelocity.velocityDelta < -5
                      ? `Spending slowly — projected ${fmt(Math.abs(spendVelocity.projectedOverCents))} under budget`
                      : 'On pace — projected to land within budget'}
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended daily spend */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="text-center p-2 rounded-lg bg-[var(--fw-surface-2)]">
                <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">Avg/day so far</div>
                <div className="text-[14px] font-semibold tnum">{fmt(spendVelocity.dailyAvgCents, { compact: true })}</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-[var(--fw-accent-soft)] border border-[var(--fw-accent-border)]">
                <div className="text-[9px] uppercase tracking-wider text-[var(--fw-accent)] font-semibold mb-0.5">Rec/day rest</div>
                <div className="text-[14px] font-semibold tnum text-[var(--fw-accent)]">{fmt(spendVelocity.recommendedDailyCents, { compact: true })}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Cash Flow Forecast */}
        <Card className="lg:col-span-2 p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendUp className="h-4 w-4 text-[var(--fw-accent)]" />
              <h2 className="text-[14px] font-semibold">14-Day Cash Flow Forecast</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)]">
                {cashFlowForecast.confidence.toFixed(0)}% confidence
              </span>
            </div>
          </div>

          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlowForecast.forecast}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--fw-accent)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--fw-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.6} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} stroke="var(--fw-border)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, { compact: true })} />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (typeof value !== 'number' || isNaN(value)) return ''
                    const label = name === 'predicted' ? 'Predicted' : name === 'upper' ? 'Upper bound' : name === 'lower' ? 'Lower bound' : name
                    return [fmt(value), label]
                  }}
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '8px 12px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)', boxShadow: 'var(--fw-shadow-md)' }}
                />
                <Area type="monotone" dataKey="upper" stroke="none" fill="url(#forecastGrad)" name="upper" />
                <Area type="monotone" dataKey="lower" stroke="none" fill="var(--fw-surface)" name="lower" />
                <Line type="monotone" dataKey="predicted" stroke="var(--fw-accent)" strokeWidth={2.5} dot={{ r: 2, fill: 'var(--fw-accent)' }} name="predicted" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--fw-border)]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Historical avg/day</div>
              <div className="text-[16px] font-semibold tnum">{fmt(cashFlowForecast.historicalAvgDaily, { compact: true })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Forecast avg/day</div>
              <div className="text-[16px] font-semibold tnum text-[var(--fw-accent)]">{fmt(cashFlowForecast.forecastAvgDaily, { compact: true })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Model RMSE</div>
              <div className="text-[16px] font-semibold tnum">{fmt(cashFlowForecast.rmse, { compact: true })}</div>
            </div>
          </div>
          <div className="mt-3 text-[10px] text-[var(--fw-text-4)] font-mono">
            Model: {assumptions.forecastModel}
          </div>
        </Card>
      </div>

      {/* ─── Row 3: What-If Scenario Builder ───────────────────────── */}
      <Card className="p-6 border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-surface)] to-[var(--fw-accent-soft)] shadow-[var(--fw-shadow-md)] rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="h-5 w-5 text-[var(--fw-accent)]" />
          <h2 className="text-[16px] font-semibold">What-If Scenario Builder</h2>
          <span className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-accent)] text-white uppercase tracking-wider">
            Interactive
          </span>
        </div>
        <p className="text-[12px] text-[var(--fw-text-2)] mb-5">
          Drag the sliders to model how changes to your savings, spending, and investment return impact your 30-year financial trajectory.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sliders */}
          <div className="space-y-5">
            {/* Savings boost */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[12px] font-medium text-[var(--fw-text-2)]">Extra monthly savings</label>
                <span className="text-[13px] font-mono tnum font-semibold text-[var(--fw-accent)]">+${savingsBoost}/mo</span>
              </div>
              <Slider
                value={[savingsBoost]}
                onValueChange={(v) => setSavingsBoost(v[0])}
                min={0}
                max={1000}
                step={25}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-[var(--fw-text-4)] mt-1">
                <span>$0</span><span>$500</span><span>$1,000</span>
              </div>
            </div>

            {/* Expense cut */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[12px] font-medium text-[var(--fw-text-2)]">Expense reduction</label>
                <span className="text-[13px] font-mono tnum font-semibold text-[var(--fw-accent)]">{expenseCut}%</span>
              </div>
              <Slider
                value={[expenseCut]}
                onValueChange={(v) => setExpenseCut(v[0])}
                min={0}
                max={30}
                step={1}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-[var(--fw-text-4)] mt-1">
                <span>0%</span><span>15%</span><span>30%</span>
              </div>
            </div>

            {/* Return rate */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-[12px] font-medium text-[var(--fw-text-2)]">Investment return rate (annual)</label>
                <span className="text-[13px] font-mono tnum font-semibold text-[var(--fw-accent)]">{returnRate}%</span>
              </div>
              <Slider
                value={[returnRate]}
                onValueChange={(v) => setReturnRate(v[0])}
                min={0}
                max={12}
                step={0.5}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-[var(--fw-text-4)] mt-1">
                <span>0%</span><span>6%</span><span>12%</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[var(--fw-surface)] border border-[var(--fw-border)] shadow-[var(--fw-shadow-sm)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">30-Year Projected Balance</div>
              <div className="text-[26px] font-semibold tnum text-[var(--fw-accent)]">{fmt(thirtyYearScenario, { compact: true })}</div>
              <div className="text-[11px] text-[var(--fw-text-3)] mt-1">
                vs <span className="font-mono tnum">{fmt(thirtyYearCurrent, { compact: true })}</span> at current pace
              </div>
              {lifetimeGain > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)] text-[11px] font-semibold">
                  <TrendingUp className="h-3 w-3" />
                  +{fmt(lifetimeGain, { compact: true })} lifetime gain
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">New savings rate</div>
                <div className="text-[18px] font-semibold tnum">{(newSavingsRate * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">
                  from {(currentSavingsRate * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Health score lift</div>
                <div className="text-[18px] font-semibold tnum text-[var(--fw-positive)]">+{healthLift}</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">
                  potential points
                </div>
              </div>
            </div>

            {/* Per-goal impact */}
            <div className="p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">Goal acceleration</div>
              <div className="space-y-1.5">
                {goalProjectionsWithScenario.slice(0, 3).map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--fw-text-2)] truncate">{g.name}</span>
                    {g.daysSaved > 0 ? (
                      <span className="font-mono tnum text-[var(--fw-positive)] font-semibold">-{g.daysSaved}d faster</span>
                    ) : (
                      <span className="font-mono tnum text-[var(--fw-text-3)]">no change</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Row 4: Compound Growth Projections per Goal ───────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkle className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[16px] font-semibold">Compound Growth Projections</h2>
          <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)] uppercase tracking-wider">
            {returnRate}% return · {goalsProjection.length} goals
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {goalsProjection.map((g: any) => {
            const chartData = g.projectionSeries.map((p: any) => ({
              month: p.month,
              balance: Math.round(p.balance / 100),
              contributions: Math.round(p.contributions / 100),
              gains: Math.round(p.gains / 100),
            }))
            return (
              <Card key={g.id} className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[13px] font-semibold">{g.name}</div>
                    <div className="text-[10px] text-[var(--fw-text-3)] mt-0.5">
                      Target: {fmt(g.targetCents, { compact: true })} · ETA {g.monthsToTarget} mo
                    </div>
                  </div>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)] uppercase tracking-wider">
                    +{fmt(g.projectedGainsCents, { compact: true })}
                  </span>
                </div>

                <div className="h-32 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`grad-${g.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--fw-accent)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="var(--fw-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}k`} width={28} />
                      <Tooltip
                        formatter={(value: any, name: any) => {
                          if (typeof value !== 'number' || isNaN(value)) return ''
                          return [`$${value}k`, name === 'balance' ? 'Balance' : name === 'gains' ? 'Investment gains' : 'Contributions']
                        }}
                        contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '4px 8px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)' }}
                      />
                      <Area type="monotone" dataKey="balance" stroke="var(--fw-accent)" strokeWidth={2} fill={`url(#grad-${g.id})`} name="balance" />
                      <Area type="monotone" dataKey="contributions" stroke="var(--fw-text-3)" strokeWidth={1} strokeDasharray="3 3" fill="none" name="contributions" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--fw-border)]">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Projected balance</div>
                    <div className="text-[13px] font-semibold tnum">{fmt(g.projectedBalanceCents, { compact: true })}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Investment gains</div>
                    <div className="text-[13px] font-semibold tnum text-[var(--fw-positive)]">+{fmt(g.projectedGainsCents, { compact: true })}</div>
                  </div>
                </div>
              </Card>
            )
          })}
          {goalsProjection.length === 0 && <EmptyState icon={Target} title="No goals to project" description="Create savings goals to see compound growth projections and Monte Carlo simulations." />}
        </div>
      </div>

      {/* ─── Row 5: Savings Trajectory ─────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Savings Trajectory (6 months)</h2>
          </div>
          <span className="text-[10px] text-[var(--fw-text-3)]">
            Cumulative: <span className="font-mono tnum text-[var(--fw-text-2)] font-semibold">
              {fmt(savingsTrajectory[savingsTrajectory.length - 1]?.cumulative || 0, { compact: true })}
            </span>
          </span>
        </div>
        <div className="h-56 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={savingsTrajectory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.6} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} stroke="var(--fw-border)" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, { compact: true })} />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (typeof value !== 'number' || isNaN(value)) return ''
                  const label = name === 'cumulative' ? 'Cumulative savings' : name === 'income' ? 'Income' : name === 'spend' ? 'Spend' : 'Net'
                  return [fmt(value), label]
                }}
                contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '8px 12px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)', boxShadow: 'var(--fw-shadow-md)' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="income" fill="var(--fw-positive)" name="income" radius={[3, 3, 0, 0]} />
              <Bar dataKey="spend" fill="var(--fw-negative)" name="spend" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="cumulative" stroke="var(--fw-accent)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--fw-accent)' }} name="cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ─── Row 6: Spending Heatmap (365 days, GitHub-style) ──────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Spending Heatmap</h2>
            <span className="text-[10px] text-[var(--fw-text-3)] ml-1">Last 365 days</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--fw-text-3)]">
            <span>Less</span>
            <div className="h-3 w-3 rounded-[3px] bg-[var(--fw-surface-2)]" />
            <div className="h-3 w-3 rounded-[3px] bg-[var(--fw-accent)]" style={{ opacity: 0.3 }} />
            <div className="h-3 w-3 rounded-[3px] bg-[var(--fw-accent)]" style={{ opacity: 0.55 }} />
            <div className="h-3 w-3 rounded-[3px] bg-[var(--fw-accent)]" style={{ opacity: 0.8 }} />
            <div className="h-3 w-3 rounded-[3px] bg-[var(--fw-accent)]" />
            <span>More</span>
          </div>
        </div>
        <div className="overflow-x-auto fw-scroll pb-2">
          <div className="inline-grid grid-flow-col grid-rows-7 gap-[3px] min-w-[800px]">
            {data.heatmap.map((day: any, i: number) => {
              const opacity = day.level === 0 ? 0 : 0.25 + day.level * 0.2
              return (
                <div
                  key={i}
                  className="h-3 w-3 rounded-[3px] hover:ring-2 hover:ring-[var(--fw-accent)] hover:ring-offset-1 transition-all cursor-pointer"
                  style={{
                    backgroundColor: day.level === 0 ? 'var(--fw-surface-2)' : 'var(--fw-accent)',
                    opacity: day.level === 0 ? 1 : opacity,
                  }}
                  title={`${day.date}: ${fmt(day.spend)}`}
                />
              )
            })}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--fw-border)] grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">Active days</div>
            <div className="font-mono tnum font-semibold">{data.heatmap.filter((d: any) => d.level > 0).length}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">High-spend days</div>
            <div className="font-mono tnum font-semibold text-[var(--fw-negative)]">{data.heatmap.filter((d: any) => d.level === 4).length}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">Avg per active day</div>
            <div className="font-mono tnum font-semibold">
              {fmt(data.heatmap.filter((d: any) => d.level > 0).reduce((s: number, d: any) => s + d.spend, 0) / Math.max(1, data.heatmap.filter((d: any) => d.level > 0).length))}
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Row 7: 5-Year Monte Carlo + Financial Stress ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monte Carlo */}
        <Card className="p-5 border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-surface)] to-[var(--fw-accent-soft)] shadow-[var(--fw-shadow-md)] rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center">
                <Sparkle className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold">5-Year Monte Carlo</h2>
                <div className="text-[10px] text-[var(--fw-text-3)]">500 trials · 7% return · 15% volatility</div>
              </div>
            </div>
            <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]">
              {data.monteCarlo.successProbability}% success
            </span>
          </div>

          {/* Histogram */}
          <div className="h-40 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monteCarlo.histogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value: any, name: any) => [value, name === 'count' ? 'Trials' : name]}
                  contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '4px 8px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)' }}
                />
                <Bar dataKey="count" fill="var(--fw-accent)" radius={[3, 3, 0, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Percentile grid */}
          <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-[var(--fw-border)]">
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">P5</div>
              <div className="text-[12px] font-semibold tnum text-[var(--fw-negative)]">{fmt(data.monteCarlo.percentiles.p5, { compact: true })}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">P25</div>
              <div className="text-[12px] font-semibold tnum">{fmt(data.monteCarlo.percentiles.p25, { compact: true })}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-[var(--fw-accent)] font-semibold mb-0.5">Median</div>
              <div className="text-[13px] font-bold tnum text-[var(--fw-accent)]">{fmt(data.monteCarlo.percentiles.p50, { compact: true })}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">P75</div>
              <div className="text-[12px] font-semibold tnum">{fmt(data.monteCarlo.percentiles.p75, { compact: true })}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-0.5">P95</div>
              <div className="text-[12px] font-semibold tnum text-[var(--fw-positive)]">{fmt(data.monteCarlo.percentiles.p95, { compact: true })}</div>
            </div>
          </div>
        </Card>

        {/* Financial Stress Index */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${
                data.financialStress.level === 'Low' ? 'text-[var(--fw-positive)]' :
                data.financialStress.level === 'Moderate' ? 'text-[var(--fw-warning)]' :
                'text-[var(--fw-negative)]'
              }`} />
              <h2 className="text-[14px] font-semibold">Financial Stress Index</h2>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
              data.financialStress.level === 'Low' ? 'bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]' :
              data.financialStress.level === 'Moderate' ? 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]' :
              'bg-[var(--fw-negative-soft)] text-[var(--fw-negative)] border border-[var(--fw-negative-border)]'
            }`}>
              {data.financialStress.level}
            </span>
          </div>

          {/* Score gauge */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative h-20 w-20 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%" outerRadius="100%"
                  data={[{
                    value: data.financialStress.score,
                    fill: data.financialStress.level === 'Low' ? 'var(--fw-positive)' : data.financialStress.level === 'Moderate' ? 'var(--fw-warning)' : 'var(--fw-negative)'
                  }]}
                  startAngle={90} endAngle={90 - (data.financialStress.score / 100) * 360}
                >
                  <RadialBar background={{ fill: 'var(--fw-surface-2)' }} dataKey="value" cornerRadius={10} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center text-[18px] font-bold tnum">
                {data.financialStress.score}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-[var(--fw-text-2)] leading-relaxed">
                {data.financialStress.level === 'Low'
                  ? 'Your financial situation is stable with minimal risk factors. Continue your current savings discipline.'
                  : data.financialStress.level === 'Moderate'
                  ? 'Some risk factors present. Review the contributing factors below to identify areas to address.'
                  : data.financialStress.level === 'Elevated'
                  ? 'Multiple stress factors detected. Focus on the highest-contributing factors to reduce risk.'
                  : 'Critical stress level — immediate action recommended on the top contributing factors.'}
              </div>
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="space-y-2">
            {data.financialStress.factors.map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-28 text-[11px] font-medium text-[var(--fw-text-2)] truncate">{f.label}</div>
                <div className="flex-1 h-1.5 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${f.contribution > 15 ? 'bg-[var(--fw-negative)]' : f.contribution > 5 ? 'bg-[var(--fw-warning)]' : 'bg-[var(--fw-positive)]'}`}
                    style={{ width: `${Math.min(100, (f.contribution / 30) * 100)}%` }}
                  />
                </div>
                <div className="w-12 text-right text-[10px] font-mono tnum text-[var(--fw-text-2)]">+{f.contribution}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ─── Row 8: Goal Optimizer + Seasonal Decomp + HHI ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Goal Optimizer */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="h-4 w-4 text-[var(--fw-accent)]" />
            <h2 className="text-[14px] font-semibold">Goal Optimizer</h2>
            <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">
              LP
            </span>
          </div>
          <p className="text-[10px] text-[var(--fw-text-3)] mb-3">{data.goalOptimizer.strategy}</p>

          <div className="space-y-2.5">
            {data.goalOptimizer.allocations.map((g: any) => (
              <div key={g.id} className="p-2.5 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium truncate">{g.name}</span>
                  {g.improvementDays > 0 && (
                    <span className="text-[10px] font-mono tnum text-[var(--fw-positive)] font-semibold flex-shrink-0">
                      -{g.improvementDays}d
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <div className="text-[var(--fw-text-3)] mb-0.5">Current</div>
                    <div className="font-mono tnum text-[var(--fw-text-2)]">{fmt(g.currentAllocation)}/mo</div>
                    <div className="text-[9px] text-[var(--fw-text-3)] mt-0.5">{g.monthsToComplete} mo</div>
                  </div>
                  <div>
                    <div className="text-[var(--fw-accent)] mb-0.5">Optimal</div>
                    <div className="font-mono tnum text-[var(--fw-accent)] font-semibold">{fmt(g.optimalAllocation)}/mo</div>
                    <div className="text-[9px] text-[var(--fw-text-3)] mt-0.5">{g.optimalMonthsToComplete} mo</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Seasonal Decomposition */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Seasonal Decomposition</h2>
            <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)] uppercase tracking-wider">
              7d period
            </span>
          </div>
          <p className="text-[10px] text-[var(--fw-text-3)] mb-3">Trend + Seasonal + Residual (additive model)</p>

          <div className="h-48 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.seasonalDecomposition}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, { compact: true })} width={36} />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (typeof value !== 'number' || isNaN(value)) return ''
                    const labels: Record<string, string> = { observed: 'Observed', trend: 'Trend', seasonal: 'Seasonal', residual: 'Residual' }
                    return [fmt(value), labels[name] || name]
                  }}
                  contentStyle={{ fontSize: '10px', borderRadius: '6px', padding: '6px 8px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="observed" stroke="var(--fw-text-3)" strokeWidth={1} dot={false} name="observed" />
                <Line type="monotone" dataKey="trend" stroke="var(--fw-accent)" strokeWidth={2} dot={false} name="trend" />
                <Line type="monotone" dataKey="seasonal" stroke="var(--fw-warning)" strokeWidth={1.5} dot={false} name="seasonal" />
                <Line type="monotone" dataKey="residual" stroke="var(--fw-text-4)" strokeWidth={1} strokeDasharray="3 3" dot={false} name="residual" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Merchant Concentration */}
        <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[14px] font-semibold">Merchant Concentration</h2>
            <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)] uppercase tracking-wider">
              HHI
            </span>
          </div>
          <p className="text-[10px] text-[var(--fw-text-3)] mb-3">Herfindahl-Hirschman Index</p>

          {/* HHI score */}
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[26px] font-bold tnum" style={{
              color: data.merchantConcentration.hhi < 1500 ? 'var(--fw-positive)' : data.merchantConcentration.hhi < 2500 ? 'var(--fw-warning)' : 'var(--fw-negative)'
            }}>
              {data.merchantConcentration.hhi}
            </span>
            <span className="text-[10px] text-[var(--fw-text-3)]">/ 10000</span>
          </div>
          <div className="text-[11px] text-[var(--fw-text-2)] mb-3 leading-relaxed">{data.merchantConcentration.interpretation}</div>

          {/* Concentration bar */}
          <div className="h-2 bg-[var(--fw-surface-2)] rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full ${data.merchantConcentration.hhi < 1500 ? 'bg-[var(--fw-positive)]' : data.merchantConcentration.hhi < 2500 ? 'bg-[var(--fw-warning)]' : 'bg-[var(--fw-negative)]'}`}
              style={{ width: `${Math.min(100, (data.merchantConcentration.hhi / 5000) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-[var(--fw-text-4)] mb-3">
            <span>0</span><span>1500</span><span>2500</span><span>5000+</span>
          </div>

          {/* Top merchants */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Top merchants</div>
            {data.merchantConcentration.topMerchants.map((m: any) => (
              <div key={m.rank} className="flex items-center gap-2 text-[11px]">
                <span className="w-4 text-[var(--fw-text-3)] font-mono">{m.rank}</span>
                <span className="flex-1 truncate text-[var(--fw-text-2)]">{m.merchant}</span>
                <span className="font-mono tnum text-[var(--fw-text-2)] font-medium">{m.share}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Assumptions footer */}
      <Card className="p-4 bg-[var(--fw-surface-2)] border-[var(--fw-border)] rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-3.5 w-3.5 text-[var(--fw-text-3)]" />
          <span className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Model Assumptions</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <div>
            <div className="text-[var(--fw-text-3)]">Investment return</div>
            <div className="font-mono tnum text-[var(--fw-text-2)] font-medium">{(assumptions.investmentReturnRate * 100).toFixed(0)}% / yr</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">14-day forecast</div>
            <div className="font-mono tnum text-[var(--fw-text-2)] font-medium">Holt-Winters</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">5-yr Monte Carlo</div>
            <div className="font-mono tnum text-[var(--fw-text-2)] font-medium">{assumptions.monteCarloTrials} trials · {(assumptions.monteCarloVolatility * 100).toFixed(0)}% vol</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">Seasonal period</div>
            <div className="font-mono tnum text-[var(--fw-text-2)] font-medium">{assumptions.seasonalPeriod} days</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ═══ View: Planning (Debt Planner + Bills + Smart Insights) ════════════
function PlanningView({ debtData, billsData, smartInsights, loading, onRefresh, onNavigate }: {
  debtData: any
  billsData: any
  smartInsights: any
  loading: boolean
  onRefresh: () => void
  onNavigate: (view: View) => void
}) {
  const [debtStrategy, setDebtStrategy] = useState<'avalanche' | 'snowball'>('avalanche')
  const [exporting, setExporting] = useState(false)

  const handleExport = async (format: 'csv' | 'summary') => {
    setExporting(true)
    try {
      if (format === 'csv') {
        // Trigger browser download
        const a = document.createElement('a')
        a.href = '/api/export?format=csv&range=12m'
        a.download = `finwise-export-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast.success('CSV export downloaded')
      } else {
        const res = await fetch('/api/export?format=summary&range=12m', { credentials: 'include' })
        const d = await res.json()
        if (d.ok) {
          toast.success('Summary report generated', {
            description: `${d.totals.transactions} transactions · ${fmt(d.totals.incomeCents)} income · ${fmt(d.totals.spendCents)} spend`,
          })
        }
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setExporting(false)
    }
  }

  if (loading || !debtData || !billsData || !smartInsights) {
    return (
      <div className="p-10 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--fw-accent)]" />
          <div className="text-sm text-[var(--fw-text-3)]">Analyzing your financial situation...</div>
          <div className="text-[11px] text-[var(--fw-text-4)]">Computing debt payoff strategies, bill schedule, and smart insights</div>
        </div>
      </div>
    )
  }

  const strategy = debtStrategy === 'avalanche' ? debtData.avalanche : debtData.snowball
  const strategyOrder = debtStrategy === 'avalanche' ? debtData.avalancheOrder : debtData.snowballOrder

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="h-5 w-5 text-[var(--fw-accent)]" />
            <h1 className="text-[28px] font-semibold tracking-tight">Financial Planning</h1>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">
              Problem Solver
            </span>
          </div>
          <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
            Debt payoff strategies · Bill scheduling · Smart insights · Export tools
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting} className="h-8 text-xs rounded-lg border-[var(--fw-border)]">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('summary')} disabled={exporting} className="h-8 text-xs rounded-lg border-[var(--fw-border)]">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Summary
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 text-xs rounded-lg border-[var(--fw-border)]">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ─── Smart Insights Feed ────────────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-accent-soft)] via-[var(--fw-surface)] to-[var(--fw-surface)] shadow-[var(--fw-shadow-md)] rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)]">
              <Sparkle className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold">Smart Insights</h2>
              <div className="text-[10px] text-[var(--fw-text-3)]">AI-curated daily action items · {smartInsights.summary.total} insights</div>
            </div>
          </div>
          {smartInsights.summary.critical > 0 && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--fw-negative-soft)] text-[var(--fw-negative)] border border-[var(--fw-negative-border)] uppercase tracking-wider">
              {smartInsights.summary.critical} Critical
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {smartInsights.insights.map((ins: any, i: number) => (
            <InsightCard key={ins.id} insight={ins} onNavigate={onNavigate} />
          ))}
        </div>

        {smartInsights.summary.potentialImpactCents > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--fw-border)] flex items-center justify-between text-[11px]">
            <span className="text-[var(--fw-text-3)]">Total potential annual impact</span>
            <span className="font-mono tnum font-semibold text-[var(--fw-positive)]">
              +{fmt(smartInsights.summary.potentialImpactCents, { compact: true })}
            </span>
          </div>
        )}
      </Card>

      {/* ─── Debt Payoff Planner ────────────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[16px] font-semibold">Debt Payoff Planner</h2>
            <span className="text-[10px] text-[var(--fw-text-3)] ml-1">
              {debtData.debts.length} debts · {fmt(debtData.totalDebtCents, { compact: true })} total
            </span>
          </div>
          {/* Strategy toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <button
              onClick={() => setDebtStrategy('avalanche')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                debtStrategy === 'avalanche'
                  ? 'bg-[var(--fw-surface)] text-[var(--fw-accent)] shadow-[var(--fw-shadow-xs)]'
                  : 'text-[var(--fw-text-3)] hover:text-[var(--fw-text-2)]'
              }`}
            >
              Avalanche
            </button>
            <button
              onClick={() => setDebtStrategy('snowball')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                debtStrategy === 'snowball'
                  ? 'bg-[var(--fw-surface)] text-[var(--fw-accent)] shadow-[var(--fw-shadow-xs)]'
                  : 'text-[var(--fw-text-3)] hover:text-[var(--fw-text-2)]'
              }`}
            >
              Snowball
            </button>
          </div>
        </div>

        {/* Strategy explanation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          {/* Payoff summary */}
          <div className="lg:col-span-2 p-4 rounded-xl bg-gradient-to-br from-[var(--fw-surface-2)] to-[var(--fw-surface)] border border-[var(--fw-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">
              {debtStrategy === 'avalanche' ? 'Avalanche Strategy' : 'Snowball Strategy'} — Projected Payoff
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] mb-1">Time to payoff</div>
                <div className="text-[20px] font-semibold tnum text-[var(--fw-accent)]">{strategy.yearsToPayoff} yr</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">{strategy.monthsToPayoff} months</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] mb-1">Total interest</div>
                <div className="text-[20px] font-semibold tnum text-[var(--fw-negative)]">{fmt(strategy.totalInterestPaid, { compact: true })}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] mb-1">Total paid</div>
                <div className="text-[20px] font-semibold tnum">{fmt(strategy.totalPaid, { compact: true })}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] mb-1">Payoff date</div>
                <div className="text-[14px] font-semibold tnum">{strategy.payoffDate}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--fw-border)] flex items-start gap-2 text-[11px]">
              <Info className="h-3.5 w-3.5 text-[var(--fw-accent)] flex-shrink-0 mt-0.5" />
              <span className="text-[var(--fw-text-2)]">{debtData.comparison.reasoning}</span>
            </div>
          </div>

          {/* Comparison */}
          <div className="p-4 rounded-xl bg-[var(--fw-positive-soft)] border border-[var(--fw-positive-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-positive)] font-semibold mb-2">
              {debtData.comparison.recommended === debtStrategy ? '✓ Recommended' : 'Alternative strategy'}
            </div>
            {debtData.comparison.recommended === debtStrategy ? (
              <>
                <div className="text-[20px] font-semibold tnum text-[var(--fw-positive)] mb-1">
                  Save {fmt(debtData.comparison.interestSavingsCents, { compact: true })}
                </div>
                <div className="text-[11px] text-[var(--fw-text-2)]">
                  vs snowball strategy, plus save {debtData.comparison.timeSavingsMonths} months of payments.
                </div>
              </>
            ) : (
              <>
                <div className="text-[20px] font-semibold tnum mb-1">
                  {fmt(debtData.comparison.interestSavingsCents, { compact: true })} more
                </div>
                <div className="text-[11px] text-[var(--fw-text-2)]">
                  in interest vs the recommended {debtData.comparison.recommended} strategy.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payoff chart */}
        <div className="h-48 -mx-2 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={strategy.monthlyHistory}>
              <defs>
                <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--fw-negative)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--fw-negative)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--fw-warning)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--fw-warning)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--fw-border)" strokeOpacity={0.6} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => `M${v}`} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--fw-text-3)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, { compact: true })} />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (typeof value !== 'number' || isNaN(value)) return ''
                  return [fmt(value), name === 'totalBalance' ? 'Remaining balance' : 'Interest paid']
                }}
                contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '8px 12px', border: '1px solid var(--fw-border)', background: 'var(--fw-surface)' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="totalBalance" stroke="var(--fw-negative)" strokeWidth={2} fill="url(#debtGrad)" name="totalBalance" />
              <Area type="monotone" dataKey="totalInterestPaid" stroke="var(--fw-warning)" strokeWidth={1.5} fill="url(#interestGrad)" name="totalInterestPaid" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Debt list with payoff order */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">
            Payoff Order ({debtStrategy === 'avalanche' ? 'Highest APR first' : 'Smallest balance first'})
          </div>
          {strategyOrder.map((d: any) => (
            <div key={d.rank} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
              <div className="h-7 w-7 rounded-md bg-[var(--fw-accent)] text-white flex items-center justify-center text-[12px] font-bold flex-shrink-0">
                {d.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{d.name}</div>
                <div className="text-[10px] text-[var(--fw-text-3)] tnum">
                  Balance: {fmt(d.balanceCents)} · APR: {(d.apr * 100).toFixed(2)}% · Monthly interest: {fmt(d.monthlyInterestCents)}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] font-semibold tnum">{fmt(d.balanceCents, { compact: true })}</div>
                <div className="text-[10px] text-[var(--fw-negative)] tnum">{(d.apr * 100).toFixed(1)}% APR</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Bill Schedule ──────────────────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[var(--fw-text-2)]" />
            <h2 className="text-[16px] font-semibold">Bill Schedule</h2>
            <span className="text-[10px] text-[var(--fw-text-3)] ml-1">
              {billsData.summary.total} bills · Next 30 days: {fmt(billsData.summary.next30DaysTotalCents, { compact: true })}
            </span>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
            billsData.summary.status === 'covered' ? 'bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]' :
            billsData.summary.status === 'tight' ? 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]' :
            'bg-[var(--fw-negative-soft)] text-[var(--fw-negative)] border border-[var(--fw-negative-border)]'
          }`}>
            {billsData.summary.status === 'covered' ? '✓ Covered' : billsData.summary.status === 'tight' ? '⚠ Tight' : '✗ Shortfall'}
          </span>
        </div>

        {/* Coverage bar */}
        <div className="mb-4 p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-[var(--fw-text-2)] font-medium">Coverage ratio</span>
            <span className={`font-mono tnum font-semibold ${
              billsData.summary.coverageRatio >= 100 ? 'text-[var(--fw-positive)]' :
              billsData.summary.coverageRatio >= 50 ? 'text-[var(--fw-warning)]' : 'text-[var(--fw-negative)]'
            }`}>
              {billsData.summary.coverageRatio}%
            </span>
          </div>
          <div className="h-2 bg-[var(--fw-surface)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                billsData.summary.coverageRatio >= 100 ? 'bg-[var(--fw-positive)]' :
                billsData.summary.coverageRatio >= 50 ? 'bg-[var(--fw-warning)]' : 'bg-[var(--fw-negative)]'
              }`}
              style={{ width: `${Math.min(100, billsData.summary.coverageRatio)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--fw-text-3)] mt-2 tnum">
            <span>Available: {fmt(billsData.summary.availableCashCents)}</span>
            <span>Bills due: {fmt(billsData.summary.next30DaysTotalCents)}</span>
          </div>
        </div>

        {/* Bill groups */}
        <div className="space-y-3">
          {billsData.summary.overdue > 0 && (
            <BillGroup title="Overdue" bills={billsData.groups.overdue} variant="negative" />
          )}
          <BillGroup title="Due in 7 days" bills={billsData.groups.dueSoon} variant="warning" />
          <BillGroup title="Due in 30 days" bills={billsData.groups.dueLater} variant="default" />
          {billsData.groups.farOut.length > 0 && (
            <BillGroup title="Coming up" bills={billsData.groups.farOut} variant="muted" />
          )}
        </div>
      </Card>

      {/* ─── Quick Actions ──────────────────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface-2)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuickAction icon={Wallet} label="Adjust budgets" desc="Rebalance envelopes" onClick={() => onNavigate('budgets')} />
          <QuickAction icon={Target} label="Boost savings" desc="Increase goal contributions" onClick={() => onNavigate('goals')} />
          <QuickAction icon={Brain} label="View analytics" desc="Deep financial analysis" onClick={() => onNavigate('analytics')} />
          <QuickAction icon={ListFilter} label="Review transactions" desc="Check recent activity" onClick={() => onNavigate('transactions')} />
        </div>
      </Card>
    </div>
  )
}

function InsightCard({ insight, onNavigate }: { insight: any; onNavigate: (v: View) => void }) {
  const typeConfig = {
    warning: { icon: AlertCircle, color: 'var(--fw-warning)', bg: 'var(--fw-warning-soft)', border: 'var(--fw-warning-border)' },
    opportunity: { icon: TrendingUp, color: 'var(--fw-positive)', bg: 'var(--fw-positive-soft)', border: 'var(--fw-positive-border)' },
    achievement: { icon: CheckCircle2, color: 'var(--fw-positive)', bg: 'var(--fw-positive-soft)', border: 'var(--fw-positive-border)' },
    tip: { icon: Info, color: 'var(--fw-accent)', bg: 'var(--fw-accent-soft)', border: 'var(--fw-accent-border)' },
    anomaly: { icon: AlertTriangle, color: 'var(--fw-warning)', bg: 'var(--fw-warning-soft)', border: 'var(--fw-warning-border)' },
  }
  const priorityLabel = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
  const config = typeConfig[insight.type as keyof typeof typeConfig] || typeConfig.tip
  const Icon = config.icon

  return (
    <div className={`p-3 rounded-lg border bg-[var(--fw-surface)] hover:shadow-[var(--fw-shadow-sm)] transition-shadow`}>
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: config.bg, border: `1px solid ${config.border}` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-[12px] font-semibold leading-tight">{insight.title}</div>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
              insight.priority === 'critical' ? 'bg-[var(--fw-negative-soft)] text-[var(--fw-negative)] border border-[var(--fw-negative-border)]' :
              insight.priority === 'high' ? 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]' :
              'bg-[var(--fw-surface-2)] text-[var(--fw-text-3)] border border-[var(--fw-border)]'
            }`}>
              {priorityLabel[insight.priority as keyof typeof priorityLabel]}
            </span>
          </div>
          <div className="text-[11px] text-[var(--fw-text-2)] leading-relaxed mb-2">{insight.detail}</div>
          <div className="flex items-center justify-between gap-2">
            {insight.impactCents && insight.impactCents > 0 && (
              <span className="text-[10px] font-mono tnum font-semibold" style={{ color: config.color }}>
                {insight.type === 'warning' || insight.type === 'anomaly' ? '' : '+'}{fmt(insight.impactCents, { compact: true })}
                {insight.type === 'opportunity' || insight.type === 'achievement' ? '/yr' : ''}
              </span>
            )}
            {insight.actionTarget && (
              <button
                onClick={() => onNavigate(insight.actionTarget as View)}
                className="text-[10px] font-medium text-[var(--fw-accent)] hover:underline ml-auto flex items-center gap-0.5"
              >
                {insight.action}
                <ChevronRight className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BillGroup({ title, bills, variant }: { title: string; bills: any[]; variant: 'negative' | 'warning' | 'default' | 'muted' }) {
  if (bills.length === 0) return null
  const variantConfig = {
    negative: { dot: 'var(--fw-negative)', label: 'text-[var(--fw-negative)]' },
    warning: { dot: 'var(--fw-warning)', label: 'text-[var(--fw-warning)]' },
    default: { dot: 'var(--fw-accent)', label: 'text-[var(--fw-text-2)]' },
    muted: { dot: 'var(--fw-text-3)', label: 'text-[var(--fw-text-3)]' },
  }
  const cfg = variantConfig[variant]
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${cfg.label}`}>{title}</span>
        <span className="text-[10px] text-[var(--fw-text-3)]">({bills.length})</span>
      </div>
      <div className="space-y-1.5">
        {bills.map((b: any, i: number) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: b.color }}>
              <Receipt className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium truncate">{b.merchant}</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">
                {b.category} · {b.frequency} · Last paid: {new Date(b.lastPaid).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[12px] font-semibold tnum">{fmt(b.typicalAmountCents)}</div>
              <div className={`text-[10px] tnum ${b.daysUntilDue < 0 ? 'text-[var(--fw-negative)]' : b.daysUntilDue <= 7 ? 'text-[var(--fw-warning)]' : 'text-[var(--fw-text-3)]'}`}>
                {b.daysUntilDue < 0 ? `${Math.abs(b.daysUntilDue)}d overdue` : b.daysUntilDue === 0 ? 'Due today' : `in ${b.daysUntilDue}d`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickAction({ icon: Icon, label, desc, onClick }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)] hover:border-[var(--fw-accent-border)] hover:bg-[var(--fw-accent-soft)] transition-all text-left fw-focus"
    >
      <Icon className="h-4 w-4 text-[var(--fw-accent)] mb-2" />
      <div className="text-[12px] font-semibold mb-0.5">{label}</div>
      <div className="text-[10px] text-[var(--fw-text-3)]">{desc}</div>
    </button>
  )
}

// ═══ View: Innovation Lab ═════════════════════════════════════════════
function InnovationView({ data, loading, onRefresh }: {
  data: any
  loading: boolean
  onRefresh: () => void
}) {
  if (loading || !data) {
    return (
      <div className="p-10 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--fw-accent)]" />
          <div className="text-sm text-[var(--fw-text-3)]">Running innovation analysis...</div>
          <div className="text-[11px] text-[var(--fw-text-4)]">Computing personality DNA, future self projection, behavioral triggers, time-value, and goal collisions</div>
        </div>
      </div>
    )
  }

  const { personality, futureSelf, triggers, timeValue, goalCollisions, assumptions } = data

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Dna className="h-5 w-5 text-[var(--fw-accent)]" />
            <h1 className="text-[28px] font-semibold tracking-tight">Innovation Lab</h1>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white uppercase tracking-wider">
              Beta
            </span>
          </div>
          <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
            5 novel features you won't find anywhere else · Personality DNA · Future Self · Behavioral Triggers · Time-Value · Goal Collisions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 text-xs rounded-lg border-[var(--fw-border)]">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Recompute
        </Button>
      </div>

      {/* ─── 1. Financial Personality DNA ──────────────────────────── */}
      <Card className="p-6 border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-accent-soft)] via-[var(--fw-surface)] to-[var(--fw-surface)] shadow-[var(--fw-shadow-md)] rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Dna className="h-5 w-5 text-[var(--fw-accent)]" />
          <h2 className="text-[16px] font-semibold">Financial Personality DNA</h2>
          <span className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">
            AI Cluster
          </span>
        </div>
        <p className="text-[11px] text-[var(--fw-text-3)] mb-5">Your spending patterns reveal your financial archetype</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* Personality hero */}
          <div className="flex flex-col items-center text-center">
            <div className="relative h-32 w-32 rounded-full bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)] mb-4">
              <span className="text-[56px]">{personality.emoji}</span>
            </div>
            <div className="text-[20px] font-semibold tracking-tight">{personality.type}</div>
            <div className="text-[11px] text-[var(--fw-text-3)] mt-1">Matched {personality.matchedTraits.length} key traits</div>
          </div>

          {/* Description + traits */}
          <div className="lg:col-span-2">
            <p className="text-[13px] text-[var(--fw-text-2)] leading-relaxed mb-4">{personality.description}</p>

            {/* Trait bars */}
            <div className="space-y-2.5 mb-4">
              {personality.traits.map((t: any) => (
                <div key={t.label} className="flex items-center gap-3">
                  <div className="w-24 text-[11px] font-medium text-[var(--fw-text-2)]">{t.label}</div>
                  <div className="flex-1 h-2 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] transition-all"
                      style={{ width: `${t.value}%` }}
                    />
                  </div>
                  <div className="w-10 text-right text-[11px] font-mono tnum font-semibold">{t.value}</div>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">Personalized recommendations</div>
              <div className="space-y-1.5">
                {personality.recommendations.map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--fw-text-2)]">
                    <SparklesIcon className="h-3 w-3 text-[var(--fw-accent)] flex-shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 2. Future Self Simulator ──────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-[var(--fw-accent)]" />
            <h2 className="text-[16px] font-semibold">Future Self Simulator</h2>
            <span className="text-[10px] text-[var(--fw-text-3)] ml-1">
              Starting age {futureSelf.currentAge} · {fmt(futureSelf.currentSavingsCents, { compact: true })} net worth today
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)]">
              FIRE: {futureSelf.fireProgress}%
            </span>
          </div>
        </div>

        {/* FIRE progress bar */}
        <div className="mb-4 p-3 rounded-lg bg-gradient-to-br from-[var(--fw-surface-2)] to-[var(--fw-surface)] border border-[var(--fw-border)]">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-[var(--fw-text-2)] font-medium">FIRE number (25× annual expenses)</span>
            <span className="font-mono tnum text-[var(--fw-text-2)]">{fmt(futureSelf.fireNumberCents, { compact: true })}</span>
          </div>
          <div className="h-2 bg-[var(--fw-surface-2)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-positive)] transition-all"
              style={{ width: `${Math.min(100, futureSelf.fireProgress)}%` }}
            />
          </div>
          <div className="text-[10px] text-[var(--fw-text-3)] mt-1.5">{futureSelf.fireProgress}% of the way to financial independence</div>
        </div>

        {/* Milestones grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {futureSelf.milestones.map((m: any) => (
            <div
              key={m.age}
              className={`p-3 rounded-lg border ${
                m.retirementReady
                  ? 'bg-[var(--fw-positive-soft)] border-[var(--fw-positive-border)]'
                  : 'bg-[var(--fw-surface-2)] border-[var(--fw-border)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Age {m.age}</span>
                {m.retirementReady && <Award className="h-3 w-3 text-[var(--fw-positive)]" />}
              </div>
              <div className="text-[16px] font-semibold tnum mb-1">{fmt(m.netWorthCents, { compact: true })}</div>
              <div className="text-[10px] text-[var(--fw-text-3)] mb-2">
                Passive: <span className="font-mono tnum">{fmt(m.annualPassiveIncomeCents, { compact: true })}/yr</span>
              </div>
              <div className="text-[10px] text-[var(--fw-text-2)] leading-tight">{m.lifestyle}</div>
              {m.yearsToFire && (
                <div className="mt-2 text-[10px] font-semibold text-[var(--fw-positive)] flex items-center gap-1">
                  <Award className="h-2.5 w-2.5" />
                  FIRE reached in {m.yearsToFire} years
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[10px] text-[var(--fw-text-4)] font-mono">
          Assumptions: {(assumptions.annualReturn * 100).toFixed(0)}% annual return · {(assumptions.inflationRate * 100).toFixed(1)}% inflation · {assumptions.fireRule}
        </div>
      </Card>

      {/* ─── 3. Behavioral Trigger Detection ───────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[16px] font-semibold">Behavioral Trigger Detection</h2>
          <span className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-md bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">
            Pattern Mining
          </span>
        </div>
        <p className="text-[11px] text-[var(--fw-text-3)] mb-4">Hidden patterns in your spending behavior — auto-discovered from {assumptions.analysisWindow} of data</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {triggers.triggers.length === 0 ? (
            <div className="col-span-2 text-center py-8 text-[var(--fw-text-3)] text-xs">
              No significant behavioral patterns detected in current data
            </div>
          ) : (
            triggers.triggers.map((t: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)] hover:border-[var(--fw-accent-border)] transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-[12px] font-semibold">{t.pattern}</div>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)] flex-shrink-0">
                    {t.confidence}% conf
                  </span>
                </div>
                <div className="text-[11px] text-[var(--fw-text-2)] leading-relaxed mb-2">{t.description}</div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--fw-text-3)]">{t.samples} samples</span>
                  {t.impact > 0 && (
                    <span className="font-mono tnum text-[var(--fw-negative)] font-semibold">${t.impact}/yr impact</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* ─── 4. Time-Value Calculator ──────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl fw-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--fw-accent)]" />
            <h2 className="text-[16px] font-semibold">Time-Value Calculator</h2>
            <span className="text-[10px] text-[var(--fw-text-3)] ml-1">
              Hourly rate: {fmt(timeValue.hourlyRateCents)}/hr · Based on 160 hrs/month
            </span>
          </div>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Top 8 purchases = work hours</div>
            <div className="text-[20px] font-semibold tnum">{Math.round(timeValue.totalHoursWorked)} hrs</div>
            <div className="text-[10px] text-[var(--fw-text-3)]">{Math.round(timeValue.totalHoursWorked / 8)} work days</div>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-[var(--fw-accent-soft)] to-[var(--fw-surface)] border border-[var(--fw-accent-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-accent)] font-semibold mb-1">30-yr opportunity cost</div>
            <div className="text-[20px] font-semibold tnum text-[var(--fw-accent)]">{fmt(timeValue.totalOpportunityCost30yrCents, { compact: true })}</div>
            <div className="text-[10px] text-[var(--fw-text-3)]">If invested at 7% instead</div>
          </div>
        </div>

        {/* Top purchases list */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">Your biggest purchases — translated</div>
          {timeValue.topPurchases.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
              <div className="h-7 w-7 rounded-md bg-[var(--fw-text)] text-[var(--fw-surface)] flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                #{i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{p.merchant}</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">
                  {p.category} · {fmt(p.amountCents)} = <span className="text-[var(--fw-text-2)] font-medium">{p.hoursWorked} hrs of work</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] font-mono tnum font-semibold text-[var(--fw-accent)]">{fmt(p.opportunityCost30yrCents, { compact: true })}</div>
                <div className="text-[9px] text-[var(--fw-text-3)]">in 30 years</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── 5. Goal Collision Detector ────────────────────────────── */}
      <Card className={`p-5 border shadow-[var(--fw-shadow-sm)] rounded-xl fw-card ${
        goalCollisions.deficitCents > 0
          ? 'border-[var(--fw-warning-border)] bg-gradient-to-br from-[var(--fw-warning-soft)] to-[var(--fw-surface)]'
          : 'border-[var(--fw-positive-border)] bg-gradient-to-br from-[var(--fw-positive-soft)] to-[var(--fw-surface)]'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className={`h-4 w-4 ${goalCollisions.deficitCents > 0 ? 'text-[var(--fw-warning)]' : 'text-[var(--fw-positive)]'}`} />
          <h2 className="text-[16px] font-semibold">Goal Collision Detector</h2>
          <span className={`ml-auto text-[10px] font-semibold px-2 py-1 rounded-md uppercase tracking-wider ${
            goalCollisions.deficitCents > 0
              ? 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning)] border border-[var(--fw-warning-border)]'
              : 'bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)]'
          }`}>
            {goalCollisions.deficitCents > 0 ? 'Conflict detected' : 'No conflicts'}
          </span>
        </div>
        <p className="text-[11px] text-[var(--fw-text-3)] mb-4">Constraint solver that detects when goals compete for the same cash</p>

        {/* Demand vs Available */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Total demand</div>
            <div className="text-[16px] font-semibold tnum">{fmt(goalCollisions.totalDemandCents, { compact: true })}/mo</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">Available</div>
            <div className="text-[16px] font-semibold tnum">{fmt(goalCollisions.availableCents, { compact: true })}/mo</div>
          </div>
          <div className={`p-3 rounded-lg border ${
            goalCollisions.deficitCents > 0
              ? 'bg-[var(--fw-negative-soft)] border-[var(--fw-negative-border)]'
              : 'bg-[var(--fw-positive-soft)] border-[var(--fw-positive-border)]'
          }`}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1">
              {goalCollisions.deficitCents > 0 ? 'Deficit' : 'Surplus'}
            </div>
            <div className={`text-[16px] font-semibold tnum ${goalCollisions.deficitCents > 0 ? 'text-[var(--fw-negative)]' : 'text-[var(--fw-positive)]'}`}>
              {fmt(Math.abs(goalCollisions.deficitCents), { compact: true })}/mo
            </div>
          </div>
        </div>

        {/* Recommendation banner */}
        <div className="mb-4 p-3 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)] flex items-start gap-2">
          <Info className="h-4 w-4 text-[var(--fw-accent)] flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-[var(--fw-text-2)]">{goalCollisions.recommendation}</div>
        </div>

        {/* Collisions list */}
        {goalCollisions.collisions.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-2">
              {goalCollisions.collisions.length} goal conflicts detected
            </div>
            {goalCollisions.collisions.map((c: any, i: number) => (
              <div key={i} className={`p-3 rounded-lg border ${
                c.severity === 'high' ? 'bg-[var(--fw-negative-soft)] border-[var(--fw-negative-border)]' :
                c.severity === 'medium' ? 'bg-[var(--fw-warning-soft)] border-[var(--fw-warning-border)]' :
                'bg-[var(--fw-surface-2)] border-[var(--fw-border)]'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12px] font-semibold flex items-center gap-2">
                    <span>{c.goalA}</span>
                    <GitBranch className="h-3 w-3 text-[var(--fw-text-3)]" />
                    <span>{c.goalB}</span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    c.severity === 'high' ? 'bg-[var(--fw-negative)] text-white' :
                    c.severity === 'medium' ? 'bg-[var(--fw-warning)] text-white' :
                    'bg-[var(--fw-text-3)] text-white'
                  }`}>
                    {c.severity}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--fw-text-2)] mb-2 leading-relaxed">{c.conflict}</div>
                <div className="text-[11px] text-[var(--fw-accent)] font-medium flex items-start gap-1.5">
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>{c.resolution}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Assumptions */}
      <Card className="p-4 bg-[var(--fw-surface-2)] border-[var(--fw-border)] rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-3.5 w-3.5 text-[var(--fw-text-3)]" />
          <span className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Innovation Lab Assumptions</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <div>
            <div className="text-[var(--fw-text-3)]">Annual return</div>
            <div className="font-mono tnum text-[var(--fw-text-2)] font-medium">{(assumptions.annualReturn * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">Inflation</div>
            <div className="font-mono tnum text-[var(--fw-text-2)] font-medium">{(assumptions.inflationRate * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">FIRE rule</div>
            <div className="font-mono text-[var(--fw-text-2)] font-medium">4% SWR</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">Analysis window</div>
            <div className="font-mono text-[var(--fw-text-2)] font-medium">6 months</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ═══ View: Settings ═══════════════════════════════════════════════════
function SettingsView({ data, loading, onRefresh, onUpdate, tier, setTier, privacyMode, setPrivacyMode, currencyInfo }: {
  data: any
  loading: boolean
  onRefresh: () => void
  onUpdate: (updates: any) => Promise<boolean>
  tier: Tier
  setTier: (t: Tier) => void
  privacyMode: boolean
  setPrivacyMode: (v: boolean) => void
  currencyInfo: any
}) {
  const [localName, setLocalName] = useState<string | null>(null)

  if (loading || !data) {
    return (
      <div className="p-10 flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--fw-accent)]" />
      </div>
    )
  }

  const s = data.settings || {}
  // Use localName if user has typed, otherwise fall back to settings value
  const displayName = localName !== null ? localName : (s.displayName || '')

  const handleSaveName = async () => {
    await onUpdate({ displayName: displayName, name: displayName })
    setLocalName(null) // reset to use settings value after save
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1000px]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-5 w-5 text-[var(--fw-accent)]" />
          <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
        </div>
        <p className="text-[13px] text-[var(--fw-text-3)] mt-1">
          Manage your profile, appearance, notifications, agent behavior, and data
        </p>
      </div>

      {/* ─── Profile Section ─────────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <UserIcon className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Profile</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Display Name</label>
            <div className="flex gap-2">
              <Input
                value={displayName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Your name"
                className="h-9 text-[13px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg"
              />
              <Button size="sm" className="h-9 px-3 bg-[var(--fw-text)] hover:bg-[var(--fw-text-2)] text-[var(--fw-surface)] rounded-lg" onClick={handleSaveName}>
                Save
              </Button>
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Email</label>
            <Input
              value={data.user?.email || ''}
              disabled
              className="h-9 text-[13px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg opacity-60"
            />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--fw-border)] flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">Avatar Color</span>
            <div className="flex gap-1.5">
              {['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444'].map(c => (
                <button
                  key={c}
                  onClick={() => onUpdate({ avatarColor: c })}
                  className={`h-7 w-7 rounded-full transition-all ${s.avatarColor === c ? 'ring-2 ring-offset-2 ring-[var(--fw-text)]' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Appearance Section ──────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Appearance</h2>
        </div>
        <div className="space-y-4">
          {/* Theme toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div className="flex items-center gap-2.5">
              {s.theme === 'dark' ? <Moon className="h-4 w-4 text-[var(--fw-accent)]" /> : <Sun className="h-4 w-4 text-[var(--fw-warning)]" />}
              <div>
                <div className="text-[12px] font-medium">Theme</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">Switch between light and dark mode</div>
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--fw-surface)] border border-[var(--fw-border)]">
              <button
                onClick={() => onUpdate({ theme: 'light' })}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${s.theme !== 'dark' ? 'bg-[var(--fw-accent)] text-white' : 'text-[var(--fw-text-3)]'}`}
              >
                <Sun className="h-3 w-3 inline mr-1" /> Light
              </button>
              <button
                onClick={() => onUpdate({ theme: 'dark' })}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${s.theme === 'dark' ? 'bg-[var(--fw-accent)] text-white' : 'text-[var(--fw-text-3)]'}`}
              >
                <Moon className="h-3 w-3 inline mr-1" /> Dark
              </button>
            </div>
          </div>

          {/* Density */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div className="flex items-center gap-2.5">
              <Sliders className="h-4 w-4 text-[var(--fw-text-3)]" />
              <div>
                <div className="text-[12px] font-medium">Layout Density</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">Adjust spacing between elements</div>
              </div>
            </div>
            <Select value={s.density || 'comfortable'} onValueChange={(v) => onUpdate({ density: v })}>
              <SelectTrigger className="w-[130px] h-8 text-[11px] border-[var(--fw-border)] bg-[var(--fw-surface)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ─── Localization Section ────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Localization</h2>
          {currencyInfo && (
            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--fw-positive-soft)] text-[var(--fw-positive)] border border-[var(--fw-positive-border)] uppercase tracking-wider flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--fw-positive)] fw-pulse" />
              Live Rates
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">
              Currency {currencyInfo && currencyInfo.target !== 'USD' && (
                <span className="text-[var(--fw-accent)] ml-1 normal-case tracking-normal">
                  · 1 USD = {currencyInfo.meta.symbol}{currencyInfo.rate.toFixed(currencyInfo.meta.decimals === 0 ? 0 : 2)} {currencyInfo.target}
                </span>
              )}
            </label>
            <Select value={s.currency || 'USD'} onValueChange={(v) => onUpdate({ currency: v })}>
              <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(currencyInfo?.supportedCurrencies || [
                  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1, decimals: 2 },
                ]).map((c: any) => (
                  <SelectItem key={c.code} value={c.code}>
                    <div className="flex items-center justify-between w-full gap-3">
                      <span className="truncate">{c.symbol} {c.code} — {c.name}</span>
                      {c.rate && c.code !== 'USD' && (
                        <span className="text-[10px] text-[var(--fw-text-3)] font-mono ml-auto flex-shrink-0">
                          1$={c.symbol}{c.rate.toFixed(c.decimals === 0 ? 0 : 2)}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[10px] text-[var(--fw-text-3)] mt-1.5 flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {currencyInfo?.totalCurrencies ? `${currencyInfo.totalCurrencies} world currencies · ` : ''}All amounts auto-convert using live exchange rates
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Date Format</label>
            <Select value={s.dateFormat || 'MMM d, yyyy'} onValueChange={(v) => onUpdate({ dateFormat: v })}>
              <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MMM d, yyyy">Jan 15, 2026</SelectItem>
                <SelectItem value="DD/MM/YYYY">15/01/2026</SelectItem>
                <SelectItem value="YYYY-MM-DD">2026-01-15</SelectItem>
                <SelectItem value="d MMM yyyy">15 Jan 2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Number Format</label>
            <Select value={s.numberFormat || 'en-US'} onValueChange={(v) => onUpdate({ numberFormat: v })}>
              <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">1,234.56 (US)</SelectItem>
                <SelectItem value="de-DE">1.234,56 (EU)</SelectItem>
                <SelectItem value="ja-JP">1,234.56 (JP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">First Day of Week</label>
            <Select value={String(s.firstDayOfWeek ?? 0)} onValueChange={(v) => onUpdate({ firstDayOfWeek: parseInt(v) })}>
              <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
                <SelectItem value="6">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ─── Notifications Section ───────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Notifications</h2>
          <span className="ml-auto text-[10px] text-[var(--fw-text-3)]">Choose what you want to be notified about</span>
        </div>
        <div className="space-y-1">
          {[
            { key: 'notifInsights', label: 'Smart Insights', desc: 'AI-curated daily action items and opportunities' },
            { key: 'notifBills', label: 'Bill Reminders', desc: 'Upcoming bills and coverage warnings' },
            { key: 'notifAnomalies', label: 'Anomaly Alerts', desc: 'Unusual transactions flagged by Isolation Forest' },
            { key: 'notifRecommendations', label: 'Recommendations', desc: 'New actionable recommendations with dollar impact' },
            { key: 'notifBudgetAlerts', label: 'Budget Alerts', desc: 'Notifications when categories exceed budget thresholds' },
            { key: 'notifWeeklyDigest', label: 'Weekly Digest', desc: 'Weekly summary email with spending trends and health score' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--fw-surface-2)] transition-colors">
              <div>
                <div className="text-[12px] font-medium">{item.label}</div>
                <div className="text-[10px] text-[var(--fw-text-3)]">{item.desc}</div>
              </div>
              <Switch
                checked={s[item.key] ?? true}
                onCheckedChange={(v) => onUpdate({ [item.key]: v })}
                className="data-[state=checked]:bg-[var(--fw-accent)]"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Agent Configuration ─────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Agent Configuration</h2>
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">AI</span>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Response Style</label>
              <Select value={s.agentResponseStyle || 'professional'} onValueChange={(v) => onUpdate({ agentResponseStyle: v })}>
                <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional — analytical and concise</SelectItem>
                  <SelectItem value="casual">Casual — friendly and conversational</SelectItem>
                  <SelectItem value="detailed">Detailed — thorough with explanations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Default Mode</label>
              <Select value={s.agentDefaultMode || 'auto'} onValueChange={(v) => onUpdate({ agentDefaultMode: v })}>
                <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto — let the agent decide</SelectItem>
                  <SelectItem value="quick_qa">Quick Q&A — fast single-shot answers</SelectItem>
                  <SelectItem value="monthly_review">Monthly Review — always deep analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div>
              <div className="text-[12px] font-medium">Auto-refresh dashboard after writes</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">Automatically reload data when the agent modifies transactions, budgets, or goals</div>
            </div>
            <Switch
              checked={s.agentAutoRefresh ?? true}
              onCheckedChange={(v) => onUpdate({ agentAutoRefresh: v })}
              className="data-[state=checked]:bg-[var(--fw-accent)]"
            />
          </div>

          <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div>
              <div className="text-[12px] font-medium">Confirm write operations</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">Ask for confirmation before the agent adds, edits, or deletes data</div>
            </div>
            <Switch
              checked={s.agentConfirmWrites ?? false}
              onCheckedChange={(v) => onUpdate({ agentConfirmWrites: v })}
              className="data-[state=checked]:bg-[var(--fw-accent)]"
            />
          </div>
        </div>
      </Card>

      {/* ─── LLM Provider Configuration ──────────────────────── */}
      <Card className="p-5 border-[var(--fw-accent-border)] bg-gradient-to-br from-[var(--fw-surface)] to-[var(--fw-accent-soft)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">LLM Provider</h2>
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--fw-accent-soft)] text-[var(--fw-accent)] border border-[var(--fw-accent-border)] uppercase tracking-wider">Advanced</span>
        </div>
        <p className="text-[11px] text-[var(--fw-text-3)] mb-4">Choose which model rewrites agent answers. If the provider is unavailable, FinWise answers from database tools instead.</p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Provider</label>
            <Select value={s.llmProvider || 'zai'} onValueChange={(v) => onUpdate({ llmProvider: v })}>
              <SelectTrigger className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zai">Free AI Copilot (no API key required)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT-4o, GPT-4, etc.)</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude 3.5 Sonnet, etc.)</SelectItem>
                <SelectItem value="custom">Custom (Ollama, LM Studio, any OpenAI-compatible)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {s.llmProvider && s.llmProvider !== 'zai' && (
            <>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">API Key</label>
                <Input
                  type="password"
                  value={s.llmApiKey || ''}
                  onChange={(e) => onUpdate({ llmApiKey: e.target.value })}
                  placeholder={s.llmProvider === 'openai' ? 'sk-...' : s.llmProvider === 'anthropic' ? 'sk-ant-...' : 'your-api-key'}
                  className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Model {s.llmProvider === 'zai' ? '(auto-selected)' : '(optional — leave empty for default)'}</label>
                <Input
                  value={s.llmModel || ''}
                  onChange={(e) => onUpdate({ llmModel: e.target.value })}
                  placeholder={s.llmProvider === 'openai' ? 'gpt-4o' : s.llmProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : s.llmProvider === 'custom' ? 'llama3.1' : ''}
                  className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg"
                />
              </div>
              {s.llmProvider === 'custom' && (
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Base URL (OpenAI-compatible endpoint)</label>
                  <Input
                    value={s.llmBaseUrl || ''}
                    onChange={(e) => onUpdate({ llmBaseUrl: e.target.value })}
                    placeholder="http://localhost:11434/v1"
                    className="h-9 text-[12px] border-[var(--fw-border)] bg-[var(--fw-surface-2)] rounded-lg"
                  />
                  <div className="text-[10px] text-[var(--fw-text-3)] mt-1">Works with Ollama, LM Studio, vLLM, LocalAI, or any OpenAI-compatible API</div>
                </div>
              )}
            </>
          )}
          {(!s.llmProvider || s.llmProvider === 'zai') && (
            <div className="p-3 rounded-lg bg-[var(--fw-positive-soft)] border border-[var(--fw-positive-border)]">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--fw-positive)] flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-[var(--fw-text-2)] leading-relaxed">
                  Using <strong>Free AI Copilot</strong> — no API key required. You can switch to OpenAI, Anthropic, or a custom model (Ollama) at any time.
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ─── Analytics Parameters ─────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Analytics Parameters</h2>
          <span className="ml-auto text-[10px] text-[var(--fw-text-3)]">Adjust assumptions used in projections</span>
        </div>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[12px] font-medium text-[var(--fw-text-2)]">Expected annual investment return</label>
              <span className="text-[13px] font-mono tnum font-semibold text-[var(--fw-accent)]">{((s.analyticsReturnRate ?? 0.07) * 100).toFixed(1)}%</span>
            </div>
            <Slider
              value={[Math.round((s.analyticsReturnRate ?? 0.07) * 1000)]}
              onValueChange={(v) => onUpdate({ analyticsReturnRate: v[0] / 1000 })}
              min={0}
              max={150}
              step={5}
              className="py-2"
            />
            <div className="flex justify-between text-[10px] text-[var(--fw-text-4)] mt-1">
              <span>0%</span><span>7.5%</span><span>15%</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[12px] font-medium text-[var(--fw-text-2)]">Inflation rate</label>
              <span className="text-[13px] font-mono tnum font-semibold text-[var(--fw-accent)]">{((s.analyticsInflation ?? 0.025) * 100).toFixed(1)}%</span>
            </div>
            <Slider
              value={[Math.round((s.analyticsInflation ?? 0.025) * 1000)]}
              onValueChange={(v) => onUpdate({ analyticsInflation: v[0] / 1000 })}
              min={0}
              max={100}
              step={5}
              className="py-2"
            />
            <div className="flex justify-between text-[10px] text-[var(--fw-text-4)] mt-1">
              <span>0%</span><span>5%</span><span>10%</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[12px] font-medium text-[var(--fw-text-2)]">Monte Carlo volatility (annual)</label>
              <span className="text-[13px] font-mono tnum font-semibold text-[var(--fw-accent)]">{((s.analyticsVolatility ?? 0.15) * 100).toFixed(1)}%</span>
            </div>
            <Slider
              value={[Math.round((s.analyticsVolatility ?? 0.15) * 1000)]}
              onValueChange={(v) => onUpdate({ analyticsVolatility: v[0] / 1000 })}
              min={0}
              max={400}
              step={10}
              className="py-2"
            />
            <div className="flex justify-between text-[10px] text-[var(--fw-text-4)] mt-1">
              <span>0%</span><span>20%</span><span>40%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Privacy & Security ──────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <ShieldIcon className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Privacy & Security</h2>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--fw-surface-2)] transition-colors">
            <div>
              <div className="text-[12px] font-medium">On-device answers</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">On-device answers only. The agent answers from your database tools only.</div>
            </div>
            <Switch
              checked={privacyMode}
              onCheckedChange={(v) => {
                setPrivacyMode(v)
                onUpdate({ privacyMode: v })
              }}
              className="data-[state=checked]:bg-[var(--fw-accent)]"
            />
          </div>
          <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--fw-surface-2)] transition-colors">
            <div>
              <div className="text-[12px] font-medium">Share anonymized data for peer benchmarking</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">Optional preference only. No peer benchmarking is implemented yet.</div>
            </div>
            <Switch
              checked={s.shareAggregates ?? true}
              onCheckedChange={(v) => onUpdate({ shareAggregates: v })}
              className="data-[state=checked]:bg-[var(--fw-accent)]"
            />
          </div>
          <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-[var(--fw-surface-2)] transition-colors">
            <div>
              <div className="text-[12px] font-medium">Default permission tier</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">Viewer is read-only. Editor can add and edit transactions, budgets, and goals.</div>
            </div>
            <Select value={tier === 'Approver' ? 'Editor' : tier} onValueChange={(v) => {
              setTier(v as Tier)
              onUpdate({ tier: v })
            }}>
              <SelectTrigger className="w-[120px] h-8 text-[11px] border-[var(--fw-border)] bg-[var(--fw-surface)] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Viewer">Viewer</SelectItem>
                <SelectItem value="Editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ─── Data Management ──────────────────────────────────── */}
      <Card className="p-5 border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-4 w-4 text-[var(--fw-accent)]" />
          <h2 className="text-[14px] font-semibold">Data Management</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
            <div>
              <div className="text-[12px] font-medium">Export all transactions (CSV)</div>
              <div className="text-[10px] text-[var(--fw-text-3)]">Download a CSV file with all your transaction data for external use</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11px] rounded-lg border-[var(--fw-border)]"
              onClick={() => {
                const a = document.createElement('a')
                a.href = '/api/export?format=csv&range=12m'
                a.download = `finwise-export-${new Date().toISOString().split('T')[0]}.csv`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                toast.success('CSV export downloaded')
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)] text-[11px] text-[var(--fw-text-3)]">
            Sample-data reset is disabled. Add transactions with chat or CSV import. Debts are added on the Planning page.
          </div>
        </div>
      </Card>

      {/* ─── About ────────────────────────────────────────────── */}
      <Card className="p-5 bg-[var(--fw-surface-2)] border-[var(--fw-border)] rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-[var(--fw-text-3)]" />
          <h2 className="text-[14px] font-semibold">About FinWise</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-[var(--fw-text-3)]">Version</div>
            <div className="font-mono text-[var(--fw-text-2)] font-medium">v1.0.0</div>
          </div>
          <div>
            <div className="text-[var(--fw-text-3)]">Framework</div>
            <div className="font-mono text-[var(--fw-text-2)] font-medium">Next.js 16</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--fw-border)] text-[10px] text-[var(--fw-text-3)]">
          FinWise is an agentic AI personal finance copilot with 11 tools, 14 API endpoints, 8 views, and 20+ features.
        </div>
      </Card>
    </div>
  )
}

// ═══ Landing Page ════════════════════════════════════════════════════
function LandingPage({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--fw-bg)] text-[var(--fw-text)]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M7 14l3-4 3 3 5-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-[18px] font-semibold tracking-tight">FinWise</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onSignIn} className="text-[13px] font-medium text-[var(--fw-text-2)] hover:text-[var(--fw-text)] transition-colors">
            Sign in
          </button>
          <Button onClick={onGetStarted} size="sm" className="h-9 px-4 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-lg shadow-[var(--fw-shadow-glow)] text-[13px] font-medium">
            Get Started <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-20 max-w-[1200px] mx-auto text-center">

        <h1 className="text-[48px] sm:text-[64px] font-bold tracking-tight leading-tight mb-4">
          Your money, <br />
          <span className="bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] bg-clip-text text-transparent">
            intelligently managed.
          </span>
        </h1>
        <p className="text-[16px] text-[var(--fw-text-3)] max-w-[600px] mx-auto mb-8 leading-relaxed">
          FinWise is an agentic AI personal finance copilot that doesn't just display your data — it actively reasons about your finances, adds transactions via natural language, runs Monte Carlo simulations, and surfaces personalized insights.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={onGetStarted} size="lg" className="h-12 px-6 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-xl shadow-[var(--fw-shadow-glow)] text-[14px] font-semibold">
            Create Free Account <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button onClick={onSignIn} variant="outline" size="lg" className="h-12 px-6 border-[var(--fw-border)] text-[14px] font-medium rounded-xl">
            Sign in
          </Button>
        </div>
        <div className="mt-12 flex items-center justify-center gap-8 text-[11px] text-[var(--fw-text-3)]">
          <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-[var(--fw-positive)]" /> 11 Agent Tools</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-[var(--fw-positive)]" /> 166 Currencies</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-[var(--fw-positive)]" /> 20+ Features</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-[var(--fw-positive)]" /> 8 Views</span>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 py-16 max-w-[1200px] mx-auto">
        <h2 className="text-[32px] font-bold text-center mb-3">Everything you need to master your finances</h2>
        <p className="text-[14px] text-[var(--fw-text-3)] text-center mb-12">From basic budgeting to advanced Monte Carlo forecasting — all powered by an AI agent you can talk to</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Bot, title: 'AI Agent Chat', desc: 'Add transactions, create goals, and update budgets through natural language. The agent understands context and gives evidence-driven advice.' },
            { icon: Brain, title: 'Financial Health Score', desc: 'A composite 0-100 metric across 5 weighted factors: savings rate, budget adherence, emergency fund, stability, and goal progress.' },
            { icon: Calculator, title: 'Monte Carlo Simulation', desc: 'Run 1000-trial simulations on your savings goals with income volatility modeling and sensitivity scenarios.' },
            { icon: TrendingUpIcon, title: 'Cash Flow Forecast', desc: '14-day forecast using Holt-Winters triple exponential smoothing with 95% confidence bounds.' },
            { icon: Dna, title: 'Personality DNA', desc: 'Discover your financial archetype — Architect, Free Spirit, Climber, Guardian, or Explorer — with personalized recommendations.' },
            { icon: CreditCard, title: 'Debt Payoff Planner', desc: 'Compare Avalanche vs Snowball strategies with month-by-month simulation. See exactly when you\'ll be debt-free.' },
            { icon: Globe, title: '166 World Currencies', desc: 'Switch between any world currency with live exchange rates. All amounts auto-convert instantly across the entire app.' },
            { icon: ShieldIcon, title: 'Viewer and Editor access', desc: 'Viewer is read-only. Editor can add and edit your own records. On-device mode answers from your data.' },
            { icon: RocketIcon, title: 'Innovation Lab', desc: '5 novel features: Future Self Simulator, Behavioral Triggers, Time-Value Calculator, Goal Collisions, and more.' },
          ].map((f, i) => (
            <div key={i} className="p-5 rounded-2xl border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-sm)] hover:shadow-[var(--fw-shadow-md)] transition-shadow">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[var(--fw-accent-soft)] to-[var(--fw-surface)] border border-[var(--fw-accent-border)] flex items-center justify-center mb-3">
                <f.icon className="h-5 w-5 text-[var(--fw-accent)]" />
              </div>
              <h3 className="text-[15px] font-semibold mb-1.5">{f.title}</h3>
              <p className="text-[12px] text-[var(--fw-text-3)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 max-w-[1200px] mx-auto text-center">
        <div className="p-12 rounded-3xl bg-gradient-to-br from-[var(--fw-accent-soft)] via-[var(--fw-surface)] to-[var(--fw-surface)] border border-[var(--fw-accent-border)]">
          <h2 className="text-[32px] font-bold mb-3">Ready to take control?</h2>
          <p className="text-[14px] text-[var(--fw-text-3)] mb-8 max-w-[500px] mx-auto">Create a free account, complete the guided onboarding, and start your journey to financial intelligence today.</p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={onGetStarted} size="lg" className="h-12 px-6 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-xl shadow-[var(--fw-shadow-glow)] text-[14px] font-semibold">
              Get Started Free <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button onClick={onSignIn} variant="outline" size="lg" className="h-12 px-6 border-[var(--fw-border)] text-[14px] font-medium rounded-xl">
              Sign in
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-[var(--fw-border)]">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--fw-text-3)]">
          <span className="font-medium text-[var(--fw-text-2)]">FinWise</span>
          <span>Personal Finance Assistant AI Agent</span>
          <span>Built with Next.js 16 · 166 currencies</span>
        </div>
      </footer>
    </div>
  )
}

// Country-to-currency mapping
const COUNTRY_CURRENCY_MAP: Record<string, { currency: string; name: string; flag: string }> = {
  'US': { currency: 'USD', name: 'United States', flag: '🇺🇸' },
  'GB': { currency: 'GBP', name: 'United Kingdom', flag: '🇬🇧' },
  'DE': { currency: 'EUR', name: 'Germany', flag: '🇩🇪' },
  'FR': { currency: 'EUR', name: 'France', flag: '🇫🇷' },
  'IT': { currency: 'EUR', name: 'Italy', flag: '🇮🇹' },
  'ES': { currency: 'EUR', name: 'Spain', flag: '🇪🇸' },
  'NL': { currency: 'EUR', name: 'Netherlands', flag: '🇳🇱' },
  'BE': { currency: 'EUR', name: 'Belgium', flag: '🇧🇪' },
  'IE': { currency: 'EUR', name: 'Ireland', flag: '🇮🇪' },
  'PT': { currency: 'EUR', name: 'Portugal', flag: '🇵🇹' },
  'AT': { currency: 'EUR', name: 'Austria', flag: '🇦🇹' },
  'FI': { currency: 'EUR', name: 'Finland', flag: '🇫🇮' },
  'GR': { currency: 'EUR', name: 'Greece', flag: '🇬🇷' },
  'JP': { currency: 'JPY', name: 'Japan', flag: '🇯🇵' },
  'CN': { currency: 'CNY', name: 'China', flag: '🇨🇳' },
  'IN': { currency: 'INR', name: 'India', flag: '🇮🇳' },
  'KR': { currency: 'KRW', name: 'South Korea', flag: '🇰🇷' },
  'AU': { currency: 'AUD', name: 'Australia', flag: '🇦🇺' },
  'CA': { currency: 'CAD', name: 'Canada', flag: '🇨🇦' },
  'CH': { currency: 'CHF', name: 'Switzerland', flag: '🇨🇭' },
  'SG': { currency: 'SGD', name: 'Singapore', flag: '🇸🇬' },
  'HK': { currency: 'HKD', name: 'Hong Kong', flag: '🇭🇰' },
  'BR': { currency: 'BRL', name: 'Brazil', flag: '🇧🇷' },
  'MX': { currency: 'MXN', name: 'Mexico', flag: '🇲🇽' },
  'RU': { currency: 'RUB', name: 'Russia', flag: '🇷🇺' },
  'ZA': { currency: 'ZAR', name: 'South Africa', flag: '🇿🇦' },
  'AE': { currency: 'AED', name: 'UAE', flag: '🇦🇪' },
  'TH': { currency: 'THB', name: 'Thailand', flag: '🇹🇭' },
  'SE': { currency: 'SEK', name: 'Sweden', flag: '🇸🇪' },
  'NO': { currency: 'NOK', name: 'Norway', flag: '🇳🇴' },
  'DK': { currency: 'DKK', name: 'Denmark', flag: '🇩🇰' },
  'PL': { currency: 'PLN', name: 'Poland', flag: '🇵🇱' },
  'TR': { currency: 'TRY', name: 'Turkey', flag: '🇹🇷' },
  'ID': { currency: 'IDR', name: 'Indonesia', flag: '🇮🇩' },
  'MY': { currency: 'MYR', name: 'Malaysia', flag: '🇲🇾' },
  'PH': { currency: 'PHP', name: 'Philippines', flag: '🇵🇭' },
  'VN': { currency: 'VND', name: 'Vietnam', flag: '🇻🇳' },
  'PK': { currency: 'PKR', name: 'Pakistan', flag: '🇵🇰' },
  'BD': { currency: 'BDT', name: 'Bangladesh', flag: '🇧🇩' },
  'NG': { currency: 'NGN', name: 'Nigeria', flag: '🇳🇬' },
  'EG': { currency: 'EGP', name: 'Egypt', flag: '🇪🇬' },
  'AR': { currency: 'ARS', name: 'Argentina', flag: '🇦🇷' },
  'CL': { currency: 'CLP', name: 'Chile', flag: '🇨🇱' },
  'CO': { currency: 'COP', name: 'Colombia', flag: '🇨🇴' },
  'PE': { currency: 'PEN', name: 'Peru', flag: '🇵🇪' },
  'NZ': { currency: 'NZD', name: 'New Zealand', flag: '🇳🇿' },
  'IL': { currency: 'ILS', name: 'Israel', flag: '🇮🇱' },
  'CZ': { currency: 'CZK', name: 'Czech Republic', flag: '🇨🇿' },
  'HU': { currency: 'HUF', name: 'Hungary', flag: '🇭🇺' },
  'RO': { currency: 'RON', name: 'Romania', flag: '🇷🇴' },
  'UA': { currency: 'UAH', name: 'Ukraine', flag: '🇺🇦' },
  'KE': { currency: 'KES', name: 'Kenya', flag: '🇰🇪' },
  'GH': { currency: 'GHS', name: 'Ghana', flag: '🇬🇭' },
  'SA': { currency: 'SAR', name: 'Saudi Arabia', flag: '🇸🇦' },
  'QA': { currency: 'QAR', name: 'Qatar', flag: '🇶🇦' },
  'KW': { currency: 'KWD', name: 'Kuwait', flag: '🇰🇼' },
  'OM': { currency: 'OMR', name: 'Oman', flag: '🇴🇲' },
  'JO': { currency: 'JOD', name: 'Jordan', flag: '🇯🇴' },
  'LB': { currency: 'LBP', name: 'Lebanon', flag: '🇱🇧' },
  'LK': { currency: 'LKR', name: 'Sri Lanka', flag: '🇱🇰' },
  'HR': { currency: 'EUR', name: 'Croatia', flag: '🇭🇷' },
  'BG': { currency: 'BGN', name: 'Bulgaria', flag: '🇧🇬' },
  'RS': { currency: 'RSD', name: 'Serbia', flag: '🇷🇸' },
  'IS': { currency: 'ISK', name: 'Iceland', flag: '🇮🇸' },
  'MA': { currency: 'MAD', name: 'Morocco', flag: '🇲🇦' },
  'DZ': { currency: 'DZD', name: 'Algeria', flag: '🇩🇿' },
  'TN': { currency: 'TND', name: 'Tunisia', flag: '🇹🇳' },
}

// Password strength calculator
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 1) return { score, label: 'Very Weak', color: '#ef4444' }
  if (score <= 2) return { score, label: 'Weak', color: '#f59e0b' }
  if (score <= 3) return { score, label: 'Fair', color: '#eab308' }
  if (score <= 4) return { score, label: 'Good', color: '#84cc16' }
  return { score, label: 'Strong', color: '#10b981' }
}

// ═══ Auth Page (Professional with First/Last Name, Country, Password Strength) ═
function AuthPage({ mode, setMode, onAuth, loading, onBack }: {
  mode: 'login' | 'signup'
  setMode: (m: 'login' | 'signup') => void
  onAuth: (action: 'login' | 'signup', email?: string, password?: string, name?: string, currency?: string) => Promise<{ ok: boolean; error?: string; field?: string }>
  loading: boolean
  onBack: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [country, setCountry] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const selectedCountry = country ? COUNTRY_CURRENCY_MAP[country] : null
  const pwStrength = password ? getPasswordStrength(password) : null

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (mode === 'signup') {
      if (!firstName.trim()) errs.firstName = 'First name is required'
      else if (firstName.trim().length < 2) errs.firstName = 'Enter a valid first name'
      if (!lastName.trim()) errs.lastName = 'Last name is required'
      else if (lastName.trim().length < 2) errs.lastName = 'Enter a valid last name'
      if (!country) errs.country = 'Please select your country'
    }
    if (!email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address'
    if (!password) errs.password = 'Password is required'
    else if (mode === 'signup') {
      if (password.length < 8) errs.password = 'Password must be at least 8 characters'
      else if (!/[a-zA-Z]/.test(password)) errs.password = 'Password must contain at least one letter'
      else if (!/[0-9]/.test(password)) errs.password = 'Password must contain at least one number'
      else if (password.length > 128) errs.password = 'Password is too long'
      else if (confirmPassword !== password) errs.confirmPassword = 'Passwords do not match'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setErrors({})
    setApiError('')
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const result = await onAuth(
      mode,
      email.trim(),
      password,
      mode === 'signup' ? fullName : undefined,
      mode === 'signup' ? selectedCountry?.currency : undefined,
    )
    if (!result.ok) {
      if (result.field && ['name', 'email', 'password'].includes(result.field)) {
        setErrors({ [result.field === 'name' ? 'firstName' : result.field]: result.error || '' })
      }
      setApiError(result.error || 'Authentication failed')
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--fw-bg)]">
      {/* Left side — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-[var(--fw-accent)] via-[var(--fw-accent-hover)] to-[#4338ca] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M7 14l3-4 3 3 5-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-[20px] font-semibold tracking-tight">FinWise</span>
          </div>
          <h1 className="text-[36px] font-bold leading-tight mb-4 whitespace-pre-line">
            {mode === 'signup' ? 'Start your journey to\nfinancial intelligence' : 'Welcome back to\nyour financial copilot'}
          </h1>
          <p className="text-[14px] text-white/80 max-w-[400px] leading-relaxed mb-8">
            {mode === 'signup'
              ? 'Join FinWise to get an AI agent that adds transactions via natural language, runs Monte Carlo simulations, and surfaces personalized insights tailored to your spending patterns.'
              : 'Sign in to continue your financial journey with AI-powered insights, budgeting, and forecasting across 166 world currencies.'}
          </p>
          <div className="space-y-3">
            {[
              { icon: Bot, text: 'AI Agent — add transactions, create goals, update budgets via chat' },
              { icon: Brain, text: 'Financial Health Score — composite metric across 5 weighted factors' },
              { icon: Dna, text: 'Personality DNA — discover your financial archetype' },
              { icon: Globe, text: '166 world currencies with live exchange rate conversion' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <f.icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-[12px] text-white/90">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-[11px] text-white/60">
          Built with Next.js 16
        </div>
      </div>

      {/* Right side — form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-[420px] py-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M7 14l3-4 3 3 5-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-[18px] font-semibold tracking-tight">FinWise</span>
          </div>

          <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-[var(--fw-text-3)] hover:text-[var(--fw-text)] mb-8 transition-colors">
            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Back to home
          </button>

          <h2 className="text-[24px] font-bold mb-1">
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h2>
          <p className="text-[13px] text-[var(--fw-text-3)] mb-6">
            {mode === 'signup' ? 'Start with a fresh account and track your real finances.' : 'Welcome back. Enter your credentials to continue.'}
          </p>

          {/* API Error banner */}
          {apiError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-[12px] text-red-700 dark:text-red-400">{apiError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                {/* First Name + Last Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">First Name</label>
                    <Input
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); if (errors.firstName) setErrors({ ...errors, firstName: '' }) }}
                      placeholder="John"
                      autoComplete="given-name"
                      className={`h-11 text-[13px] bg-[var(--fw-surface-2)] rounded-lg ${errors.firstName ? 'border-red-400' : 'border-[var(--fw-border)]'}`}
                    />
                    {errors.firstName && <p className="text-[11px] text-red-500 mt-1">{errors.firstName}</p>}
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Last Name</label>
                    <Input
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); if (errors.lastName) setErrors({ ...errors, lastName: '' }) }}
                      placeholder="Doe"
                      autoComplete="family-name"
                      className={`h-11 text-[13px] bg-[var(--fw-surface-2)] rounded-lg ${errors.lastName ? 'border-red-400' : 'border-[var(--fw-border)]'}`}
                    />
                    {errors.lastName && <p className="text-[11px] text-red-500 mt-1">{errors.lastName}</p>}
                  </div>
                </div>

                {/* Country selector */}
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Country</label>
                  <Select value={country} onValueChange={(v) => { setCountry(v); if (errors.country) setErrors({ ...errors, country: '' }) }}>
                    <SelectTrigger className={`h-11 text-[13px] bg-[var(--fw-surface-2)] rounded-lg ${errors.country ? 'border-red-400' : 'border-[var(--fw-border)]'}`}>
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[250px]">
                      {Object.entries(COUNTRY_CURRENCY_MAP).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, c]) => (
                        <SelectItem key={code} value={code}>
                          <span className="mr-2">{c.flag}</span> {c.name} <span className="text-[var(--fw-text-3)] ml-1">({c.currency})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && <p className="text-[11px] text-red-500 mt-1">{errors.country}</p>}
                  {selectedCountry && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--fw-accent)]">
                      <Globe className="h-3 w-3" />
                      Currency auto-set to <strong>{selectedCountry.currency}</strong> — you can change it later in Settings
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fw-text-3)]" />
                <Input
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: '' }); setApiError('') }}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={`h-11 pl-10 text-[13px] bg-[var(--fw-surface-2)] rounded-lg ${errors.email || apiError ? 'border-red-400' : 'border-[var(--fw-border)]'}`}
                />
              </div>
              {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email}</p>}
            </div>

            {/* Password with strength meter */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fw-text-3)]" />
                <Input
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: '' }); setApiError('') }}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className={`h-11 pl-10 pr-10 text-[13px] bg-[var(--fw-surface-2)] rounded-lg ${errors.password ? 'border-red-400' : 'border-[var(--fw-border)]'}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fw-text-3)] hover:text-[var(--fw-text)] text-[11px] font-medium">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && <p className="text-[11px] text-red-500 mt-1">{errors.password}</p>}
              {/* Password strength meter */}
              {mode === 'signup' && password && (
                <div className="mt-2">
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all"
                        style={{ backgroundColor: pwStrength && i <= pwStrength.score ? pwStrength.color : 'var(--fw-surface-3)' }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[var(--fw-text-3)]">Min 8 characters, 1 letter + 1 number</span>
                    {pwStrength && (
                      <span className="text-[10px] font-semibold" style={{ color: pwStrength.color }}>{pwStrength.label}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password (signup only) */}
            {mode === 'signup' && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold mb-1.5 block">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fw-text-3)]" />
                  <Input
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' }) }}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={`h-11 pl-10 pr-10 text-[13px] bg-[var(--fw-surface-2)] rounded-lg ${errors.confirmPassword ? 'border-red-400' : 'border-[var(--fw-border)]'}`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fw-text-3)] hover:text-[var(--fw-text)] text-[11px] font-medium">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-[11px] text-red-500 mt-1">{errors.confirmPassword}</p>}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-11 mt-2 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-lg text-[13px] font-semibold shadow-[var(--fw-shadow-glow)]">
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                : (mode === 'signup' ? 'Create Account' : 'Sign In')}
            </Button>
          </form>

          {/* Switch mode */}
          <div className="text-center mt-6 text-[12px] text-[var(--fw-text-3)]">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" onClick={() => {
              const next = mode === 'signup' ? 'login' : 'signup'
              setMode(next)
              setErrors({})
              setApiError('')
              setPassword('')
              setConfirmPassword('')
              setShowPassword(false)
            }} className="text-[var(--fw-accent)] font-medium hover:underline">
              {mode === 'signup' ? 'Sign in' : 'Sign up free'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══ Onboarding Page (Professional Guided Tour) ═══════════════════════
function OnboardingPage({ userName, tasks, completedTasks, onComplete, onSkip }: {
  userName: string
  tasks: any[]
  completedTasks: Set<string>
  onComplete: () => void
  onSkip: () => void
}) {
  const [currentStep, setCurrentStep] = useState(0)

  const tourSteps = [
    {
      title: `Welcome to FinWise, ${userName}!`,
      icon: Sparkles2,
      description: 'Your account is ready with a fresh start. Let\'s take a quick tour to learn how FinWise works.',
      highlights: ['Agent chat that can add transactions, budgets, and goals', 'Budgets, goals, and CSV import on your own data', 'Currency display using live FX rates when available', 'Analytics and planning tools based on your records'],
    },
    {
      title: 'Step 1: Your Overview Dashboard',
      icon: LayoutGrid,
      description: 'The Overview page is your financial command center. It shows your income, spending, and net savings at a glance, plus a spending treemap and monthly trend chart.',
      highlights: ['KPI cards show 6-month income, spend, and net savings', 'Spending treemap visualizes category distribution', 'Monthly trend chart tracks income vs spend over time', 'Budget status shows which categories are over/under budget'],
    },
    {
      title: 'Step 2: Chat with the AI Agent',
      icon: Bot,
      description: 'The chat panel on the right is your AI copilot. Ask it anything in natural language — it can read your data AND modify it.',
      highlights: ['Ask "How did this month go?" for a monthly review', 'Say "I spent $25 on coffee at Blue Bottle" to add a transaction', 'Say "Create a goal to save $5000 for a car" to create a goal', 'Say "Set my dining budget to $400" to update budgets'],
    },
    {
      title: 'Step 3: Add Your First Transaction',
      icon: Receipt,
      description: 'Start building your financial picture by adding transactions through the agent. Just type what you spent — the agent extracts the amount, merchant, and category automatically.',
      highlights: ['Type: "I spent $42 on groceries at Trader Joe\'s"', 'The agent infers the category from keywords ("groceries" → Groceries)', 'Income: "I received $2000 paycheck" creates a credit transaction', 'All changes auto-refresh the dashboard instantly'],
    },
    {
      title: 'Step 4: Explore Budgets & Goals',
      icon: Wallet,
      description: 'Set monthly budgets for each category and create savings goals. Run Monte Carlo simulations to project when you\'ll reach your targets.',
      highlights: ['Budgets: Set envelopes per category, track spend vs allocation', 'Goals: Create targets with monthly contributions', 'Monte Carlo: 1000-trial simulation with confidence intervals', 'Sensitivity analysis shows how small changes accelerate goals'],
    },
    {
      title: 'Step 5: Advanced Analytics & Innovation',
      icon: BrainIcon,
      description: 'Analytics and Innovation Lab are experimental tools. They use your transactions plus stated assumptions (return rate, age, inflation).',
      highlights: ['Financial Health Score: weighted 0-100 from savings, budget, and goals', 'Cash flow forecast: short-horizon smoothing, not a bank-grade model', 'Personality scores are heuristics from spending mix', 'Future Self uses your savings rate and the return/inflation you set'],
    },
    {
      title: 'Step 6: Settings & Customization',
      icon: Settings,
      description: 'Customize FinWise to your needs. Change currency (166 options with live rates), toggle dark mode, configure the agent, and more.',
      highlights: ['Display currency with live FX rates when the rate API is available', 'Dark/light theme toggle', 'Agent response style and write confirmation', 'Analytics parameters: return rate, inflation, volatility', 'Viewer (read-only) or Editor (can change records)'],
    },
    {
      title: 'You\'re all set',
      icon: CheckCircle,
      description: 'You now know how to use FinWise. Start by adding a few transactions via the agent chat, then explore the Analytics and Innovation Lab views. Your financial journey starts now.',
      highlights: ['Add transactions by chatting with the agent', 'Set up budgets and savings goals', 'Check your Financial Health Score', 'Discover your Financial Personality DNA'],
    },
  ]

  const step = tourSteps[currentStep]
  const isLastStep = currentStep === tourSteps.length - 1
  const progress = Math.round(((currentStep + 1) / tourSteps.length) * 100)

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--fw-bg)] p-4">
      <div className="w-full max-w-[560px]">
        <div className="rounded-2xl border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-lg)] overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-[var(--fw-surface-2)]">
            <div className="h-full bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="p-8">
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--fw-text-3)] font-semibold">
                  Tour Step {currentStep + 1} of {tourSteps.length}
                </span>
              </div>
              <button onClick={onSkip} className="text-[11px] text-[var(--fw-text-3)] hover:text-[var(--fw-text)] transition-colors">
                Skip tour
              </button>
            </div>

            {/* Icon */}
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[var(--fw-accent)] to-[var(--fw-accent-hover)] flex items-center justify-center shadow-[var(--fw-shadow-glow)] mb-5">
              <step.icon className="h-8 w-8 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-[22px] font-bold mb-3 leading-tight">{step.title}</h2>

            {/* Description */}
            <p className="text-[13px] text-[var(--fw-text-2)] leading-relaxed mb-5">{step.description}</p>

            {/* Highlights */}
            <div className="space-y-2 mb-8">
              {step.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[var(--fw-surface-2)] border border-[var(--fw-border)]">
                  <CheckCircle className="h-4 w-4 text-[var(--fw-positive)] flex-shrink-0 mt-0.5" />
                  <span className="text-[12px] text-[var(--fw-text-2)] leading-relaxed">{h}</span>
                </div>
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between gap-3">
              {currentStep > 0 ? (
                <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)} className="h-10 px-4 border-[var(--fw-border)] text-[13px] font-medium rounded-lg">
                  <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1.5" /> Back
                </Button>
              ) : (
                <div />
              )}
              {isLastStep ? (
                <Button onClick={onComplete} className="h-10 px-6 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-lg text-[13px] font-semibold shadow-[var(--fw-shadow-glow)]">
                  Start Using FinWise <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              ) : (
                <Button onClick={() => setCurrentStep(currentStep + 1)} className="h-10 px-6 bg-gradient-to-r from-[var(--fw-accent)] to-[var(--fw-accent-hover)] text-white rounded-lg text-[13px] font-semibold shadow-[var(--fw-shadow-glow)]">
                  Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              )}
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-1.5 mt-6">
              {tourSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`h-1.5 rounded-full transition-all ${i === currentStep ? 'w-6 bg-[var(--fw-accent)]' : 'w-1.5 bg-[var(--fw-border-strong)] hover:bg-[var(--fw-text-3)]'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Info banner below */}
        <div className="mt-4 p-3 rounded-xl bg-[var(--fw-accent-soft)] border border-[var(--fw-accent-border)]">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-[var(--fw-accent)] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-[var(--fw-text-2)] leading-relaxed">
              Your account starts completely empty. Add your first transaction by typing something like "I spent $25 on coffee at Blue Bottle' in the agent chat after the tour.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compound growth helper for the 30-year projection
function compoundGrowth(principal: number, monthlyContribution: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 12
  let balance = principal
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution
  }
  return Math.round(balance)
}
