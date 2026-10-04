'use client'

import Link from 'next/link'
import { ArrowRight, MapPin, Sparkles } from 'lucide-react'

export default function BrandOrigins({ settings }) {
  const img = settings?.brand_story_image || '/api/media/file/seed-04.jpg'
  const brandStory =
    settings?.brand_story ||
    'Thretha was born out of a quiet rebellion against heavy, uncomfortable traditional wear. Every piece is handcrafted with breathable natural fabrics and mindful details — so you feel completely at ease while looking extraordinary.'

  return (
    <section
      aria-labelledby="origins-heading"
      className="border-b border-white/5 bg-ink text-cream overflow-hidden"
    >
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 items-center">

        {/* ── Text Content ── */}
        <div className="flex flex-col justify-center px-5 sm:px-10 lg:px-16 py-12 sm:py-16 lg:py-24 gap-5 sm:gap-7 order-2 lg:order-1 w-full min-w-0">

          {/* Location pill */}
          <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-gold/15 border border-gold/25">
            <MapPin className="h-3 w-3 text-gold shrink-0" />
            <p className="text-[9.5px] uppercase tracking-[0.24em] text-gold font-sans font-medium">
              {settings?.address || 'Kerala, India'}
            </p>
          </div>

          {/* Large Typographic Statement */}
          <h2
            id="origins-heading"
            className="font-display text-[clamp(1.9rem,6vw,3.75rem)] text-cream font-normal leading-[1.08] tracking-tight break-words w-full"
          >
            Rooted In Kerala.
            <br />
            <span className="text-gold font-serif italic">Designed For Now.</span>
          </h2>

          {/* Short Copy */}
          <p className="text-xs sm:text-sm lg:text-base text-cream/70 font-sans leading-relaxed max-w-full sm:max-w-md break-words">
            {brandStory}
          </p>

          {/* Brand Signature */}
          <div className="pt-2">
            <span className="font-hand text-lg sm:text-xl text-gold/80 block">
              handwoven with unhurried grace,
            </span>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] font-sans font-semibold text-cream/50 mt-0.5 block">
              The Thretha Atelier Team
            </span>
          </div>

          {/* CTA */}
          <div className="pt-1">
            <Link
              href="/about"
              className="group inline-flex items-center justify-center sm:justify-start gap-2.5 border border-cream/30 text-cream px-6 sm:px-8 py-3.5 sm:py-4 text-[11px] sm:text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cream hover:text-ink active:scale-[0.97] transition-all duration-200 min-h-[46px] w-full sm:w-auto self-start shadow-sm"
            >
              <span>Read Our Story</span>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* ── Image Side ── */}
        <div className="relative w-full h-[52vw] min-h-[220px] max-h-[460px] lg:h-full lg:min-h-[540px] overflow-hidden order-1 lg:order-2">
          <img
            src={img}
            alt="Thretha Atelier — Kerala"
            className="absolute inset-0 h-full w-full object-cover object-[center_20%] transition-transform duration-700 hover:scale-[1.03]"
            loading="lazy"
          />
          {/* Subtle gradient edges for smooth visual transition */}
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-ink to-transparent hidden lg:block" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink to-transparent lg:hidden" />
        </div>
      </div>
    </section>
  )
}
