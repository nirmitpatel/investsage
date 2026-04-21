'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, getToken } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type TraderType = 'congress' | 'hedge_fund' | 'insider'
type TradeDir = 'buy' | 'sell' | 'all'

interface SmartMoneyTrade {
  id: string
  trader_type: TraderType
  trader_name: string
  trader_detail: Record<string, unknown>
  symbol: string
  trade_type: string
  trade_date: string | null
  disclosure_date: string | null
  amount_range: string | null
  shares: number | null
  price: number | null
  source: string
}

interface Follow {
  id: string
  trader_name: string
  trader_type: string
}

const TAB_CONFIG: { key: TraderType | 'overlap'; label: string }[] = [
  { key: 'overlap', label: 'My Holdings' },
  { key: 'congress', label: 'Congress' },
  { key: 'hedge_fund', label: 'Hedge Funds' },
  { key: 'insider', label: 'Insiders' },
]

function traderTypeBadge(type: TraderType) {
  if (type === 'congress') return 'bg-blue-500/15 text-blue-300 border-blue-500/20'
  if (type === 'hedge_fund') return 'bg-violet-500/15 text-violet-300 border-violet-500/20'
  return 'bg-amber-500/15 text-amber-300 border-amber-500/20'
}

function traderTypeLabel(type: TraderType) {
  if (type === 'congress') return 'Congress'
  if (type === 'hedge_fund') return 'Hedge Fund'
  return 'Insider'
}

function tradeBadge(type: string) {
  const t = (type || '').toLowerCase()
  if (t === 'buy') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
  if (t === 'sell') return 'bg-red-500/15 text-red-300 border-red-500/20'
  return 'bg-gray-500/15 text-gray-400 border-gray-500/20'
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function disclosureLag(tradeDate: string | null, disclosureDate: string | null): string | null {
  if (!tradeDate || !disclosureDate) return null
  const t = new Date(tradeDate)
  const d = new Date(disclosureDate)
  const days = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (days < 0) return null
  return `${days}d lag`
}

function TradeRow({ trade, followed, onFollow, onUnfollow }: {
  trade: SmartMoneyTrade
  followed: boolean
  onFollow: (tradeId: string) => void
  onUnfollow: (tradeId: string) => void
}) {
  const detail = trade.trader_detail || {}
  const lag = disclosureLag(trade.trade_date, trade.disclosure_date)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 border-b border-white/[0.05] hover:bg-white/[0.02] transition">
      {/* Trader info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-white truncate">{trade.trader_name}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${traderTypeBadge(trade.trader_type)}`}>
            {traderTypeLabel(trade.trader_type)}
          </span>
          {trade.trader_type === 'congress' && (
            <>
              {(detail.party as string) && (
                <span className="text-[10px] text-gray-500">{detail.party as string}</span>
              )}
              {(detail.state as string) && (
                <span className="text-[10px] text-gray-500">{detail.state as string}</span>
              )}
              {(detail.chamber as string) && (
                <span className="text-[10px] capitalize text-gray-500">{detail.chamber as string}</span>
              )}
            </>
          )}
          {trade.trader_type === 'insider' && (detail.title as string) && (
            <span className="text-[10px] text-gray-500">{detail.title as string}</span>
          )}
          {trade.trader_type === 'hedge_fund' && (detail.fund_name as string) && (
            <span className="text-[10px] text-gray-500">{detail.fund_name as string}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          {trade.trade_date && <span>Traded {fmtDate(trade.trade_date)}</span>}
          {trade.disclosure_date && <span>Disclosed {fmtDate(trade.disclosure_date)}</span>}
          {lag && <span className="text-amber-500/80">{lag}</span>}
        </div>
      </div>

      {/* Trade details */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-base font-bold text-white">{trade.symbol}</p>
          {trade.amount_range && <p className="text-xs text-gray-500">{trade.amount_range}</p>}
          {trade.shares && !trade.amount_range && (
            <p className="text-xs text-gray-500">{trade.shares.toLocaleString()} shares</p>
          )}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${tradeBadge(trade.trade_type)}`}>
          {trade.trade_type || '—'}
        </span>
        <button
          onClick={() => followed ? onUnfollow(trade.id) : onFollow(trade.id)}
          title={followed ? `Unfollow ${trade.trader_name}` : `Follow ${trade.trader_name}`}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${
            followed
              ? 'bg-violet-600/20 border-violet-500/30 text-violet-300 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400'
              : 'bg-white/[0.04] border-white/[0.08] text-gray-500 hover:bg-violet-600/10 hover:border-violet-500/20 hover:text-violet-300'
          }`}
        >
          {followed ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-600">
      <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  )
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
      <svg className="w-10 h-10 mb-3 text-red-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="font-medium text-sm text-gray-400 mb-1">Failed to load data</p>
      <button onClick={onRetry} className="text-sm text-violet-400 hover:text-violet-300 transition">Try again</button>
    </div>
  )
}

export default function SmartMoneyPage() {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<TraderType | 'overlap'>('overlap')
  const [trades, setTrades] = useState<SmartMoneyTrade[]>([])
  const [follows, setFollows] = useState<Follow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')
  const [filterDir, setFilterDir] = useState<TradeDir>('all')
  const [filterSymbol, setFilterSymbol] = useState('')

  useEffect(() => { loadData() }, [tab])
  useEffect(() => { loadFollows() }, [])

  async function loadData() {
    setLoading(true)
    setError(false)
    const token = await getToken()
    if (!token) { router.push('/login'); return }

    const endpoint = tab === 'overlap'
      ? `${API}/api/v1/smart-money/overlap`
      : `${API}/api/v1/smart-money/${tab === 'hedge_fund' ? 'hedge-funds' : tab}`

    try {
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { router.push('/login?reason=session_expired'); return }
      if (!res.ok) { setError(true); setLoading(false); return }
      const data = await res.json()
      setTrades(data.trades ?? [])
    } catch {
      setError(true)
    }
    setLoading(false)
  }

  async function loadFollows() {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${API}/api/v1/smart-money/follows`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setFollows(data.follows ?? [])
      }
    } catch { /* silent */ }
  }

  async function handleFollow(tradeId: string) {
    const token = await getToken()
    if (!token) return
    const res = await fetch(`${API}/api/v1/smart-money/follow/${tradeId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setFollows(f => {
        if (f.some(x => x.trader_name === data.trader_name)) return f
        return [...f, { id: tradeId, trader_name: data.trader_name, trader_type: data.trader_type }]
      })
    }
  }

  async function handleUnfollow(tradeId: string) {
    const trade = trades.find(t => t.id === tradeId)
    if (!trade) return
    const token = await getToken()
    if (!token) return
    const res = await fetch(`${API}/api/v1/smart-money/follow/${tradeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setFollows(f => f.filter(x => x.trader_name !== trade.trader_name))
    }
  }

  async function handleIngest() {
    setIngesting(true)
    setIngestMsg('')
    const token = await getToken()
    if (!token) return
    try {
      const source = tab === 'overlap' ? 'congress' : tab === 'hedge_fund' ? 'hedge_funds' : tab
      const res = await fetch(`${API}/api/v1/smart-money/ingest?source=${source}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const counts = Object.entries(data.ingested || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
        setIngestMsg(`Ingested — ${counts}`)
        await loadData()
      } else {
        setIngestMsg('Ingest failed')
      }
    } catch {
      setIngestMsg('Ingest failed')
    }
    setIngesting(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const followedNames = new Set(follows.map(f => f.trader_name))

  const filtered = trades.filter(t => {
    if (filterDir !== 'all' && (t.trade_type || '').toLowerCase() !== filterDir) return false
    if (filterSymbol && !t.symbol.toUpperCase().includes(filterSymbol.toUpperCase())) return false
    return true
  })

  const buys = trades.filter(t => (t.trade_type || '').toLowerCase() === 'buy').length
  const sells = trades.filter(t => (t.trade_type || '').toLowerCase() === 'sell').length

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <Sidebar active="smart-money" onSignOut={handleSignOut} />

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-4 md:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Smart Money</h1>
            <p className="text-xs text-gray-500">Congressional trades, hedge fund 13F, insider Form 4</p>
          </div>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="flex items-center gap-2 text-sm bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 px-4 py-2 rounded-xl transition disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${ingesting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {ingesting ? 'Syncing…' : 'Sync Data'}
          </button>
        </div>

        <div className="px-4 md:px-8 py-6 space-y-5">
          {ingestMsg && (
            <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              {ingestMsg}
            </p>
          )}

          {/* Stats row */}
          {!loading && !error && trades.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Total Trades</p>
                <p className="text-xl font-bold">{trades.length}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Buys</p>
                <p className="text-xl font-bold text-emerald-400">{buys}</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">Sells</p>
                <p className="text-xl font-bold text-red-400">{sells}</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1 w-fit">
            {TAB_CONFIG.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setFilterDir('all'); setFilterSymbol('') }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  tab === key
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex gap-1">
              {(['all', 'buy', 'sell'] as TradeDir[]).map(d => (
                <button
                  key={d}
                  onClick={() => setFilterDir(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition capitalize border ${
                    filterDir === d
                      ? d === 'buy' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                        : d === 'sell' ? 'bg-red-500/20 border-red-500/30 text-red-300'
                        : 'bg-white/[0.08] border-white/20 text-gray-200'
                      : 'border-white/[0.06] text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {d === 'all' ? 'All' : d}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Filter by symbol…"
              value={filterSymbol}
              onChange={e => setFilterSymbol(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-500/40 w-36"
            />
            {(filterDir !== 'all' || filterSymbol) && (
              <button
                onClick={() => { setFilterDir('all'); setFilterSymbol('') }}
                className="text-xs text-gray-500 hover:text-gray-300 transition"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Followed traders */}
          {follows.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Following</p>
              <div className="flex gap-2 flex-wrap">
                {follows.map(f => (
                  <span key={f.id} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${traderTypeBadge(f.trader_type as TraderType)}`}>
                    {f.trader_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Trade list */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-sm font-medium text-gray-300">
                {tab === 'overlap' ? 'Trades overlapping your holdings'
                  : tab === 'congress' ? 'Congressional STOCK Act disclosures'
                  : tab === 'hedge_fund' ? 'Hedge fund 13F positions'
                  : 'Executive Form 4 filings'}
              </p>
              <span className="text-xs text-gray-600">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-500 text-sm">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading…
              </div>
            ) : error ? (
              <ErrorCard onRetry={loadData} />
            ) : filtered.length === 0 ? (
              <EmptyState
                message={
                  tab === 'overlap'
                    ? 'No smart money trades found for your current holdings. Sync data or import positions to see overlaps.'
                    : 'No trades found. Click "Sync Data" to fetch the latest disclosures.'
                }
              />
            ) : (
              <div>
                {filtered.map(trade => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    followed={followedNames.has(trade.trader_name)}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-700 text-center pb-2">
            Sources: Capitol Trades (congressional), SEC EDGAR 13F (hedge funds), SEC EDGAR Form 4 (insiders).
            Not investment advice.
          </p>
        </div>
      </main>
    </div>
  )
}
