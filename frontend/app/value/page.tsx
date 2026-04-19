'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface RecRow {
  id: string
  symbol: string
  recommendation_type: string
  confidence: string | null
  user_action: string
  snapshot_date: string
  price_at_recommendation: number | null
  current_price: number | null
  value_at_recommendation: number | null
  value_impact: number | null
  checkpoint_days: number | null
}

interface ValueStats {
  total_recommendations: number
  followed_count: number
  ignored_count: number
  pending_count: number
  total_value_impact: number
  recommendations: RecRow[]
}

function fmt(n: number | null, prefix = '') {
  if (n == null) return '—'
  return prefix + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtSigned(n: number | null) {
  if (n == null) return '—'
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n >= 0 ? '+$' : '−$') + abs
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-violet-400 mx-auto" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

const REC_COLOR: Record<string, string> = {
  BUY_MORE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SELL: 'bg-red-500/15 text-red-400 border-red-500/30',
  HOLD: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  REDUCE: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MAINTAIN: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  INCREASE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

const ACTION_STYLE: Record<string, string> = {
  followed: 'text-emerald-400',
  ignored: 'text-gray-500',
  pending: 'text-gray-600',
}

export default function ValueDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [stats, setStats] = useState<ValueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<'all' | 'followed' | 'ignored' | 'pending'>('all')

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    setError(false)
    const token = await getToken()
    if (!token) { router.push('/login'); return }
    try {
      const res = await fetch(`${API}/api/v1/value`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { router.push('/login?reason=session_expired'); return }
      if (res.ok) {
        setStats(await res.json())
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    }
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleRecs = stats?.recommendations.filter(r =>
    filter === 'all' ? true : r.user_action === filter
  ) ?? []

  const followedSells = stats?.recommendations.filter(
    r => r.user_action === 'followed' && r.recommendation_type === 'SELL'
  ) ?? []
  const totalProtected = followedSells.reduce((s, r) => s + (r.value_impact ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <Sidebar active="value" onSignOut={handleSignOut} />

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-4 md:px-8 py-4">
          <h1 className="text-lg font-semibold">Value Dashboard</h1>
          <p className="text-xs text-gray-500">Track the ROI of following Sage recommendations</p>
        </div>

        <div className="px-4 md:px-8 py-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Spinner />
            </div>
          ) : error ? (
            <div className="bg-white/[0.03] border border-red-500/20 rounded-2xl p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">Failed to load value data</p>
              <p className="text-gray-500 text-sm mb-5">There was a problem connecting to the server.</p>
              <button onClick={loadStats}
                className="inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-5 py-2.5 rounded-xl text-sm font-medium transition"
              >
                Try again
              </button>
            </div>
          ) : !stats || stats.total_recommendations === 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">No recommendations yet</p>
              <p className="text-gray-500 text-sm mb-5">Ask Sage for recommendations on your positions to start tracking.</p>
              <button onClick={() => router.push('/dashboard')}
                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
              >
                Go to Portfolio
              </button>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Recs</p>
                  <p className="text-3xl font-bold">{stats.total_recommendations}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Followed</p>
                  <p className="text-3xl font-bold text-emerald-400">{stats.followed_count}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Ignored</p>
                  <p className="text-3xl font-bold text-gray-400">{stats.ignored_count}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pending</p>
                  <p className="text-3xl font-bold text-gray-500">{stats.pending_count}</p>
                </div>
              </div>

              {/* Value impact card */}
              {followedSells.length > 0 && (
                <div className={`border rounded-2xl p-6 ${totalProtected >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${totalProtected >= 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                      <svg className={`w-5 h-5 ${totalProtected >= 0 ? 'text-emerald-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-300 mb-0.5">Value protected from followed SELL recommendations</p>
                      <p className={`text-2xl font-bold ${totalProtected >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtSigned(totalProtected)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Based on {followedSells.length} SELL recommendation{followedSells.length !== 1 ? 's' : ''} marked as followed.
                        Positive = avoided losses. Negative = missed gains.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5 w-fit">
                {(['all', 'followed', 'ignored', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${filter === f ? 'bg-white/[0.10] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Recommendations table */}
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
                {visibleRecs.length === 0 ? (
                  <div className="p-12 text-center text-gray-600 text-sm">No recommendations in this category.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          {['Symbol', 'Recommendation', 'Date', 'Price Then', 'Price Now', 'Value Impact', 'Action'].map((h, i) => (
                            <th key={h} className={`px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {visibleRecs.map(r => {
                          const priceDelta = r.price_at_recommendation && r.current_price
                            ? ((r.current_price - r.price_at_recommendation) / r.price_at_recommendation * 100)
                            : null
                          return (
                            <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
                                    {r.symbol.slice(0, 2)}
                                  </div>
                                  <span className="font-semibold">{r.symbol}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border ${REC_COLOR[r.recommendation_type] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'}`}>
                                  {r.recommendation_type.replace('_', ' ')}
                                  {r.confidence && <span className="opacity-60 font-normal ml-1">{r.confidence[0]}</span>}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right text-gray-500 text-xs">
                                {r.snapshot_date ? new Date(r.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </td>
                              <td className="px-5 py-4 text-right text-gray-300">
                                {fmt(r.price_at_recommendation, '$')}
                              </td>
                              <td className="px-5 py-4 text-right">
                                {r.current_price != null ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-gray-300">${r.current_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    {priceDelta != null && (
                                      <span className={`text-[11px] ${priceDelta >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                        {priceDelta >= 0 ? '+' : ''}{priceDelta.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                ) : <span className="text-gray-700">—</span>}
                              </td>
                              <td className="px-5 py-4 text-right">
                                {r.value_impact != null ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className={`font-medium ${r.value_impact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {fmtSigned(r.value_impact)}
                                    </span>
                                    {r.checkpoint_days && (
                                      <span className="text-[10px] text-gray-600">{r.checkpoint_days}d checkpoint</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-700 text-xs">Awaiting checkpoint</span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span className={`text-xs font-medium capitalize ${ACTION_STYLE[r.user_action] ?? 'text-gray-600'}`}>
                                  {r.user_action}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-700 px-1">
                Value impact uses checkpoint price comparisons (30/60/90/180/365 days post-recommendation). Followed SELL = value protected vs holding. All others = position gain/loss since recommendation date.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
