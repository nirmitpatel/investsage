'use client'

import { useRouter } from 'next/navigation'

type ActivePage = 'portfolio' | 'tax' | 'execution-plan' | 'insights' | 'analytics'

const NAV_ITEMS: { key: ActivePage; label: string; href: string; icon: React.ReactNode }[] = [
  { key: 'portfolio', label: 'Portfolio', href: '/dashboard', icon: <GridIcon /> },
  { key: 'tax', label: 'Tax', href: '/tax', icon: <LeafIcon /> },
  { key: 'execution-plan', label: 'Execution Plan', href: '/execution-plan', icon: <ChecklistIcon /> },
  { key: 'insights', label: 'Sage Insights', href: '/insights', icon: <SparkleIcon /> },
  { key: 'analytics', label: 'Analytics', href: '/analytics', icon: <ChartIcon /> },
]

export default function Sidebar({ active, onSignOut }: { active: ActivePage; onSignOut: () => void }) {
  const router = useRouter()
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-white/[0.06] flex-col py-6 px-4">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/30">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight">InvestSage</span>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(item => (
            <div
              key={item.key}
              onClick={() => router.push(item.href)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition cursor-pointer
                ${active === item.key
                  ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <button
          onClick={onSignOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] text-sm transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
          Sign out
        </button>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-sm safe-area-inset-bottom">
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => router.push(item.href)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition
              ${active === item.key ? 'text-violet-400' : 'text-gray-600 active:text-gray-300'}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <button
          onClick={onSignOut}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium text-gray-600 active:text-gray-300 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
          </svg>
          <span>Sign out</span>
        </button>
      </nav>
    </>
  )
}

function GridIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
}
function LeafIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
}
function SparkleIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
}
function ChartIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
}
function ChecklistIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
}
