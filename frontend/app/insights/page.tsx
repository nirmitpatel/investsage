'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface AnalysisResult {
  summary: string
  health: {
    score: number
    grade: string
    total_value: number
    total_gain_loss: number
    position_count: number
    investment_style: string | null
    issues: { type: string; severity: string; message: string }[]
  }
  tax_summary: {
    opportunity_count: number
    total_tax_savings_estimate: number
  }
}

export default function InsightsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  async function handleAnalyze() {
    setLoading(true)
    setError('')
    const token = await getToken()
    if (!token) { router.push('/login'); return }

    try {
      const res = await fetch(`${API}/api/v1/ai/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { router.push('/login'); return }
      if (res.ok) {
        setResult(await res.json())
      } else {
        setError('Analysis failed. Please try again.')
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
      <Sidebar active="insights" onSignOut={handleSignOut} />

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-8 py-4">
          <h1 className="text-lg font-semibold">AI Insights</h1>
          <p className="text-xs text-gray-500 mt-0.5">Plain-English portfolio analysis powered by Claude</p>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-3xl">
          {/* Trigger */}
          {!result && !loading && !error && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <SparkleIcon large />
              </div>
              <p className="text-white font-semibold mb-1">Get your portfolio analysis</p>
              <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                Claude will analyze your portfolio health, sector exposure, and tax opportunities — and explain what it all means in plain English.
              </p>
              <button
                onClick={handleAnalyze}
                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-6 py-3 rounded-xl text-sm font-semibold transition shadow-lg shadow-violet-500/20"
              >
                <SparkleIcon /> Analyze my portfolio
              </button>
            </div>
          )}

          {/* Error retry card */}
          {!result && !loading && error && (
            <div className="bg-white/[0.03] border border-red-500/20 rounded-2xl p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">Analysis failed</p>
              <p className="text-gray-500 text-sm mb-5">{error}</p>
              <button
                onClick={handleAnalyze}
                className="inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] px-5 py-2.5 rounded-xl text-sm font-medium transition"
              >
                Try again
              </button>
            </div>
          )}

          {loading && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
              <svg className="animate-spin h-6 w-6 text-violet-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-400 text-sm">Claude is analyzing your portfolio...</p>
              <p className="text-gray-600 text-xs mt-1">This takes ~15 seconds</p>
            </div>
          )}

          {result && (
            <>
              {/* AI Summary */}
              <div className="bg-gradient-to-br from-violet-500/10 to-violet-500/5 border border-violet-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <SparkleIcon />
                  <span className="font-semibold text-violet-300">Portfolio Summary</span>
                  <span className="text-xs text-gray-600 ml-auto">Powered by Claude</span>
                </div>
                <p className="text-gray-200 leading-relaxed text-[15px]">{result.summary}</p>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <QuickStat label="Health Score" value={`${result.health.score}/100`} sub={`Grade ${result.health.grade}`} />
                <QuickStat label="Portfolio Value" value={`$${result.health.total_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
                <QuickStat label="Issues Found" value={String(result.health.issues.length)} sub={result.health.issues.length === 0 ? 'All clear' : 'See portfolio'} />
                {result.tax_summary?.opportunity_count > 0 ? (
                  <QuickStat
                    label="Tax Savings"
                    value={`$${result.tax_summary.total_tax_savings_estimate.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                    sub="Est. harvestable"
                    highlight
                  />
                ) : (
                  <QuickStat label="Tax Opportunities" value="None" sub="All positions at gain" />
                )}
              </div>

              {/* Issues */}
              {result.health.issues.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
                  <h2 className="font-semibold mb-4 text-sm text-gray-400 uppercase tracking-wider">Issues Detected</h2>
                  <div className="space-y-2">
                    {result.health.issues.map((issue, i) => (
                      <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${
                        issue.severity === 'high' ? 'border-red-500/30 bg-red-500/5 text-red-300' :
                        issue.severity === 'medium' ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300' :
                        'border-blue-500/30 bg-blue-500/5 text-blue-300'
                      }`}>
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          issue.severity === 'high' ? 'bg-red-400' :
                          issue.severity === 'medium' ? 'bg-yellow-400' : 'bg-blue-400'
                        }`} />
                        <p className="text-sm leading-relaxed">{issue.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Re-analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 border border-white/[0.06] hover:border-white/[0.10] px-4 py-2 rounded-xl transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-analyze
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function QuickStat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${highlight ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.03] border-white/[0.08]'}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

function SparkleIcon({ large }: { large?: boolean }) {
  return <svg className={large ? 'w-7 h-7 text-violet-400' : 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
}

function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  )
}
