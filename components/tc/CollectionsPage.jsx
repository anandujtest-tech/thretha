'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, FolderTree } from 'lucide-react'
import { api } from '@/lib/tc'

export default function CollectionsPage({ initialCategories }) {
  const [categories, setCategories] = useState(initialCategories || [])
  const [loading, setLoading] = useState(!initialCategories)

  useEffect(() => {
    api('/categories')
      .then((cats) => {
        setCategories(Array.isArray(cats) ? cats : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="w-full bg-paper py-10 sm:py-16 lg:py-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Editorial Header ── */}
        <div className="mb-12 sm:mb-16 border-b border-ink/10 pb-8 sm:pb-12 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 text-gold-dark text-[10px] sm:text-[11px] font-sans font-semibold uppercase tracking-[0.25em] mb-3">
            <Sparkles className="h-3 w-3 text-gold" />
            <span>The Thretha Wardrobe</span>
          </div>
          <h1 className="font-display text-4xl sm:text-6xl text-ink font-normal leading-tight tracking-tight">
            Curated Collections
          </h1>
          <p className="mt-3 text-sm sm:text-base text-cocoa leading-relaxed font-sans max-w-xl mx-auto">
            Discover every silhouette, pure natural weave, and handcrafted drape tailored with a soft spot for Kerala elegance.
          </p>
        </div>

        {/* ── Featured Editorial Curations ── */}
        <div className="mb-12 sm:mb-16 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Festive Edit Card */}
          <Link
            href={categories.some(category => category.slug === 'sarees') ? '/category/sarees' : '/shop'}
            className="group relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/10] overflow-hidden bg-sand/40 border border-ink/8 block"
          >
            <img
              src="/api/media/file/seed-03.jpg"
              alt="The Festive Edit"
              className="h-full w-full object-cover object-[center_20%] transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
            <div className="absolute top-4 left-4">
              <span className="px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] font-sans font-semibold bg-gold text-ink">
                Festive '26
              </span>
            </div>
            <div className="absolute bottom-5 left-5 right-5 sm:bottom-6 sm:left-6 sm:right-6 text-cream">
              <h2 className="font-display text-2xl sm:text-4xl font-normal leading-tight">
                The Festive Drape Edit
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-cream/75 font-sans leading-relaxed line-clamp-2 max-w-md hidden sm:block">
                Rich ochres, woven zari borders, and luminous drapes crafted for celebrations and slow festive evenings.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-gold-light group-hover:text-cream">
                <span>Explore The Drape Edit</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>

          {/* Everyday Silhouettes Card */}
          <Link
            href={categories.some(category => category.slug === 'crop-tops') ? '/category/crop-tops' : '/shop'}
            className="group relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[16/10] overflow-hidden bg-sand/40 border border-ink/8 block"
          >
            <img
              src="/api/media/file/seed-07.jpg"
              alt="Everyday Silhouettes"
              className="h-full w-full object-cover object-[center_15%] transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
            <div className="absolute top-4 left-4">
              <span className="px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] font-sans font-semibold bg-terracotta text-cream">
                Everyday Modern
              </span>
            </div>
            <div className="absolute bottom-5 left-5 right-5 sm:bottom-6 sm:left-6 sm:right-6 text-cream">
              <h2 className="font-display text-2xl sm:text-4xl font-normal leading-tight">
                Contemporary Tops & Blouses
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-cream/75 font-sans leading-relaxed line-clamp-2 max-w-md hidden sm:block">
                Breathable cottons and effortless silhouettes tailored for easy mornings and contemporary wardrobes.
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-gold-light group-hover:text-cream">
                <span>Explore Silhouette Drops</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        </div>

        {/* ── Dynamic Category Silhouettes from MongoDB ── */}
        <div className="mt-12 sm:mt-16">
          <div className="flex items-center gap-2 mb-6 sm:mb-8 border-b border-ink/10 pb-4">
            <FolderTree className="h-4 w-4 text-terracotta" />
            <h3 className="font-display text-2xl sm:text-3xl text-ink font-normal">
              All Silhouettes
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((c) => (
              <Link
                key={c.id || c.slug}
                href={`/category/${c.slug}`}
                className="group flex flex-col justify-between overflow-hidden bg-cream border border-ink/8 shadow-2xs hover:shadow-lg transition-all duration-300"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-sand/30">
                  <img
                    src={c.image || '/api/media/file/seed-01.jpg'}
                    alt={c.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-106"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-transparent to-transparent opacity-60 group-hover:opacity-75 transition-opacity" />
                  <div className="absolute bottom-3 left-3 right-3 text-cream">
                    <h4 className="font-display text-2xl font-normal leading-tight">
                      {c.name}
                    </h4>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-cocoa leading-relaxed line-clamp-2 mb-4 font-sans">
                    {c.description || 'Handcrafted contemporary pieces from our Kerala atelier.'}
                  </p>
                  <div className="pt-3 border-t border-ink/8 flex items-center justify-between text-xs font-sans font-semibold uppercase tracking-wider text-ink group-hover:text-terracotta transition-colors">
                    <span>Explore {c.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
