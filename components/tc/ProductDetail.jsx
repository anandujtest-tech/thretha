'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Heart,
  Minus,
  Plus,
  ShoppingBag,
  Ruler,
  Truck,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Check,
  ChevronRight,
  Video,
  AlertCircle,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { api, inr, toggleWishlist, inWishlist } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { useCart } from './CartContext'
import ProductCard from './ProductCard'
import SizeGuideModal from './SizeGuideModal'
import OrderModal from './OrderModal'
import FlyingCartAnimation from './FlyingCartAnimation'
import VirtualTryOnModal from './VirtualTryOnModal'
import { useTryOnAvailability } from './TryOnSettingsContext'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

export default function ProductDetail({ navigate, settings, slug, addToCart, initialProduct, categorySlug }) {
  const router = useRouter()
  const cartContext = (() => {
    try { return useCart() } catch { return null }
  })()
  const nav = navigate || ((to) => router.push(to))
  const addCart = addToCart || cartContext?.addToCart || (() => {})

  const [p, setP] = useState(initialProduct || null)
  const { available: tryOnAvailable, settings: tryOnSettings } = useTryOnAvailability('product', p?.ai_tryon_enabled)
  const [err, setErr] = useState(false)
  const [activeMedia, setActiveMedia] = useState(0)
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [orderOpen, setOrderOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [related, setRelated] = useState([])
  const [addedToast, setAddedToast] = useState(false)
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const [sizeError, setSizeError] = useState(false)
  const [feedbackToast, setFeedbackToast] = useState(null)
  const [flyingFlight, setFlyingFlight] = useState(null)
  const [isTryOnOpen, setIsTryOnOpen] = useState(false)
  const [activeColour, setActiveColour] = useState('')
  const addToBagButtonRef = useRef(null)
  const sizeSectionRef = useRef(null)
  const toastTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!tryOnAvailable) setIsTryOnOpen(false)
  }, [tryOnAvailable])

  useEffect(() => {
    if (!slug) return
    setErr(false)
    if (!initialProduct || initialProduct.slug !== slug) setP(null)
    setSizeError(false)
    setFeedbackToast(null)
    setQty(1)

    api(`/products/${encodeURIComponent(slug)}`)
      .catch(() => api(`/product/${encodeURIComponent(slug)}`))
      .then((d) => {
        if (!d || d.error || !d.id) {
          throw new Error('Product not found')
        }
        setP(d)
        setSaved(inWishlist(d.slug))
        setActiveColour(d.colour || d.colours?.[0] || 'Standard')

        // Determine if product has explicit multiple sizes or is Free Size
        const explicitSizes = (d.sizes || []).filter((s) => s && s.size)
        const isMulti =
          explicitSizes.length > 1 ||
          (explicitSizes.length === 1 && explicitSizes[0].size !== 'Free Size')

        if (isMulti) {
          // Explicit sizing: require customer selection (or first available size)
          const firstAvail = explicitSizes.find((s) => s.available)
          setSize(firstAvail?.size || '')
        } else {
          // Free size: automatically set Free Size without requiring manual selection
          setSize(explicitSizes[0]?.size || 'Free Size')
        }

        // Fetch related items from same category
        if (d.category_id) {
          api('/products')
            .then((list) => {
              const rel = (list || [])
                .filter((item) => item.category_id === d.category_id && item.id !== d.id)
                .slice(0, 4)
              setRelated(rel)
            })
            .catch(() => {})
        }
      })
      .catch(() => { if (!initialProduct) setErr(true) })
  }, [slug, initialProduct])

  if (err) {
    return (
      <div className="container py-24 text-center">
        <p className="font-display text-4xl text-ink">
          This piece has found a new home.
        </p>
        <p className="mt-2 text-cocoa">
          Explore our current collection drops instead.
        </p>
        <Button
          type="button"
          onClick={() => nav('/shop')}
          className="mt-6 rounded-none bg-ink px-8 py-5 text-xs uppercase tracking-widest text-cream hover:bg-cocoa-dark"
        >
          Back to the Collection →
        </Button>
      </div>
    )
  }

  if (!p) {
    return (
      <div className="container py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading atelier details…
        </p>
      </div>
    )
  }

  const media = p.media || []
  const availableStock = Math.max(0, Number(p.stock ?? 999))
  const soldOut = availableStock <= 0
  const price = Number(p.discount_price || p.price) || 0
  const threshold = settings?.low_stock_threshold ?? 3
  const low = !soldOut && availableStock <= threshold
  const hasDiscount = p.discount_price && p.discount_price < p.price
  const discountPercent = hasDiscount
    ? Math.round(((p.price - p.discount_price) / p.price) * 100)
    : 0

  const explicitSizes = (p.sizes || []).filter((s) => s && s.size)
  const isMultiSize =
    explicitSizes.length > 1 ||
    (explicitSizes.length === 1 && explicitSizes[0].size !== 'Free Size')
  const selectedSize = (isMultiSize ? size : (size || 'Free Size'))?.trim() || ''

  const cartItems = cartContext?.cart || []
  const existingCartItem = cartItems.find(
    (item) => String(item.product_id) === String(p.id) && item.size === (selectedSize || 'Free Size')
  )
  const currentQtyInCart = existingCartItem ? Math.max(0, Number(existingCartItem.quantity) || 0) : 0
  const isAlreadyAtMaxStock = currentQtyInCart >= availableStock

  const handleWishlist = () => {
    const next = toggleWishlist(p.slug)
    setSaved(next)
  }

  const handleAddToCart = async (e) => {
    // Prevent concurrent / rapid double clicks
    if (isAddingToCart) return

    if (soldOut || availableStock <= 0) {
      setFeedbackToast({
        type: 'error',
        message: 'Sorry, this atelier piece is currently sold out.',
      })
      return
    }

    // 1. Size Validation
    if (isMultiSize && !selectedSize) {
      setSizeError(true)
      setFeedbackToast({
        type: 'warning',
        message: 'Please select a size.',
      })
      if (sizeSectionRef.current) {
        sizeSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
      return
    }

    if (isMultiSize && selectedSize) {
      const chosenSizeObj = explicitSizes.find((s) => s.size === selectedSize)
      if (chosenSizeObj && chosenSizeObj.available === false) {
        setSizeError(true)
        setFeedbackToast({
          type: 'error',
          message: `Size ${selectedSize} is currently out of stock.`,
        })
        return
      }
    }

    // 2. Quantity Validation (strictly 1 <= qty <= availableStock)
    const validQty = Math.max(1, Math.min(Math.floor(Number(qty) || 1), availableStock))

    // 3. Duplicate Cart & Stock Boundary Validation
    if (isAlreadyAtMaxStock) {
      setFeedbackToast({
        type: 'warning',
        message:
          availableStock === 1
            ? 'This single-edition piece is already in your bag.'
            : `All ${availableStock} available pieces are already in your bag.`,
      })
      setAddedToast(true)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = setTimeout(() => {
        setAddedToast(false)
        setFeedbackToast(null)
      }, 3000)
      window.dispatchEvent(new CustomEvent('tc-bag-bounce'))
      return
    }

    // 4. Processing State
    setIsAddingToCart(true)
    try {
      const res = addCart(p, validQty, selectedSize || 'Free Size')

      if (res?.success === false) {
        if (res.reason === 'MAX_STOCK_REACHED') {
          setFeedbackToast({
            type: 'warning',
            message: `All ${availableStock} available pieces are already in your bag.`,
          })
          window.dispatchEvent(new CustomEvent('tc-bag-bounce'))
        } else {
          setFeedbackToast({
            type: 'error',
            message: 'Unable to add piece to shopping bag. Please try again.',
          })
        }
        return
      }

      // Success feedback
      setAddedToast(true)
      setFeedbackToast(null)
      setSizeError(false)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = setTimeout(() => {
        setAddedToast(false)
        setFeedbackToast(null)
      }, 3000)

      // 5. Trigger Physical Flying Flight Animation ONLY after confirmed addition
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

      if (prefersReducedMotion) {
        window.dispatchEvent(new CustomEvent('tc-bag-bounce'))
      } else {
        const clickedBtn = e?.currentTarget || addToBagButtonRef.current
        const sourceRect = clickedBtn?.getBoundingClientRect()
        const bagEl =
          document.getElementById('navbar-bag-button') ||
          document.querySelector('[data-cart-button="true"]') ||
          document.getElementById('mobile-bag-nav-button')

        const destRect = bagEl ? bagEl.getBoundingClientRect() : null

        if (sourceRect && sourceRect.width > 0 && destRect && destRect.width > 0) {
          const currentImage =
            (media[activeMedia]?.type !== 'video' && media[activeMedia]?.url) ||
            media.find((m) => m.type !== 'video')?.url ||
            media[0]?.url ||
            p.image ||
            '/api/media/file/seed-01.jpg'

          setFlyingFlight({
            image: currentImage,
            sourceRect,
            destRect,
          })
        } else {
          window.dispatchEvent(new CustomEvent('tc-bag-bounce'))
        }
      }
    } catch (err) {
      console.error('[ProductDetail] Add to bag error:', err)
      setFeedbackToast({
        type: 'error',
        message: 'Something went wrong while adding to bag.',
      })
    } finally {
      setIsAddingToCart(false)
    }
  }

  return (
    <div className="container py-8 sm:py-12">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-[11px] uppercase tracking-wider text-cocoa-light font-medium">
        <Link href="/" className="hover:text-ink">Home</Link>
        <span>/</span>
        <Link href="/shop" className="hover:text-ink">Shop</Link>
        {p.category_name && categorySlug && (
          <>
            <span>/</span>
            <Link href={`/category/${categorySlug}`} className="hover:text-ink">
              {p.category_name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-ink truncate max-w-[150px] sm:max-w-none">{p.name}</span>
      </nav>

      {/* Main PDP Grid */}
      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        {/* Left: Lookbook Media Gallery */}
        <div className="space-y-4">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-sand/30 shadow-xl border border-ink/10">
            {media[activeMedia]?.type === 'video' ? (
              <video
                src={media[activeMedia].url}
                className="h-full w-full object-cover"
                autoPlay
                loop
                muted
                controls
                playsInline
              />
            ) : media[activeMedia]?.url ? (
              <img
                src={media[activeMedia].url}
                alt={p.name}
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/api/media/file/seed-01.jpg'
                }}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center bg-sand/30 p-8 text-center">
                <div>
                  <Sparkles className="mx-auto h-8 w-8 text-mango/60 mb-2" />
                  <span className="font-display text-lg text-ink">Thretha Atelier</span>
                  <p className="text-xs uppercase tracking-wider text-cocoa-light mt-1">Image coming soon</p>
                </div>
              </div>
            )}

            {/* Badges */}
            <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-10">
              {p.new_arrival && (
                <span className="bg-coral px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-cream rounded-sm shadow-sm">
                  New Arrival Drop
                </span>
              )}
              {hasDiscount && (
                <span className="bg-plum px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-cream rounded-sm shadow-sm">
                  {discountPercent}% Off
                </span>
              )}
            </div>
          </div>

          {/* Thumbnail Strip */}
          {media.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {media.map((m, idx) => (
                <button
                  key={m.id || idx}
                  onClick={() => setActiveMedia(idx)}
                  className={cn(
                    'relative h-20 w-16 shrink-0 overflow-hidden rounded-sm border-2 transition',
                    activeMedia === idx ? 'border-mango shadow-md scale-105' : 'border-ink/15 opacity-70 hover:opacity-100'
                  )}
                >
                  {m.type === 'video' ? (
                    <div className="grid h-full w-full place-items-center bg-ink text-cream">
                      <Video className="h-4 w-4 text-gold-shimmer" />
                    </div>
                  ) : (
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Details & Purchase Actions */}
        <div className="space-y-6">
          <div className="border-b border-ink/10 pb-6 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mango-dark">
                  {p.category_name} · SKU: {p.sku}
                </p>
                <h1 className="mt-1 font-display text-3xl sm:text-5xl text-ink font-normal leading-tight">
                  {p.name}
                </h1>
              </div>

              <button
                type="button"
                onClick={handleWishlist}
                className="grid h-10 w-10 place-items-center rounded-full bg-cream border border-ink/15 text-ink hover:text-coral hover:border-coral transition shadow-sm"
                aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart className={cn('h-5 w-5', saved && 'fill-coral text-coral')} />
              </button>
            </div>

            {/* Pricing Strip */}
            <div className="flex items-baseline gap-3 pt-1">
              <span className="font-display text-3xl sm:text-4xl text-ink font-semibold">
                {inr(price)}
              </span>
              {hasDiscount && (
                <span className="text-base text-cocoa-light line-through">
                  {inr(p.price)}
                </span>
              )}
              {hasDiscount && (
                <span className="text-xs font-bold uppercase tracking-wider text-plum bg-plum-light px-2 py-0.5 rounded-sm">
                  Save {inr(p.price - p.discount_price)} ({discountPercent}%)
                </span>
              )}
            </div>

            {/* Stock Alert */}
            {low && (
              <p className="text-xs text-amber-700 font-semibold flex items-center gap-1.5 pt-1">
                <Sparkles className="h-3.5 w-3.5" /> Only {p.stock} piece{p.stock === 1 ? '' : 's'} remaining in the atelier.
              </p>
            )}
            {soldOut && (
              <p className="text-xs text-coral-dark font-semibold">
                Currently sold out. Contact our WhatsApp concierge to request a custom restock.
              </p>
            )}
          </div>

          {/* Story / Description */}
          <p className="text-sm text-cocoa leading-relaxed font-sans">
            {p.description || 'A timeless handcrafted drape cut for effortless comfort, celebrations, and slow mornings.'}
          </p>

          {/* Size Selector */}
          {p.sizes?.length > 0 && (
            <div ref={sizeSectionRef} className="space-y-2 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1">
                  Select Size {isMultiSize && <span className="text-coral">*</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setSizeGuideOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-mango-dark hover:underline font-bold"
                >
                  <Ruler className="h-3.5 w-3.5" /> Sizing Guide
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {p.sizes.map((s) => {
                  const isAvailable = s.available && !soldOut && availableStock > 0
                  const isSelected = size === s.size
                  return (
                    <button
                      key={s.size}
                      type="button"
                      disabled={!isAvailable || isAddingToCart}
                      onClick={() => {
                        setSize(s.size)
                        setSizeError(false)
                        setFeedbackToast(null)
                      }}
                      className={cn(
                        'px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition border',
                        isSelected
                          ? 'bg-ink border-ink text-cream shadow-xs'
                          : isAvailable
                          ? 'bg-cream border-ink/20 text-ink hover:border-mango'
                          : 'bg-sand/30 border-ink/10 text-cocoa-light opacity-50 cursor-not-allowed line-through',
                        sizeError && !size && 'border-coral ring-1 ring-coral/40'
                      )}
                      aria-label={`Select size ${s.size}${!isAvailable ? ' - Out of stock' : ''}`}
                    >
                      {s.size}
                    </button>
                  )
                })}
              </div>

              {sizeError && (
                <p className="text-xs text-coral font-semibold flex items-center gap-1.5 pt-1 animate-fade-in">
                  <AlertCircle className="h-3.5 w-3.5" /> Please select a size before adding to bag.
                </p>
              )}
            </div>
          )}

          {/* Quantity Stepper */}
          <div className="flex items-center gap-4 pt-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink">Quantity</span>
            <div className="flex items-center border border-ink/20 bg-cream">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={qty <= 1 || soldOut || availableStock <= 0 || isAddingToCart}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className={cn(
                  'grid h-9 w-9 place-items-center transition text-ink',
                  qty <= 1 || soldOut || availableStock <= 0 || isAddingToCart
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-sand/30'
                )}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-9 text-center text-xs font-bold text-ink">{qty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={qty >= availableStock || soldOut || availableStock <= 0 || isAddingToCart}
                onClick={() => setQty((q) => Math.min(availableStock, q + 1))}
                className={cn(
                  'grid h-9 w-9 place-items-center transition text-ink',
                  qty >= availableStock || soldOut || availableStock <= 0 || isAddingToCart
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-sand/30'
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {availableStock === 1 && !soldOut && (
              <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">
                Max 1 in Atelier
              </span>
            )}
          </div>

          {/* Order Actions */}
          <div className="space-y-3 pt-4">
            <Button
              onClick={() => setOrderOpen(true)}
              disabled={soldOut || availableStock <= 0}
              className="w-full rounded-none bg-[#25D366] py-6 text-xs uppercase tracking-[0.22em] text-white hover:bg-[#1eb457] shadow-lg font-semibold"
            >
              <WAIcon className="mr-2 h-4 w-4" />
              Order Piece on WhatsApp
            </Button>

            <Button
              ref={addToBagButtonRef}
              onClick={handleAddToCart}
              disabled={soldOut || availableStock <= 0 || isAddingToCart}
              aria-label="Add to Shopping Bag"
              className={cn(
                'w-full rounded-none py-6 text-xs uppercase tracking-[0.22em] transition-all duration-300 font-semibold shadow-md min-h-[50px] active:scale-[0.99]',
                soldOut || availableStock <= 0
                  ? 'bg-ink/40 text-cream cursor-not-allowed'
                  : addedToast
                  ? 'bg-emerald-800 text-cream'
                  : 'bg-ink text-cream hover:bg-cocoa-dark'
              )}
            >
              {isAddingToCart ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                  Adding to Bag…
                </span>
              ) : addedToast ? (
                <span className="flex items-center gap-2 animate-fade-in">
                  <Check className="h-4 w-4 text-emerald-300" />
                  {isAlreadyAtMaxStock && currentQtyInCart >= availableStock
                    ? 'In Shopping Bag (Max Stock)'
                    : 'Added to Shopping Bag'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" /> Add to Shopping Bag
                </span>
              )}
            </Button>

            {/* AI Virtual Try-On CTA Button */}
            {tryOnAvailable && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTryOnOpen(true)}
                disabled={soldOut || availableStock <= 0}
                className="w-full rounded-none py-5 text-xs uppercase tracking-[0.2em] font-semibold border border-gold-dark/40 bg-sand/20 hover:bg-gold-light/30 text-ink shadow-2xs transition-all flex items-center justify-center gap-2 min-h-[46px]"
              >
                <Sparkles className="h-3.5 w-3.5 text-gold-dark" />
                <span>Try It On ✦</span>
              </Button>
            )}

            {/* Non-intrusive Inline Feedback Notice */}
            {feedbackToast && (
              <div
                className={cn(
                  'flex items-center gap-2 p-3 text-xs font-medium rounded-sm animate-fade-in border',
                  feedbackToast.type === 'error'
                    ? 'bg-coral-light border-coral/30 text-coral-dark'
                    : feedbackToast.type === 'warning'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                )}
              >
                {feedbackToast.type === 'error' ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-coral" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-mango-dark" />
                )}
                <span>{feedbackToast.message}</span>
              </div>
            )}
          </div>

          {/* Accordion Specs & Policies */}
          <div className="pt-6 border-t border-ink/10">
            <Accordion type="single" collapsible defaultValue="specs" className="w-full text-xs">
              <AccordionItem value="specs">
                <AccordionTrigger className="text-xs uppercase tracking-wider font-bold text-ink">
                  Fabric & Artisan Specifications
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-cocoa leading-relaxed">
                  <p><strong>Fabric:</strong> {p.fabric || 'Pure breathable cotton / silk blend'}</p>
                  <p><strong>Colour:</strong> {p.colour || 'Natural dye tone'}</p>
                  <p><strong>Material:</strong> {p.material || 'Natural fibers'}</p>
                  <p><strong>Pattern / Border:</strong> {p.pattern || 'Handloom woven detail'}</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="care">
                <AccordionTrigger className="text-xs uppercase tracking-wider font-bold text-ink">
                  Artisan Care Instructions
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-cocoa leading-relaxed">
                  {p.care_instructions || 'Dry clean recommended for silk and embellished pieces. Hand wash gently in cold water with mild detergent for pure cottons. Store folded in a breathable muslin bag away from direct sunlight.'}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="shipping">
                <AccordionTrigger className="text-xs uppercase tracking-wider font-bold text-ink">
                  Shipping & Exchange Policies
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-cocoa leading-relaxed">
                  <p>• <strong>Pan-India Express:</strong> Dispatched in 24–48 hours; delivery in {settings?.shipping?.delivery_timeframe || '5–7 business days'}.</p>
                  <p>• <strong>Free Shipping:</strong> Automatically applied for orders above {inr(settings?.shipping?.free_shipping_threshold || 2999)}.</p>
                  <p>• <strong>Size Exchange:</strong> {settings?.shipping?.exchange_policy || 'Hassle-free 5-day size exchange on unwashed pieces with tags.'}</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Sizing Guide Modal */}
      <SizeGuideModal open={sizeGuideOpen} onOpenChange={setSizeGuideOpen} />

      {/* WhatsApp Checkout Dialog */}
      <OrderModal
        open={orderOpen}
        onOpenChange={setOrderOpen}
        product={p}
        size={size}
        qty={qty}
        settings={settings}
      />

      {/* Related Products Grid */}
      {related.length > 0 && (
        <section className="mt-16 sm:mt-24 border-t border-ink/10 pt-12">
          <div className="mb-8 flex justify-between items-end">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-bold">
                Pair With Atelier Drops
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-4xl text-ink font-normal">
                Complete the Look
              </h2>
            </div>
            <button
              type="button"
              onClick={() => nav('/shop')}
              className="text-xs font-sans font-semibold uppercase tracking-wider text-ink hover:text-terracotta underline"
            >
              View Full Collection →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                p={item}
                settings={settings}
                addToCart={addCart}
              />
            ))}
          </div>
        </section>
      )}

      {/* Mobile Sticky Add to Bag Bar */}
      <div className="fixed bottom-16 left-0 right-0 z-30 sm:hidden bg-cream/95 backdrop-blur-md border-t border-ink/10 px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg">
        <div>
          <p className="text-xs font-display font-medium text-ink truncate max-w-[140px]">{p.name}</p>
          <p className="text-xs font-semibold text-ink">{inr(price)}</p>
        </div>
        <button
          type="button"
          disabled={soldOut || availableStock <= 0 || isAddingToCart}
          onClick={handleAddToCart}
          aria-label="Add to Shopping Bag"
          className={cn(
            'flex-1 py-3 px-4 text-[11px] font-sans uppercase tracking-[0.18em] font-semibold text-center transition-all duration-300 active:scale-[0.98]',
            soldOut || availableStock <= 0
              ? 'bg-ink/40 text-cream cursor-not-allowed'
              : addedToast
              ? 'bg-emerald-800 text-cream'
              : 'bg-ink text-cream hover:bg-cocoa-dark shadow-md'
          )}
        >
          {soldOut || availableStock <= 0
            ? 'Sold Out'
            : isAddingToCart
            ? 'Adding…'
            : addedToast
            ? isAlreadyAtMaxStock && currentQtyInCart >= availableStock
              ? '✓ In Bag'
              : '✓ Added'
            : 'Add to Bag'}
        </button>
      </div>

      {/* Product Image Flight Animation */}
      {flyingFlight && (
        <FlyingCartAnimation
          image={flyingFlight.image}
          sourceRect={flyingFlight.sourceRect}
          destRect={flyingFlight.destRect}
          onComplete={() => {
            setFlyingFlight(null)
            window.dispatchEvent(new CustomEvent('tc-bag-bounce'))
          }}
        />
      )}

      {/* AI Virtual Try-On Modal */}
      {tryOnAvailable && <VirtualTryOnModal
        isOpen={isTryOnOpen}
        onClose={() => setIsTryOnOpen(false)}
        mode="single"
        product={p}
        selectedColour={activeColour || p?.colour}
        selectedSize={selectedSize || 'Free Size'}
        onColourChange={(c) => setActiveColour(c)}
        onSizeChange={(s) => setSize(s)}
        onAddToCart={handleAddToCart}
        settings={tryOnSettings}
      />}
    </div>
  )
}
