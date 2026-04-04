'use client'
// Design A: Dark Glass — violet accent, frosted cards

const POSITIONS = [
  { symbol: 'AAPL', description: 'Apple Inc.', sector: 'Technology', shares: 42, price: 189.30, value: 7950.60, cost: 6200.00, gain: 1750.60, gainPct: 28.24 },
  { symbol: 'MSFT', description: 'Microsoft Corp.', sector: 'Technology', shares: 18, price: 415.20, value: 7473.60, cost: 6100.00, gain: 1373.60, gainPct: 22.52 },
  { symbol: 'VOO', description: 'Vanguard S&P 500 ETF', sector: 'ETF', shares: 30, price: 492.10, value: 14763.00, cost: 12400.00, gain: 2363.00, gainPct: 19.06 },
  { symbol: 'NVDA', description: 'NVIDIA Corp.', sector: 'Technology', shares: 15, price: 875.40, value: 13131.00, cost: 9800.00, gain: 3331.00, gainPct: 33.99 },
  { symbol: 'AMZN', description: 'Amazon.com Inc.', sector: 'Consumer', shares: 25, price: 185.60, value: 4640.00, cost: 5200.00, gain: -560.00, gainPct: -10.77 },
]

export default function PreviewA() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex" suppressHydrationWarning>
      {/* Switcher */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        {['a','b','c'].map(v => (
          <a key={v} href={`/preview/${v}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase transition
              ${v === 'a' ? 'bg-violet-600 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}>
            {v}
          </a>
        ))}
      </div>

      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col py-6 px-4">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">InvestSage</span>
        </div>
        <nav className="space-y-1">
          {[
            { label: 'Portfolio', active: true },
            { label: 'Tax Savings', soon: true },
            { label: 'Health Score', soon: true },
            { label: 'Analytics', soon: true },
          ].map(item => (
            <div key={item.label} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition
              ${item.active ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20' : 'text-gray-600'}`}>
              <span className="flex-1">{item.label}</span>
              {item.soon && <span className="text-[10px] bg-white/[0.06] text-gray-600 px-1.5 py-0.5 rounded-md">soon</span>}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 bg-[#0a0a0f]/80 backdrop-blur border-b border-white/[0.06] px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Portfolio Overview</h1>
            <p className="text-xs text-gray-500">5 positions</p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 text-sm bg-white/[0.06] border border-white/[0.08] px-4 py-2 rounded-xl">Import CSV</button>
            <button className="flex items-center gap-2 text-sm bg-violet-600/20 border border-violet-500/30 text-violet-300 px-4 py-2 rounded-xl">Refresh</button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Portfolio Value</p>
              <p className="text-3xl font-bold">$84,231.50</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Total Return</p>
              <p className="text-3xl font-bold text-emerald-400">+$6,420.00</p>
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">All time gain</span>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Health Score</p>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 64 64" className="-rotate-90 w-16 h-16">
                    <circle cx="32" cy="32" r="26" stroke="#1f2937" strokeWidth="6" fill="none" />
                    <circle cx="32" cy="32" r="26" stroke="#60a5fa" strokeWidth="6" fill="none"
                      strokeDasharray={163} strokeDashoffset={163 * 0.26} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-400">74</span>
                  </div>
                </div>
                <p className="text-4xl font-bold text-blue-400">B</p>
              </div>
            </div>
          </div>

          {/* Issue */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm">
              <span className="w-4 h-4 text-yellow-400">⚠</span> Portfolio Issues
            </h2>
            <div className="flex items-start gap-3 border border-yellow-500/30 bg-yellow-500/5 rounded-xl px-4 py-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
              <p className="text-sm text-yellow-300">Technology sector at 58% — consider diversifying into other sectors</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="font-semibold">Positions</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Symbol','Sector','Shares','Price','Value','Gain / Loss','%'].map((h,i) => (
                    <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {POSITIONS.map(p => (
                  <tr key={p.symbol} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300">{p.symbol.slice(0,2)}</div>
                        <div>
                          <div className="font-semibold">{p.symbol}</div>
                          <div className="text-gray-600 text-xs">{p.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><span className="text-xs bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full text-gray-400">{p.sector}</span></td>
                    <td className="px-5 py-3.5 text-right text-gray-400">{p.shares}</td>
                    <td className="px-5 py-3.5 text-right text-gray-300">${p.price.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold">${p.value.toLocaleString()}</td>
                    <td className={`px-5 py-3.5 text-right font-medium ${p.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.gain >= 0 ? '+' : '−'}${Math.abs(p.gain).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${p.gain >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
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
