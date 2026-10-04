'use client'

import { useState } from 'react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setSubscribed(true)
      setEmail('')
    }, 600)
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
              <span>Welcome to The Thretha Edit. Thank you!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address…"
                className="flex-1 bg-cream border border-ink/20 px-4 py-3.5 text-xs font-sans text-ink placeholder:text-cocoa/40 focus:outline-none focus:border-ink rounded-none transition-colors min-h-[46px]"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-7 py-3.5 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark active:scale-[0.98] transition-all min-h-[46px] shrink-0"
              >
                <span>{loading ? 'Subscribing…' : 'Subscribe'}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            </form>
          )}

          <p className="mt-3 text-[10px] text-cocoa/50 font-sans">
            We send thoughtfully spaced dispatches. Never any spam.
          </p>
        </div>
      </div>
    </section>
  )
}

