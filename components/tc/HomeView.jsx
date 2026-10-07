'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { api } from '@/lib/tc'
import FullscreenHero from './Hero'
import CategoryDiscovery from './CategoryDiscovery'
import FeaturedProducts from './FeaturedProducts'
import LookbookWall from './LookbookWall'
import FashionImage, { productImage } from './FashionImage'
import ErrorBoundary from './ErrorBoundary'
import { getHomepageContent } from '@/lib/homepageContent'
import OccasionDiscovery from './OccasionDiscovery'
import Newsletter from './Newsletter'
import HomeDiscoveryFilters from './HomeDiscoveryFilters'
import { normalizeHomeSectionOrder } from '@/lib/homeLayout'

export default function HomeView({ addToCart, initialData }) {
  const router = useRouter()
  const [data, setData] = useState(initialData || { arrivals: [], featured: [], categories: [], settings: null })
  const [loading, setLoading] = useState(!initialData)
  const [failed, setFailed] = useState({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (initialData) {
      setLoading(false)
      return
    }
    let active = true
    const controller = new AbortController()
    setLoading(true)
    const requests = ['/products?new=true', '/products?featured=true', '/categories', '/settings']
    Promise.allSettled(requests.map((path) => api(path, { signal: controller.signal }))).then((results) => {
      if (!active) return
      const keys = ['arrivals', 'featured', 'categories', 'settings']
      const errors = {}
      const next = {}
      results.forEach((result, index) => {
        const key = keys[index]
        errors[key] = result.status === 'rejected'
        next[key] = result.status === 'fulfilled' ? (key === 'settings' ? result.value : Array.isArray(result.value) ? result.value : []) : (key === 'settings' ? null : [])
      })
      setData(next)
      setFailed(errors)
      setLoading(false)
    })
    return () => { active = false; controller.abort() }
  }, [attempt, initialData])

  useEffect(() => {
    if (!initialData) return
    setData(initialData)
    setFailed({})
    setLoading(false)
  }, [initialData])

  useEffect(() => {
    const refreshContent = () => router.refresh()
    window.addEventListener('tc-storefront-settings-changed', refreshContent)
    return () => window.removeEventListener('tc-storefront-settings-changed', refreshContent)
  }, [router])

  const retry = () => setAttempt((value) => value + 1)
  const content = getHomepageContent(data.settings)
  const imagery = [...data.featured, ...data.arrivals]
  const edit = data.featured.find((product) => productImage(product))
  const sectionOrder = normalizeHomeSectionOrder(data.settings?.homepage_content?.section_order)
  const sections = {
    hero: <ErrorBoundary sectionName="Hero"><FullscreenHero settings={data.settings} /></ErrorBoundary>,
    intro: <div className="fashion-intro"><span>{content.intro_left}</span><span>{content.intro_right}</span></div>,
    silhouette: <>
      <ErrorBoundary sectionName="Categories"><CategoryDiscovery categories={data.categories} products={imagery} content={content} /></ErrorBoundary>
      {failed.categories && <div className="fashion-section fashion-data-message" role="status"><p>Categories are temporarily unavailable.</p><button className="fashion-link" type="button" onClick={retry}>Try again <ArrowRight size={15} aria-hidden="true" /></button></div>}
    </>,
    filters: <HomeDiscoveryFilters />,
    new_arrivals: <ErrorBoundary sectionName="New arrivals"><FeaturedProducts products={data.arrivals} settings={data.settings} addToCart={addToCart} title={content.arrivals_heading} loading={loading} error={failed.arrivals} onRetry={retry} /></ErrorBoundary>,
    featured_edit: edit ? <section className="fashion-edit" aria-labelledby="fashion-edit-heading">
      <Link href={`/product/${edit.slug}`} className="fashion-edit-image" aria-label={`Discover ${edit.name}`}><FashionImage src={content.featured_editorial_image || productImage(edit)} alt={edit.name} sizes="(max-width: 767px) 100vw, 55vw" /></Link>
      <div className="fashion-edit-content"><p className="fashion-eyebrow">{content.featured_eyebrow}</p><h2 id="fashion-edit-heading">{content.featured_heading.split('\n').map((line, index) => <span key={index}>{index > 0 && <br />}{index === 1 ? <em>{line}</em> : line}</span>)}</h2><p>{content.featured_description}</p><Link href={content.featured_cta_link || '/shop'} className="fashion-link">{content.featured_cta} <ArrowRight size={16} aria-hidden="true" /></Link></div>
    </section> : null,
    shop_by_occasion: <OccasionDiscovery settings={data.settings} products={imagery} categories={data.categories} />,
    instagram: <ErrorBoundary sectionName="Instagram"><LookbookWall settings={data.settings} editorial content={content} initialFeedData={data.instagramFeed} /></ErrorBoundary>,
    newsletter: <Newsletter />,
    final_cta: <section className="fashion-final" aria-labelledby="fashion-final-heading"><p className="fashion-eyebrow">{content.final_kicker}</p><h2 id="fashion-final-heading">{content.final_heading.split('\n').map((line, index) => <span key={index}>{index > 0 && <br />}{index === 1 ? <em>{line}</em> : line}</span>)}</h2><Link href={content.final_cta_link || '/shop'} className="fashion-link">{content.final_cta} <ArrowRight size={17} aria-hidden="true" /></Link></section>,
  }

  return (
    <div className="fashion-home">
      {sectionOrder.map((id) => <Fragment key={id}>{sections[id]}</Fragment>)}
    </div>
  )
}
