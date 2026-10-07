'use client'

import { useState } from 'react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { api } from '@/lib/tc'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !email.includes('@')) { setError('Enter a valid email address.'); return }
    if (!consent) { setError('Please consent to receive newsletter emails.'); return }
    setLoading(true)
    try {
      const result = await api('/newsletter/subscribe', { method: 'POST', body: { email, consent: true } })
      setLoading(false)
      setSuccessMessage(result.message || (result.alreadySubscribed ? 'You are already subscribed.' : 'Thank you for subscribing.'))
      setSubscribed(true)
      setEmail('')
    } catch (err) {
      setError(err.message || 'We could not save your subscription. Please try again.')
      setLoading(false)
    }
  }

  return (
    <section
      aria-labelledby="newsletter-heading"
      className="py-16 sm:py-20 lg:py-24 bg-paper-warm border-b border-ink/8"
    >
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 text-gold-dark text-[10px] sm:text-[11px] font-sans font-semibold uppercase tracking-[0.25em] mb-4">
          <Sparkles className="h-3 w-3 text-gold" />
          <span>The Thretha Edit</span>
        </div>

        {/* Heading */}
        <h2
          id="newsletter-heading"
          className="font-display text-[clamp(2rem,6vw,3.5rem)] text-ink font-normal leading-[1.1] tracking-tight"
        >
          Join Our Circle
        </h2>

        {/* Subtitle */}
        <p className="mt-3 text-sm sm:text-base text-cocoa/80 font-sans max-w-lg mx-auto leading-relaxed">
          Be the first to discover new silhouette drops, private archive previews, and intimate stories from our Kerala atelier.
        </p>

        {/* Subscription Form */}
        <div className="mt-8 max-w-md mx-auto">
          {subscribed ? (
            <div className="flex items-center justify-center gap-2 py-4 px-6 bg-cream border border-gold/30 rounded-sm text-xs font-sans uppercase tracking-[0.2em] font-semibold text-ink animate-fade-in shadow-xs">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address…"
                className="min-h-[46px] min-w-0 flex-1 bg-cream border border-ink/20 px-4 py-3.5 text-xs font-sans text-ink placeholder:text-cocoa/40 focus:outline-none focus:border-ink rounded-none transition-colors sm:min-w-[200px]"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-7 py-3.5 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark active:scale-[0.98] transition-all min-h-[46px] shrink-0"
              >
                <span>{loading ? 'Subscribing…' : 'Subscribe'}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </button>
              <label className="flex basis-full items-start gap-2 pt-2 text-left text-[11px] leading-relaxed text-cocoa sm:order-3">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-ink" />
                <span>I agree to receive Thretha Couture newsletter emails. I can unsubscribe at any time.</span>
              </label>
            </form>
          )}

          <p className="mt-3 text-[10px] text-cocoa/50 font-sans">
            We send thoughtfully spaced dispatches. Never any spam.
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-coral">{error}</p>}
        </div>
      </div>
    </section>
  )
}
