'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function FinalCTA({ settings }) {
  const img = settings?.final_cta_image || '/api/media/file/seed-02.jpg'

  return (
    <section
      aria-label="Shop Thretha"
      className="relative overflow-hidden"
    >
      {/* Background image */}
      <img
        src={img}
        alt="Thretha collection"
        className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
        loading="lazy"
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-ink/65" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-5 py-24 sm:py-32 lg:py-40 gap-6 sm:gap-8">

        {/* Label */}
        <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.32em] text-cream/55 font-sans font-semibold">
          Ready To Explore?
        </p>

        {/* Large headline */}
        <h2 className="font-display text-[clamp(2rem,7vw,4.5rem)] text-cream font-normal leading-[1.1] tracking-tight max-w-3xl">
          Find Your Next Favourite Piece
        </h2>

        {/* Tagline */}
        <p className="text-sm sm:text-base text-cream/55 font-sans max-w-md leading-relaxed">
          Contemporary Indian fashion. Handwoven with love in Kerala.
          Every piece tells a story worth wearing.
        </p>

        {/* CTA */}
        <Link
          href="/shop"
          className="group inline-flex items-center gap-3 bg-cream text-ink px-9 sm:px-12 py-4 sm:py-5 text-[11px] sm:text-xs font-sans uppercase tracking-[0.25em] font-semibold hover:bg-paper active:scale-[0.97] transition-all duration-200 min-h-[52px] shadow-xl mt-2"
        >
          <span>Explore Thretha</span>
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>

        {/* Brand annotation */}
        <p className="font-hand text-xl sm:text-2xl text-cream/30 mt-2">
          handwoven with love in Kerala ✦
        </p>
      </div>
    </section>
  )
}

