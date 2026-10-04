import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, Search } from 'lucide-react'

export const metadata = {
  title: 'Page Not Found — Thretha Couture',
  description: 'The requested piece or collection could not be found.',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main className="min-h-[75vh] flex items-center justify-center bg-cream px-4 py-20">
      <div className="max-w-md w-full text-center space-y-8 p-10 bg-paper border border-ink/10 shadow-xs">
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold-dark font-medium">
            404 — Not Found
          </p>
          <h1 className="font-display text-4xl text-ink font-normal tracking-tight">
            Piece Not Found
          </h1>
          <div className="w-12 h-px bg-gold-dark/40 mx-auto my-3" />
          <p className="text-xs text-cocoa leading-relaxed max-w-sm mx-auto">
            The artisanal silhouette or collection you are seeking may have been archived, renamed, or is currently unavailable.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-6 py-3.5 text-xs uppercase tracking-[0.2em] font-medium hover:bg-cocoa transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Explore Shop
          </Link>

          <Link
            href="/search"
            className="inline-flex items-center justify-center gap-2 border border-ink/20 text-ink px-6 py-3.5 text-xs uppercase tracking-[0.2em] font-medium hover:bg-sand/30 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            Search Catalogue
          </Link>
        </div>

        <div className="pt-4 border-t border-ink/10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-cocoa hover:text-ink transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-3 h-3" />
            Return to Homepage
          </Link>
        </div>
      </div>
    </main>
  )
}
