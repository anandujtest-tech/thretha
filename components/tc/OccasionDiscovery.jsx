'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_OCCASIONS, hasMoreOccasions, normalizeOccasions } from '@/lib/occasions'
import FashionImage, { productImage } from './FashionImage'

export default function OccasionDiscovery({ settings, products = [], categories = [] }) {
  const rowRef = useRef(null)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const enabled = settings?.shop_by_occasion?.enabled !== false
  const occasions = normalizeOccasions(settings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS)
    .filter((item) => item.active && !item.deleted)

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const measure = () => setShowScrollHint(hasMoreOccasions(row.scrollLeft, row.scrollWidth, row.clientWidth))
    measure()
    row.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(row)
    return () => {
      row.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [enabled, occasions.length])

  if (!enabled || !occasions.length) return null
  const imageProducts = products.filter((product) => productImage(product))
  return (
    <section className="fashion-section" aria-labelledby="shop-occasion-heading">
      <div className="fashion-section-heading">
        <h2 id="shop-occasion-heading">Shop by Occasion</h2>
        <span className="fashion-eyebrow">A look for every moment</span>
      </div>
      <div className="relative min-w-0">
        <div ref={rowRef} className="hide-scrollbar flex w-full min-w-0 gap-5 overflow-x-auto overscroll-x-contain pb-3 sm:gap-7 lg:justify-between" aria-label="Shop by occasion">
          {occasions.map((occasion, index) => {
            const matchingProduct = products.find((product) => product.occasion_slugs?.includes(occasion.slug) && productImage(product))
            const categoryImage = categories.find((category) => category.slug === occasion.slug)?.image
            const fallbackProduct = imageProducts[index % imageProducts.length]
            const image = occasion.image || productImage(matchingProduct) || categoryImage || productImage(fallbackProduct)
            return <Link key={occasion.slug} href={`/shop?occasion=${encodeURIComponent(occasion.slug)}`} className="group flex w-28 shrink-0 flex-col items-center gap-3 text-center sm:w-36 lg:w-40">
              <span className="relative block aspect-square w-full overflow-hidden rounded-full border border-ink/10 bg-sand/20 transition-colors group-hover:border-mango">
                <FashionImage src={image} alt={`${occasion.name} fashion`} sizes="(max-width: 640px) 112px, 160px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
              </span>
              <span className="font-display text-base text-ink sm:text-lg">{occasion.name}</span>
            </Link>
          })}
        </div>
        {showScrollHint && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-end bg-gradient-to-l from-paper via-paper/85 to-transparent pb-3 pr-1 text-xl text-cocoa/80 sm:w-14">→</span>}
      </div>
    </section>
  )
}
