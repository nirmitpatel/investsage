'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Position {
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
}

interface HealthIssue {
  type: string
  severity: 'high' | 'medium' | 'low'
  message: string
}

interface Health {
  score: number
  grade: string
  total_value: number
  total_gain_loss: number
  position_count: number
  issues: HealthIssue[]
}

function fmt(n: number | null, prefix = '') {
  if (n == null) return '—'
  return prefix + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gainColor(n: number | null) {
  if (n == null) return 'text-gray-400'
  return n >= 0 ? 'text-green-400' : 'text-red-400'
}

function gradeColor(grade: string) {
  if (grade === 'A') return 'text-green-400'
  if (grade === 'B') return 'text-blue-400'
  if (grade === 'C') return 'text-yellow-400'
  if (grade === 'D' || grade === 'F') return 'text-red-400'
  return 'text-gray-400'
}

function severityColor(s: string) {
  if (s === 'high') return 'border-red-500 bg-red-500/10'
  if (s === 'medium') return 'border-yellow-500 bg-yellow-500/10'
  return 'border-blue-500 bg-blue-500/10'
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [positions, setPositions] = useState<Position[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [uploading, setUploading] = useState<'positions' | 'transactions' | null>(null)
  const [uploadMsg, setUploadMsg] = useState('')
  const [loadingPortfolio, setLoadingPortfolio] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const positionsRef = useRef<HTMLInputElement>(null)
  const transactionsRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPortfolio()
  }, [])

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  async function loadPortfolio() {
    setLoadingPortfolio(true)
    const token = await getToken()
    if (!token) {
      router.push('/login')
      return
    }

    const res = await fetch(`${API}/api/v1/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      router.push('/login')
      return
    }
    if (res.ok) {
      const data = await res.json()
      setPositions(data.positions ?? [])
      setHealth(data.health ?? null)
    }
    setLoadingPortfolio(false)
  }

  async function handleUpload(type: 'positions' | 'transactions', file: File) {
    setUploading(type)
    setUploadMsg('')

    const token = await getToken()
    if (!token) { router.push('/login'); return }

    const form = new FormData()
    form.append('file', file)

    const res = await fetch(`${API}/api/v1/portfolio/import/${type}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })

    setUploading(null)

    if (res.ok) {
      const data = await res.json()
      if (type === 'positions') {
        setPositions(data.positions ?? [])
        setHealth(data.health ?? null)
        setUploadMsg(`Imported ${data.imported} positions successfully.`)
      } else {
        setUploadMsg(`Imported ${data.imported} transactions, reconstructed ${data.tax_lots_reconstructed} tax lots.`)
      }
    } else {
      const err = await res.json().catch(() => ({}))
      setUploadMsg(`Error: ${err.detail ?? 'Upload failed'}`)
    }
  }

  async function handleRefreshPrices() {
    setRefreshing(true)
    const token = await getToken()
    if (!token) { router.push('/login'); return }
    const res = await fetch(`${API}/api/v1/portfolio/refresh-prices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setPositions(data.positions ?? [])
      setHealth(data.health ?? null)
    }
    setRefreshing(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">InvestSage</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
            >
              {refreshing && (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {refreshing ? 'Refreshing...' : 'Refresh Prices'}
            </button>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-900 rounded-xl p-6">
            <p className="text-gray-400 text-sm mb-1">Portfolio Value</p>
            <p className="text-2xl font-bold">
              {health ? `$${health.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6">
            <p className="text-gray-400 text-sm mb-1">Total Gain / Loss</p>
            <p className={`text-2xl font-bold ${health ? gainColor(health.total_gain_loss) : 'text-white'}`}>
              {health ? fmt(health.total_gain_loss, health.total_gain_loss >= 0 ? '+$' : '-$').replace('-$-', '$') : '—'}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6">
            <p className="text-gray-400 text-sm mb-1">Health Score</p>
            <p className={`text-2xl font-bold ${health ? gradeColor(health.grade) : 'text-white'}`}>
              {health ? `${health.score}/100 (${health.grade})` : '—'}
            </p>
          </div>
        </div>

        {/* Health issues */}
        {health && health.issues.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Portfolio Issues</h2>
            <div className="space-y-3">
              {health.issues.map((issue, i) => (
                <div key={i} className={`border-l-4 rounded-r-lg p-3 ${severityColor(issue.severity)}`}>
                  <p className="text-sm">{issue.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import */}
        <div className="bg-gray-900 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-2">Import Portfolio</h2>
          <p className="text-gray-400 text-sm mb-4">
            Export from Fidelity: Accounts &rarr; Portfolio &rarr; Download (positions CSV), and History &rarr; Download (transactions CSV).
          </p>
          <div className="flex gap-4 flex-wrap items-center">
            <button
              onClick={() => positionsRef.current?.click()}
              disabled={uploading !== null}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              {uploading === 'positions' && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {uploading === 'positions' ? 'Fetching prices...' : 'Upload Positions CSV'}
            </button>
            <button
              onClick={() => transactionsRef.current?.click()}
              disabled={uploading !== null}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              {uploading === 'transactions' && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {uploading === 'transactions' ? 'Processing...' : 'Upload Transactions CSV'}
            </button>
            {uploading && (
              <p className="text-sm text-gray-400">Fetching live prices from Yahoo Finance — this takes ~20s...</p>
            )}
          </div>
          <input
            ref={positionsRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload('positions', e.target.files[0])}
          />
          <input
            ref={transactionsRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload('transactions', e.target.files[0])}
          />
          {uploadMsg && (
            <p className={`mt-3 text-sm ${uploadMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {uploadMsg}
            </p>
          )}
        </div>

        {/* Positions table */}
        {loadingPortfolio ? (
          <p className="text-gray-400">Loading portfolio...</p>
        ) : positions.length > 0 ? (
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-semibold">Positions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800">
                    <th className="text-left px-6 py-3 font-medium">Symbol</th>
                    <th className="text-left px-6 py-3 font-medium">Sector</th>
                    <th className="text-right px-6 py-3 font-medium">Shares</th>
                    <th className="text-right px-6 py-3 font-medium">Price</th>
                    <th className="text-right px-6 py-3 font-medium">Value</th>
                    <th className="text-right px-6 py-3 font-medium">Cost Basis</th>
                    <th className="text-right px-6 py-3 font-medium">Gain/Loss</th>
                    <th className="text-right px-6 py-3 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-6 py-3">
                        <div className="font-semibold">{p.symbol}</div>
                        <div className="text-gray-500 text-xs truncate max-w-[160px]">{p.description}</div>
                      </td>
                      <td className="px-6 py-3 text-gray-400">{p.sector ?? '—'}</td>
                      <td className="px-6 py-3 text-right">{p.total_shares ?? '—'}</td>
                      <td className="px-6 py-3 text-right">{fmt(p.current_price, '$')}</td>
                      <td className="px-6 py-3 text-right font-medium">{fmt(p.current_value, '$')}</td>
                      <td className="px-6 py-3 text-right text-gray-400">{fmt(p.total_cost_basis, '$')}</td>
                      <td className={`px-6 py-3 text-right ${gainColor(p.total_gain_loss)}`}>
                        {p.total_gain_loss != null
                          ? (p.total_gain_loss >= 0 ? '+' : '') + fmt(p.total_gain_loss, '$')
                          : '—'}
                      </td>
                      <td className={`px-6 py-3 text-right ${gainColor(p.total_gain_loss_percent)}`}>
                        {p.total_gain_loss_percent != null
                          ? (p.total_gain_loss_percent >= 0 ? '+' : '') + p.total_gain_loss_percent.toFixed(2) + '%'
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl p-12 text-center text-gray-400">
            <p className="text-lg mb-1">No positions yet</p>
            <p className="text-sm">Upload your Fidelity positions CSV above to get started.</p>
          </div>
        )}
      </div>
    </main>
  )
}
