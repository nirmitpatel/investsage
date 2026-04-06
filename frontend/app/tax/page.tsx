'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface TaxOpportunity {
  symbol: string
  sector: string
  shares: number
  purchase_date: string | null
  purchase_price: number
  current_price: number
  cost_basis: number
  current_value: number
  unrealized_loss: number
  tax_savings_estimate: number
  is_short_term: boolean
  days_held: number | null
  days_until_lt: number | null
  holding_period_label: string
  replacement_suggestion: string
  urgency: 'high' | 'medium' | null
}

interface TaxSummary {
  total_harvestable_loss: number
  total_tax_savings_estimate: number
  opportunity_count: number
  short_term_count: number
  long_term_count: number
  urgent_count: number
}

function fmt(n: number, prefix = '') {
  return prefix + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function UrgencyBadge({ urgency }: { urgency: 'high' | 'medium' | null }) {
  if (!urgency) return null
  if (urgency === 'high') return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
      Harvest soon
    </span>
  )
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
      Consider timing
    </span>
  )
}

export default function TaxPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [hasLots, setHasLots] = useState(false)
  const [summary, setSummary] = useState<TaxSummary | null>(null)
  const [opportunities, setOpportunities] = useState<TaxOpportunity[]>([])
  const [explanations, setExplanations] = useState<Record<string, string>>({})
  const [explaining, setExplaining] = useState<Record<string, boolean>>({})

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const token = await getToken()
    if (!token) { router.push('/login'); return }

    const res = await fetch(`${API}/api/v1/tax/opportunities`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) { router.push('/login'); return }
    if (res.ok) {
      const data = await res.json()
      setHasLots(data.has_lots ?? false)
      setSummary(data.summary ?? null)
      setOpportunities(data.opportunities ?? [])
    }
    setLoading(false)
  }

  async function handleExplain(symbol: string) {
    if (explanations[symbol]) return
    setExplaining(e => ({ ...e, [symbol]: true }))
    const token = await getToken()
    if (!token) return
    const res = await fetch(`${API}/api/v1/tax/opportunities/${symbol}/explain`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setExplanations(e => ({ ...e, [symbol]: data.explanation }))
    }
    setExplaining(e => ({ ...e, [symbol]: false }))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <Sidebar active="tax" onSignOut={handleSignOut} />

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-8 py-4">
          <h1 className="text-lg font-semibold">Tax Savings Finder</h1>
          <p className="text-xs text-gray-500 mt-0.5">Identify tax-loss harvesting opportunities in your portfolio</p>
        </div>

        <div className="px-8 py-6 space-y-6">
          {loading ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
              <svg className="animate-spin h-6 w-6 text-violet-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-500 text-sm">Analyzing tax lots...</p>
            </div>
          ) : !hasLots ? (
            <NoLotsState />
          ) : opportunities.length === 0 ? (
            <AllGreenState />
          ) : (
            <>
              {/* Summary cards */}
              {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <SummaryCard
                    label="Harvestable Losses"
                    value={`$${summary.total_harvestable_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    sub={`${summary.opportunity_count} position${summary.opportunity_count !== 1 ? 's' : ''}`}
                    color="text-red-400"
                  />
                  <SummaryCard
                    label="Est. Tax Savings"
                    value={`$${summary.total_tax_savings_estimate.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    sub="At top federal rates"
                    color="text-emerald-400"
                  />
                  <SummaryCard
                    label="Urgent (Short-term)"
                    value={String(summary.short_term_count)}
                    sub={summary.urgent_count > 0 ? `${summary.urgent_count} expiring soon` : 'No immediate deadlines'}
                    color={summary.urgent_count > 0 ? 'text-yellow-400' : 'text-gray-400'}
                  />
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-gray-600 bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3">
                <span className="text-gray-500 font-medium">Disclaimer:</span> Tax savings estimates use top federal marginal rates (37% short-term, 20% long-term) and are for educational purposes only. Consult a tax advisor before making decisions. Wash-sale rules apply — avoid buying substantially identical securities within 30 days.
              </p>

              {/* Opportunities */}
              <div className="space-y-4">
                {opportunities.map((opp) => (
                  <OpportunityCard
                    key={`${opp.symbol}-${opp.purchase_date}`}
                    opp={opp}
                    explanation={explanations[opp.symbol]}
                    explaining={explaining[opp.symbol] ?? false}
                    onExplain={() => handleExplain(opp.symbol)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-2">{sub}</p>
    </div>
  )
}

function OpportunityCard({
  opp, explanation, explaining, onExplain
}: {
  opp: TaxOpportunity
  explanation?: string
  explaining: boolean
  onExplain: () => void
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xs font-bold text-red-300 shrink-0">
            {opp.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{opp.symbol}</span>
              <span className="text-xs text-gray-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{opp.sector}</span>
              <UrgencyBadge urgency={opp.urgency} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {opp.shares} shares · {opp.holding_period_label} ({opp.days_held != null ? `${opp.days_held} days` : 'unknown'})
              {opp.days_until_lt != null && ` · ${opp.days_until_lt}d until long-term`}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-emerald-400">+${opp.tax_savings_estimate.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-500">est. tax savings</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Unrealized Loss" value={`-$${opp.unrealized_loss.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} valueClass="text-red-400" />
        <Stat label="Cost Basis" value={`$${fmt(opp.cost_basis)}`} />
        <Stat label="Current Value" value={`$${fmt(opp.current_value)}`} />
        <Stat label="Purchased" value={opp.purchase_date ?? '—'} />
      </div>

      {/* Replacement suggestion */}
      <div className="flex items-center gap-2 mb-4 bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2.5">
        <svg className="w-4 h-4 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <p className="text-xs text-gray-400">
          <span className="text-gray-500">Wash-sale safe replacement:</span> {opp.replacement_suggestion}
        </p>
      </div>

      {/* AI explanation */}
      {explanation ? (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-violet-400 mb-1 flex items-center gap-1.5">
            <SparkleIcon small /> AI Analysis
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">{explanation}</p>
        </div>
      ) : (
        <button
          onClick={onExplain}
          disabled={explaining}
          className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/10 px-4 py-2 rounded-xl transition disabled:opacity-50"
        >
          {explaining ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analyzing...
            </>
          ) : (
            <>
              <SparkleIcon small /> Explain this opportunity
            </>
          )}
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, valueClass = 'text-gray-300' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white/[0.02] rounded-xl px-3 py-2">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

function NoLotsState() {
  const router = useRouter()
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
        <LeafIcon large />
      </div>
      <p className="text-white font-semibold mb-1">No transaction history yet</p>
      <p className="text-gray-500 text-sm mb-5 max-w-xs mx-auto">Import your Fidelity transactions CSV to calculate tax-loss harvesting opportunities from your individual lots.</p>
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
      >
        Go to Portfolio → Import Transactions
      </button>
    </div>
  )
}

function AllGreenState() {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">No harvesting opportunities right now</p>
      <p className="text-gray-500 text-sm max-w-xs mx-auto">All your open positions are currently at a gain. Check back after market volatility creates new opportunities.</p>
    </div>
  )
}


function LeafIcon({ large }: { large?: boolean }) {
  return (
    <svg className={large ? 'w-7 h-7 text-emerald-400' : 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function SparkleIcon({ small }: { small?: boolean }) {
  return (
    <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

