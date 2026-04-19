'use client'

import { Fragment, useState, useEffect } from 'react'

export interface Position {
  symbol: string
  description: string
  total_shares: number | null
  current_price: number | null
  current_value: number | null
  total_cost_basis: number | null
  total_gain_loss: number | null
  total_gain_loss_percent: number | null
  percent_of_account: number | null
  sector: string | null
  previous_close: number | null
  account_type: string | null
}

const RETIREMENT_TYPES = new Set(['401k', 'roth_401k', 'ira', 'roth_ira', 'rollover_ira', 'sep_ira', 'hsa'])

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  individual: 'Brokerage',
  '401k': '401(k)',
  roth_401k: 'Roth 401(k)',
  ira: 'IRA',
  roth_ira: 'Roth IRA',
  rollover_ira: 'Rollover IRA',
  sep_ira: 'SEP IRA',
  hsa: 'HSA',
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

function NoCostBasis() {
  return (
    <span
      className="inline-flex items-center gap-1 text-gray-600 cursor-default"
      title="Upload a transactions CSV to calculate cost basis and gain/loss"
    >
      <span>—</span>
      <svg className="w-3 h-3 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
      </svg>
    </span>
  )
}

function Spinner({ small }: { small?: boolean }) {
  const cls = small ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <svg className={`animate-spin ${cls}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function ActionButtons({ snapshotId, currentAction, onAction }: {
  snapshotId: string | null
  currentAction?: string
  onAction: (snapshotId: string, action: 'followed' | 'ignored') => void
}) {
  if (!snapshotId) return null
  if (currentAction === 'followed') {
    return (
      <div className="flex items-center gap-1.5 pt-4 border-t border-white/[0.05]">
        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm text-emerald-500/80 font-medium">Followed</span>
      </div>
    )
  }
  if (currentAction === 'ignored') {
    return (
      <div className="pt-4 border-t border-white/[0.05]">
        <span className="text-sm text-gray-600">Ignored</span>
      </div>
    )
  }
  return (
    <div className="flex gap-2 pt-4 border-t border-white/[0.05]">
      <button
        onClick={() => onAction(snapshotId, 'followed')}
        className="flex-1 py-2.5 text-xs font-semibold rounded-lg border border-emerald-500/20 text-emerald-500/80 hover:bg-emerald-500/[0.08] hover:text-emerald-400 transition"
      >
        Followed
      </button>
      <button
        onClick={() => onAction(snapshotId, 'ignored')}
        className="flex-1 py-2.5 text-xs font-semibold rounded-lg border border-white/[0.06] text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition"
      >
        Ignored
      </button>
    </div>
  )
}

const REC_COLORS: Record<string, string> = {
  BUY_MORE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SELL: 'bg-red-500/15 text-red-400 border-red-500/30',
  HOLD: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  REDUCE: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MAINTAIN: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  INCREASE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

const REC_LABEL: Record<string, string> = {
  BUY_MORE: 'BUY MORE', SELL: 'SELL', HOLD: 'HOLD',
  REDUCE: 'REDUCE', MAINTAIN: 'MAINTAIN', INCREASE: 'INCREASE',
}

function RecBadge({ rec }: { rec: any }) {
  const color = REC_COLORS[rec.recommendation] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${color}`}>
      {REC_LABEL[rec.recommendation] ?? rec.recommendation}
      {rec.confidence && <span className="opacity-60 font-normal">{rec.confidence[0]}</span>}
    </span>
  )
}

// ── Shared analysis content (used by both drawer and inline expand) ───────────

function AnalysisContent({
  symbol, recommendation, loading, error, snapshotId, recAction,
  onAction, onGetRecommendation, isRetirement,
}: {
  symbol: string
  recommendation: any
  loading: boolean
  error?: string
  snapshotId?: string
  recAction?: string
  onAction: (snapshotId: string, action: 'followed' | 'ignored') => void
  onGetRecommendation: (symbol: string) => void
  isRetirement: boolean
}) {
  if (loading) {
    return <div className="flex justify-center py-10 text-gray-600"><Spinner /></div>
  }

  if (recommendation) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <RecBadge rec={recommendation} />
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${isRetirement ? 'text-amber-700' : 'text-violet-600'}`}>
            Sage{isRetirement ? ' — Retirement' : ' Analysis'}
          </span>
        </div>
        {recommendation.reasoning && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-sm text-gray-300 leading-relaxed">{recommendation.reasoning}</p>
          </div>
        )}
        {recommendation.key_factors?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 mb-2">Key Factors</p>
            <div className="space-y-1.5">
              {recommendation.key_factors.map((f: string, i: number) => (
                <div key={i} className="flex gap-2 text-xs text-gray-500 leading-relaxed">
                  <span className="text-gray-700 shrink-0 mt-0.5">·</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {recommendation.recommendation === 'SELL' && recommendation.opportunity_cost && (
          <div className="bg-emerald-500/[0.04] border border-emerald-500/[0.12] rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 mb-2">Opportunity Cost</p>
            <p className="text-xs text-gray-500 mb-1.5">
              Capital freed:{' '}
              <span className="text-white font-medium">
                ${recommendation.opportunity_cost.freed_capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </p>
            {recommendation.opportunity_cost.best_position && (
              <p className="text-xs text-gray-500 mb-1.5">
                Best performer:{' '}
                <span className="text-emerald-400 font-medium">{recommendation.opportunity_cost.best_position.symbol}</span>{' '}
                <span className="text-emerald-400">+{recommendation.opportunity_cost.best_position.return_pct}%</span>
                <span className="text-gray-600"> all-time</span>
              </p>
            )}
            {recommendation.opportunity_cost.best_sector && (
              <p className="text-xs text-gray-500">
                Strongest sector:{' '}
                <span className="text-emerald-400 font-medium">{recommendation.opportunity_cost.best_sector.name}</span>{' '}
                <span className="text-emerald-400">+{recommendation.opportunity_cost.best_sector.return_pct}%</span>
                <span className="text-gray-600"> ({recommendation.opportunity_cost.best_sector.period} trend)</span>
              </p>
            )}
          </div>
        )}
        <ActionButtons snapshotId={snapshotId ?? null} currentAction={recAction} onAction={onAction} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-red-400 mb-3">{error}</p>
        <button
          onClick={() => onGetRecommendation(symbol)}
          className="text-xs border border-red-500/20 text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg transition"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <p className="text-xs text-gray-600">Sage hasn't analyzed {symbol} yet.</p>
      <button
        onClick={() => onGetRecommendation(symbol)}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-violet-400 border border-white/[0.08] hover:border-violet-500/30 px-3 py-1.5 rounded-lg transition shrink-0"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Ask Sage
      </button>
    </div>
  )
}

// ── Option B: Side Drawer (desktop) ─────────────────────────────────────────

interface DrawerProps {
  symbol: string
  position: Position
  recommendation: any
  loading: boolean
  error?: string
  snapshotId?: string
  recAction?: string
  onAction: (snapshotId: string, action: 'followed' | 'ignored') => void
  onGetRecommendation: (symbol: string) => void
  onClose: () => void
  isRetirement: boolean
}

function DrawerPanel({
  symbol, position, recommendation, loading, error,
  snapshotId, recAction, onAction, onGetRecommendation, onClose, isRetirement,
}: DrawerProps) {
  return (
    <div className="bg-[#0d0d14] border border-white/[0.08] rounded-2xl overflow-hidden sticky top-6">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
            isRetirement
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
          }`}>
            {symbol.slice(0, 2)}
          </div>
          <div>
            <div className="font-bold text-[15px] text-white">{symbol}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{position.description || '—'}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.08] transition shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-5">
        <AnalysisContent
          symbol={symbol}
          recommendation={recommendation}
          loading={loading}
          error={error}
          snapshotId={snapshotId}
          recAction={recAction}
          onAction={onAction}
          onGetRecommendation={onGetRecommendation}
          isRetirement={isRetirement}
        />
      </div>
    </div>
  )
}

// ── Option A: Inline Expand Row (mobile) ─────────────────────────────────────

function InlineExpandRow({
  colSpan, symbol, recommendation, loading, error,
  snapshotId, recAction, onAction, onGetRecommendation, isRetirement,
}: {
  colSpan: number
  symbol: string
  recommendation: any
  loading: boolean
  error?: string
  snapshotId?: string
  recAction?: string
  onAction: (snapshotId: string, action: 'followed' | 'ignored') => void
  onGetRecommendation: (symbol: string) => void
  isRetirement: boolean
}) {
  return (
    <tr className="border-b border-white/[0.04]">
      <td colSpan={colSpan} className="px-4 pb-4 pt-0">
        <div className={`rounded-xl border p-4 ${
          isRetirement
            ? 'bg-amber-500/[0.03] border-amber-500/[0.10]'
            : 'bg-violet-500/[0.03] border-violet-500/[0.10]'
        }`}>
          <AnalysisContent
            symbol={symbol}
            recommendation={recommendation}
            loading={loading}
            error={error}
            snapshotId={snapshotId}
            recAction={recAction}
            onAction={onAction}
            onGetRecommendation={onGetRecommendation}
            isRetirement={isRetirement}
          />
        </div>
      </td>
    </tr>
  )
}

// ── Position Row ─────────────────────────────────────────────────────────────

function PositionRow({
  p, recommendations, loadingRec, recErrors,
  isSelected, onRowClick, onGetRecommendation, readOnly, isRetirement,
}: {
  p: Position
  recommendations: Record<string, any>
  loadingRec: Record<string, boolean>
  recErrors: Record<string, string>
  isSelected: boolean
  onRowClick: (symbol: string) => void
  onGetRecommendation: (symbol: string) => void
  readOnly?: boolean
  isRetirement: boolean
}) {
  const selectedBg = isRetirement ? 'bg-amber-500/[0.05]' : 'bg-violet-500/[0.06]'

  return (
    <tr
      onClick={() => onRowClick(p.symbol)}
      className={`cursor-pointer transition-colors ${isSelected ? selectedBg : 'hover:bg-white/[0.02]'}`}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
            isRetirement
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
          }`}>
            {p.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white">{p.symbol}</span>
              {p.account_type && p.account_type !== 'individual' && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {ACCOUNT_TYPE_LABEL[p.account_type] ?? p.account_type}
                </span>
              )}
            </div>
            <div className="text-gray-600 text-xs truncate max-w-[140px]">{p.description}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        {p.sector
          ? <span className="text-xs bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full text-gray-400">{p.sector}</span>
          : <span className="text-gray-700">—</span>}
      </td>
      <td className="px-5 py-4 text-right text-gray-300">{p.total_shares ?? '—'}</td>
      <td className="px-5 py-4 text-right text-gray-300">{fmt(p.current_price, '$')}</td>
      <td className="px-5 py-4 text-right font-semibold text-white">{fmt(p.current_value, '$')}</td>
      <td className="px-5 py-4 text-right text-gray-500">
        {p.total_cost_basis != null ? fmt(p.total_cost_basis, '$') : <NoCostBasis />}
      </td>
      <td className={`px-5 py-4 text-right font-medium ${gainColor(p.total_gain_loss)}`}>
        {p.total_gain_loss != null
          ? (p.total_gain_loss >= 0 ? '+$' : '−$') + Math.abs(p.total_gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2 })
          : <span className="text-gray-700">—</span>}
      </td>
      <td className="px-5 py-4 text-right">
        {p.total_gain_loss_percent != null ? (
          <span className={`text-xs px-2 py-1 rounded-lg font-medium ${gainBg(p.total_gain_loss_percent)}`}>
            {p.total_gain_loss_percent >= 0 ? '+' : ''}{p.total_gain_loss_percent.toFixed(2)}%
          </span>
        ) : <span className="text-gray-700">—</span>}
      </td>
      <td className="px-5 py-4 text-right">
        {(() => {
          const { current_price, previous_close, total_shares } = p
          if (current_price == null || previous_close == null) return <span className="text-gray-700">—</span>
          const dayPct = ((current_price - previous_close) / previous_close) * 100
          const dayDollar = total_shares != null ? (current_price - previous_close) * total_shares : null
          const pos = dayPct >= 0
          return (
            <div className="flex flex-col items-end gap-0.5">
              <span className={`text-xs font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                {pos ? '+' : ''}{dayPct.toFixed(2)}%
              </span>
              {dayDollar != null && (
                <span className={`text-[11px] ${pos ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                  {pos ? '+$' : '−$'}{Math.abs(dayDollar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )
        })()}
      </td>
      {!readOnly && (
        <td className="px-5 py-4 text-right">
          {loadingRec[p.symbol] ? (
            <span className="inline-flex justify-center w-full"><Spinner /></span>
          ) : recommendations[p.symbol] ? (
            <RecBadge rec={recommendations[p.symbol]} />
          ) : recErrors[p.symbol] ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRowClick(p.symbol); onGetRecommendation(p.symbol) }}
              title={recErrors[p.symbol]}
              className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1 rounded-lg transition"
            >
              Retry
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onRowClick(p.symbol); onGetRecommendation(p.symbol) }}
              className="text-xs text-gray-600 hover:text-violet-400 border border-white/[0.06] hover:border-violet-500/30 px-2.5 py-1 rounded-lg transition"
            >
              Ask Sage
            </button>
          )}
        </td>
      )}
    </tr>
  )
}

// ── Positions Section ────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  subtitle: string
  accentClass: string
  positions: Position[]
  recommendations: Record<string, any>
  loadingRec: Record<string, boolean>
  recErrors: Record<string, string>
  snapshotIds: Record<string, string>
  recActions: Record<string, string>
  selectedSymbol: string | null
  onRowClick: (symbol: string) => void
  onGetRecommendation: (symbol: string) => void
  onAction?: (symbol: string, snapshotId: string, action: 'followed' | 'ignored') => void
  readOnly?: boolean
  headerRight?: React.ReactNode
  isRetirement: boolean
  isMobile: boolean
}

function PositionsSection({
  title, subtitle, accentClass, positions, recommendations, loadingRec, recErrors,
  snapshotIds, recActions, selectedSymbol, onRowClick, onGetRecommendation, onAction,
  readOnly, headerRight, isRetirement, isMobile,
}: SectionProps) {
  const colSpan = readOnly ? 9 : 10
  return (
    <div>
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${accentClass}`} />
            <h3 className="font-semibold text-sm">{title}</h3>
            <span className="text-xs text-gray-600">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 ml-3.5">{subtitle}</p>
        </div>
        {headerRight}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {['Symbol', 'Sector', 'Shares', 'Price', 'Value', 'Cost Basis', 'Gain / Loss', '%', 'Day', ...(readOnly ? [] : ['Sage'])].map((h, i) => (
                <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {positions.map((p) => (
              <Fragment key={p.symbol}>
                <PositionRow
                  p={p}
                  recommendations={recommendations}
                  loadingRec={loadingRec}
                  recErrors={recErrors}
                  isSelected={selectedSymbol === p.symbol}
                  onRowClick={onRowClick}
                  onGetRecommendation={onGetRecommendation}
                  readOnly={readOnly}
                  isRetirement={isRetirement}
                />
                {isMobile && selectedSymbol === p.symbol && (
                  <InlineExpandRow
                    colSpan={colSpan}
                    symbol={p.symbol}
                    recommendation={recommendations[p.symbol]}
                    loading={!!loadingRec[p.symbol]}
                    error={recErrors[p.symbol]}
                    snapshotId={snapshotIds[p.symbol]}
                    recAction={recActions[p.symbol]}
                    onAction={(sid, action) => onAction?.(p.symbol, sid, action)}
                    onGetRecommendation={onGetRecommendation}
                    isRetirement={isRetirement}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

interface Props {
  positions: Position[]
  loadingRec: Record<string, boolean>
  recommendations: Record<string, any>
  recErrors: Record<string, string>
  snapshotIds?: Record<string, string>
  recActions?: Record<string, string>
  onGetRecommendation: (symbol: string) => void
  onAction?: (symbol: string, snapshotId: string, action: 'followed' | 'ignored') => void
  onImportClick: () => void
  readOnly?: boolean
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}

export default function PositionsTable({
  positions, loadingRec, recommendations, recErrors,
  snapshotIds = {}, recActions = {}, onGetRecommendation, onAction, onImportClick, readOnly,
}: Props) {
  const [loadingAllPersonal, setLoadingAllPersonal] = useState(false)
  const [loadingAllRetirement, setLoadingAllRetirement] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const personalPositions = positions.filter(p => !RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
  const retirementPositions = positions.filter(p => RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
  const hasPersonal = personalPositions.length > 0
  const hasRetirement = retirementPositions.length > 0
  const hasBoth = hasPersonal && hasRetirement

  const selectedPosition = positions.find(p => p.symbol === selectedSymbol) ?? null
  const isSelectedRetirement = selectedPosition
    ? RETIREMENT_TYPES.has(selectedPosition.account_type ?? 'individual')
    : false
  // Drawer is only shown on desktop
  const drawerOpen = !isMobile && selectedSymbol !== null && selectedPosition !== null

  function handleRowClick(symbol: string) {
    setSelectedSymbol(prev => prev === symbol ? null : symbol)
  }

  if (positions.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-white font-semibold mb-1">No positions yet</p>
        <p className="text-gray-500 text-sm mb-5">Import your Fidelity CSV to get started</p>
        <button
          onClick={onImportClick}
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-violet-500/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import CSV
        </button>
      </div>
    )
  }

  async function handleAskAll(group: Position[], setLoading: (v: boolean) => void) {
    setLoading(true)
    const pending = group.filter(p => !recommendations[p.symbol] && !loadingRec[p.symbol])
    for (const p of pending) {
      onGetRecommendation(p.symbol)
      await new Promise(r => setTimeout(r, 350))
    }
    setLoading(false)
  }

  function AskAllButton({ group, loading, setLoading }: {
    group: Position[]; loading: boolean; setLoading: (v: boolean) => void
  }) {
    const pending = group.filter(p => !recommendations[p.symbol] && !loadingRec[p.symbol])
    const doneCount = group.filter(p => recommendations[p.symbol]).length
    if (readOnly) return null
    return (
      <div className="flex items-center gap-2">
        {doneCount > 0 && (
          <span className="text-xs text-gray-600">{doneCount}/{group.length} analyzed</span>
        )}
        <button
          onClick={() => handleAskAll(group, setLoading)}
          disabled={loading || pending.length === 0}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-violet-400 border border-white/[0.08] hover:border-violet-500/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Spinner small /> : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
          {loading ? 'Analyzing…' : pending.length === 0 ? 'All analyzed' : 'Ask Sage'}
        </button>
      </div>
    )
  }

  // Desktop drawer element
  const drawerEl = drawerOpen && selectedPosition ? (
    <DrawerPanel
      symbol={selectedSymbol!}
      position={selectedPosition}
      recommendation={recommendations[selectedSymbol!]}
      loading={!!loadingRec[selectedSymbol!]}
      error={recErrors[selectedSymbol!]}
      snapshotId={snapshotIds[selectedSymbol!]}
      recAction={recActions[selectedSymbol!]}
      onAction={(sid, action) => onAction?.(selectedSymbol!, sid, action)}
      onGetRecommendation={onGetRecommendation}
      onClose={() => setSelectedSymbol(null)}
      isRetirement={isSelectedRetirement}
    />
  ) : null

  // Shared section props
  const sharedSectionProps = {
    recommendations, loadingRec, recErrors, snapshotIds, recActions,
    selectedSymbol, onRowClick: handleRowClick, onGetRecommendation, onAction,
    readOnly, isMobile,
  }

  // The section cards (left column on desktop, full-width on mobile)
  const sectionCards = !hasBoth ? (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="font-semibold">Positions</h2>
        <AskAllButton
          group={positions}
          loading={hasRetirement ? loadingAllRetirement : loadingAllPersonal}
          setLoading={hasRetirement ? setLoadingAllRetirement : setLoadingAllPersonal}
        />
      </div>
      <PositionsSection
        {...sharedSectionProps}
        title={hasRetirement ? 'Retirement' : 'Brokerage'}
        subtitle={hasRetirement
          ? 'Sage recommends rebalancing actions — no sell signals for retirement accounts'
          : 'Sage gives Buy / Hold / Sell recommendations based on your investment style'}
        accentClass={hasRetirement ? 'bg-amber-400' : 'bg-violet-400'}
        positions={positions}
        isRetirement={hasRetirement}
      />
    </div>
  ) : (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
        <PositionsSection
          {...sharedSectionProps}
          title="Brokerage"
          subtitle="Buy / Hold / Sell recommendations based on your investment style"
          accentClass="bg-violet-400"
          positions={personalPositions}
          isRetirement={false}
          headerRight={<AskAllButton group={personalPositions} loading={loadingAllPersonal} setLoading={setLoadingAllPersonal} />}
        />
      </div>
      <div className="bg-white/[0.03] border border-amber-500/[0.08] rounded-2xl overflow-hidden">
        <PositionsSection
          {...sharedSectionProps}
          title="Retirement Accounts"
          subtitle="Sage recommends rebalancing actions — no sell signals, focused on allocation balance"
          accentClass="bg-amber-400"
          positions={retirementPositions}
          isRetirement={true}
          headerRight={<AskAllButton group={retirementPositions} loading={loadingAllRetirement} setLoading={setLoadingAllRetirement} />}
        />
        <div className="px-6 py-3 border-t border-white/[0.04] flex items-center gap-2 bg-amber-500/[0.03]">
          <svg className="w-3.5 h-3.5 text-amber-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-500/60">
            Add your retirement year and age in your profile to unlock glide path alignment scoring for these accounts.
          </p>
        </div>
      </div>
    </div>
  )

  // Mobile: just the cards (inline expand handled inside PositionsSection)
  if (isMobile) {
    return sectionCards
  }

  // Desktop: grid with side drawer
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: drawerOpen ? '1fr 380px' : '1fr 0px',
        gap: drawerOpen ? '16px' : '0px',
        transition: 'grid-template-columns 0.25s cubic-bezier(.4,0,.2,1), gap 0.25s',
        alignItems: 'start',
      }}
    >
      <div className="min-w-0">{sectionCards}</div>
      <div style={{ overflow: 'hidden' }}>
        <div
          style={{ width: '380px' }}
          className={`transition-all duration-200 ${drawerOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5 pointer-events-none'}`}
        >
          {drawerEl}
        </div>
      </div>
    </div>
  )
}
