'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import ProductCard from './ProductCard'
import { productImage } from './FashionImage'

export default function FeaturedProducts({ products = [], settings, addToCart, title = 'New arrivals', id = 'new-arrivals-heading', href = '/new-arrivals', loading = false, error = false, onRetry }) {
  const shown = products.filter((product) => productImage(product)).slice(0, 4)
  if (!shown.length && !loading && !error) return null
  return (
    <section className="fashion-section" aria-labelledby={id}>
      <div className="fashion-section-heading"><h2 id={id}>{title}</h2><Link href={href} className="fashion-link">View all <ArrowRight size={15} aria-hidden="true" /></Link></div>
      {error && !shown.length ? (
        <div className="fashion-data-message" role="status"><p>We couldn’t load the collection right now.</p><button type="button" onClick={onRetry} className="fashion-link">Try again <ArrowRight size={15} aria-hidden="true" /></button></div>
      ) : (
        <div className="fashion-products" aria-busy={loading}>
          {loading && !shown.length ? Array.from({ length: 4 }, (_, i) => <div className="fashion-product-skeleton" key={i} aria-hidden="true"><div /><span /></div>) : shown.map((product) => <ProductCard key={product.id || product.slug} p={product} settings={settings} addToCart={addToCart} editorial />)}
        </div>
      )}
      {loading && <span className="sr-only" role="status">Loading collection</span>}
    </section>
  )
}
