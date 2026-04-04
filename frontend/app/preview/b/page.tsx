'use client'
// Design B: Minimal/Monospace — near-black, emerald green, sparse, data-dense

const POSITIONS = [
  { symbol: 'AAPL', description: 'Apple Inc.', sector: 'Technology', shares: 42, price: 189.30, value: 7950.60, gain: 1750.60, gainPct: 28.24 },
  { symbol: 'MSFT', description: 'Microsoft Corp.', sector: 'Technology', shares: 18, price: 415.20, value: 7473.60, gain: 1373.60, gainPct: 22.52 },
  { symbol: 'VOO', description: 'Vanguard S&P 500 ETF', sector: 'ETF', shares: 30, price: 492.10, value: 14763.00, gain: 2363.00, gainPct: 19.06 },
  { symbol: 'NVDA', description: 'NVIDIA Corp.', sector: 'Technology', shares: 15, price: 875.40, value: 13131.00, gain: 3331.00, gainPct: 33.99 },
  { symbol: 'AMZN', description: 'Amazon.com Inc.', sector: 'Consumer', shares: 25, price: 185.60, value: 4640.00, gain: -560.00, gainPct: -10.77 },
]

export default function PreviewB() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex" suppressHydrationWarning>
      {/* Switcher */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        {['a','b','c'].map(v => (
          <a key={v} href={`/preview/${v}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase transition
              ${v === 'b' ? 'bg-emerald-500 text-black' : 'bg-white/10 text-gray-600 hover:bg-white/20'}`}>
            {v}
          </a>
        ))}
      </div>

      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-white/[0.05] flex flex-col py-8 px-5">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-mono text-emerald-400 tracking-[0.2em] uppercase">InvestSage</span>
          </div>
          <p className="text-[10px] font-mono text-gray-700 ml-3.5">portfolio intelligence</p>
        </div>
        <nav className="space-y-0.5 font-mono">
          {[
            { label: '01 PORTFOLIO', active: true },
            { label: '02 TAX SAVINGS', soon: true },
            { label: '03 HEALTH', soon: true },
            { label: '04 ANALYTICS', soon: true },
          ].map(item => (
            <div key={item.label} className={`flex items-center justify-between px-2 py-2 rounded text-xs transition
              ${item.active ? 'text-emerald-400 bg-emerald-500/5' : 'text-gray-700'}`}>
              <span>{item.label}</span>
              {item.soon && <span className="text-[9px] text-gray-800">SOON</span>}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-white/[0.04]">
          <div className="text-[10px] font-mono text-gray-800">LAST SYNC</div>
          <div className="text-[10px] font-mono text-gray-600">2 min ago</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="border-b border-white/[0.05] px-8 py-4 flex items-center justify-between">
          <div className="font-mono">
            <span className="text-[10px] text-gray-700 tracking-widest uppercase">Portfolio</span>
            <span className="text-gray-800 mx-2">/</span>
            <span className="text-[10px] text-gray-500 tracking-widest uppercase">Overview</span>
          </div>
          <div className="flex gap-2">
            <button className="font-mono text-[11px] border border-white/[0.08] text-gray-600 px-4 py-1.5 rounded hover:border-white/20 transition">IMPORT CSV</button>
            <button className="font-mono text-[11px] border border-emerald-500/30 text-emerald-500 px-4 py-1.5 rounded hover:bg-emerald-500/5 transition">REFRESH ↻</button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-0 border border-white/[0.06] rounded-lg overflow-hidden">
            {[
              { label: 'TOTAL VALUE', value: '$84,231.50', color: 'text-white' },
              { label: 'ALL-TIME RETURN', value: '+$6,420.00', color: 'text-emerald-400' },
              { label: 'POSITIONS', value: '5', color: 'text-white' },
              { label: 'HEALTH SCORE', value: '74 · B', color: 'text-emerald-400' },
            ].map((s, i) => (
              <div key={s.label} className={`px-6 py-5 ${i > 0 ? 'border-l border-white/[0.06]' : ''}`}>
                <div className="text-[9px] font-mono text-gray-700 tracking-widest mb-2">{s.label}</div>
                <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Alert */}
          <div className="border border-yellow-500/20 rounded-lg px-5 py-3 flex items-center gap-3">
            <span className="text-yellow-500 font-mono text-xs">!</span>
            <p className="text-xs font-mono text-yellow-600">TECH CONCENTRATION AT 58% — consider rebalancing</p>
          </div>

          {/* Table */}
          <div className="border border-white/[0.06] rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.05]">
              <span className="text-[10px] font-mono text-gray-700 tracking-widest uppercase">Positions · 5</span>
            </div>
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {['SYMBOL','SECTOR','SHARES','PRICE','VALUE','GAIN/LOSS','%'].map((h,i) => (
                    <th key={h} className={`px-5 py-2.5 text-[9px] text-gray-700 tracking-widest font-normal ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p, i) => (
                  <tr key={p.symbol} className={`border-b border-white/[0.03] hover:bg-white/[0.01] transition ${i === POSITIONS.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="text-white font-bold">{p.symbol}</div>
                      <div className="text-gray-700 text-[9px]">{p.description}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{p.sector.toUpperCase()}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{p.shares}</td>
                    <td className="px-5 py-3 text-right text-gray-400">${p.price.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right text-white">${p.value.toLocaleString()}</td>
                    <td className={`px-5 py-3 text-right ${p.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.gain >= 0 ? '+' : '−'}${Math.abs(p.gain).toFixed(2)}
                    </td>
                    <td className={`px-5 py-3 text-right ${p.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.gainPct >= 0 ? '+' : ''}{p.gainPct.toFixed(2)}%
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
