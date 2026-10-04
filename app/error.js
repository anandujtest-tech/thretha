'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw, ShoppingBag, ArrowLeft } from 'lucide-react'

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    // Log client error safely without exposing raw secrets
    console.error('Application Error Boundary Caught:', error?.message || error)
  }, [error])

  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-cream px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6 p-8 bg-paper border border-ink/10 shadow-xs">
        <div className="mx-auto w-12 h-12 rounded-full bg-sand/60 flex items-center justify-center text-cocoa">
          <AlertCircle className="w-6 h-6 text-gold-dark" />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.25em] text-cocoa font-medium">
            Thretha Atelier
          </p>
          <h1 className="font-display text-3xl text-ink">
            Something went wrong
          </h1>
          <p className="text-xs text-cocoa leading-relaxed max-w-sm mx-auto">
            We encountered an unexpected issue while loading this piece. Please try again, or continue browsing our collections.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium hover:bg-cocoa transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>

          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 border border-ink/20 text-ink px-6 py-3 text-xs uppercase tracking-[0.2em] font-medium hover:bg-sand/30 transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Continue Shopping
          </Link>
        </div>

        <div className="pt-4 border-t border-ink/10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-cocoa hover:text-ink transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-3 h-3" />
            Return to Home
          </Link>
        </div>
      </div>
    </main>
  )
}

