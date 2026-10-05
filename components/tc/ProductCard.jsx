'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, Sparkles, Video, ArrowRight } from 'lucide-react'
import { inr, toggleWishlist, inWishlist } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { useCart } from './CartContext'
import FashionImage from './FashionImage'

const QuickViewModal = dynamic(() => import('./QuickViewModal'))

export default function ProductCard({ p, settings, addToCart, editorial = false }) {
  const router = useRouter()
  const quickTrigger = useRef(null)
  const cartContext = (() => {
    try { return useCart() } catch { return null }
  })()
  const addCart = addToCart || cartContext?.addToCart || (() => {})

  const [saved, setSaved] = useState(() => (p?.slug ? inWishlist(p.slug) : false))
  const [quickOpen, setQuickOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [imgErr, setImgErr] = useState(false)

  useEffect(() => {
    if (!p?.slug) return
    const sync = () => setSaved(inWishlist(p.slug))
    sync()
    window.addEventListener('tc-wishlist', sync)
    return () => window.removeEventListener('tc-wishlist', sync)
  }, [editorial, p?.slug])

  if (!p) return null

  const media = p.media || []
  const primaryImg = media.find((m) => m.is_primary)?.url || media.find((m) => m.type !== 'video')?.url || media[0]?.url
  const secondaryImg = media.filter((m) => m.type !== 'video')[1]?.url
  const hasVideo = media.some((m) => m.type === 'video')

  const soldOut = p.stock <= 0
  const threshold = settings?.low_stock_threshold ?? 3
  const lowStock = !soldOut && p.stock <= threshold
  const price = p.discount_price || p.price
  const hasDiscount = p.discount_price && p.discount_price < p.price
  const discountPercent = hasDiscount
    ? Math.round(((p.price - p.discount_price) / p.price) * 100)
    : 0

  const handleWishlist = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const next = toggleWishlist(p.slug)
    setSaved(next.includes(p.slug))
  }

  const handleQuickView = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setQuickOpen(true)
  }

  if (editorial) return (
    <>
      <article className="fashion-product">
        <div className="fashion-product-media">
          <Link href={`/product/${p.slug}`} className="fashion-product-image" aria-label={`View ${p.name}`}><FashionImage src={media.find((m) => m.type !== 'video' && m.is_primary)?.url || media.find((m) => m.type !== 'video')?.url} alt={p.name} sizes="(max-width: 767px) 45vw, 23vw" /></Link>
          <button type="button" onClick={handleWishlist} aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} aria-pressed={saved} className="fashion-product-wish"><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>
          {soldOut && <span className="fashion-stock-label">Sold out</span>}
          <button ref={quickTrigger} type="button" className="product-quick-shop" onClick={handleQuickView} aria-label={`Quick shop ${p.name}`} aria-haspopup="dialog"><span className="product-quick-shop-label">Quick <span>shop</span></span><ArrowRight size={15} aria-hidden="true" /></button>
        </div>
        <Link href={`/product/${p.slug}`} className="fashion-product-meta"><h3>{p.name}</h3><div className="fashion-product-price"><span>{inr(price)}</span>{hasDiscount && <><del>{inr(p.price)}</del><span className="sr-only">{discountPercent}% off</span></>}</div></Link>
      </article>
      {quickOpen && <QuickViewModal returnFocusRef={quickTrigger} product={p} open={quickOpen} onOpenChange={setQuickOpen} navigate={(to) => router.push(to)} addToCart={addCart} settings={settings} />}
    </>
  )

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group relative flex flex-col justify-between transition-all duration-300 w-full min-w-0"
      >
        {/* Media Frame (4:5 Ratio) */}
        <div className="product-card-media relative">
        <Link
          href={`/product/${p.slug}`}
          className="relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-sand/30 shadow-sm border border-ink/5 block"
        >
          {/* Primary Image */}
          {primaryImg && !imgErr ? (
            <img
              src={primaryImg}
              alt={p.name}
              onError={() => setImgErr(true)}
              className={cn(
                'h-full w-full object-cover transition-all duration-700 ease-out',
                hovered && secondaryImg ? 'opacity-0 scale-105' : 'opacity-100 group-hover:scale-105'
              )}
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-sand/30 p-4 text-center">
              <div>
                <Sparkles className="mx-auto h-5 w-5 text-mango/60 mb-1" />
                <span className="font-display text-sm text-ink/70">Thretha Atelier</span>
                <p className="text-[10px] uppercase tracking-wider text-cocoa-light mt-0.5">Image coming soon</p>
              </div>
            </div>
          )}

          {/* Secondary Lookbook Cross-Fade */}
          {secondaryImg && !imgErr && (
            <img
              src={secondaryImg}
              alt={`${p.name} alternate`}
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out',
                hovered ? 'opacity-100 scale-105' : 'opacity-0'
              )}
              loading="lazy"
            />
          )}

          {/* Badges Overlay */}
          <div className="absolute left-2 top-2 sm:left-2.5 sm:top-2.5 flex flex-col gap-1 z-10">
            {p.new_arrival && (
              <span className="bg-coral px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-cream rounded-sm shadow-sm">
                New Drop
              </span>
            )}
            {hasDiscount && (
              <span className="bg-plum px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-cream rounded-sm shadow-sm">
                {discountPercent}% Off
              </span>
            )}
            {lowStock && (
              <span className="bg-amber-600 px-1.5 sm:px-2 py-0.5 text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-cream rounded-sm shadow-sm">
                Only {p.stock} left
              </span>
            )}
            {soldOut && (
              <span className="bg-ink px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider text-cream rounded-sm shadow-sm">
                Sold Out
              </span>
            )}
          </div>

          {/* Video Indicator */}
          {hasVideo && (
            <span
              className="absolute right-2 bottom-16 sm:right-2.5 grid h-6 w-6 place-items-center rounded-full bg-ink/75 text-cream backdrop-blur-sm shadow-sm z-10"
              title="Watch lookbook reel"
            >
              <Video className="h-3 w-3 text-gold-shimmer" />
            </span>
          )}

        </Link>
          {/* Wishlist Button */}
          <button
            type="button"
            onClick={handleWishlist}
            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-pressed={saved}
            className={cn(
              'absolute right-2 top-2 sm:right-2.5 sm:top-2.5 z-20 grid h-11 w-11 place-items-center rounded-full bg-paper/90 backdrop-blur-md shadow-sm transition-all duration-300 pointer-events-auto active:scale-95',
              saved ? 'text-coral scale-110' : 'text-ink/60 hover:text-coral hover:scale-110'
            )}
          >
            <Heart className={cn('h-4 w-4 transition-transform active:scale-125', saved && 'fill-coral text-coral')} />
          </button>

          <button ref={quickTrigger} type="button" className="product-quick-shop" onClick={handleQuickView} aria-label={`Quick shop ${p.name}`} aria-haspopup="dialog"><span className="product-quick-shop-label">Quick <span>shop</span></span><ArrowRight size={15} aria-hidden="true" /></button>
        </div>

        {/* Product Meta */}
        <Link href={`/product/${p.slug}`} className="mt-2.5 sm:mt-3.5 space-y-1 block">
          {p.category_name && (
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.25em] text-mango-dark font-semibold">
              {p.category_name}
            </p>
          )}

          <h3 className="font-display text-base sm:text-lg text-ink line-clamp-1 group-hover:text-mango-dark transition font-normal">
            {p.name}
          </h3>

          <div className="flex flex-wrap gap-1 items-baseline justify-between pt-0.5">
            <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
              <span className="font-display text-sm sm:text-base font-semibold text-ink">
                {inr(price)}
              </span>
              {hasDiscount && (
                <span className="text-[11px] sm:text-xs text-cocoa-light line-through">
                  {inr(p.price)}
                </span>
              )}
            </div>

            {p.sizes?.length === 1 && p.sizes[0].size === 'Free Size' ? (
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-cocoa-light font-medium">
                Free Size
              </span>
            ) : p.sizes?.length > 1 ? (
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-cocoa-light font-medium">
                {p.sizes.filter((s) => s.available).length} sizes
              </span>
            ) : null}
          </div>
        </Link>
      </div>

      {/* Quick View Dialog */}
      {quickOpen && (
        <QuickViewModal
          returnFocusRef={quickTrigger}
          product={p}
          open={quickOpen}
          onOpenChange={setQuickOpen}
          navigate={(to) => router.push(to)}
          addToCart={addCart}
          settings={settings}
        />
      )}
    </>
  )
}
