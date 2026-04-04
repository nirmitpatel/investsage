'use client'
// Design C: Bold/Gradient — deep navy, amber/gold accent, dramatic

const POSITIONS = [
  { symbol: 'AAPL', description: 'Apple Inc.', sector: 'Technology', shares: 42, price: 189.30, value: 7950.60, gain: 1750.60, gainPct: 28.24 },
  { symbol: 'MSFT', description: 'Microsoft Corp.', sector: 'Technology', shares: 18, price: 415.20, value: 7473.60, gain: 1373.60, gainPct: 22.52 },
  { symbol: 'VOO', description: 'Vanguard S&P 500 ETF', sector: 'ETF', shares: 30, price: 492.10, value: 14763.00, gain: 2363.00, gainPct: 19.06 },
  { symbol: 'NVDA', description: 'NVIDIA Corp.', sector: 'Technology', shares: 15, price: 875.40, value: 13131.00, gain: 3331.00, gainPct: 33.99 },
  { symbol: 'AMZN', description: 'Amazon.com Inc.', sector: 'Consumer', shares: 25, price: 185.60, value: 4640.00, gain: -560.00, gainPct: -10.77 },
]

const gold = '#f59e0b'
const goldDim = 'rgba(245,158,11,0.15)'

export default function PreviewC() {
  return (
    <div className="min-h-screen text-white flex" suppressHydrationWarning
      style={{ background: 'linear-gradient(160deg, #07091a 0%, #0b0f20 60%, #070912 100%)' }}>
      {/* Switcher */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        {['a','b','c'].map(v => (
          <a key={v} href={`/preview/${v}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase transition`}
            style={v === 'c'
              ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000' }
              : { background: 'rgba(255,255,255,0.08)', color: '#6b7280' }}>
            {v}
          </a>
        ))}
      </div>

      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col py-7 px-5" style={{ borderRight: `1px solid ${goldDim}` }}>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #b45309)', boxShadow: '0 4px 20px rgba(245,158,11,0.25)' }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-base tracking-tight">InvestSage</div>
            <div className="text-[9px] tracking-[0.15em] uppercase" style={{ color: gold }}>Intelligence</div>
          </div>
        </div>

        <nav className="space-y-1">
          {[
            { label: 'Portfolio', active: true },
            { label: 'Tax Savings', soon: true },
            { label: 'Health Score', soon: true },
            { label: 'Analytics', soon: true },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition"
              style={item.active ? { background: 'rgba(245,158,11,0.08)', color: gold, border: `1px solid ${goldDim}` } : { color: 'rgba(255,255,255,0.25)' }}>
              <span>{item.label}</span>
              {item.soon && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)' }}>soon</span>}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${goldDim}`, background: 'rgba(0,0,0,0.2)' }}>
          <div>
            <h1 className="text-lg font-bold">Portfolio Overview</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>5 positions · Last updated 2 min ago</p>
          </div>
          <div className="flex gap-3">
            <button className="text-sm px-4 py-2 rounded-xl transition" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
              Import CSV
            </button>
            <button className="text-sm font-semibold px-4 py-2 rounded-xl transition text-black"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 2px 16px rgba(245,158,11,0.25)' }}>
              Refresh ↻
            </button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Portfolio Value', value: '$84,231.50', accent: false, sub: null },
              { label: 'Total Return', value: '+$6,420.00', accent: true, sub: 'All-time gain' },
              { label: 'Health Score', value: '74', accent: true, sub: 'Grade B · 1 issue' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl p-6"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${goldDim}` }}>
                <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{card.label}</p>
                <p className="text-3xl font-bold" style={{ color: card.accent ? gold : 'white' }}>{card.value}</p>
                {card.sub && <p className="text-xs mt-2" style={{ color: 'rgba(245,158,11,0.5)' }}>{card.sub}</p>}
              </div>
            ))}
          </div>

          {/* Alert */}
          <div className="rounded-xl px-5 py-3.5 flex items-center gap-3"
            style={{ background: 'rgba(245,158,11,0.05)', border: `1px solid rgba(245,158,11,0.2)` }}>
            <span style={{ color: gold }}>⚠</span>
            <p className="text-sm" style={{ color: 'rgba(245,158,11,0.8)' }}>Technology sector at 58% — consider diversifying into other sectors</p>
          </div>

          {/* Table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${goldDim}` }}>
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${goldDim}`, background: 'rgba(0,0,0,0.2)' }}>
              <h2 className="font-semibold">Positions</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${goldDim}` }}>
                  {['Symbol','Sector','Shares','Price','Value','Gain / Loss','%'].map((h,i) => (
                    <th key={h} className={`px-5 py-3 text-xs font-medium uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}
                      style={{ color: 'rgba(255,255,255,0.25)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p, i) => (
                  <tr key={p.symbol} className="transition-colors"
                    style={{ borderBottom: i < POSITIONS.length - 1 ? `1px solid rgba(245,158,11,0.06)` : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.2)`, color: gold }}>
                          {p.symbol.slice(0,2)}
                        </div>
                        <div>
                          <div className="font-semibold">{p.symbol}</div>
                          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{p.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        {p.sector}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{p.shares}</td>
                    <td className="px-5 py-4 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>${p.price.toFixed(2)}</td>
                    <td className="px-5 py-4 text-right font-semibold text-white">${p.value.toLocaleString()}</td>
                    <td className={`px-5 py-4 text-right font-medium ${p.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.gain >= 0 ? '+' : '−'}${Math.abs(p.gain).toFixed(2)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${p.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                        style={{ background: p.gain >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)' }}>
                        {p.gainPct >= 0 ? '+' : ''}{p.gainPct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
