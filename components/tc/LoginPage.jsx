'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, ArrowRight, ShieldCheck, Mail, CheckCircle2, RotateCcw, AlertCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from './AuthContext'
import { cn } from '@/lib/utils'

function GoogleIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

function getOAuthErrorMessage(code) {
  if (!code) return ''
  switch (code) {
    case 'oauth_cancelled':
      return 'Google Sign-In was cancelled.'
    case 'oauth_invalid_state':
      return 'Your sign-in session expired. Please try again.'
    case 'oauth_config_missing':
      return 'Google Sign-In is temporarily unavailable. Please use email login.'
    case 'account_disabled':
      return 'Your account is currently disabled. Please contact customer care.'
    case 'account_deleted':
      return 'This account was previously closed. Please contact customer care if you wish to reopen it.'
    case 'oauth_no_email':
      return 'No email address was provided by Google. Please verify your Google account.'
    case 'oauth_failed':
    case 'oauth_exchange_failed':
      return 'Unable to sign in with Google. Please try again.'
    default:
      return 'Authentication could not be completed. Please try again.'
  }
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams?.get('redirect_to') || '/account'
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/account'
  const errorParam = searchParams?.get('error')

  const { isAuthenticated, sendOtp, verifyOtp, getGoogleAuthUrl, loading: authLoading } = useAuth()

  // Form states
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('EMAIL') // 'EMAIL' | 'OTP'
  const [maskedEmail, setMaskedEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(getOAuthErrorMessage(errorParam))
  const [successMsg, setSuccessMsg] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push(redirectTo)
    }
  }, [authLoading, isAuthenticated, redirectTo, router])

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // 1. Submit Email for OTP
  const handleSendOtp = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      const res = await sendOtp(email.trim())
      if (res?.ok) {
        setMaskedEmail(res.email || email)
        setStep('OTP')
        setCooldown(45)
        setSuccessMsg(res.message || 'Verification code dispatched.')
      } else {
        setError(res?.error || 'Failed to dispatch verification code.')
      }
    } catch (err) {
      setError(err.message || 'Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // 2. Submit 6-digit OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    const cleanOtp = otp.trim()
    if (cleanOtp.length !== 6) {
      setError('Please enter the complete 6-digit verification code.')
      return
    }

    setLoading(true)
    try {
      const res = await verifyOtp(email.trim(), cleanOtp)
      if (res?.ok) {
        setSuccessMsg('Verified successfully! Welcoming you to your atelier account…')
        setTimeout(() => {
          router.push(redirectTo)
        }, 400)
      } else {
        setError(res?.error || 'Invalid or expired verification code.')
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // 3. Continue with Google
  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await getGoogleAuthUrl(redirectTo)
      if (res?.configured && res?.url) {
        window.location.href = res.url
      } else {
        setError(res?.message || 'Google Sign-In is awaiting production credentials. Please use Email verification below.')
        setLoading(false)
      }
    } catch (err) {
      setError(err.message || 'Google Sign-In is unavailable at the moment.')
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-h-[85vh] flex items-center justify-center bg-paper py-12 sm:py-20 px-4 sm:px-6">
      <div className="w-full max-w-md mx-auto">

        {/* Brand Header */}
        <div className="text-center mb-8 sm:mb-10">
          <Link href="/" className="inline-block group mb-3">
            <span className="font-display text-3xl sm:text-4xl text-ink font-normal tracking-wide block">
              THRETHA
            </span>
            <span className="text-[9px] uppercase tracking-[0.4em] text-gold font-sans font-semibold block mt-0.5">
              COUTURE · KOCHI
            </span>
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl text-ink font-normal mt-2">
            {step === 'EMAIL' ? 'Welcome To Your Wardrobe' : 'Enter Verification Code'}
          </h1>
          <p className="text-xs sm:text-sm text-cocoa/80 font-sans mt-1.5 leading-relaxed max-w-xs mx-auto">
            {step === 'EMAIL'
              ? 'Access your private styling board, order history, and saved atelier delivery addresses.'
              : `We sent a 6-digit one-time code to ${maskedEmail}`}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-cream border border-ink/10 p-6 sm:p-9 shadow-lg rounded-none space-y-6">

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3.5 bg-rose/10 border border-coral/30 text-ink text-xs font-sans flex items-start gap-2.5 rounded-none animate-fade-in">
              <AlertCircle className="h-4 w-4 text-coral shrink-0 mt-0.5" />
              <div className="leading-snug">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-sans flex items-start gap-2.5 rounded-none animate-fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-snug">{successMsg}</div>
            </div>
          )}

          {step === 'EMAIL' ? (
            <>
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-paper border border-ink/20 py-3.5 px-4 text-xs font-sans font-semibold uppercase tracking-[0.16em] text-ink hover:bg-sand/30 hover:border-ink/40 active:scale-[0.98] transition-all min-h-[48px] shadow-2xs"
              >
                <GoogleIcon className="h-4 w-4" />
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-ink/10 w-full" />
                <span className="bg-cream px-3 text-[10px] font-sans uppercase tracking-[0.25em] text-cocoa-light font-semibold shrink-0">
                  Or passwordless email
                </span>
                <div className="border-t border-ink/10 w-full" />
              </div>

              {/* Email Form */}
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="block text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-ink mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cocoa-light" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. priya@example.com"
                      className="w-full bg-paper border border-ink/20 pl-10 pr-4 py-3.5 text-xs font-sans text-ink placeholder:text-cocoa/40 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 rounded-none transition min-h-[46px]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 bg-ink text-cream py-3.5 px-6 text-xs font-sans uppercase tracking-[0.22em] font-semibold hover:bg-cocoa-dark active:scale-[0.98] transition-all min-h-[48px] shadow-md disabled:opacity-50"
                >
                  <span>{loading ? 'Dispatched Code…' : 'Send Verification Code'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          ) : (
            /* Step 2: 6-Digit OTP Entry */
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="auth-otp" className="text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-ink">
                    6-Digit One-Time Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('EMAIL')
                      setOtp('')
                      setError('')
                    }}
                    className="text-[11px] font-sans text-terracotta hover:underline inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" /> Change email
                  </button>
                </div>

                <input
                  id="auth-otp"
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full bg-paper border border-ink/25 text-center font-mono text-2xl tracking-[0.4em] py-3 text-ink placeholder:text-cocoa/30 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink/20 rounded-none transition min-h-[52px]"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 bg-ink text-cream py-3.5 px-6 text-xs font-sans uppercase tracking-[0.22em] font-semibold hover:bg-cocoa-dark active:scale-[0.98] transition-all min-h-[48px] shadow-md disabled:opacity-40"
              >
                <span>{loading ? 'Verifying…' : 'Verify & Enter Account'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              {/* Resend Action */}
              <div className="pt-2 text-center text-xs font-sans text-cocoa">
                {cooldown > 0 ? (
                  <p className="text-cocoa-light text-[11px]">
                    Resend code in <strong className="font-mono text-ink">{cooldown}s</strong>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-ink font-semibold uppercase tracking-wider text-[11px] hover:text-terracotta underline"
                  >
                    <RotateCcw className="h-3 w-3" /> Resend verification code
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Security & Privacy Badges */}
          <div className="pt-4 border-t border-ink/10 flex items-center justify-center gap-2 text-[10px] text-cocoa-light font-sans">
            <ShieldCheck className="h-3.5 w-3.5 text-gold shrink-0" />
            <span>Encrypted & protected customer session</span>
          </div>

        </div>

        {/* Continue as Guest Footer */}
        <div className="mt-8 text-center space-y-2">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold uppercase tracking-[0.2em] text-ink hover:text-terracotta border-b border-ink/30 pb-0.5 hover:border-terracotta transition"
          >
            <span>Continue as Guest</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          <p className="text-[10.5px] text-cocoa-light font-sans">
            No account required. You can always browse and order directly on WhatsApp.
          </p>
        </div>

      </div>
    </div>
  )
}

