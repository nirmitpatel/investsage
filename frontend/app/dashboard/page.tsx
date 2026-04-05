'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type InvestmentStyle = 'play_it_safe' | 'beat_the_market' | 'long_game' | null

interface Portfolio {
  id: string
  investment_style: InvestmentStyle
  last_import_at: string | null
}

interface Position {
  symbol: string
  description: string
  total_shares: number | null
  current_price: number | null
  current_value: number | null
  total_cost_basis: number | null
  total_gain_loss: number | null
  total_gain_loss_percent: number | null
  percent_of_account: number | null
  sector: string | null
}

interface HealthIssue {
  type: string
  severity: 'high' | 'medium' | 'low'
  message: string
}

interface SectorBreakdownItem {
  sector: string
  value: number
  pct: number
  market_trend?: number
}

interface Health {
  score: number
  grade: string
  total_value: number
  total_gain_loss: number
  position_count: number
  issues: HealthIssue[]
  notes: string[]
  sector_breakdown: SectorBreakdownItem[]
  investment_style: InvestmentStyle
  market_trends_period: string
}

const STYLE_CONFIG = {
  play_it_safe: {
    label: 'Play it safe',
    emoji: '🛡️',
    desc: 'Conservative — capital preservation, low volatility',
    color: 'text-blue-300',
    bg: 'bg-blue-500/10 border-blue-500/30',
    dot: 'bg-blue-400',
  },
  beat_the_market: {
    label: 'Beat the market',
    emoji: '⚡',
    desc: 'Aggressive — outperform the S&P 500',
    color: 'text-violet-300',
    bg: 'bg-violet-500/10 border-violet-500/30',
    dot: 'bg-violet-400',
  },
  long_game: {
    label: 'Long game',
    emoji: '🌱',
    desc: 'Patient — decades-long compounding',
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
}

function fmt(n: number | null, prefix = '') {
  if (n == null) return '—'
  return prefix + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gainColor(n: number | null) {
  if (n == null) return 'text-gray-500'
  return n >= 0 ? 'text-emerald-400' : 'text-red-400'
}

function gainBg(n: number | null) {
  if (n == null) return 'bg-gray-800/50 text-gray-500'
  return n >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
}

function gradeColor(grade: string) {
  if (grade === 'A') return 'text-emerald-400'
  if (grade === 'B') return 'text-blue-400'
  if (grade === 'C') return 'text-yellow-400'
  if (grade === 'D' || grade === 'F') return 'text-red-400'
  return 'text-gray-400'
}

function scoreRingColor(score: number) {
  if (score >= 80) return '#34d399'
  if (score >= 60) return '#60a5fa'
  if (score >= 40) return '#facc15'
  return '#f87171'
}

function severityStyle(s: string) {
  if (s === 'high') return 'border-red-500/40 bg-red-500/5 text-red-300'
  if (s === 'medium') return 'border-yellow-500/40 bg-yellow-500/5 text-yellow-300'
  return 'border-blue-500/40 bg-blue-500/5 text-blue-300'
}

function severityDot(s: string) {
  if (s === 'high') return 'bg-red-400'
  if (s === 'medium') return 'bg-yellow-400'
  return 'bg-blue-400'
}

function ScoreRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = scoreRingColor(score)
  return (
    <svg width="96" height="96" className="-rotate-90">
      <circle cx="48" cy="48" r={r} stroke="#1f2937" strokeWidth="8" fill="none" />
      <circle
        cx="48" cy="48" r={r}
        stroke={color} strokeWidth="8" fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  )
}

const SECTOR_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6',
  '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
]
const OTHER_COLOR = '#374151' // gray for "Other" (unknown funds)

function TrendBadge({ pct }: { pct: number }) {
  const pos = pct >= 0
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${pos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

function DonutChart({ breakdown }: { breakdown: SectorBreakdownItem[] }) {
  const r = 58
  const cx = 80
  const cy = 80
  const sw = 22
  const circ = 2 * Math.PI * r
  const gap = 2.5

  let cumLen = 0
  const segments = breakdown.map((item, i) => {
    const arcLen = (item.pct / 100) * circ
    const seg = {
      dasharray: `${Math.max(0, arcLen - gap)} ${circ}`,
      dashoffset: -cumLen,
      color: getSectorColor(item.sector, i),
    }
    cumLen += arcLen
    return seg
  })

  return (
    <svg width="160" height="160" className="-rotate-90" style={{ minWidth: 160 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#151520" strokeWidth={sw} />
      {segments.map((seg, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={sw}
          strokeDasharray={seg.dasharray}
          strokeDashoffset={seg.dashoffset}
        />
      ))}
    </svg>
  )
}

function getSectorColor(sector: string, index: number): string {
  if (sector === 'Other') return OTHER_COLOR
  return SECTOR_COLORS[index % SECTOR_COLORS.length]
}

function SectorBreakdownPanel({ breakdown, period }: { breakdown: SectorBreakdownItem[]; period?: string }) {
  if (!breakdown || breakdown.length === 0) return null

  // Separate "Other" so it always goes last in legend and donut
  const knownSectors = breakdown.filter(b => b.sector !== 'Other')
  const otherEntry = breakdown.find(b => b.sector === 'Other')
  const ordered = otherEntry ? [...knownSectors, otherEntry] : knownSectors
  const hasTrends = knownSectors.some(b => b.market_trend != null)

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="font-semibold flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
          Sector Exposure
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          ETF & fund holdings expanded to underlying sectors
          {hasTrends && period && (
            <> &middot; <span className="text-gray-400">{period} return</span> shown per sector</>
          )}
        </p>
      </div>

      <div className="flex gap-8 items-center">
        {/* Donut chart */}
        <div className="relative shrink-0">
          <DonutChart breakdown={ordered} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-white">{knownSectors.length}</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">sectors</span>
          </div>
        </div>

        {/* Legend — grid for consistent column alignment */}
        <div className="flex-1 min-w-0">
          <div className="grid" style={{ gridTemplateColumns: '10px 1fr auto auto', columnGap: '12px', rowGap: '2px' }}>
            {/* Column headers */}
            <span />
            <span className="text-[10px] text-gray-600 uppercase tracking-wider pb-2">Sector</span>
            {hasTrends && period
              ? <span className="text-[10px] text-gray-600 uppercase tracking-wider pb-2 text-right">{period}</span>
              : <span />
            }
            <span className="text-[10px] text-gray-600 uppercase tracking-wider pb-2 text-right">Alloc.</span>

            {/* Rows */}
            {ordered.map((item, i) => {
              const color = getSectorColor(item.sector, i < knownSectors.length ? i : -1)
              const isOther = item.sector === 'Other'
              return (
                <>
                  <span
                    key={`dot-${item.sector}`}
                    className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0"
                    style={{ background: color }}
                  />
                  <span key={`name-${item.sector}`} className={`text-sm truncate py-1 ${isOther ? 'text-gray-600' : 'text-gray-300'}`}>
                    {isOther ? 'Other (funds)' : item.sector}
                  </span>
                  <span key={`trend-${item.sector}`} className="py-1 flex items-center justify-end">
                    {item.market_trend != null && !isOther
                      ? <TrendBadge pct={item.market_trend} />
                      : null}
                  </span>
                  <span key={`pct-${item.sector}`} className={`text-sm font-semibold tabular-nums text-right py-1 ${isOther ? 'text-gray-600' : 'text-white'}`}>
                    {item.pct}%
                  </span>
                </>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

interface StyleModalProps {
  currentStyle: InvestmentStyle
  saving: boolean
  onSelect: (style: InvestmentStyle) => void
  onClose?: () => void
}

function InvestmentStyleModal({ currentStyle, saving, onSelect, onClose }: StyleModalProps) {
  const styles = (['play_it_safe', 'beat_the_market', 'long_game'] as const)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f1a] border border-white/[0.10] rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-bold">What's your investment style?</h2>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition ml-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-gray-500 text-sm mb-6">
          This shapes how your portfolio health is evaluated and what insights you see.
        </p>
        <div className="space-y-3">
          {styles.map((s) => {
            const cfg = STYLE_CONFIG[s]
            const selected = currentStyle === s
            return (
              <button
                key={s}
                onClick={() => onSelect(s)}
                disabled={saving}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition
                  ${selected
                    ? `${cfg.bg} border-opacity-100`
                    : 'border-white/[0.08] hover:bg-white/[0.04]'
                  } disabled:opacity-60`}
              >
                <span className="text-2xl">{cfg.emoji}</span>
                <div className="flex-1">
                  <p className={`font-semibold ${selected ? cfg.color : 'text-gray-200'}`}>{cfg.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{cfg.desc}</p>
                </div>
                {selected && (
                  <svg className={`w-5 h-5 shrink-0 ${cfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
        {saving && (
          <p className="text-center text-sm text-gray-500 mt-5 flex items-center justify-center gap-2">
            <Spinner /> Saving...
          </p>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [uploading, setUploading] = useState<'positions' | 'transactions' | null>(null)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState(false)
  const [loadingPortfolio, setLoadingPortfolio] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showStyleModal, setShowStyleModal] = useState(false)
  const [savingStyle, setSavingStyle] = useState(false)

  const positionsRef = useRef<HTMLInputElement>(null)
  const transactionsRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPortfolio()
  }, [])

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  async function loadPortfolio() {
    setLoadingPortfolio(true)
    const token = await getToken()
    if (!token) { router.push('/login'); return }

    const res = await fetch(`${API}/api/v1/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) {
      const data = await res.json()
      setPortfolio(data.portfolio ?? null)
      setPositions(data.positions ?? [])
      setHealth(data.health ?? null)
      // Show style modal if not yet set and they have positions
      if (!data.portfolio?.investment_style && (data.positions?.length ?? 0) > 0) {
        setShowStyleModal(true)
      }
    }
    setLoadingPortfolio(false)
  }

  async function handleSelectStyle(style: InvestmentStyle) {
    if (!style) return
    setSavingStyle(true)
    const token = await getToken()
    if (!token) return
    const res = await fetch(`${API}/api/v1/portfolio`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ investment_style: style }),
    })
    setSavingStyle(false)
    if (res.ok) {
      const data = await res.json()
      setPortfolio(p => p ? { ...p, investment_style: style } : null)
      setHealth(data.health ?? null)
      setShowStyleModal(false)
    }
  }

  async function handleUpload(type: 'positions' | 'transactions', file: File) {
    setUploading(type)
    setUploadMsg('')
    setUploadError(false)

    const token = await getToken()
    if (!token) { router.push('/login'); return }

    const form = new FormData()
    form.append('file', file)

    const res = await fetch(`${API}/api/v1/portfolio/import/${type}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })

    setUploading(null)

    if (res.ok) {
      const data = await res.json()
      if (type === 'positions') {
        setPositions(data.positions ?? [])
        setHealth(data.health ?? null)
        setUploadMsg(`Imported ${data.imported} positions`)
        // Prompt for style if not set
        if (!portfolio?.investment_style) setShowStyleModal(true)
      } else {
        setUploadMsg(`Imported ${data.imported} transactions · ${data.tax_lots_reconstructed} tax lots reconstructed`)
      }
    } else {
      const err = await res.json().catch(() => ({}))
      setUploadMsg(err.detail ?? 'Upload failed')
      setUploadError(true)
    }
  }

  async function handleRefreshPrices() {
    setRefreshing(true)
    const token = await getToken()
    if (!token) { router.push('/login'); return }
    const res = await fetch(`${API}/api/v1/portfolio/refresh-prices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setPositions(data.positions ?? [])
      setHealth(data.health ?? null)
    }
    setRefreshing(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const gainLoss = health?.total_gain_loss ?? null
  const gainLossAbs = gainLoss != null ? Math.abs(gainLoss) : null
  const investmentStyle = portfolio?.investment_style ?? health?.investment_style ?? null
  const styleCfg = investmentStyle ? STYLE_CONFIG[investmentStyle] : null

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      {/* Investment style modal */}
      {showStyleModal && (
        <InvestmentStyleModal
          currentStyle={investmentStyle}
          saving={savingStyle}
          onSelect={handleSelectStyle}
          onClose={positions.length > 0 ? () => setShowStyleModal(false) : undefined}
        />
      )}

      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col py-6 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">InvestSage</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          <NavItem icon={<GridIcon />} label="Portfolio" active />
          <NavItem icon={<LeafIcon />} label="Tax Savings" href="/tax" />
          <NavItem icon={<SparkleIcon />} label="AI Insights" href="/insights" />
          <NavItem icon={<ChartIcon />} label="Analytics" soon />
        </nav>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] text-sm transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold">Portfolio Overview</h1>
              {health && (
                <p className="text-xs text-gray-500">{health.position_count} positions</p>
              )}
            </div>
            {/* Style badge */}
            {styleCfg && (
              <button
                onClick={() => setShowStyleModal(true)}
                title="Change investment style"
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition hover:opacity-80 ${styleCfg.bg} ${styleCfg.color}`}
              >
                <span>{styleCfg.emoji}</span>
                <span>{styleCfg.label}</span>
              </button>
            )}
            {!styleCfg && !loadingPortfolio && positions.length > 0 && (
              <button
                onClick={() => setShowStyleModal(true)}
                className="text-xs text-gray-500 border border-white/[0.08] px-2.5 py-1 rounded-full hover:text-gray-300 transition"
              >
                Set style
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(!showImport)}
              className="flex items-center gap-2 text-sm bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-4 py-2 rounded-xl transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </button>
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-2 text-sm bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 px-4 py-2 rounded-xl transition disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Import panel */}
          {showImport && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <h2 className="font-semibold mb-1">Import from Fidelity</h2>
              <p className="text-gray-500 text-sm mb-5">
                Accounts → Portfolio → Download (positions CSV) &nbsp;·&nbsp; History → Download (transactions CSV)
              </p>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => positionsRef.current?.click()}
                  disabled={uploading !== null}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
                >
                  {uploading === 'positions' ? <Spinner /> : <UploadIcon />}
                  {uploading === 'positions' ? 'Fetching prices & sectors (~30s)...' : 'Upload Positions CSV'}
                </button>
                <button
                  onClick={() => transactionsRef.current?.click()}
                  disabled={uploading !== null}
                  className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] disabled:opacity-50 px-5 py-2.5 rounded-xl text-sm font-medium transition"
                >
                  {uploading === 'transactions' ? <Spinner /> : <UploadIcon />}
                  {uploading === 'transactions' ? 'Processing...' : 'Upload Transactions CSV'}
                </button>
              </div>
              <input ref={positionsRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload('positions', e.target.files[0])} />
              <input ref={transactionsRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload('transactions', e.target.files[0])} />
              {uploadMsg && (
                <p className={`mt-4 text-sm flex items-center gap-2 ${uploadError ? 'text-red-400' : 'text-emerald-400'}`}>
                  {uploadError ? '✕' : '✓'} {uploadMsg}
                </p>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Portfolio Value */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Portfolio Value</p>
              <p className="text-3xl font-bold tracking-tight">
                {health
                  ? `$${health.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                  : <span className="text-gray-700">—</span>}
              </p>
            </div>

            {/* Total Gain/Loss */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Total Return</p>
              {health ? (
                <>
                  <p className={`text-3xl font-bold tracking-tight ${gainColor(gainLoss)}`}>
                    {gainLoss != null ? (gainLoss >= 0 ? '+' : '−') : ''}${gainLossAbs != null ? gainLossAbs.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                  </p>
                  <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${gainBg(gainLoss)}`}>
                    {gainLoss != null && gainLoss >= 0 ? 'All time gain' : 'All time loss'}
                  </span>
                </>
              ) : (
                <p className="text-3xl font-bold text-gray-700">—</p>
              )}
            </div>

            {/* Health Score */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Health Score</p>
              {health ? (
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <ScoreRing score={health.score} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-xl font-bold ${gradeColor(health.grade)}`}>{health.score}</span>
                      <span className="text-xs text-gray-500">/ 100</span>
                    </div>
                  </div>
                  <div>
                    <p className={`text-4xl font-bold ${gradeColor(health.grade)}`}>{health.grade}</p>
                    <p className="text-xs text-gray-500 mt-1">{health.issues.length} issue{health.issues.length !== 1 ? 's' : ''} found</p>
                    {styleCfg && (
                      <p className={`text-xs mt-1 font-medium ${styleCfg.color}`}>{styleCfg.emoji} {styleCfg.label}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-3xl font-bold text-gray-700">—</p>
              )}
            </div>
          </div>

          {/* Sector Breakdown */}
          {health && health.sector_breakdown && health.sector_breakdown.length > 0 && (
            <SectorBreakdownPanel breakdown={health.sector_breakdown} period={health.market_trends_period} />
          )}

          {/* Health Issues */}
          {health && health.issues.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Portfolio Issues
              </h2>
              <div className="space-y-2">
                {health.issues.map((issue, i) => (
                  <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${severityStyle(issue.severity)}`}>
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${severityDot(issue.severity)}`} />
                    <p className="text-sm leading-relaxed">{issue.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes (informational, no score impact) */}
          {health && health.notes && health.notes.length > 0 && (
            <div className="px-1">
              {health.notes.map((note, i) => (
                <p key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {note}
                </p>
              ))}
            </div>
          )}

          {/* Positions table */}
          {loadingPortfolio ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
              <svg className="animate-spin h-6 w-6 text-violet-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-500 text-sm">Loading portfolio...</p>
            </div>
          ) : positions.length > 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-white/[0.06]">
                <h2 className="font-semibold">Positions</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Symbol', 'Sector', 'Shares', 'Price', 'Value', 'Cost Basis', 'Gain / Loss', '%'].map((h, i) => (
                        <th key={h} className={`px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {positions.map((p) => (
                      <tr key={p.symbol} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
                              {p.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-semibold text-white">{p.symbol}</div>
                              <div className="text-gray-600 text-xs truncate max-w-[140px]">{p.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {p.sector ? (
                            <span className="text-xs bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full text-gray-400">
                              {p.sector}
                            </span>
                          ) : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-5 py-4 text-right text-gray-300">{p.total_shares ?? '—'}</td>
                        <td className="px-5 py-4 text-right text-gray-300">{fmt(p.current_price, '$')}</td>
                        <td className="px-5 py-4 text-right font-semibold text-white">{fmt(p.current_value, '$')}</td>
                        <td className="px-5 py-4 text-right text-gray-500">{fmt(p.total_cost_basis, '$')}</td>
                        <td className={`px-5 py-4 text-right font-medium ${gainColor(p.total_gain_loss)}`}>
                          {p.total_gain_loss != null
                            ? (p.total_gain_loss >= 0 ? '+$' : '−$') + Math.abs(p.total_gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {p.total_gain_loss_percent != null ? (
                            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${gainBg(p.total_gain_loss_percent)}`}>
                              {p.total_gain_loss_percent >= 0 ? '+' : ''}{p.total_gain_loss_percent.toFixed(2)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">No positions yet</p>
              <p className="text-gray-500 text-sm mb-5">Import your Fidelity CSV to get started</p>
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
              >
                <UploadIcon /> Import CSV
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function NavItem({ icon, label, active, soon, href }: { icon: React.ReactNode; label: string; active?: boolean; soon?: boolean; href?: string }) {
  const router = useRouter()
  return (
    <div
      onClick={href ? () => router.push(href) : undefined}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition
        ${href || active ? 'cursor-pointer' : 'cursor-default'}
        ${active
          ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20'
          : href ? 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]' : 'text-gray-700'
        }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {soon && <span className="text-[10px] bg-white/[0.07] text-gray-500 px-1.5 py-0.5 rounded-md">soon</span>}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function LeafIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  )
}
