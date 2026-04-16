'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type View = 'signin' | 'signup' | 'check_email' | 'forgot' | 'forgot_sent'

function SessionExpiredBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get('reason') !== 'session_expired') return null
  return (
    <div className="mb-6 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-400 text-sm">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      Your session has expired. Please sign in again.
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setView('check_email')
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
    const redirectTo = `${window.location.origin}${basePath}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setView('forgot_sent')
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/8 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight">InvestSage</span>
          </div>
          <p className="text-gray-400 text-sm">Sage-powered portfolio intelligence</p>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 backdrop-blur-sm shadow-2xl">

          <Suspense>
            <SessionExpiredBanner />
          </Suspense>

          {/* ── Sign in ── */}
          {view === 'signin' && (
            <>
              <h2 className="text-xl font-semibold mb-6">Welcome back</h2>
              <form onSubmit={handleSignIn} className="space-y-4">
                <EmailField value={email} onChange={setEmail} />
                <PasswordField value={password} onChange={setPassword} />
                {error && <ErrorBox msg={error} />}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 py-3 rounded-xl font-semibold text-sm transition shadow-lg shadow-violet-500/20 mt-2"
                >
                  {loading ? <Spinner label="Signing in..." /> : 'Sign in'}
                </button>
              </form>
              <div className="mt-5 flex items-center justify-between text-sm text-gray-500">
                <button
                  onClick={() => { setError(''); setView('forgot') }}
                  className="hover:text-gray-300 transition"
                >
                  Forgot password?
                </button>
                <span>
                  No account?{' '}
                  <button
                    onClick={() => { setError(''); setView('signup') }}
                    className="text-violet-400 hover:text-violet-300 font-medium transition"
                  >
                    Sign up
                  </button>
                </span>
              </div>
            </>
          )}

          {/* ── Sign up ── */}
          {view === 'signup' && (
            <>
              <h2 className="text-xl font-semibold mb-6">Create your account</h2>
              <form onSubmit={handleSignUp} className="space-y-4">
                <EmailField value={email} onChange={setEmail} />
                <PasswordField value={password} onChange={setPassword} hint="At least 6 characters" />
                {error && <ErrorBox msg={error} />}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 py-3 rounded-xl font-semibold text-sm transition shadow-lg shadow-violet-500/20 mt-2"
                >
                  {loading ? <Spinner label="Creating account..." /> : 'Create account'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-5">
                Already have an account?{' '}
                <button
                  onClick={() => { setError(''); setView('signin') }}
                  className="text-violet-400 hover:text-violet-300 font-medium transition"
                >
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* ── Check email (after sign up) ── */}
          {view === 'check_email' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">Check your email</h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                We sent a confirmation link to <span className="text-white">{email}</span>.
                Click it to activate your account, then sign in.
              </p>
              <button
                onClick={() => { setError(''); setView('signin') }}
                className="w-full bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] py-3 rounded-xl text-sm font-medium transition"
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot password ── */}
          {view === 'forgot' && (
            <>
              <h2 className="text-xl font-semibold mb-2">Reset your password</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter your email and we'll send you a reset link.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <EmailField value={email} onChange={setEmail} />
                {error && <ErrorBox msg={error} />}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 py-3 rounded-xl font-semibold text-sm transition shadow-lg shadow-violet-500/20 mt-2"
                >
                  {loading ? <Spinner label="Sending..." /> : 'Send reset link'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 mt-5">
                <button
                  onClick={() => { setError(''); setView('signin') }}
                  className="text-violet-400 hover:text-violet-300 font-medium transition"
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {/* ── Forgot sent ── */}
          {view === 'forgot_sent' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2">Reset link sent</h2>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Check <span className="text-white">{email}</span> for a password reset link.
              </p>
              <button
                onClick={() => { setError(''); setView('signin') }}
                className="w-full bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] py-3 rounded-xl text-sm font-medium transition"
              >
                Back to sign in
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder="Email address"
        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 focus:bg-white/[0.07] transition"
      />
    </div>
  )
}

function PasswordField({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder="Password"
        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 focus:bg-white/[0.07] transition"
      />
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
      {msg}
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      {label}
    </span>
  )
}
