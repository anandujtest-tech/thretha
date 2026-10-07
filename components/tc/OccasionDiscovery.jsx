'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { DEFAULT_OCCASIONS, normalizeOccasions } from '@/lib/occasions'

export default function OccasionDiscovery({ settings }) {
  if (settings?.shop_by_occasion?.enabled === false) return null
  const occasions = normalizeOccasions(settings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS).filter((item) => item.active)
  if (!occasions.length) return null
  return (
    <section className="fashion-section" aria-labelledby="shop-occasion-heading">
      <div className="fashion-section-heading">
        <h2 id="shop-occasion-heading">Shop by Occasion</h2>
        <span className="fashion-eyebrow">A look for every moment</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {occasions.map((occasion) => (
          <Link key={occasion.slug} href={`/shop?occasion=${encodeURIComponent(occasion.slug)}`} className="group flex min-h-20 items-center justify-between border border-ink/10 bg-cream px-4 py-4 transition-colors hover:border-mango hover:bg-white">
            <span className="font-display text-lg text-ink sm:text-xl">{occasion.name}</span>
            <ArrowUpRight size={17} className="text-cocoa transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  )
}
