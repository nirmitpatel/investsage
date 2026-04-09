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

interface Analytics {
  empty: boolean
  summary?: {
    total_value: number
    total_cost: number
    total_gain_loss: number
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

function gainColor(n: number) { return n >= 0 ? 'text-emerald-400' : 'text-red-400' }
function gainBg(n: number) { return n >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400' }

export default function AnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Analytics | null>(null)
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
      const res = await fetch(`${API}/api/v1/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { router.push('/login?reason=session_expired'); return }
      if (res.ok) {
        setData(await res.json())
      } else {
        setError('Failed to load analytics. Please try again.')
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
                  <StatCard label="Total Return" value={`${data.summary.total_gain_loss >= 0 ? '+' : ''}$${Math.abs(data.summary.total_gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} valueClass={gainColor(data.summary.total_gain_loss)} />
                  <StatCard label="Return %" value={data.summary.total_return_pct != null ? `${data.summary.total_return_pct >= 0 ? '+' : ''}${data.summary.total_return_pct.toFixed(2)}%` : '—'} valueClass={data.summary.total_return_pct != null ? gainColor(data.summary.total_return_pct) : 'text-gray-400'} />
                  <StatCard label="Portfolio Value" value={`$${data.summary.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                  <StatCard label="Positions" value={String(data.summary.position_count)} />
                </div>
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

function StatCard({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
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

