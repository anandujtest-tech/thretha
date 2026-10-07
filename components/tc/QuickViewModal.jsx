'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Heart, ShoppingBag, ArrowRight, Minus, Plus, Ruler } from 'lucide-react'
import { inr, toggleWishlist, inWishlist } from '@/lib/tc'
import { useCart } from './CartContext'
import FashionImage from './FashionImage'
import SizeGuideModal from './SizeGuideModal'
import { getProductAvailableStock, isProductVariantAvailable } from '@/lib/productInventory'

export default function QuickViewModal({ product, open, onOpenChange, navigate, addToCart, returnFocusRef }) {
  const router = useRouter()
  const { cart } = useCart()
  const sizes = (product?.sizes || []).filter(s => s?.size)
  const [size, setSize] = useState(() => sizes.find(s => isProductVariantAvailable(product, s.size))?.size || (sizes.length ? '' : 'Free Size'))
  const [quantity, setQuantity] = useState(1)
  const [activeMedia, setActiveMedia] = useState(() => Math.max(0, (product?.media || []).filter(m => m.url).findIndex(m => m.is_primary)))
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [saved, setSaved] = useState(() => inWishlist(product?.slug))
  const [message, setMessage] = useState('')
  const [adding, setAdding] = useState(false)
  const pending = useRef(null)
  const closeRef = useRef(null)
  const stock = getProductAvailableStock(product, size)
  const cartQuantity = Number(cart.find(item => !item.is_combo && String(item.product_id) === String(product?.id) && item.size === size)?.quantity || 0)
  const remaining = Math.max(0, stock - cartQuantity)
  const availableSize = sizes.length ? isProductVariantAvailable(product, size) : true

  useEffect(() => {
    setQuantity(q => Math.min(q, Math.max(1, remaining)))
  }, [remaining])

  useEffect(() => {
    const sync = () => setSaved(inWishlist(product?.slug))
    window.addEventListener('tc-wishlist', sync)
    return () => window.removeEventListener('tc-wishlist', sync)
  }, [product?.slug])

  // Observe the existing cart state: its updater can commit after addToCart returns.
  useEffect(() => {
    if (pending.current !== null && cartQuantity > pending.current) {
      pending.current = null
      setAdding(false)
      setMessage('Added to your bag.')
      window.dispatchEvent(new Event('tc-bag-bounce'))
    }
  }, [cartQuantity])

  useEffect(() => {
    if (!adding) return
    const timeout = setTimeout(() => {
      pending.current = null
      setAdding(false)
      setMessage('Please check your bag before trying again.')
    }, 4000)
    return () => clearTimeout(timeout)
  }, [adding])

  if (!product) return null
  const media = (product.media || []).filter(m => m.url)
  const currentMedia = media[activeMedia]
  const discounted = product.discount_price && product.discount_price < product.price
  const validSelection = () => {
    if (!stock) { setMessage('This piece is sold out.'); return false }
    if (!availableSize || !size) { setMessage('Please select an available size.'); return false }
    return true
  }
  const add = () => {
    if (adding || !validSelection()) return
    if (!remaining) { setMessage('You already have the available quantity in your bag.'); return }
    pending.current = cartQuantity
    setAdding(true)
    setMessage('')
    try {
      const result = addToCart(product, Math.min(quantity, remaining), size)
      if (result?.success === false && result.reason !== 'UNKNOWN') {
        pending.current = null
        setAdding(false)
        setMessage('Unable to add this selection. Please check availability.')
      }
    } catch {
      pending.current = null
      setAdding(false)
      setMessage('Unable to add this selection. Please try again.')
    }
  }

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="quick-shop-dialog" ref={closeRef}
        onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.querySelector(':scope > button:last-child')?.focus() }}
        onCloseAutoFocus={event => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus({ preventScroll: true }) } }}>
        <div className="quick-shop-scroll">
          <div className="quick-shop-gallery">
            <div className="quick-shop-image">
              {currentMedia?.type === 'video' ? <video key={currentMedia.url} src={currentMedia.url} controls playsInline preload="metadata" aria-label={`${product.name} video`} /> : <FashionImage src={currentMedia?.url} alt={product.name} sizes="(max-width: 767px) 100vw, 440px" />}
              {product.new_arrival && <span className="quick-shop-badge">New arrival</span>}
            </div>
            {media.length > 1 && <div className="quick-shop-thumbnails" aria-label="Product media">{media.map((item, index) => <button key={item.id || index} type="button" onClick={() => setActiveMedia(index)} aria-label={`View ${item.type === 'video' ? 'video' : 'image'} ${index + 1}`} aria-pressed={activeMedia === index}>{item.type === 'video' ? <span>Video</span> : <FashionImage src={item.url} alt="" sizes="48px" />}</button>)}</div>}
          </div>
          <div className="quick-shop-info">
            <p className="quick-shop-eyebrow">{product.category_name || 'Quick shop'}</p>
            <div className="quick-shop-title-row"><DialogTitle className="quick-shop-title">{product.name}</DialogTitle><button type="button" className="quick-shop-heart" aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'} aria-pressed={saved} onClick={() => setSaved(toggleWishlist(product.slug).includes(product.slug))}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button></div>
            <DialogDescription className="sr-only">Choose your size and quantity for {product.name}.</DialogDescription>
            <div className="quick-shop-price"><span>{inr(product.discount_price || product.price)}</span>{discounted && <><del>{inr(product.price)}</del><small>Save {inr(product.price - product.discount_price)}</small></>}</div>
            {product.description && <p className="quick-shop-description">{product.description}</p>}
            {product.colour && <p className="quick-shop-colour"><span>Colour</span> {product.colour}</p>}
            {sizes.length > 0 && <fieldset className="quick-shop-sizes" disabled={adding}><legend>Size</legend><button className="quick-shop-size-guide" type="button" onClick={() => setSizeGuideOpen(true)}><Ruler size={14} /> Size guide</button><div>{sizes.map(s => { const available = isProductVariantAvailable(product, s.size); return <button type="button" key={s.size} disabled={!available} aria-pressed={size === s.size} aria-label={`Size ${s.size}${!available ? ' — unavailable' : ''}`} onClick={() => { setSize(s.size); setQuantity(1); setMessage('') }}>{s.size}</button> })}</div></fieldset>}
            <div className="quick-shop-quantity"><span>Quantity</span><div><button type="button" aria-label="Decrease quantity" disabled={quantity <= 1 || adding} onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={15} /></button><output aria-live="polite">{Math.min(quantity, Math.max(1, remaining))}</output><button type="button" aria-label="Increase quantity" disabled={quantity >= remaining || !availableSize || adding} onClick={() => setQuantity(q => Math.min(remaining, q + 1))}><Plus size={15} /></button></div></div>
            <p className="quick-shop-status" role="status">{message || (!stock ? 'Sold out' : !remaining ? 'Available quantity is already in your bag.' : !availableSize ? 'Select an available size.' : 'Available to add to your bag')}</p>
            <div className="quick-shop-actions">{cartQuantity > 0 ? <button className="quick-shop-add" type="button" onClick={() => { onOpenChange(false); (navigate || router.push)('/cart') }}><ShoppingBag size={17} />View bag</button> : <button className="quick-shop-add" type="button" onClick={add} disabled={!stock || !remaining || !availableSize || adding}><ShoppingBag size={17} />{adding ? 'Adding…' : !stock ? 'Sold out' : 'Add to bag'}</button>}<button className="quick-shop-details" type="button" onClick={() => { onOpenChange(false); (navigate || router.push)(`/product/${product.slug}`) }}>View full details <ArrowRight size={15} /></button></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <SizeGuideModal open={sizeGuideOpen} onOpenChange={setSizeGuideOpen} />
  </>
}
