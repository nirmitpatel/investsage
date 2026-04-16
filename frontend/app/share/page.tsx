'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PositionsTable from '@/components/PositionsTable'
import SectorBreakdownPanel from '@/components/SectorBreakdownPanel'
import type { Position } from '@/components/PositionsTable'
import type { SectorBreakdownItem } from '@/components/SectorBreakdownPanel'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

type InvestmentStyle = 'play_it_safe' | 'beat_the_market' | 'long_game' | null

interface Health {
  score: number
  grade: string
  total_value: number
  total_gain_loss: number | null
  position_count: number
  issues: { type: string; severity: string; message: string }[]
  notes: string[]
  opportunities: string[]
  sector_breakdown: SectorBreakdownItem[]
  investment_style: InvestmentStyle
  market_trends_period: string
}

const STYLE_CONFIG = {
  play_it_safe: { label: 'Play it safe', emoji: '🛡️', color: 'text-blue-300', bg: 'bg-blue-500/10 border-blue-500/30' },
  beat_the_market: { label: 'Beat the market', emoji: '⚡', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/30' },
  long_game: { label: 'Long game', emoji: '🌱', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30' },
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

function ShareView() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [positions, setPositions] = useState<Position[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [portfolioName, setPortfolioName] = useState<string>('Portfolio')
  const [investmentStyle, setInvestmentStyle] = useState<InvestmentStyle>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    fetch(`${API}/api/v1/share/${token}`)
      .then(res => {
        if (res.status === 404) { setNotFound(true); setLoading(false); return null }
        return res.ok ? res.json() : null
      })
      .then(data => {
        if (!data) return
        setPositions(data.positions ?? [])
        setHealth(data.health ?? null)
        setPortfolioName(data.portfolio?.name ?? 'Portfolio')
        setInvestmentStyle(data.portfolio?.investment_style ?? null)
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [token])

  const gainLoss = health?.total_gain_loss ?? null
  const gainLossAbs = gainLoss != null ? Math.abs(gainLoss) : null
  const styleCfg = investmentStyle ? STYLE_CONFIG[investmentStyle] : null

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">{portfolioName}</h1>
          {health && <p className="text-xs text-gray-500">{health.position_count} positions</p>}
        </div>
        {styleCfg && (
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${styleCfg.bg} ${styleCfg.color}`}>
            <span>{styleCfg.emoji}</span><span>{styleCfg.label}</span>
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <svg className="animate-spin h-8 w-8 text-violet-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : notFound ? (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">Link not found</p>
          <p className="text-gray-500 text-sm">This share link has been revoked or doesn't exist.</p>
        </div>
      ) : (
        <>
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
                gainLoss != null ? (
                  <>
                    <p className={`text-3xl font-bold tracking-tight ${gainColor(gainLoss)}`}>
                      {gainLoss >= 0 ? '+' : '−'}${gainLossAbs!.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${gainBg(gainLoss)}`}>
                      {gainLoss >= 0 ? 'All time gain' : 'All time loss'}
                    </span>
                  </>
                ) : (
                  <p className="text-3xl font-bold text-gray-700">—</p>
                )
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

          {/* Positions */}
          <PositionsTable
            positions={positions}
            loadingRec={{}}
            recommendations={{}}
            recErrors={{}}
            onGetRecommendation={() => {}}
            onImportClick={() => {}}
            readOnly
          />
        </>
      )}
    </main>
  )
}

export default function SharePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Read-only banner */}
      <div className="bg-violet-600/10 border-b border-violet-500/20 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-violet-300">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Read-only shared view
        </div>
        <a href="/" className="text-xs text-gray-500 hover:text-gray-300 transition">
          InvestSage
        </a>
      </div>
      <Suspense fallback={
        <div className="flex items-center justify-center py-32">
          <svg className="animate-spin h-8 w-8 text-violet-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      }>
        <ShareView />
      </Suspense>
    </div>
  )
}
