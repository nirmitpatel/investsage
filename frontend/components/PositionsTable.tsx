'use client'

import { useRef, useState } from 'react'

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
      <div className="flex items-center gap-1 mt-1.5">
        <span className="text-[10px] text-emerald-500/70 flex items-center gap-0.5">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Followed
        </span>
      </div>
    )
  }
  if (currentAction === 'ignored') {
    return (
      <div className="flex items-center gap-1 mt-1.5">
        <span className="text-[10px] text-gray-600">Ignored</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 mt-1.5">
      <button
        onClick={() => onAction(snapshotId, 'followed')}
        className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-400 transition"
      >
        Followed
      </button>
      <button
        onClick={() => onAction(snapshotId, 'ignored')}
        className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.06] text-gray-600 hover:text-gray-400 transition"
      >
        Ignored
      </button>
    </div>
  )
}

function RecBadge({ rec, snapshotId, recAction, onAction }: { rec: any; snapshotId: string | null; recAction?: string; onAction: (id: string, action: 'followed' | 'ignored') => void }) {
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const btnRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const colors: Record<string, string> = {
    BUY_MORE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    SELL: 'bg-red-500/15 text-red-400 border-red-500/30',
    HOLD: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    REDUCE: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    MAINTAIN: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    INCREASE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  }
  const label: Record<string, string> = {
    BUY_MORE: 'BUY MORE', SELL: 'SELL', HOLD: 'HOLD',
    REDUCE: 'REDUCE', MAINTAIN: 'MAINTAIN', INCREASE: 'INCREASE',
  }
  const color = colors[rec.recommendation] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'

  function handleMouseEnter() {
    timerRef.current = setTimeout(() => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        const right = Math.max(8, window.innerWidth - rect.right)
        if (spaceBelow < spaceAbove) {
          setPopoverStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 4, right, maxHeight: spaceAbove - 8 })
        } else {
          setPopoverStyle({ position: 'fixed', top: rect.bottom + 4, right, maxHeight: spaceBelow - 8 })
        }
      }
      setOpen(true)
    }, 150)
  }

  function handleMouseLeave() {
    clearTimeout(timerRef.current)
    setOpen(false)
  }

  return (
    <div className="inline-flex flex-col items-end" onMouseLeave={handleMouseLeave}>
      <button
        ref={btnRef}
        onMouseEnter={handleMouseEnter}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-default ${color}`}
      >
        {label[rec.recommendation] ?? rec.recommendation}
        {rec.confidence && <span className="opacity-60 font-normal">{rec.confidence[0]}</span>}
      </button>
      <ActionButtons snapshotId={snapshotId} currentAction={recAction} onAction={onAction} />
      {open && (
        <div
          style={popoverStyle}
          className="z-50 w-72 bg-[#13131f] border border-white/[0.10] rounded-xl shadow-2xl p-4 text-left overflow-y-auto"
          onMouseEnter={() => clearTimeout(timerRef.current)}
          onMouseLeave={handleMouseLeave}
        >
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {label[rec.recommendation] ?? rec.recommendation}
            {rec.confidence && (
              <span className="ml-1.5 normal-case font-normal text-gray-600">
                ({rec.confidence.toLowerCase()} confidence)
              </span>
            )}
          </p>
          {rec.reasoning && (
            <p className="text-sm text-gray-300 leading-relaxed mb-3">{rec.reasoning}</p>
          )}
          {rec.key_factors?.length > 0 && (
            <ul className="space-y-1">
              {rec.key_factors.map((f: string, i: number) => (
                <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                  <span className="text-gray-700 mt-0.5">·</span>{f}
                </li>
              ))}
            </ul>
          )}
          {rec.recommendation === 'SELL' && rec.opportunity_cost && (
            <div className="mt-3 pt-3 border-t border-white/[0.08]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Opportunity Cost</p>
              <p className="text-xs text-gray-500 mb-2">
                Capital freed:{' '}
                <span className="text-white font-medium">
                  ${rec.opportunity_cost.freed_capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </p>
              {rec.opportunity_cost.best_position && (
                <p className="text-xs text-gray-500 mb-1.5">
                  Best performer:{' '}
                  <span className="text-emerald-400 font-medium">{rec.opportunity_cost.best_position.symbol}</span>
                  {' '}
                  <span className="text-emerald-400">+{rec.opportunity_cost.best_position.return_pct}%</span>
                  <span className="text-gray-600"> all-time</span>
                </p>
              )}
              {rec.opportunity_cost.best_sector && (
                <p className="text-xs text-gray-500">
                  Strongest sector:{' '}
                  <span className="text-emerald-400 font-medium">{rec.opportunity_cost.best_sector.name}</span>
                  {' '}
                  <span className="text-emerald-400">+{rec.opportunity_cost.best_sector.return_pct}%</span>
                  <span className="text-gray-600"> ({rec.opportunity_cost.best_sector.period} trend)</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

export default function PositionsTable({ positions, loadingRec, recommendations, recErrors, snapshotIds = {}, recActions = {}, onGetRecommendation, onAction, onImportClick, readOnly }: Props) {
  const [loadingAll, setLoadingAll] = useState(false)
  const [tab, setTab] = useState<'all' | 'personal' | 'retirement'>('all')

  const hasPersonal = positions.some(p => !RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
  const hasRetirement = positions.some(p => RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
  const showTabs = hasPersonal && hasRetirement

  const visiblePositions = !showTabs || tab === 'all' ? positions
    : tab === 'personal'
      ? positions.filter(p => !RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
      : positions.filter(p => RETIREMENT_TYPES.has(p.account_type ?? 'individual'))

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

  const pending = visiblePositions.filter(p => !recommendations[p.symbol] && !loadingRec[p.symbol])
  const doneCount = visiblePositions.filter(p => recommendations[p.symbol]).length

  async function handleAskAll() {
    setLoadingAll(true)
    for (const p of pending) {
      onGetRecommendation(p.symbol)
      // Small delay so we don't fire 51 requests simultaneously
      await new Promise(r => setTimeout(r, 350))
    }
    setLoadingAll(false)
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">Positions</h2>
          {showTabs && (
            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5">
              {(['all', 'personal', 'retirement'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition capitalize ${tab === t ? 'bg-white/[0.10] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        {positions.length > 0 && !readOnly && (
          <div className="flex items-center gap-3">
            {doneCount > 0 && (
              <span className="text-xs text-gray-600">{doneCount}/{positions.length} analyzed</span>
            )}
            <button
              onClick={handleAskAll}
              disabled={loadingAll || pending.length === 0}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-violet-400 border border-white/[0.08] hover:border-violet-500/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingAll ? <Spinner small /> : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
              {loadingAll ? 'Analyzing…' : pending.length === 0 ? 'All analyzed' : `Ask Sage for all`}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['Symbol', 'Sector', 'Shares', 'Price', 'Value', 'Cost Basis', 'Gain / Loss', '%', 'Day', ...(readOnly ? [] : ['Sage'])].map((h, i) => (
                <th key={h} className={`px-5 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {visiblePositions.map((p) => (
              <tr key={p.symbol} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
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
                      <RecBadge
                        rec={recommendations[p.symbol]}
                        snapshotId={snapshotIds[p.symbol] ?? null}
                        recAction={recActions[p.symbol]}
                        onAction={(sid, action) => onAction?.(p.symbol, sid, action)}
                      />
                    ) : recErrors[p.symbol] ? (
                      <button
                        onClick={() => onGetRecommendation(p.symbol)}
                        title={recErrors[p.symbol]}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1 rounded-lg transition"
                      >
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => onGetRecommendation(p.symbol)}
                        className="text-xs text-gray-600 hover:text-violet-400 border border-white/[0.06] hover:border-violet-500/30 px-2.5 py-1 rounded-lg transition"
                      >
                        Ask Sage
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
