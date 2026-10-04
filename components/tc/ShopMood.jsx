'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ShopMood() {
  const moods = [
    {
      title: 'Festive Twilight',
      tag: 'Celebration Drapes',
      desc: 'Rich ochres, woven zari borders, and luminous silks made for celebrations.',
      href: '/category/sarees',
      img: '/api/media/file/seed-02.jpg',
      badgeBg: 'bg-plum text-cream',
    },
    {
      title: 'Sunlit Mornings',
      tag: 'Casual Everyday',
      desc: 'Lightweight cottons and breezy tops cut for effortless comfort.',
      href: '/category/crop-tops',
      img: '/api/media/file/seed-07.jpg',
      badgeBg: 'bg-mango text-ink font-bold',
    },
    {
      title: 'Heirloom Classics',
      tag: 'Handcrafted Sarees',
      desc: 'Timeless ivory, rose, and black drapes inspired by Kerala heritage.',
      href: '/category/sarees',
      img: '/api/media/file/seed-03.jpg',
      badgeBg: 'bg-teal text-cream',
    },
    {
      title: 'Fresh Drops',
      tag: 'Just In',
      desc: 'The latest silhouettes fresh off our Kochi cutting tables.',
      href: '/new-arrivals',
      img: '/api/media/file/seed-01.jpg',
      badgeBg: 'bg-coral text-cream',
    },
  ]

  return (
    <section className="py-10 sm:py-20 border-b border-ink/10 bg-paper">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-6 sm:mb-14 flex flex-row items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-coral animate-pulse" />
              <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-coral-dark font-bold">
                Curated Aesthetics
              </p>
            </div>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl text-ink font-normal leading-tight">
              Shop The Mood
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-ink hover:text-mango-dark transition pb-0.5 border-b border-ink shrink-0"
          >
            <span>Explore All</span>
            <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
        </div>

        {/* 2-Column Mobile / 4-Column Desktop Grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
          {moods.map((m, idx) => (
            <Link
              key={idx}
              href={m.href}
              className="group relative block cursor-pointer overflow-hidden rounded-sm bg-sand/30 border border-ink/10 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] flex flex-col justify-between"
            >
              {/* Image Frame */}
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-sand/40">
                <img
                  src={m.img}
                  alt={m.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-108"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/15 to-transparent opacity-70 group-hover:opacity-85 transition duration-300" />
                
                {/* Floating Tag */}
                <div className="absolute top-2 sm:top-3 left-2 sm:left-3">
                  <span className={cn('px-2 py-0.5 text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold rounded-xs shadow-xs', m.badgeBg)}>
                    {m.tag}
                  </span>
                </div>

                {/* Bottom Overlay Label */}
                <div className="absolute bottom-2.5 sm:bottom-3 left-2.5 sm:left-3 right-2.5 sm:right-3 text-cream">
                  <h3 className="font-display text-lg sm:text-2xl font-normal leading-tight drop-shadow-sm flex items-center justify-between">
                    <span>{m.title}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-0.5" />
                  </h3>
                </div>
              </div>

              {/* Description Card Footer */}
              <div className="p-2.5 sm:p-4 bg-cream flex-1 flex flex-col justify-between">
                <p className="hidden sm:block text-xs text-cocoa leading-relaxed">
                  {m.desc}
                </p>
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-mango-dark group-hover:underline block">
                  Discover Drop →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
