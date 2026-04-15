'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Performer {
  symbol: string
  sector: string
  gain_loss_pct: number
  gain_loss: number
  current_value: number
}

interface SectorBreakdown {
  sector: string
  gain_loss: number
  value: number
  pct_of_portfolio: number
  count: number
}

interface Snapshot {
  snapshot_date: string
  total_value: number
  total_cost: number | null
}

interface Analytics {
  empty: boolean
  summary?: {
    total_value: number
    total_cost: number | null
    total_gain_loss: number | null
    total_return_pct: number | null
    position_count: number
  }
  spy_comparison?: {
    spy_1mo?: number
    spy_1y?: number
    spy_ytd?: number
  }
  top_performers?: Performer[]
  worst_performers?: Performer[]
  sector_breakdown?: SectorBreakdown[]
  market_trends?: Record<string, number>
  trends_period?: string
}

function fmt(n: number, prefix = '') {
  return prefix + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gainColor(n: number | null) { return n == null ? 'text-gray-500' : n >= 0 ? 'text-emerald-400' : 'text-red-400' }
function gainBg(n: number | null) { return n == null ? 'bg-gray-800/50 text-gray-500' : n >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400' }

function InfoIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
    </svg>
  )
}

export default function AnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Analytics | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [error, setError] = useState('')

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const token = await getToken()
    if (!token) { router.push('/login'); return }

    try {
      const [analyticsRes, snapshotsRes] = await Promise.all([
        fetch(`${API}/api/v1/analytics`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/analytics/snapshots`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (analyticsRes.status === 401) { router.push('/login?reason=session_expired'); return }
      if (analyticsRes.ok) {
        setData(await analyticsRes.json())
      } else {
        setError('Failed to load analytics. Please try again.')
      }
      if (snapshotsRes.ok) {
        setSnapshots(await snapshotsRes.json())
      }
    } catch {
      setError('Could not connect to the server. Please try again.')
    }
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <Sidebar active="analytics" onSignOut={handleSignOut} />

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-4 md:px-8 py-4">
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">Performance breakdown and market comparison</p>
        </div>

        <div className="px-4 md:px-8 py-6 space-y-6">
          {loading ? (
            <LoadingCard label="Loading analytics..." />
          ) : error ? (
            <ErrorCard message={error} onRetry={load} />
          ) : !data || data.empty ? (
            <EmptyState router={router} />
          ) : (
            <>
              {/* Summary row */}
              {data.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Return"
                    value={data.summary.total_gain_loss != null ? `${data.summary.total_gain_loss >= 0 ? '+' : ''}$${Math.abs(data.summary.total_gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null}
                    valueClass={gainColor(data.summary.total_gain_loss)}
                    infoTip="Upload a transactions CSV to calculate total return"
                  />
                  <StatCard
                    label="Return %"
                    value={data.summary.total_return_pct != null ? `${data.summary.total_return_pct >= 0 ? '+' : ''}${data.summary.total_return_pct.toFixed(2)}%` : null}
                    valueClass={gainColor(data.summary.total_return_pct)}
                    infoTip="Upload a transactions CSV to calculate return %"
                  />
                  <StatCard label="Portfolio Value" value={`$${data.summary.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                  <StatCard label="Positions" value={String(data.summary.position_count)} />
                </div>
              )}

              {/* Portfolio value over time */}
              {snapshots.length >= 2 && (
                <PortfolioChart snapshots={snapshots} />
              )}

              {/* vs S&P 500 */}
              {data.spy_comparison && Object.keys(data.spy_comparison).length > 0 && data.summary?.total_return_pct != null && (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <span className="text-base">📈</span> vs S&P 500
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {data.spy_comparison.spy_ytd != null && (
                      <CompareRow label="YTD" portfolio={data.summary.total_return_pct} market={data.spy_comparison.spy_ytd} />
                    )}
                    {data.spy_comparison.spy_1mo != null && (
                      <CompareRow label="1-Month" portfolio={null} market={data.spy_comparison.spy_1mo} />
                    )}
                    {data.spy_comparison.spy_1y != null && (
                      <CompareRow label="1-Year (SPY)" portfolio={null} market={data.spy_comparison.spy_1y} />
                    )}
                  </div>
                  <p className="text-xs text-gray-700 mt-4">Portfolio return is all-time based on cost basis. S&P 500 returns shown for reference.</p>
                </div>
              )}

              {/* Top & worst performers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {data.top_performers && data.top_performers.length > 0 && (
                  <PerformersCard title="Top Performers" items={data.top_performers} positive />
                )}
                {data.worst_performers && data.worst_performers.length > 0 && (
                  <PerformersCard title="Underperformers" items={data.worst_performers} positive={false} />
                )}
              </div>

              {/* Sector P&L */}
              {data.sector_breakdown && data.sector_breakdown.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <span className="text-base">🥧</span> Sector Breakdown
                    {data.trends_period && data.market_trends && Object.keys(data.market_trends).length > 0 && (
                      <span className="text-xs text-gray-600 ml-1">· {data.trends_period} market trend</span>
                    )}
                  </h2>
                  <div className="space-y-2">
                    {data.sector_breakdown.map(s => (
                      <div key={s.sector} className="grid items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
                        <div>
                          <span className="text-sm text-gray-200">{s.sector}</span>
                          <span className="text-xs text-gray-600 ml-2">{s.count} position{s.count !== 1 ? 's' : ''}</span>
                        </div>
                        {data.market_trends?.[s.sector] != null && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${gainBg(data.market_trends![s.sector])}`}>
                            {data.market_trends![s.sector] >= 0 ? '+' : ''}{data.market_trends![s.sector].toFixed(1)}%
                          </span>
                        )}
                        <span className={`text-sm font-semibold tabular-nums ${gainColor(s.gain_loss)}`}>
                          {s.gain_loss >= 0 ? '+' : '−'}${Math.abs(s.gain_loss).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums w-10 text-right">{s.pct_of_portfolio}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function CompareRow({ label, portfolio, market }: { label: string; portfolio: number | null; market: number }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      {portfolio != null && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-600">Your portfolio</span>
          <span className={`text-sm font-bold ${gainColor(portfolio)}`}>{portfolio >= 0 ? '+' : ''}{portfolio.toFixed(2)}%</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">S&P 500</span>
        <span className={`text-sm font-bold ${gainColor(market)}`}>{market >= 0 ? '+' : ''}{market.toFixed(2)}%</span>
      </div>
    </div>
  )
}

function PerformersCard({ title, items, positive }: { title: string; items: Performer[]; positive: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <h2 className="font-semibold mb-4 flex items-center gap-2">
        <span>{positive ? '🚀' : '📉'}</span> {title}
      </h2>
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.symbol} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${positive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                {p.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="text-sm font-medium text-white">{p.symbol}</span>
                <span className="text-xs text-gray-600 ml-1.5">{p.sector}</span>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${gainColor(p.gain_loss_pct)}`}>
                {p.gain_loss_pct >= 0 ? '+' : ''}{p.gain_loss_pct.toFixed(1)}%
              </p>
              <p className={`text-xs ${gainColor(p.gain_loss)}`}>
                {p.gain_loss >= 0 ? '+' : '−'}${Math.abs(p.gain_loss).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, valueClass = 'text-white', infoTip }: { label: string; value: string | null; valueClass?: string; infoTip?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      {value != null ? (
        <p className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      ) : (
        <div className="flex items-center gap-1.5">
          <p className="text-2xl font-bold tracking-tight text-gray-700">—</p>
          {infoTip && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 mt-1" title={infoTip}>
              <InfoIcon />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <svg className="animate-spin h-6 w-6 text-violet-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white/[0.03] border border-red-500/20 rounded-2xl p-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">Failed to load analytics</p>
      <p className="text-gray-500 text-sm mb-5">{message}</p>
      <button onClick={onRetry}
        className="inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-5 py-2.5 rounded-xl text-sm font-medium transition"
      >
        Try again
      </button>
    </div>
  )
}

function EmptyState({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <p className="text-white font-semibold mb-1">No positions yet</p>
      <p className="text-gray-500 text-sm mb-5">Import your Fidelity CSV to see analytics</p>
      <button onClick={() => router.push('/dashboard')} className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition">
        Go to Portfolio
      </button>
    </div>
  )
}

function PortfolioChart({ snapshots }: { snapshots: Snapshot[] }) {
  const W = 800
  const H = 160
  const PAD = { top: 12, right: 16, bottom: 28, left: 60 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const values = snapshots.map(s => s.total_value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1

  const xs = snapshots.map((_, i) => PAD.left + (i / (snapshots.length - 1)) * innerW)
  const ys = values.map(v => PAD.top + innerH - ((v - minV) / range) * innerH)

  const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const area = [
    `M ${xs[0]},${PAD.top + innerH}`,
    ...xs.map((x, i) => `L ${x},${ys[i]}`),
    `L ${xs[xs.length - 1]},${PAD.top + innerH}`,
    'Z',
  ].join(' ')

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: PAD.top + innerH - t * innerH,
    label: `$${Math.round(minV + t * range).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`,
  }))

  // X-axis: show ~4 evenly spaced date labels
  const xLabelCount = Math.min(4, snapshots.length)
  const xLabelIdxs = Array.from({ length: xLabelCount }, (_, i) =>
    Math.round((i / (xLabelCount - 1)) * (snapshots.length - 1))
  )

  const first = snapshots[0]
  const last = snapshots[snapshots.length - 1]
  const delta = last.total_value - first.total_value
  const deltaPos = delta >= 0

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm">Portfolio Value Over Time</h2>
        <span className={`text-sm font-bold ${deltaPos ? 'text-emerald-400' : 'text-red-400'}`}>
          {deltaPos ? '+' : '−'}${Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          <span className="text-xs font-normal text-gray-500 ml-1">since first snapshot</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Y-axis grid lines + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={PAD.left + innerW} y2={t.y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="rgba(156,163,175,0.7)">{t.label}</text>
          </g>
        ))}
        {/* Area fill */}
        <path d={area} fill="url(#chartGrad)" />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* X-axis date labels */}
        {xLabelIdxs.map(i => (
          <text key={i} x={xs[i]} y={H - 6} textAnchor="middle" fontSize="10" fill="rgba(107,114,128,0.9)">
            {new Date(snapshots[i].snapshot_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}
        {/* Last value dot */}
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3.5" fill="#8b5cf6" />
      </svg>
      <p className="text-xs text-gray-700 mt-1">{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} · updates on import or price refresh</p>
    </div>
  )
}

