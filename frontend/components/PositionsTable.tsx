'use client'

import { useState, useEffect } from 'react'

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

type SortField = 'symbol' | 'value' | 'gain_pct' | 'day_pct' | 'weight'
type SortDir = 'asc' | 'desc'
type ViewMode = 'tile' | 'list'

// ── Utilities ────────────────────────────────────────────────────────────────

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

function dayChange(p: Position) {
  if (p.current_price == null || p.previous_close == null) return null
  const pct = ((p.current_price - p.previous_close) / p.previous_close) * 100
  const dollar = p.total_shares != null ? (p.current_price - p.previous_close) * p.total_shares : null
  return { pct, dollar }
}

function posClass(p: Position): 'gain' | 'loss' | 'flat' {
  if (p.total_gain_loss_percent == null) return 'flat'
  if (p.total_gain_loss_percent > 0) return 'gain'
  if (p.total_gain_loss_percent < 0) return 'loss'
  return 'flat'
}

// ── Small shared components ──────────────────────────────────────────────────

function Spinner({ small }: { small?: boolean }) {
  const cls = small ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <svg className={`animate-spin ${cls}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function NoCostBasis() {
  return (
    <span className="inline-flex items-center gap-1 text-gray-600 cursor-default" title="Upload a transactions CSV to calculate cost basis and gain/loss">
      <span>—</span>
      <svg className="w-3 h-3 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
      </svg>
    </span>
  )
}

function RecBadge({ rec, small }: { rec: any; small?: boolean }) {
  const color = REC_COLORS[rec.recommendation] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  const sz = small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-lg border ${sz} ${color}`}>
      {REC_LABEL[rec.recommendation] ?? rec.recommendation}
      {rec.confidence && <span className="opacity-60 font-normal">{rec.confidence[0]}</span>}
    </span>
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
      <div className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm text-emerald-500/80 font-medium">Followed</span>
      </div>
    )
  }
  if (currentAction === 'ignored') {
    return <span className="text-sm text-gray-600">Ignored</span>
  }
  return (
    <div className="flex gap-2">
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

// ── View Toggle ──────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5">
      <button
        onClick={() => onChange('tile')}
        title="Tile view"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
          view === 'tile' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Tiles
      </button>
      <button
        onClick={() => onChange('list')}
        title="List view"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
          view === 'list' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        List
      </button>
    </div>
  )
}

// ── Sort & Filter Bar ────────────────────────────────────────────────────────

function SortFilterBar({
  sortField, sortDir, onSort,
  filterSector, onFilterSector,
  filterRec, onFilterRec,
  sectors,
}: {
  sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void
  filterSector: string | null; onFilterSector: (s: string | null) => void
  filterRec: string | null; onFilterRec: (r: string | null) => void
  sectors: string[]
}) {
  const sorts: { field: SortField; label: string }[] = [
    { field: 'value', label: 'Value' },
    { field: 'gain_pct', label: 'Gain %' },
    { field: 'day_pct', label: 'Day %' },
    { field: 'weight', label: 'Weight' },
    { field: 'symbol', label: 'Symbol' },
  ]

  const recs = [
    { key: 'BUY_MORE', label: 'Buy More' },
    { key: 'HOLD', label: 'Hold' },
    { key: 'SELL', label: 'Sell' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
      {/* Sort */}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mr-1">Sort</span>
      {sorts.map(s => (
        <button
          key={s.field}
          onClick={() => onSort(s.field)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition ${
            sortField === s.field
              ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
              : 'border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'
          }`}
        >
          {s.label}
          {sortField === s.field && (
            <svg className={`w-2.5 h-2.5 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      ))}

      {/* Divider */}
      {(sectors.length > 0 || true) && <div className="w-px h-4 bg-white/[0.08] mx-1" />}

      {/* Rec filter */}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mr-1">Rec</span>
      <button
        onClick={() => onFilterRec(null)}
        className={`text-xs px-2.5 py-1 rounded-lg border transition ${
          filterRec === null
            ? 'bg-white/[0.08] border-white/[0.15] text-white'
            : 'border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'
        }`}
      >All</button>
      {recs.map(r => (
        <button
          key={r.key}
          onClick={() => onFilterRec(filterRec === r.key ? null : r.key)}
          className={`text-xs px-2.5 py-1 rounded-lg border transition ${
            filterRec === r.key
              ? REC_COLORS[r.key] + ' !border-opacity-50'
              : 'border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'
          }`}
        >
          {r.label}
        </button>
      ))}

      {/* Sector filter */}
      {sectors.length > 1 && (
        <>
          <div className="w-px h-4 bg-white/[0.08] mx-1" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mr-1">Sector</span>
          <button
            onClick={() => onFilterSector(null)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${
              filterSector === null
                ? 'bg-white/[0.08] border-white/[0.15] text-white'
                : 'border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'
            }`}
          >All</button>
          {sectors.map(s => (
            <button
              key={s}
              onClick={() => onFilterSector(filterSector === s ? null : s)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                filterSector === s
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  : 'border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'
              }`}
            >
              {s}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

// ── Tile Card (Design B) ─────────────────────────────────────────────────────

function PositionCard({
  p, rec, loadingRec, recError, isRetirement, onClick, onAskSage,
}: {
  p: Position
  rec: any
  loadingRec: boolean
  recError?: string
  isRetirement: boolean
  onClick: () => void
  onAskSage: (e: React.MouseEvent) => void
}) {
  const cls = posClass(p)
  const day = dayChange(p)

  const topBar = cls === 'gain'
    ? 'from-transparent via-emerald-400/60 to-transparent'
    : cls === 'loss'
    ? 'from-transparent via-red-400/60 to-transparent'
    : 'from-transparent via-violet-400/40 to-transparent'

  const avatarCls = isRetirement
    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
    : cls === 'gain'
    ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-300'
    : cls === 'loss'
    ? 'bg-red-500/10 border border-red-400/20 text-red-300'
    : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'

  const gainBigColor = cls === 'gain' ? 'text-emerald-400' : cls === 'loss' ? 'text-red-400' : 'text-violet-300'
  const gainSubColor = cls === 'gain' ? 'text-emerald-500/60' : cls === 'loss' ? 'text-red-500/60' : 'text-violet-400/50'
  const weightFill = cls === 'gain'
    ? 'from-emerald-500/40 to-emerald-400/70'
    : cls === 'loss'
    ? 'from-red-500/40 to-red-400/70'
    : 'from-violet-500/30 to-violet-400/60'

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden bg-white/[0.025] border border-white/[0.07] rounded-[18px] p-[18px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] group"
    >
      {/* top edge glow */}
      <div className={`absolute top-0 left-[10%] right-[10%] h-[2px] bg-gradient-to-r ${topBar} rounded-t-[18px]`} />

      {/* hover glow bg */}
      <div className={`absolute inset-0 rounded-[18px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
        cls === 'gain'
          ? 'bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(16,185,129,0.07)_0%,transparent_70%)]'
          : cls === 'loss'
          ? 'bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(239,68,68,0.07)_0%,transparent_70%)]'
          : ''
      }`} />

      {/* header */}
      <div className="relative flex items-start justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-[13px] flex items-center justify-center text-xs font-bold shrink-0 ${avatarCls}`}>
            {p.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-white tracking-tight">{p.symbol}</span>
              {p.account_type && p.account_type !== 'individual' && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {ACCOUNT_TYPE_LABEL[p.account_type] ?? p.account_type}
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[120px]">{p.description}</div>
          </div>
        </div>

        {/* rec badge */}
        {loadingRec ? (
          <span className="inline-flex"><Spinner small /></span>
        ) : rec ? (
          <RecBadge rec={rec} small />
        ) : recError ? (
          <button
            onClick={onAskSage}
            className="text-[10px] text-red-400 border border-red-500/20 px-2 py-0.5 rounded-lg"
          >Retry</button>
        ) : (
          <button
            onClick={onAskSage}
            className="text-[10px] text-gray-500 hover:text-violet-400 border border-white/[0.07] hover:border-violet-500/30 px-2 py-0.5 rounded-lg transition"
          >
            Ask Sage
          </button>
        )}
      </div>

      {/* big gain */}
      <div className={`relative text-[26px] font-bold tracking-tight leading-none mb-1 ${gainBigColor}`}>
        {p.total_gain_loss_percent != null
          ? (p.total_gain_loss_percent >= 0 ? '+' : '') + p.total_gain_loss_percent.toFixed(1) + '%'
          : '—'}
      </div>
      <div className={`relative text-xs mb-3.5 ${gainSubColor}`}>
        {p.total_gain_loss != null
          ? (p.total_gain_loss >= 0 ? '+$' : '−$') + Math.abs(p.total_gain_loss).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' all-time'
          : 'No cost basis'}
      </div>

      {/* metrics */}
      <div className="relative grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Value', value: p.current_value != null ? '$' + p.current_value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—' },
          { label: 'Shares', value: p.total_shares ?? '—' },
          { label: 'Price', value: p.current_price != null ? '$' + p.current_price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—' },
        ].map(m => (
          <div key={m.label} className="bg-white/[0.03] rounded-[10px] p-2">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-600 mb-1">{m.label}</div>
            <div className="text-[13px] font-semibold text-gray-200">{String(m.value)}</div>
          </div>
        ))}
      </div>

      {/* weight bar */}
      {p.percent_of_account != null && (
        <div className="relative flex items-center gap-2 mb-2.5">
          <span className="text-[10px] text-gray-600 w-[60px] shrink-0">Portfolio wt.</span>
          <div className="flex-1 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${weightFill}`} style={{ width: `${Math.min(p.percent_of_account, 100)}%` }} />
          </div>
          <span className="text-[10px] text-gray-600 w-8 text-right shrink-0">{p.percent_of_account.toFixed(1)}%</span>
        </div>
      )}

      {/* today + sector */}
      <div className="relative flex items-center gap-2 flex-wrap">
        {day && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
            day.pct >= 0 ? 'bg-emerald-500/[0.08] text-emerald-400/80' : 'bg-red-500/[0.08] text-red-400/80'
          }`}>
            {day.pct >= 0 ? '▲' : '▼'} {day.pct >= 0 ? '+' : ''}{day.pct.toFixed(2)}% today
          </span>
        )}
        {p.sector && (
          <span className="text-[10px] text-gray-600 bg-white/[0.04] px-2 py-0.5 rounded-md">{p.sector}</span>
        )}
      </div>
    </div>
  )
}

// ── List Row (Design C) ──────────────────────────────────────────────────────

function PositionRow({
  p, rec, loadingRec, recError, isSelected, isRetirement, onRowClick, onAskSage,
}: {
  p: Position
  rec: any
  loadingRec: boolean
  recError?: string
  isSelected: boolean
  isRetirement: boolean
  onRowClick: () => void
  onAskSage: (e: React.MouseEvent) => void
}) {
  const cls = posClass(p)
  const day = dayChange(p)

  const accentColor = cls === 'gain'
    ? 'from-emerald-400 to-emerald-500/20'
    : cls === 'loss'
    ? 'from-red-400 to-red-500/20'
    : 'from-violet-400/60 to-violet-500/10'

  return (
    <tr
      onClick={onRowClick}
      className={`cursor-pointer border-b border-white/[0.03] transition-colors ${
        isSelected ? 'bg-cyan-500/[0.04]' : 'hover:bg-white/[0.025]'
      }`}
    >
      {/* left accent bar */}
      <td className="w-1 p-0">
        <div className={`w-1 min-h-[44px] bg-gradient-to-b ${accentColor}`} />
      </td>

      {/* symbol */}
      <td className="py-3 pl-3 pr-5 min-w-[170px]">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
            isRetirement
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              : cls === 'gain'
              ? 'bg-emerald-500/10 border border-emerald-400/20 text-emerald-300'
              : cls === 'loss'
              ? 'bg-red-500/10 border border-red-400/20 text-red-300'
              : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
          }`}>
            {p.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[13px] text-white font-mono">{p.symbol}</span>
              {p.account_type && p.account_type !== 'individual' && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {ACCOUNT_TYPE_LABEL[p.account_type] ?? p.account_type}
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-600 truncate max-w-[120px]">{p.description}</div>
          </div>
        </div>
      </td>

      {/* sector */}
      <td className="px-4 py-3 text-left">
        {p.sector ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-[1px] bg-violet-400 shrink-0" />
            {p.sector}
          </span>
        ) : <span className="text-gray-700">—</span>}
      </td>

      {/* shares */}
      <td className="px-4 py-3 text-right text-sm text-gray-400 font-mono">{p.total_shares ?? '—'}</td>

      {/* price */}
      <td className="px-4 py-3 text-right text-sm text-gray-400 font-mono">{fmt(p.current_price, '$')}</td>

      {/* value */}
      <td className="px-4 py-3 text-right text-sm font-semibold text-white font-mono">{fmt(p.current_value, '$')}</td>

      {/* cost */}
      <td className="px-4 py-3 text-right text-sm text-gray-600 font-mono">
        {p.total_cost_basis != null ? fmt(p.total_cost_basis, '$') : <NoCostBasis />}
      </td>

      {/* P&L $ */}
      <td className={`px-4 py-3 text-right text-sm font-medium font-mono ${gainColor(p.total_gain_loss)}`}>
        {p.total_gain_loss != null
          ? (p.total_gain_loss >= 0 ? '+$' : '−$') + Math.abs(p.total_gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : <span className="text-gray-700">—</span>}
      </td>

      {/* P&L % */}
      <td className="px-4 py-3 text-right">
        {p.total_gain_loss_percent != null ? (
          <span className={`text-xs px-2 py-0.5 rounded-md font-medium font-mono ${gainBg(p.total_gain_loss_percent)}`}>
            {p.total_gain_loss_percent >= 0 ? '+' : ''}{p.total_gain_loss_percent.toFixed(2)}%
          </span>
        ) : <span className="text-gray-700">—</span>}
      </td>

      {/* day */}
      <td className="px-4 py-3 text-right">
        {day ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-xs font-semibold font-mono ${day.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {day.pct >= 0 ? '+' : ''}{day.pct.toFixed(2)}%
            </span>
            {day.dollar != null && (
              <span className={`text-[11px] font-mono ${day.pct >= 0 ? 'text-emerald-500/60' : 'text-red-500/60'}`}>
                {day.pct >= 0 ? '+$' : '−$'}{Math.abs(day.dollar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        ) : <span className="text-gray-700">—</span>}
      </td>

      {/* sage */}
      <td className="px-4 py-3 text-right">
        {loadingRec ? (
          <span className="inline-flex justify-center"><Spinner small /></span>
        ) : rec ? (
          <RecBadge rec={rec} small />
        ) : recError ? (
          <button onClick={onAskSage} className="text-xs text-red-400 border border-red-500/20 px-2 py-0.5 rounded-lg">Retry</button>
        ) : (
          <button onClick={onAskSage} className="text-xs text-gray-600 hover:text-violet-400 border border-white/[0.06] hover:border-violet-500/30 px-2.5 py-1 rounded-lg transition">
            Ask Sage
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Detail Modal (Design C sheet as modal) ───────────────────────────────────

function DetailModal({
  p, rec, loadingRec, recError, snapshotId, recAction,
  isRetirement, onClose, onAction, onGetRecommendation,
}: {
  p: Position
  rec: any
  loadingRec: boolean
  recError?: string
  snapshotId?: string
  recAction?: string
  isRetirement: boolean
  onClose: () => void
  onAction: (snapshotId: string, action: 'followed' | 'ignored') => void
  onGetRecommendation: (symbol: string) => void
}) {
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const cls = posClass(p)
  const day = dayChange(p)

  const avatarCls = isRetirement
    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
    : cls === 'gain'
    ? 'bg-emerald-500/10 border border-emerald-400/25 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
    : cls === 'loss'
    ? 'bg-red-500/10 border border-red-400/20 text-red-300'
    : 'bg-violet-500/10 border border-violet-500/20 text-violet-300'

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const kvItems = [
    { key: 'CURRENT VALUE', val: fmt(p.current_value, '$'), color: '' },
    { key: 'SHARES HELD', val: p.total_shares?.toString() ?? '—', color: '' },
    { key: 'CURRENT PRICE', val: fmt(p.current_price, '$'), color: '' },
    { key: 'COST BASIS', val: p.total_cost_basis != null ? fmt(p.total_cost_basis, '$') : null, color: '' },
    {
      key: 'TOTAL GAIN',
      val: p.total_gain_loss != null
        ? (p.total_gain_loss >= 0 ? '+$' : '−$') + Math.abs(p.total_gain_loss).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null,
      color: gainColor(p.total_gain_loss),
    },
    {
      key: 'GAIN %',
      val: p.total_gain_loss_percent != null
        ? (p.total_gain_loss_percent >= 0 ? '+' : '') + p.total_gain_loss_percent.toFixed(2) + '%'
        : null,
      color: gainColor(p.total_gain_loss_percent),
    },
    {
      key: 'TODAY P&L',
      val: day?.dollar != null
        ? (day.dollar >= 0 ? '+$' : '−$') + Math.abs(day.dollar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null,
      color: day ? gainColor(day.pct) : '',
    },
    {
      key: 'TODAY %',
      val: day ? (day.pct >= 0 ? '+' : '') + day.pct.toFixed(2) + '%' : null,
      color: day ? gainColor(day.pct) : '',
    },
    {
      key: 'PORTFOLIO WT.',
      val: p.percent_of_account != null ? p.percent_of_account.toFixed(1) + '%' : null,
      color: '',
    },
    {
      key: 'SECTOR',
      val: p.sector ?? null,
      color: '',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px]" onClick={onClose} />

      {/* modal box */}
      <div className="relative w-full sm:max-w-[720px] max-h-[82vh] bg-[#0c0c14] border-t sm:border border-white/[0.07] sm:rounded-2xl shadow-[0_-20px_60px_rgba(0,0,0,0.6)] sm:shadow-[0_40px_100px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden">

        {/* drag handle (mobile) */}
        <div className="sm:hidden w-9 h-1 rounded-full bg-white/10 mx-auto mt-3 mb-1 shrink-0" />

        {/* top accent line */}
        <div className="h-px mx-6 mt-2 sm:mt-0 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent shrink-0" />

        {/* tabs */}
        <div className="flex border-b border-white/[0.05] px-6 shrink-0">
          {(['overview', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[11px] font-bold uppercase tracking-wider py-3 px-4 border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'text-cyan-300 border-cyan-400'
                  : 'text-gray-600 border-transparent hover:text-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
          {/* close button */}
          <button
            onClick={onClose}
            className="ml-auto self-center w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.08] transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* overview tab */}
        {tab === 'overview' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.05]">

              {/* left: position data */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* symbol row */}
                <div className="flex items-start gap-3.5 mb-5">
                  <div className={`w-12 h-12 rounded-[13px] flex items-center justify-center text-sm font-bold shrink-0 ${avatarCls}`}>
                    {p.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-xl font-bold text-white font-mono tracking-tight">{p.symbol}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{p.description}</div>
                    {p.account_type && p.account_type !== 'individual' && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-1 inline-block">
                        {ACCOUNT_TYPE_LABEL[p.account_type] ?? p.account_type}
                      </span>
                    )}
                  </div>
                </div>

                {/* KV grid */}
                <div className="grid grid-cols-2 gap-[2px]">
                  {kvItems.filter(k => k.val !== null).map(k => (
                    <div key={k.key} className="bg-white/[0.02] border border-white/[0.04] rounded-md p-2.5 flex flex-col gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 font-mono">{k.key}</span>
                      <span className={`text-[14px] font-bold font-mono ${k.color || 'text-gray-200'}`}>{k.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* right: sage analysis */}
              <div className="p-5 sm:p-6">
                <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-500/70 font-mono mb-4">
                  ⚡ Sage Analysis
                </div>

                {loadingRec ? (
                  <div className="flex justify-center py-10 text-gray-600"><Spinner /></div>
                ) : rec ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-[13px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border font-mono ${
                        REC_COLORS[rec.recommendation] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                      }`}>
                        {REC_LABEL[rec.recommendation] ?? rec.recommendation}
                      </span>
                      {rec.confidence && (
                        <div>
                          <div className="text-lg font-bold text-violet-300 font-mono">{rec.confidence[0]}</div>
                          <div className="text-[9px] uppercase tracking-wider text-gray-600 font-mono">Confidence</div>
                        </div>
                      )}
                    </div>

                    {rec.reasoning && (
                      <p className="text-[12px] text-gray-400 leading-relaxed border-l-2 border-cyan-500/30 pl-3">
                        {rec.reasoning}
                      </p>
                    )}

                    {rec.key_factors?.length > 0 && (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-500/40 font-mono mb-2">Key Factors</div>
                        <div className="space-y-1.5">
                          {rec.key_factors.map((f: string, i: number) => (
                            <div key={i} className="flex gap-2 text-[11px] text-gray-500 leading-relaxed">
                              <span className="text-cyan-600/50 shrink-0 font-mono">›</span>
                              <span>{f}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {rec.recommendation === 'SELL' && rec.opportunity_cost && (
                      <div className="bg-emerald-500/[0.04] border border-emerald-500/[0.12] rounded-xl p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-2 font-mono">Opportunity Cost</p>
                        <p className="text-xs text-gray-500 mb-1">
                          Capital freed: <span className="text-white font-medium">${rec.opportunity_cost.freed_capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        </p>
                        {rec.opportunity_cost.best_position && (
                          <p className="text-xs text-gray-500">
                            Best performer: <span className="text-emerald-400 font-medium">{rec.opportunity_cost.best_position.symbol}</span>{' '}
                            <span className="text-emerald-400">+{rec.opportunity_cost.best_position.return_pct}%</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : recError ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-red-400 mb-3">{recError}</p>
                    <button
                      onClick={() => onGetRecommendation(p.symbol)}
                      className="text-xs border border-red-500/20 text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg transition"
                    >Retry</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3 py-4">
                    <p className="text-xs text-gray-600">Sage hasn't analyzed {p.symbol} yet.</p>
                    <button
                      onClick={() => onGetRecommendation(p.symbol)}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-violet-400 border border-white/[0.08] hover:border-violet-500/30 px-3 py-1.5 rounded-lg transition"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Ask Sage
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* history tab */}
        {tab === 'history' && (
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-500/40 font-mono mb-4">
              Transaction History · {p.symbol}
            </div>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Transaction history coming soon</p>
              <p className="text-xs text-gray-700 mt-1">Import a transactions CSV to see your trade history here</p>
            </div>
          </div>
        )}

        {/* footer */}
        <div className="shrink-0 flex gap-2.5 px-6 py-4 border-t border-white/[0.05]">
          <ActionButtons snapshotId={snapshotId ?? null} currentAction={recAction} onAction={onAction} />
          <button
            onClick={onClose}
            className="ml-auto text-xs font-semibold uppercase tracking-wider px-4 py-2.5 rounded-lg bg-cyan-500/[0.06] border border-cyan-500/20 text-cyan-500/70 hover:bg-cyan-500/10 transition font-mono"
          >
            Close ×
          </button>
        </div>
      </div>
    </div>
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
  selectedSymbol: string | null
  onRowClick: (symbol: string) => void
  onGetRecommendation: (symbol: string) => void
  readOnly?: boolean
  headerRight?: React.ReactNode
  isRetirement: boolean
  viewMode: ViewMode
  sortField: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  filterSector: string | null
  onFilterSector: (s: string | null) => void
  filterRec: string | null
  onFilterRec: (r: string | null) => void
}

function PositionsSection({
  title, subtitle, accentClass, positions, recommendations, loadingRec, recErrors,
  selectedSymbol, onRowClick, onGetRecommendation,
  readOnly, headerRight, isRetirement, viewMode, sortField, sortDir, onSort,
  filterSector, onFilterSector, filterRec, onFilterRec,
}: SectionProps) {

  const sectors = Array.from(new Set(positions.map(p => p.sector).filter(Boolean) as string[])).sort()

  // filter
  let filtered = positions.filter(p => {
    if (filterSector && p.sector !== filterSector) return false
    if (filterRec) {
      const rec = recommendations[p.symbol]
      if (!rec || rec.recommendation !== filterRec) return false
    }
    return true
  })

  // sort
  filtered = [...filtered].sort((a, b) => {
    let va = 0, vb = 0
    if (sortField === 'symbol') {
      return sortDir === 'asc'
        ? a.symbol.localeCompare(b.symbol)
        : b.symbol.localeCompare(a.symbol)
    }
    if (sortField === 'value') { va = a.current_value ?? 0; vb = b.current_value ?? 0 }
    if (sortField === 'gain_pct') { va = a.total_gain_loss_percent ?? -Infinity; vb = b.total_gain_loss_percent ?? -Infinity }
    if (sortField === 'day_pct') {
      const da = dayChange(a); const db = dayChange(b)
      va = da?.pct ?? -Infinity; vb = db?.pct ?? -Infinity
    }
    if (sortField === 'weight') { va = a.percent_of_account ?? 0; vb = b.percent_of_account ?? 0 }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  return (
    <div>
      {/* section header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${accentClass}`} />
            <h3 className="font-semibold text-sm">{title}</h3>
            <span className="text-xs text-gray-600">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
            {filtered.length !== positions.length && (
              <span className="text-xs text-cyan-500/60">({filtered.length} shown)</span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 ml-3.5">{subtitle}</p>
        </div>
        {headerRight}
      </div>

      {/* sort/filter bar */}
      <SortFilterBar
        sortField={sortField} sortDir={sortDir} onSort={onSort}
        filterSector={filterSector} onFilterSector={onFilterSector}
        filterRec={filterRec} onFilterRec={onFilterRec}
        sectors={sectors}
      />

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-gray-600">No positions match the current filters.</div>
      ) : viewMode === 'tile' ? (
        /* ── Tile grid ── */
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map(p => (
            <PositionCard
              key={p.symbol}
              p={p}
              rec={recommendations[p.symbol]}
              loadingRec={!!loadingRec[p.symbol]}
              recError={recErrors[p.symbol]}
              isRetirement={isRetirement}
              onClick={() => onRowClick(p.symbol)}
              onAskSage={e => { e.stopPropagation(); onRowClick(p.symbol); onGetRecommendation(p.symbol) }}
            />
          ))}
        </div>
      ) : (
        /* ── List table ── */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.04] bg-white/[0.015]">
                <th className="w-1 p-0" />
                {['Symbol', 'Sector', 'Shares', 'Price', 'Value', 'Cost', 'P&L ($)', 'P&L (%)', 'Day', ...(readOnly ? [] : ['Sage'])].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[9px] font-bold text-gray-600 uppercase tracking-wider font-mono ${i < 2 ? 'text-left' : 'text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <PositionRow
                  key={p.symbol}
                  p={p}
                  rec={recommendations[p.symbol]}
                  loadingRec={!!loadingRec[p.symbol]}
                  recError={recErrors[p.symbol]}
                  isSelected={selectedSymbol === p.symbol}
                  isRetirement={isRetirement}
                  onRowClick={() => onRowClick(p.symbol)}
                  onAskSage={e => { e.stopPropagation(); onRowClick(p.symbol); onGetRecommendation(p.symbol) }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
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


export default function PositionsTable({
  positions, loadingRec, recommendations, recErrors,
  snapshotIds = {}, recActions = {}, onGetRecommendation, onAction, onImportClick, readOnly,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('tile')
  const [sortField, setSortField] = useState<SortField>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterSector, setFilterSector] = useState<string | null>(null)
  const [filterRec, setFilterRec] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [loadingAllPersonal, setLoadingAllPersonal] = useState(false)
  const [loadingAllRetirement, setLoadingAllRetirement] = useState(false)

  const personalPositions = positions.filter(p => !RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
  const retirementPositions = positions.filter(p => RETIREMENT_TYPES.has(p.account_type ?? 'individual'))
  const hasPersonal = personalPositions.length > 0
  const hasRetirement = retirementPositions.length > 0
  const hasBoth = hasPersonal && hasRetirement

  const selectedPosition = positions.find(p => p.symbol === selectedSymbol) ?? null
  const isSelectedRetirement = selectedPosition
    ? RETIREMENT_TYPES.has(selectedPosition.account_type ?? 'individual')
    : false

  function handleRowClick(symbol: string) {
    setSelectedSymbol(prev => prev === symbol ? null : symbol)
  }

  function handleSort(f: SortField) {
    if (sortField === f) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(f)
      setSortDir('desc')
    }
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

  const sharedSectionProps = {
    recommendations, loadingRec, recErrors,
    selectedSymbol, onRowClick: handleRowClick, onGetRecommendation, readOnly,
    viewMode, sortField, sortDir, onSort: handleSort,
    filterSector, onFilterSector: setFilterSector,
    filterRec, onFilterRec: setFilterRec,
  }

  const sectionCards = !hasBoth ? (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="font-semibold">Positions</h2>
        <div className="flex items-center gap-3">
          <ViewToggle view={viewMode} onChange={setViewMode} />
          <AskAllButton
            group={positions}
            loading={hasRetirement ? loadingAllRetirement : loadingAllPersonal}
            setLoading={hasRetirement ? setLoadingAllRetirement : setLoadingAllPersonal}
          />
        </div>
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
          headerRight={
            <div className="flex items-center gap-3">
              <ViewToggle view={viewMode} onChange={setViewMode} />
              <AskAllButton group={personalPositions} loading={loadingAllPersonal} setLoading={setLoadingAllPersonal} />
            </div>
          }
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
          headerRight={
            <div className="flex items-center gap-3">
              <ViewToggle view={viewMode} onChange={setViewMode} />
              <AskAllButton group={retirementPositions} loading={loadingAllRetirement} setLoading={setLoadingAllRetirement} />
            </div>
          }
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

  return (
    <>
      {sectionCards}

      {/* Detail modal */}
      {selectedSymbol && selectedPosition && (
        <DetailModal
          p={selectedPosition}
          rec={recommendations[selectedSymbol]}
          loadingRec={!!loadingRec[selectedSymbol]}
          recError={recErrors[selectedSymbol]}
          snapshotId={snapshotIds[selectedSymbol]}
          recAction={recActions[selectedSymbol]}
          isRetirement={isSelectedRetirement}
          onClose={() => setSelectedSymbol(null)}
          onAction={(sid, action) => onAction?.(selectedSymbol, sid, action)}
          onGetRecommendation={onGetRecommendation}
        />
      )}
    </>
  )
}
