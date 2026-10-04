'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import FashionImage, { productImage } from './FashionImage'

export default function CategoryDiscovery({ categories = [], products = [], content = {} }) {
  if (!categories.length) return null
  return (
    <section className="fashion-section" aria-labelledby="categories-heading">
      <div className="fashion-section-heading"><h2 id="categories-heading">{content.categories_heading || 'Find your silhouette.'}</h2><span className="fashion-eyebrow">{content.categories_eyebrow || 'Shop by category'}</span></div>
      <div className="fashion-categories">
        {categories.map((category) => {
          const image = category.image || productImage(products.find((p) => p.category_id === category.id))
          return (
            <Link key={category.id || category.slug} href={`/category/${category.slug}`} className="fashion-category">
              <div className="fashion-category-image"><FashionImage src={image} alt={category.name} sizes="(max-width: 767px) 50vw, 45vw" /></div>
              <div className="fashion-category-caption"><h3>{category.name}</h3><ArrowUpRight size={22} aria-hidden="true" /></div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
