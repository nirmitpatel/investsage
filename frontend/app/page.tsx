'use client'

import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-5%] w-[700px] h-[700px] bg-violet-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-emerald-500/8 rounded-full blur-[140px]" />
        <div className="absolute top-[40%] right-[20%] w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">InvestSage</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-gray-400 hover:text-white transition px-4 py-2"
          >
            Sign in
          </button>
          <button
            onClick={() => router.push('/login')}
            className="text-sm bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-xl font-medium transition shadow-lg shadow-violet-500/20"
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Powered by Sage
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
          Your portfolio,{' '}
          <span className="bg-gradient-to-r from-violet-400 to-violet-600 bg-clip-text text-transparent">
            finally explained
          </span>
        </h1>
        <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Import your Fidelity portfolio and get instant Sage-powered insights — health score, sector exposure, tax-loss opportunities, and plain-English explanations of every position.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => router.push('/login')}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-7 py-3.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-violet-500/25 hover:shadow-violet-500/35"
          >
            Start for free
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
          <p className="text-gray-600 text-sm">No credit card required</p>
        </div>
      </section>

      {/* Feature cards */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard
            icon="🛡️"
            iconBg="bg-emerald-500/10 border-emerald-500/20"
            title="Portfolio Health Score"
            desc="Get scored 0–100 across diversification, concentration, and performance. Know exactly what's hurting your portfolio and why."
          />
          <FeatureCard
            icon="🥧"
            iconBg="bg-blue-500/10 border-blue-500/20"
            title="Sector Exposure"
            desc="See exactly where your money is — even inside ETFs and mutual funds. Compare your allocation to real market trends."
          />
          <FeatureCard
            icon="💸"
            iconBg="bg-yellow-500/10 border-yellow-500/20"
            title="Tax Savings Finder"
            desc="Identify tax-loss harvesting opportunities in your open lots. See estimated savings and wash-sale safe replacements."
          />
          <FeatureCard
            icon="✨"
            iconBg="bg-violet-500/10 border-violet-500/20"
            title="Sage Insights"
            desc="Sage analyzes your full portfolio and explains what it means in plain English — no finance degree required."
          />
          <FeatureCard
            icon="⚡"
            iconBg="bg-orange-500/10 border-orange-500/20"
            title="Sell / Hold / Buy"
            desc="Get a Sage recommendation on every position based on your portfolio context and investment style."
          />
          <FeatureCard
            icon="📊"
            iconBg="bg-pink-500/10 border-pink-500/20"
            title="Analytics"
            desc="See your best and worst performers, sector P&L, and how your portfolio stacks up against the S&P 500."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-3xl mx-auto px-8 pb-24 text-center">
        <h2 className="text-2xl font-bold mb-3">Get started in 3 steps</h2>
        <p className="text-gray-500 text-sm mb-10">Takes about 2 minutes. No brokerage connection required.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { n: '1', title: 'Create account', desc: 'Sign up with email. Free to use.' },
            { n: '2', title: 'Import from Fidelity', desc: 'Download your positions CSV and upload it. Transactions CSV unlocks tax features.' },
            { n: '3', title: 'Get insights', desc: 'Your health score, sector breakdown, Sage analysis, and tax opportunities are instantly ready.' },
          ].map(step => (
            <div key={step.n} className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 text-left">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-sm font-bold text-violet-400 mb-4">
                {step.n}
              </div>
              <p className="font-semibold mb-1">{step.title}</p>
              <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-24">
        <div className="bg-gradient-to-br from-violet-500/15 to-violet-500/5 border border-violet-500/20 rounded-3xl p-12 text-center">
          <h2 className="text-3xl font-bold mb-3">Know your portfolio inside out</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">Import your Fidelity CSV and get a full picture in under a minute.</p>
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-7 py-3.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-violet-500/25"
          >
            Get started free
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] px-8 py-6 max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          InvestSage
        </div>
        <p className="text-xs text-gray-700">For informational purposes only. Not financial advice.</p>
      </footer>
    </main>
  )
}

function FeatureCard({ icon, iconBg, title, desc }: { icon: string; iconBg: string; title: string; desc: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] transition">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl mb-4 ${iconBg}`}>
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
    </div>
  )
}
