'use client'

export interface SectorBreakdownItem {
  sector: string
  value: number
  pct: number
  market_trend?: number
}

const SECTOR_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6',
  '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
]
const OTHER_COLOR = '#374151'

function getSectorColor(sector: string, index: number): string {
  if (sector === 'Other') return OTHER_COLOR
  return SECTOR_COLORS[index % SECTOR_COLORS.length]
}

function TrendBadge({ pct }: { pct: number }) {
  const pos = pct >= 0
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${pos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

function DonutChart({ breakdown }: { breakdown: SectorBreakdownItem[] }) {
  const r = 58, cx = 80, cy = 80, sw = 22
  const circ = 2 * Math.PI * r
  const gap = 2.5
  let cumLen = 0
  const segments = breakdown.map((item, i) => {
    const arcLen = (item.pct / 100) * circ
    const seg = {
      dasharray: `${Math.max(0, arcLen - gap)} ${circ}`,
      dashoffset: -cumLen,
      color: getSectorColor(item.sector, i),
    }
    cumLen += arcLen
    return seg
  })
  return (
    <svg width="160" height="160" className="-rotate-90" style={{ minWidth: 160 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#151520" strokeWidth={sw} />
      {segments.map((seg, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={seg.color} strokeWidth={sw}
          strokeDasharray={seg.dasharray} strokeDashoffset={seg.dashoffset}
        />
      ))}
    </svg>
  )
}

export default function SectorBreakdownPanel({ breakdown, period }: { breakdown: SectorBreakdownItem[]; period?: string }) {
  if (!breakdown || breakdown.length === 0) return null

  const knownSectors = breakdown.filter(b => b.sector !== 'Other')
  const otherEntry = breakdown.find(b => b.sector === 'Other')
  const ordered = otherEntry ? [...knownSectors, otherEntry] : knownSectors
  const hasTrends = knownSectors.some(b => b.market_trend != null)

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="font-semibold flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
          Sector Exposure
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          ETF & fund holdings expanded to underlying sectors
          {hasTrends && period && <> &middot; <span className="text-gray-400">{period} return</span> shown per sector</>}
        </p>
      </div>
      <div className="flex gap-8 items-center">
        <div className="relative shrink-0">
          <DonutChart breakdown={ordered} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-white">{knownSectors.length}</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">sectors</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="grid" style={{ gridTemplateColumns: '10px 1fr auto auto', columnGap: '12px', rowGap: '2px' }}>
            <span />
            <span className="text-[10px] text-gray-600 uppercase tracking-wider pb-2">Sector</span>
            {hasTrends && period
              ? <span className="text-[10px] text-gray-600 uppercase tracking-wider pb-2 text-right">{period}</span>
              : <span />}
            <span className="text-[10px] text-gray-600 uppercase tracking-wider pb-2 text-right">Alloc.</span>
            {ordered.map((item, i) => {
              const color = getSectorColor(item.sector, i < knownSectors.length ? i : -1)
              const isOther = item.sector === 'Other'
              return (
                <>
                  <span key={`dot-${item.sector}`} className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: color }} />
                  <span key={`name-${item.sector}`} className={`text-sm truncate py-1 ${isOther ? 'text-gray-600' : 'text-gray-300'}`}>
                    {isOther ? 'Other (funds)' : item.sector}
                  </span>
                  <span key={`trend-${item.sector}`} className="py-1 flex items-center justify-end">
                    {item.market_trend != null && !isOther ? <TrendBadge pct={item.market_trend} /> : null}
                  </span>
                  <span key={`pct-${item.sector}`} className={`text-sm font-semibold tabular-nums text-right py-1 ${isOther ? 'text-gray-600' : 'text-white'}`}>
                    {item.pct}%
                  </span>
                </>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
