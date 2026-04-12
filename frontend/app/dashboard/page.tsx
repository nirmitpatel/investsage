'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, getToken } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SectorBreakdownPanel from '@/components/SectorBreakdownPanel'
import PositionsTable from '@/components/PositionsTable'
import type { Position } from '@/components/PositionsTable'
import type { SectorBreakdownItem } from '@/components/SectorBreakdownPanel'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type InvestmentStyle = 'play_it_safe' | 'beat_the_market' | 'long_game' | null

interface Portfolio {
  id: string
  investment_style: InvestmentStyle
  last_import_at: string | null
}

interface HealthIssue {
  type: string
  severity: 'high' | 'medium' | 'low'
  message: string
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
  play_it_safe: { label: 'Play it safe', emoji: '🛡️', desc: 'Conservative — capital preservation, 3-year stability focus', color: 'text-blue-300', bg: 'bg-blue-500/10 border-blue-500/30' },
  beat_the_market: { label: 'Beat the market', emoji: '⚡', desc: 'Aggressive — outperform the S&P 500', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/30' },
  long_game: { label: 'Long game', emoji: '🌱', desc: 'Patient — 10-year horizon, decades-long compounding', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30' },
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
  const r = 36, circ = 2 * Math.PI * r
  return (
    <svg width="96" height="96" className="-rotate-90">
      <circle cx="48" cy="48" r={r} stroke="#1f2937" strokeWidth="8" fill="none" />
      <circle cx="48" cy="48" r={r} stroke={scoreRingColor(score)} strokeWidth="8" fill="none"
        strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
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

function InvestmentStyleModal({ currentStyle, saving, onSelect, onClose }: {
  currentStyle: InvestmentStyle; saving: boolean
  onSelect: (s: InvestmentStyle) => void; onClose?: () => void
}) {
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
        <p className="text-gray-500 text-sm mb-6">This shapes how your portfolio health is evaluated and what insights you see.</p>
        <div className="space-y-3">
          {(['play_it_safe', 'beat_the_market', 'long_game'] as const).map((s) => {
            const cfg = STYLE_CONFIG[s]
            const selected = currentStyle === s
            return (
              <button key={s} onClick={() => onSelect(s)} disabled={saving}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition
                  ${selected ? `${cfg.bg} border-opacity-100` : 'border-white/[0.08] hover:bg-white/[0.04]'} disabled:opacity-60`}
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
  const [uploadStep, setUploadStep] = useState('')
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState(false)
  const [selectedBrokerage, setSelectedBrokerage] = useState<string | null>(null)
  const [loadingPortfolio, setLoadingPortfolio] = useState(true)
  const [loadingError, setLoadingError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showStyleModal, setShowStyleModal] = useState(false)
  const [savingStyle, setSavingStyle] = useState(false)
  const [recommendations, setRecommendations] = useState<Record<string, any>>({})
  const [loadingRec, setLoadingRec] = useState<Record<string, boolean>>({})
  const [recErrors, setRecErrors] = useState<Record<string, string>>({})

  const positionsRef = useRef<HTMLInputElement>(null)
  const transactionsRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadPortfolio() }, [])

  useEffect(() => {
    if (uploading !== 'positions') { setUploadStep(''); return }
    const steps: [number, string][] = [
      [0,    'Parsing CSV…'],
      [2000, 'Fetching prices…'],
      [12000, 'Fetching sectors…'],
      [22000, 'Calculating health score…'],
      [28000, 'Almost done…'],
    ]
    setUploadStep(steps[0][1])
    const timers = steps.slice(1).map(([delay, label]) =>
      setTimeout(() => setUploadStep(label), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [uploading])

  async function loadPortfolio() {
    setLoadingPortfolio(true)
    setLoadingError(false)
    const token = await getToken()
    if (!token) { router.push('/login'); return }
    try {
      const res = await fetch(`${API}/api/v1/portfolio`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { router.push('/login?reason=session_expired'); return }
      if (res.ok) {
        const data = await res.json()
        setPortfolio(data.portfolio ?? null)
        setPositions(data.positions ?? [])
        setHealth(data.health ?? null)
        if (!data.portfolio?.investment_style && (data.positions?.length ?? 0) > 0) setShowStyleModal(true)
      } else {
        setLoadingError(true)
      }
    } catch {
      setLoadingError(true)
    }
    setLoadingPortfolio(false)
  }

  async function handleGetRecommendation(symbol: string) {
    if (recommendations[symbol]) return
    setLoadingRec(r => ({ ...r, [symbol]: true }))
    setRecErrors(e => { const next = { ...e }; delete next[symbol]; return next })
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API}/api/v1/ai/position/${symbol}/recommend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setRecommendations(r => ({ ...r, [symbol]: data }))
      } else {
        const err = await res.json().catch(() => ({}))
        setRecErrors(e => ({ ...e, [symbol]: err.detail ?? 'AI request failed' }))
      }
    } catch {
      setRecErrors(e => ({ ...e, [symbol]: 'Network error' }))
    }
    setLoadingRec(r => ({ ...r, [symbol]: false }))
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
      setRecommendations({})
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
    const url = new URL(`${API}/api/v1/portfolio/import/${type}`)
    if (selectedBrokerage) url.searchParams.set('brokerage', selectedBrokerage)
    const res = await fetch(url.toString(), {
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
        const brokerageLabel = data.brokerage ? ` from ${data.brokerage}` : ''
        setUploadMsg(`Imported ${data.imported} positions${brokerageLabel}`)
        if (!portfolio?.investment_style) setShowStyleModal(true)
      } else {
        const brokerageLabel = data.brokerage ? ` from ${data.brokerage}` : ''
        setUploadMsg(`Imported ${data.imported} transactions${brokerageLabel} · ${data.tax_lots_reconstructed} tax lots reconstructed`)
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
      {showStyleModal && (
        <InvestmentStyleModal
          currentStyle={investmentStyle}
          saving={savingStyle}
          onSelect={handleSelectStyle}
          onClose={positions.length > 0 ? () => setShowStyleModal(false) : undefined}
        />
      )}

      <Sidebar active="portfolio" onSignOut={handleSignOut} />

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold">Portfolio Overview</h1>
              {health && <p className="text-xs text-gray-500">{health.position_count} positions</p>}
            </div>
            {styleCfg && (
              <button onClick={() => setShowStyleModal(true)} title="Change investment style"
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition hover:opacity-80 ${styleCfg.bg} ${styleCfg.color}`}
              >
                <span>{styleCfg.emoji}</span><span>{styleCfg.label}</span>
              </button>
            )}
            {!styleCfg && !loadingPortfolio && positions.length > 0 && (
              <button onClick={() => setShowStyleModal(true)}
                className="text-xs text-gray-500 border border-white/[0.08] px-2.5 py-1 rounded-full hover:text-gray-300 transition"
              >
                Set style
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowImport(!showImport)}
              className="flex items-center gap-2 text-sm bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-4 py-2 rounded-xl transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </button>
            <button onClick={handleRefreshPrices} disabled={refreshing}
              className="flex items-center gap-2 text-sm bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 px-4 py-2 rounded-xl transition disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="px-4 md:px-8 py-6 space-y-6">
          {/* Import panel */}
          {showImport && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <h2 className="font-semibold mb-1">Import CSV</h2>
              <p className="text-gray-500 text-sm mb-4 text-gray-500">Select your brokerage, then upload your CSV export.</p>

              {/* Brokerage selector */}
              <div className="flex gap-2 flex-wrap mb-5">
                {(['Fidelity', 'Charles Schwab', 'Vanguard', 'Robinhood'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setSelectedBrokerage(selectedBrokerage === b ? null : b)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                      selectedBrokerage === b
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>

              {selectedBrokerage === 'Robinhood' && (
                <p className="text-xs text-amber-400/80 mb-4">
                  Robinhood doesn&apos;t export a positions file — upload your account history CSV and positions will be reconstructed from your transaction history.
                </p>
              )}

              <div className="flex gap-3 flex-wrap">
                <button onClick={() => positionsRef.current?.click()} disabled={uploading !== null || !selectedBrokerage}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
                >
                  {uploading === 'positions' ? <Spinner /> : <UploadIcon />}
                  {uploading === 'positions' ? uploadStep || 'Uploading…' : selectedBrokerage === 'Robinhood' ? 'Upload Account History CSV' : 'Upload Positions CSV'}
                </button>
                {selectedBrokerage !== 'Robinhood' && (
                  <button onClick={() => transactionsRef.current?.click()} disabled={uploading !== null || !selectedBrokerage}
                    className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium transition"
                  >
                    {uploading === 'transactions' ? <Spinner /> : <UploadIcon />}
                    {uploading === 'transactions' ? 'Processing...' : 'Upload Transactions CSV'}
                  </button>
                )}
                {!selectedBrokerage && (
                  <p className="self-center text-xs text-gray-600">Select a brokerage above to enable upload</p>
                )}
              </div>
              <input ref={positionsRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload('positions', e.target.files[0])} />
              <input ref={transactionsRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload('transactions', e.target.files[0])} />
              {uploading === 'positions' && (
                <div className="mt-4 space-y-2">
                  {(['Parsing CSV…', 'Fetching prices…', 'Fetching sectors…', 'Calculating health score…', 'Almost done…'] as const).map((label) => {
                    const stepOrder = ['Parsing CSV…', 'Fetching prices…', 'Fetching sectors…', 'Calculating health score…', 'Almost done…']
                    const currentIdx = stepOrder.indexOf(uploadStep)
                    const thisIdx = stepOrder.indexOf(label)
                    const isDone = thisIdx < currentIdx
                    const isActive = thisIdx === currentIdx
                    return (
                      <div key={label} className={`flex items-center gap-2 text-xs transition-opacity ${isActive ? 'opacity-100' : isDone ? 'opacity-40' : 'opacity-20'}`}>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500/30 text-emerald-400' : isActive ? 'bg-violet-500/30 text-violet-300' : 'bg-white/10 text-gray-600'}`}>
                          {isDone ? '✓' : isActive ? '·' : '·'}
                        </span>
                        <span className={isDone ? 'text-emerald-400' : isActive ? 'text-violet-300' : 'text-gray-600'}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {uploadMsg && (
                <p className={`mt-4 text-sm flex items-center gap-2 ${uploadError ? 'text-red-400' : 'text-emerald-400'}`}>
                  {uploadError ? '✕' : '✓'} {uploadMsg}
                </p>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Portfolio Value</p>
              <p className="text-3xl font-bold tracking-tight">
                {health ? `$${health.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-gray-700">—</span>}
              </p>
            </div>
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
              ) : <p className="text-3xl font-bold text-gray-700">—</p>}
            </div>
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
                    {styleCfg && <p className={`text-xs mt-1 font-medium ${styleCfg.color}`}>{styleCfg.emoji} {styleCfg.label}</p>}
                  </div>
                </div>
              ) : <p className="text-3xl font-bold text-gray-700">—</p>}
            </div>
          </div>

          {/* Sector Breakdown */}
          {health?.sector_breakdown && health.sector_breakdown.length > 0 && (
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

          {/* Notes */}
          {health?.notes && health.notes.length > 0 && (
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

          {/* Positions */}
          {loadingPortfolio ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
              <svg className="animate-spin h-6 w-6 text-violet-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-500 text-sm">Loading portfolio...</p>
            </div>
          ) : loadingError ? (
            <div className="bg-white/[0.03] border border-red-500/20 rounded-2xl p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">Failed to load portfolio</p>
              <p className="text-gray-500 text-sm mb-5">There was a problem connecting to the server.</p>
              <button onClick={loadPortfolio}
                className="inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-5 py-2.5 rounded-xl text-sm font-medium transition"
              >
                Try again
              </button>
            </div>
          ) : (
            <PositionsTable
              positions={positions}
              loadingRec={loadingRec}
              recommendations={recommendations}
              recErrors={recErrors}
              onGetRecommendation={handleGetRecommendation}
              onImportClick={() => setShowImport(true)}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}
