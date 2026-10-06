'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Minus, Plus, ArrowRight, Check, Trash2, Tag, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inr, api } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { useCart, getItemKey } from './CartContext'

export default function CartPage({
  navigate,
  settings,
}) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))
  const {
    isLoaded,
    cart,
    cartCount,
    cartSubtotal,
    cartTotal,
    discountAmount,
    shippingCharge,
    freeShippingThreshold,
    isFreeShipping,
    remainingForFreeShipping,
    deliveryEnabled,
    freeThresholdEnabled,
    shippingReason,
    coupon,
    setCoupon,
    cartNotice,
    clearCartNotice,
    highlightedCartItemIds,
    updateQty,
    removeFromCart,
  } = useCart()

  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [liveSettings, setLiveSettings] = useState(settings || null)

  useEffect(() => {
    if (settings) {
      setLiveSettings(settings)
    } else {
      api('/settings').then(setLiveSettings).catch(() => {})
    }
  }, [settings])

  const combosEnabled = liveSettings?.combos_enabled !== false
  const hasDisabledCombos = !combosEnabled && cart.some((it) => it.is_combo)


  const applyCoupon = async (e) => {
    e.preventDefault()
    setCouponError('')
    if (!couponInput.trim()) return

    setCouponLoading(true)
    try {
      const res = await api('/coupons/validate', {
        method: 'POST',
        body: { code: couponInput.trim(), cart_subtotal: cartSubtotal },
      })
      if (res?.valid) {
        setCoupon(res.coupon)
        setCouponInput('')
      } else {
        setCouponError(res?.error || 'Invalid coupon code')
      }
    } catch (err) {
      setCouponError(err.message || 'Invalid or expired coupon')
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setCoupon(null)
    setCouponError('')
  }

  if (!isLoaded) {
    return (
      <main className="container py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading shopping bag…
        </p>
      </main>
    )
  }

  if (cart.length === 0) {
    return (
      <main className="container py-20 sm:py-28 text-center max-w-md mx-auto">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sand/40 text-mango-dark">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-display text-4xl sm:text-5xl text-ink font-normal">
          Your Bag is Empty
        </h1>
        <p className="mt-3 text-sm text-cocoa leading-relaxed font-sans">
          Your wardrobe is waiting for something beautiful. Explore our curated sarees, crop tops, and everyday favorites.
        </p>
        <Button
          onClick={() => nav('/shop')}
          className="mt-8 rounded-none bg-ink px-8 py-6 text-xs uppercase tracking-[0.25em] text-cream hover:bg-cocoa-dark shadow-md font-semibold"
        >
          Explore Collection Drops →
        </Button>
      </main>
    )
  }

  return (
    <main className="container py-10 sm:py-16">
      <div className="mb-8 border-b border-ink/10 pb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-bold">
          Thretha Shopping Bag
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl text-ink font-normal">
          Selected Atelier Pieces
        </h1>
        <p className="mt-2 text-sm text-cocoa">
          {cartCount} {cartCount === 1 ? 'piece' : 'pieces'} in your bag.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* Cart Item List */}
        <div className="space-y-6">
          {/* Free Shipping Milestone Meter */}
          {(freeThresholdEnabled || !deliveryEnabled || isFreeShipping) && (
            <div className="border border-ink/10 bg-cream p-5 rounded-sm shadow-xs">
              <p className="text-xs text-ink font-semibold">
                {!deliveryEnabled ? (
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> 🎉 Storewide Free Delivery is active on all orders!
                  </span>
                ) : shippingReason === 'PROMOTION' ? (
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> 🎉 Free delivery unlocked via promotional offer!
                  </span>
                ) : isFreeShipping ? (
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> 🎉 You&apos;ve unlocked <strong>FREE delivery</strong>.
                  </span>
                ) : (
                  <span>
                    Add <strong>{inr(remainingForFreeShipping)}</strong> more to unlock <strong>FREE delivery</strong>.
                  </span>
                )}
              </p>
              {deliveryEnabled && shippingReason !== 'PROMOTION' && freeThresholdEnabled && (
                <div className="mt-3 h-2 w-full bg-sand/60 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-mango transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (cartSubtotal / (freeShippingThreshold || 1)) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Cart Notice Banner */}
          {cartNotice && (
            <div className="border border-gold-dark/40 bg-sand/30 p-4 rounded-none shadow-xs flex items-start justify-between gap-3 text-xs text-ink">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-gold-dark shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{cartNotice}</p>
              </div>
              <button
                type="button"
                onClick={clearCartNotice}
                className="text-cocoa hover:text-ink p-1 shrink-0 transition-colors"
                aria-label="Dismiss notice"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {cart.map((item) => {
            const itemKey = getItemKey(item)
            const isHighlighted = highlightedCartItemIds?.includes(item.cart_item_id)

            if (item.is_combo) {
              const components = Array.isArray(item.components) ? item.components : []
              return (
                <div
                  key={itemKey}
                  className={cn(
                    "border border-ink/10 bg-cream p-4 sm:p-5 rounded-none shadow-xs space-y-4 transition-colors",
                    !combosEnabled && "border-coral/40 bg-coral-light/5",
                    isHighlighted && "border-gold-dark/60 bg-sand/20 ring-1 ring-gold-dark/30"
                  )}
                >
                  {!combosEnabled && (
                    <div className="border border-coral/30 bg-coral-light/20 p-2.5 text-xs text-coral font-medium flex items-center justify-between gap-2">
                      <span>⚠️ Curated ensembles are temporarily unavailable for purchase. Please remove this ensemble to proceed to checkout.</span>
                    </div>
                  )}

                  <div className="flex gap-4 sm:gap-5 items-start">
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-none bg-sand/30 border border-ink/10">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.combo_name || item.product_name}
                          onError={(e) => {
                            e.currentTarget.onerror = null
                            e.currentTarget.src = '/api/media/file/seed-01.jpg'
                          }}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center bg-sand/30 p-2 text-center text-[10px] text-cocoa-light">
                          <span>Curated Set</span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="inline-flex items-center gap-1 bg-mango-dark/10 text-mango-dark border border-mango/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          <Sparkles className="h-3 w-3" /> Curated Ensemble
                        </span>
                        <span className="font-semibold text-sm text-ink sm:hidden">
                          {inr(item.price * item.quantity)}
                        </span>
                      </div>

                      <h3 className="font-display text-lg sm:text-xl text-ink font-medium mt-1 leading-snug">
                        {item.combo_name || item.product_name}
                      </h3>
                      {item.customer_title && item.customer_title !== item.combo_name && (
                        <p className="text-xs text-cocoa">{item.customer_title}</p>
                      )}

                      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold text-ink text-base">
                          {inr(item.price)}
                        </span>
                        {item.regular_price > item.price && (
                          <span className="text-xs text-cocoa-light line-through">
                            {inr(item.regular_price)}
                          </span>
                        )}
                        {item.savings > 0 && (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider">
                            Save {inr(item.savings)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Components Included in this combo */}
                  {components.length > 0 && (
                    <div className="border-t border-ink/10 pt-3 space-y-2 bg-paper/60 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">
                        Included Pieces in your Ensemble:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {components.map((comp, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex items-center gap-2 text-xs text-ink bg-cream p-2 border border-ink/5"
                          >
                            <span className="h-2 w-2 rounded-full bg-mango-dark shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{comp.product_name}</p>
                              <p className="text-[10px] text-cocoa">
                                Size: <strong>{comp.size || 'Free Size'}</strong> {comp.colour ? `· ${comp.colour}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions & Quantity */}
                  <div className="flex items-center justify-between pt-2 border-t border-ink/10 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-ink/20 bg-cream">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={item.quantity <= 1}
                          onClick={() => updateQty(itemKey, item.quantity - 1)}
                          className={cn(
                            'grid h-8 w-8 place-items-center transition text-ink',
                            item.quantity <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-sand/30'
                          )}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-ink">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => updateQty(itemKey, item.quantity + 1)}
                          className="grid h-8 w-8 place-items-center transition text-ink hover:bg-sand/30"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-[11px] text-cocoa-light uppercase tracking-wider">
                        Sets in Bag
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="hidden sm:block text-right">
                        <p className="font-display text-xl text-ink font-semibold">
                          {inr(item.price * item.quantity)}
                        </p>
                      </div>

                      {item.combo_slug && (
                        <button
                          type="button"
                          onClick={() =>
                            nav(
                              `/combos/${item.combo_slug}?editCartItem=${item.cart_item_id || itemKey}`
                            )
                          }
                          className="text-[11px] uppercase tracking-wider text-mango-dark hover:underline font-bold"
                        >
                          Edit Selections
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${item.combo_name || 'combo'} from bag`}
                        onClick={() => removeFromCart(itemKey)}
                        className="text-[11px] uppercase tracking-wider text-coral hover:underline font-bold"
                      >
                        Remove Ensemble
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            // Single Product Card
            return (
              <div
                key={itemKey}
                className={cn(
                  "flex gap-4 sm:gap-6 border-b border-ink/10 pb-6 transition-colors",
                  isHighlighted && "p-3 border border-gold-dark/60 bg-sand/20 ring-1 ring-gold-dark/30"
                )}
              >
                <button
                  type="button"
                  onClick={() => nav(`/product/${item.slug}`)}
                  className="h-32 w-24 shrink-0 overflow-hidden rounded-sm bg-sand/30 shadow-xs border border-ink/10"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.product_name}
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/api/media/file/seed-01.jpg'
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center bg-sand/30 p-2 text-center text-[10px] text-cocoa-light">
                      <span>Atelier Piece</span>
                    </div>
                  )}
                </button>

                <div className="min-w-0 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <button
                        type="button"
                        onClick={() => nav(`/product/${item.slug}`)}
                        className="text-left font-display text-xl sm:text-2xl text-ink hover:text-mango-dark transition font-normal"
                      >
                        {item.product_name}
                      </button>
                      <span className="font-semibold text-sm text-ink sm:hidden">
                        {inr(item.price * item.quantity)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-cocoa">
                      Size: <strong className="text-ink">{item.size || 'Free Size'}</strong> {item.colour ? `· Colour: ${item.colour}` : ''}
                    </p>

                    <p className="mt-1 text-xs text-cocoa-light">
                      {inr(item.price)} each
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-ink/20 bg-cream">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={item.quantity <= 1}
                          onClick={() =>
                            updateQty(item.product_id, item.size, item.quantity - 1)
                          }
                          className={cn(
                            'grid h-8 w-8 place-items-center transition text-ink',
                            item.quantity <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-sand/30'
                          )}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-ink">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={item.stock !== undefined && item.quantity >= item.stock}
                          onClick={() =>
                            updateQty(item.product_id, item.size, item.quantity + 1)
                          }
                          className={cn(
                            'grid h-8 w-8 place-items-center transition text-ink',
                            item.stock !== undefined && item.quantity >= item.stock
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:bg-sand/30'
                          )}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {item.stock !== undefined && item.quantity >= item.stock && (
                        <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">
                          Max in Atelier
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${item.product_name} from bag`}
                      onClick={() => removeFromCart(item.product_id, item.size)}
                      className="text-[11px] uppercase tracking-wider text-coral hover:underline font-bold"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="hidden sm:block text-right">
                  <p className="font-display text-2xl text-ink font-semibold">
                    {inr(item.price * item.quantity)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Order Summary Aside */}
        <aside className="h-fit border border-ink/10 bg-cream p-6 sm:p-8 shadow-sm rounded-sm space-y-6">
          <h2 className="font-display text-2xl sm:text-3xl text-ink font-normal">
            Bag Summary
          </h2>

          {/* Coupon Input */}
          <div className="space-y-2 border-b border-ink/10 pb-5">
            <label className="text-[11px] uppercase tracking-wider font-bold text-ink flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-mango-dark" />
              <span>Promotional Code</span>
            </label>

            {coupon ? (
              <div className="flex items-center justify-between bg-mango-light p-3 rounded-sm text-xs text-mango-dark font-semibold">
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" /> Code <strong>{coupon.code}</strong> Applied (-{inr(discountAmount)})
                </span>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="text-mango-dark hover:text-ink ml-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={applyCoupon} className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="e.g. THRETHA10, FESTIVE15"
                  className="rounded-none border-ink/20 bg-paper text-xs uppercase tracking-wider focus-visible:border-mango"
                />
                <Button
                  type="submit"
                  disabled={couponLoading || !couponInput.trim()}
                  className="rounded-none bg-ink text-cream text-xs uppercase tracking-wider px-4 font-semibold shrink-0"
                >
                  {couponLoading ? 'Checking…' : 'Apply'}
                </Button>
              </form>
            )}

            {couponError && (
              <p className="text-[11px] text-coral font-medium">{couponError}</p>
            )}
          </div>

          <div className="space-y-3 text-xs border-b border-ink/10 pb-4">
            <div className="flex justify-between">
              <span className="text-cocoa">Subtotal</span>
              <span className="font-bold text-ink">{inr(cartSubtotal)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-plum font-semibold">
                <span>Coupon Discount</span>
                <span>-{inr(discountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-cocoa">Estimated Shipping</span>
              <span className="font-semibold text-ink">
                {isFreeShipping ? (
                  <span className="text-emerald-700 font-bold">FREE</span>
                ) : (
                  inr(shippingCharge)
                )}
              </span>
            </div>
          </div>

          <div className="flex items-baseline justify-between border-b border-ink/10 pb-6">
            <span className="font-display text-xl text-ink">Estimated Total</span>
            <span className="font-display text-3xl font-semibold text-ink">
              {inr(cartTotal)}
            </span>
          </div>

          <div className="space-y-3">
            {/* Primary Action: Online Checkout */}
            <Button
              disabled={hasDisabledCombos}
              onClick={() => nav('/checkout')}
              className={cn(
                "w-full rounded-none bg-ink py-6 text-xs uppercase tracking-[0.22em] text-cream hover:bg-cocoa-dark shadow-md font-semibold",
                hasDisabledCombos && "opacity-50 cursor-not-allowed hover:bg-ink"
              )}
            >
              <span>{hasDisabledCombos ? 'Remove Unavailable Combos' : 'Proceed to Checkout'}</span>
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              onClick={() => nav('/shop')}
              className="w-full rounded-none border-ink/30 bg-cream py-6 text-xs uppercase tracking-[0.2em] text-ink hover:border-ink hover:bg-sand/30 font-semibold"
            >
              Continue Browsing
            </Button>
          </div>
        </aside>
      </div>
    </main>
  )
}
