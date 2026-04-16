'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, getToken } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface SellStep {
  step: number
  action: 'SELL'
  symbol: string
  sector: string
  shares: number
  estimated_proceeds: number
  unrealized_loss: number
  tax_savings: number
  holding_period: string
  is_short_term: boolean
  days_until_lt: number | null
  urgency: 'high' | 'medium' | null
  holding_deadline_note: string | null
  wash_sale_window_end: string
  replacement_symbol: string
  rationale: string
  running_cash_balance: number
}

interface BuyStep {
  step: number
  action: 'BUY'
  symbol: string
  sector: string
  estimated_cost: number
  paired_sell: string
  wash_sale_warning: string
  wash_sale_safe_after: string
  rationale: string
  running_cash_balance: number
}

type PlanStep = SellStep | BuyStep

interface PlanSummary {
  total_proceeds: number
  total_tax_savings: number
  total_reinvestment_cost: number
  final_cash_balance: number
  sell_count: number
  buy_count: number
  wash_sale_warnings: number
  holding_period_deadlines: number
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ExecutionPlanPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState(false)
  const [hasLots, setHasLots] = useState(false)
  const [steps, setSteps] = useState<PlanStep[]>([])
  const [summary, setSummary] = useState<PlanSummary | null>(null)
  const [completed, setCompleted] = useState<Set<number>>(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadingError(false)
    const token = await getToken()
    if (!token) { router.push('/login'); return }

    try {
      const res = await fetch(`${API}/api/v1/analysis/execution-plan`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { router.push('/login?reason=session_expired'); return }
      if (res.ok) {
        const data = await res.json()
        setHasLots(data.has_lots ?? false)
        setSteps(data.steps ?? [])
        setSummary(data.summary ?? null)
      } else {
        setLoadingError(true)
      }
    } catch {
      setLoadingError(true)
    }
    setLoading(false)
  }

  function toggleComplete(stepNum: number) {
    setCompleted(prev => {
      const next = new Set(prev)
      if (next.has(stepNum)) next.delete(stepNum)
      else next.add(stepNum)
      return next
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const sells = steps.filter(s => s.action === 'SELL') as SellStep[]
  const buys = steps.filter(s => s.action === 'BUY') as BuyStep[]
  const doneCount = completed.size

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <Sidebar active="execution-plan" onSignOut={handleSignOut} />

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-4 md:px-8 py-4">
          <h1 className="text-lg font-semibold">Execution Plan</h1>
          <p className="text-xs text-gray-500 mt-0.5">Step-by-step sequence to execute your tax-loss harvest</p>
        </div>

        <div className="px-4 md:px-8 py-6 space-y-6">
          {loading ? (
            <LoadingCard />
          ) : loadingError ? (
            <ErrorCard onRetry={load} />
          ) : !hasLots ? (
            <NoLotsCard router={router} />
          ) : steps.length === 0 ? (
            <NoOpportunitiesCard />
          ) : (
            <>
              {/* Summary cards */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <SummaryCard
                    label="Est. Proceeds"
                    value={`$${fmt(summary.total_proceeds)}`}
                    color="text-blue-400"
                  />
                  <SummaryCard
                    label="Est. Tax Savings"
                    value={`$${fmt(summary.total_tax_savings)}`}
                    color="text-emerald-400"
                  />
                  <SummaryCard
                    label="Wash Sale Windows"
                    value={String(summary.wash_sale_warnings)}
                    color={summary.wash_sale_warnings > 0 ? 'text-yellow-400' : 'text-gray-400'}
                  />
                  <SummaryCard
                    label="Urgent Deadlines"
                    value={String(summary.holding_period_deadlines)}
                    color={summary.holding_period_deadlines > 0 ? 'text-red-400' : 'text-gray-400'}
                  />
                </div>
              )}

              {/* Progress bar */}
              {steps.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 font-medium">
                      {doneCount} of {steps.length} steps completed
                    </p>
                    {doneCount > 0 && (
                      <button
                        onClick={() => setCompleted(new Set())}
                        className="text-xs text-gray-600 hover:text-gray-400 transition"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-300"
                      style={{ width: `${(doneCount / steps.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-gray-600 bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3">
                <span className="text-gray-500 font-medium">Disclaimer:</span> This plan is for educational purposes only. Consult a tax advisor before executing trades. Wash-sale rules apply — avoid repurchasing substantially identical securities within 30 days of a loss sale.
              </p>

              {/* Phase: SELL */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">Phase 1 — Sell</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <div className="space-y-3">
                  {sells.map(step => (
                    <SellCard
                      key={step.step}
                      step={step}
                      completed={completed.has(step.step)}
                      onToggle={() => toggleComplete(step.step)}
                    />
                  ))}
                </div>
              </div>

              {/* Phase: BUY */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Phase 2 — Buy Replacements</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <div className="space-y-3">
                  {buys.map(step => (
                    <BuyCard
                      key={step.step}
                      step={step}
                      completed={completed.has(step.step)}
                      onToggle={() => toggleComplete(step.step)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
    </div>
  )
}

function SellCard({ step, completed, onToggle }: { step: SellStep; completed: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-white/[0.03] border rounded-2xl p-5 transition ${completed ? 'opacity-50 border-white/[0.05]' : 'border-red-500/20'}`}>
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${
            completed ? 'bg-violet-600 border-violet-500' : 'border-white/20 hover:border-violet-500/60'
          }`}
        >
          {completed && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 uppercase tracking-wider">
              Step {step.step} · Sell
            </span>
            <span className="font-semibold text-white">{step.symbol}</span>
            <span className="text-xs text-gray-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{step.sector}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
              step.is_short_term
                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
            }`}>
              {step.holding_period}
            </span>
            {step.urgency === 'high' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                Harvest soon
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <Stat label="Est. Proceeds" value={`$${fmt(step.estimated_proceeds)}`} valueClass="text-blue-400" />
            <Stat label="Tax Savings" value={`$${fmt(step.tax_savings)}`} valueClass="text-emerald-400" />
            <Stat label="Unrealized Loss" value={`-$${fmt(step.unrealized_loss)}`} valueClass="text-red-400" />
            <Stat label="Cash After" value={`$${fmt(step.running_cash_balance)}`} valueClass="text-gray-300" />
          </div>

          <p className="text-xs text-gray-500 mb-3">{step.rationale}</p>

          {/* Holding deadline warning */}
          {step.holding_deadline_note && (
            <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5 mb-2">
              <svg className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-red-300">{step.holding_deadline_note}</p>
            </div>
          )}

          {/* Wash sale notice */}
          <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-3 py-2.5">
            <svg className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-yellow-300/80">
              Wash-sale window active until <span className="font-semibold text-yellow-300">{step.wash_sale_window_end}</span>. Replacement: <span className="text-gray-300">{step.replacement_symbol}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function BuyCard({ step, completed, onToggle }: { step: BuyStep; completed: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-white/[0.03] border rounded-2xl p-5 transition ${completed ? 'opacity-50 border-white/[0.05]' : 'border-emerald-500/20'}`}>
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition ${
            completed ? 'bg-violet-600 border-violet-500' : 'border-white/20 hover:border-violet-500/60'
          }`}
        >
          {completed && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
              Step {step.step} · Buy
            </span>
            <span className="font-semibold text-white">{step.symbol}</span>
            <span className="text-xs text-gray-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{step.sector}</span>
            <span className="text-xs text-gray-600">
              replaces <span className="text-gray-400">{step.paired_sell}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            <Stat label="Est. Cost" value={`$${fmt(step.estimated_cost)}`} valueClass="text-blue-400" />
            <Stat label="Cash After" value={`$${fmt(step.running_cash_balance)}`} valueClass="text-gray-300" />
            <Stat label="Safe to Buy After" value={step.wash_sale_safe_after} valueClass="text-yellow-300" />
          </div>

          <p className="text-xs text-gray-500 mb-3">{step.rationale}</p>

          {/* Wash sale warning */}
          <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-3 py-2.5">
            <svg className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs text-yellow-300/80">{step.wash_sale_warning}</p>
          </div>
        </div>
      </div>
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

function LoadingCard() {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <svg className="animate-spin h-6 w-6 text-violet-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-gray-500 text-sm">Building execution plan...</p>
    </div>
  )
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-white/[0.03] border border-red-500/20 rounded-2xl p-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">Failed to build execution plan</p>
      <p className="text-gray-500 text-sm mb-5">There was a problem connecting to the server.</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-5 py-2.5 rounded-xl text-sm font-medium transition"
      >
        Try again
      </button>
    </div>
  )
}

function NoLotsCard({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">No transaction history yet</p>
      <p className="text-gray-500 text-sm mb-5 max-w-xs mx-auto">Import your transactions CSV to generate a personalized tax-loss harvest execution plan.</p>
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
      >
        Go to Portfolio → Import Transactions
      </button>
    </div>
  )
}

function NoOpportunitiesCard() {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-white font-semibold mb-1">No execution needed right now</p>
      <p className="text-gray-500 text-sm max-w-xs mx-auto">All positions are at a gain — no tax-loss harvesting opportunities to execute. Check back after market volatility creates new openings.</p>
    </div>
  )
}
