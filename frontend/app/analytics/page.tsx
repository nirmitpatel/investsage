'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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

    const res = await fetch(`${API}/api/v1/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) {
      setData(await res.json())
    } else {
      setError('Failed to load analytics. Please try again.')
    }
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <Sidebar active="analytics" onSignOut={handleSignOut} router={router} />

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-8 py-4">
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">Performance breakdown and market comparison</p>
        </div>

        <div className="px-8 py-6 space-y-6">
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
    <div className="bg-white/[0.03] border border-red-500/20 rounded-2xl p-10 text-center">
      <p className="text-red-400 mb-4">{message}</p>
      <button onClick={onRetry} className="text-sm text-gray-400 hover:text-white border border-white/[0.08] px-4 py-2 rounded-xl transition">Retry</button>
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

function Sidebar({ active, onSignOut, router }: { active: string; onSignOut: () => void; router: ReturnType<typeof useRouter> }) {
  const navItems = [
    { key: 'portfolio', label: 'Portfolio', icon: <GridIcon />, href: '/dashboard' },
    { key: 'tax', label: 'Tax Savings', icon: <LeafIcon />, href: '/tax' },
    { key: 'insights', label: 'AI Insights', icon: <SparkleIcon />, href: '/insights' },
    { key: 'analytics', label: 'Analytics', icon: <ChartIcon />, href: '/analytics' },
  ]
  return (
    <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col py-6 px-4">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        </div>
        <span className="font-bold text-lg tracking-tight">InvestSage</span>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map(item => (
          <div
            key={item.key}
            onClick={() => router.push(item.href)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition cursor-pointer
              ${active === item.key ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
      <button onClick={onSignOut} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] text-sm transition">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" /></svg>
        Sign out
      </button>
    </aside>
  )
}

function GridIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> }
function LeafIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> }
function SparkleIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> }
function ChartIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg> }
