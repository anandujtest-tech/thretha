'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import FashionImage from './FashionImage'

const DEFAULT_HERO_CONTENT = {
  title: 'Made for\nyour moments.',
  kicker: 'The Thretha wardrobe',
  subtitle: 'Everyday. Occasion. You.',
  annotation: 'Thretha Couture',
  cta: 'Shop collection',
  cta_link: '/shop',
}

export default function FullscreenHero({ settings }) {
  const hero = { ...DEFAULT_HERO_CONTENT, ...(settings?.hero || {}) }
  const images = Array.isArray(hero.images)
    ? hero.images.filter((image) => typeof image === 'string' && image.trim())
    : []
  const [slide, setSlide] = useState(0)
  useEffect(() => {
    setSlide(0)
    if (images.length < 2) return
    const timer = window.setInterval(() => setSlide(current => (current + 1) % images.length), 6000)
    return () => window.clearInterval(timer)
  }, [images.join('\u0000')])
  const src = images.length ? images[slide % images.length] : ''
  const lines = String(hero.title || DEFAULT_HERO_CONTENT.title).split('\n')
  return (
    <section className="fashion-hero" aria-labelledby="fashion-hero-title">
      <div className="fashion-hero-image"><FashionImage src={src} alt={lines.join(' ')} priority /></div>
      <div className="fashion-hero-shade" />
      <div className="fashion-hero-content">
        <p className="fashion-eyebrow">{hero.kicker}</p>
        <h1 id="fashion-hero-title">{lines.map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</h1>
        {hero.subtitle && <p className="fashion-hero-subtitle">{hero.subtitle}</p>}
        <Link href={hero.cta_link || '/shop'} className="fashion-link fashion-link-light">{hero.cta} <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      {hero.annotation && <div className="fashion-hero-foot"><span>{hero.annotation}</span><span>Thretha Couture</span></div>}
    </section>
  )
}
