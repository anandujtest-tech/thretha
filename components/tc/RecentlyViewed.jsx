'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tc'
import { useCart } from './CartContext'
import ProductCard from './ProductCard'
import { orderProductsByRequestedSlugs } from '@/lib/recentlyViewed'

const KEY = 'thretha_recently_viewed_v1'

export default function RecentlyViewed({ product, settings }) {
  const [products, setProducts] = useState([])
  const { addToCart } = useCart()

  useEffect(() => {
    if (!product?.slug) return
    let slugs = []
    try { slugs = JSON.parse(localStorage.getItem(KEY) || '[]') } catch {}
    if (!Array.isArray(slugs)) slugs = []
    const previous = [...new Set(slugs.filter((slug) => typeof slug === 'string' && slug && slug !== product.slug))]
    slugs = [product.slug, ...previous].slice(0, 12)
    try { localStorage.setItem(KEY, JSON.stringify(slugs)) } catch {}
    const requested = slugs.filter((slug) => slug !== product.slug).slice(0, 8)
    if (!requested.length) { setProducts([]); return }
    let active = true
    api(`/products?slugs=${encodeURIComponent(requested.join(','))}`).then((result) => {
      if (active) {
        setProducts(orderProductsByRequestedSlugs(requested, result, product.id))
      }
    }).catch(() => { if (active) setProducts([]) })
    return () => { active = false }
  }, [product?.slug, product?.id])

  if (!products.length) return null
  return <section className="mt-14 border-t border-ink/10 pt-10" aria-labelledby="recently-viewed-title">
    <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mango-dark">Your browsing trail</p><h2 id="recently-viewed-title" className="mt-1 font-display text-3xl text-ink">Recently Viewed</h2></div>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">{products.map((item) => <ProductCard key={item.id} p={item} settings={settings} addToCart={addToCart} />)}</div>
  </section>
}
