'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function EditorialStory({ settings }) {
  const img = settings?.campaign_image || '/api/media/file/seed-03.jpg'

  return (
    <section
      aria-label="The Current Edit"
      className="relative overflow-hidden bg-paper border-b border-ink/8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] min-h-[480px] sm:min-h-[560px] lg:min-h-[640px]">

        {/* ── Image — left on desktop, top on mobile ── */}
        <div className="relative h-[52vw] min-h-[280px] max-h-[480px] lg:h-auto lg:max-h-none overflow-hidden">
          <img
            src={img}
            alt="The Thretha Current Edit"
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 hover:scale-[1.03]"
            loading="lazy"
          />
          {/* Subtle right-edge fade on desktop */}
          <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-paper to-transparent hidden lg:block" />
        </div>

        {/* ── Text — right on desktop, below on mobile ── */}
        <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-12 sm:py-16 lg:py-20 gap-5 sm:gap-6">

          {/* Eyebrow */}
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-terracotta" />
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-terracotta font-sans font-semibold">
              The Current Edit
            </p>
          </div>

          {/* Headline */}
          <h2 className="font-display text-[clamp(2rem,6vw,3.25rem)] text-ink font-normal leading-[1.1] tracking-tight">
            Made For Everyday Moments Worth Remembering
          </h2>

          {/* Divider */}
          <div className="h-px w-12 bg-ink/20" />

          {/* Copy */}
          <p className="text-sm sm:text-base text-cocoa/80 font-sans leading-relaxed max-w-md">
            Contemporary silhouettes. Breathable handlooms. Timeless drapes
            handcrafted in Kerala with unhurried artisanal grace — designed
            to make getting dressed a quiet joy.
          </p>

          {/* CTA */}
          <Link
            href="/shop"
            className="group self-start mt-1 inline-flex items-center gap-2.5 bg-terracotta text-cream px-7 sm:px-8 py-3.5 sm:py-4 text-[11px] sm:text-xs font-sans uppercase tracking-[0.22em] font-semibold hover:bg-terracotta-dark active:scale-[0.97] transition-all duration-200 min-h-[48px] w-full sm:w-auto justify-center sm:justify-start"
          >
            <span>Discover The Edit</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* Brand annotation */}
          <p className="font-hand text-lg sm:text-xl text-cocoa/50 mt-auto pt-4 border-t border-ink/8">
            New season. New silhouettes. ✦
          </p>
        </div>
      </div>
    </section>
  )
}

