'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getWishlist, toggleWishlist as toggleWishlistStorage, inWishlist as inWishlistStorage, api } from '@/lib/tc'
import { trackVisitorEvent } from '@/lib/visitorAnalytics'
import { getProductAvailableStock } from '@/lib/productInventory'

const CartContext = createContext(null)

export function getItemKey(item) {
  if (!item) return ''
  if (item.cart_item_id) return String(item.cart_item_id)
  if (item.is_combo) {
    const compStr = Array.isArray(item.components)
      ? item.components.map((c) => `${c.product_id}:${c.size || 'Free Size'}:${c.colour || ''}`).join('_')
      : ''
    return `combo_${item.combo_id || item.product_id || item.id}_${compStr}`
  }
  return `${item.product_id || item.id}_${item.size || 'Free Size'}`
}

function generateCartItemId() {
  return `cart_item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState([])
  const [wishlist, setWishlist] = useState([])
  const [coupon, setCoupon] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [cartNotice, setCartNotice] = useState('')
  const [highlightedCartItemIds, setHighlightedCartItemIds] = useState([])
  const [settings, setSettings] = useState(null)

  const clearCartNotice = () => {
    setCartNotice('')
    setHighlightedCartItemIds([])
  }

  // 1. Initial Load & Authoritative Server Inventory Validation
  useEffect(() => {
    let savedCart = []
    try {
      const raw = localStorage.getItem('thretha_cart')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          // Strictly validate every item loaded from storage
          savedCart = parsed
            .filter((item) => item && typeof item === 'object' && (item.product_id || item.id || item.combo_id || item.cart_item_id))
            .map((item) => {
              const stableId = item.cart_item_id || generateCartItemId()

              if (item.is_combo) {
                return {
                  cart_item_id: stableId,
                  is_combo: true,
                  combo_id: String(item.combo_id || item.id),
                  combo_slug: String(item.combo_slug || ''),
                  combo_name: String(item.combo_name || item.name || 'Curated Ensemble'),
                  customer_title: String(item.customer_title || item.name || 'Curated Combo'),
                  product_name: String(item.product_name || `${item.combo_name || 'Curated'} (Combo)`),
                  price: Math.max(0, Number(item.price) || 0),
                  regular_price: Math.max(0, Number(item.regular_price || item.price) || 0),
                  original_price: Math.max(0, Number(item.original_price || item.regular_price || item.price) || 0),
                  savings: Math.max(0, Number(item.savings) || 0),
                  total_savings: Math.max(0, Number(item.total_savings) || 0),
                  image: typeof item.image === 'string' ? item.image : '',
                  allow_coupons: item.allow_coupons !== false,
                  quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
                  components: Array.isArray(item.components)
                    ? item.components.map((c) => ({
                        slot_id: c.slot_id,
                        slot_name: c.slot_name || '',
                        product_id: String(c.product_id || c.id),
                        product_name: String(c.product_name || c.name || 'Atelier Piece'),
                        slug: String(c.slug || ''),
                        sku: String(c.sku || 'TC-PIECE'),
                        size: typeof c.size === 'string' && c.size.trim() ? c.size.trim() : 'Free Size',
                        colour: typeof c.colour === 'string' ? c.colour : '',
                        price: Math.max(0, Number(c.price) || 0),
                        original_price: Math.max(0, Number(c.original_price || c.price) || 0),
                        image: typeof c.image === 'string' ? c.image : '',
                        quantity: Math.max(1, Number(c.quantity) || 1),
                      }))
                    : [],
                }
              }

              const stock = Math.max(1, Number(item.stock) || 999)
              const qty = Math.max(1, Math.min(Math.floor(Number(item.quantity) || 1), stock))
              return {
                cart_item_id: stableId,
                product_id: String(item.product_id || item.id),
                product_name: String(item.product_name || item.name || 'Atelier Piece'),
                slug: String(item.slug || ''),
                price: Math.max(0, Number(item.price) || 0),
                original_price: Math.max(0, Number(item.original_price || item.price) || 0),
                image: typeof item.image === 'string' ? item.image : '',
                size: typeof item.size === 'string' && item.size.trim() ? item.size.trim() : 'Free Size',
                colour: typeof item.colour === 'string' ? item.colour : '',
                stock: stock,
                quantity: qty,
              }
            })
        }
      }
    } catch (e) {
      console.warn('[CartContext] Failed to parse stored cart, recovering:', e)
      savedCart = []
    }

    try {
      setWishlist(getWishlist())
    } catch {
      setWishlist([])
    }

    // Authoritatively re-validate against live backend inventory
    if (savedCart.length > 0) {
      api('/products')
        .then((latestProducts) => {
          if (Array.isArray(latestProducts) && latestProducts.length > 0) {
            const validatedCart = []

            for (const item of savedCart) {
              if (item.is_combo) {
                // Verify all component products have stock
                let comboAvailable = true
                const validatedComponents = []

                for (const comp of item.components || []) {
                  const liveProd = latestProducts.find(
                    (p) => String(p.id) === String(comp.product_id) || p.slug === comp.slug
                  )
                  if (!liveProd || (liveProd.stock ?? 0) < comp.quantity * item.quantity) {
                    comboAvailable = false
                    break
                  }
                  validatedComponents.push({
                    ...comp,
                    product_id: String(liveProd.id),
                    product_name: String(liveProd.name),
                    slug: String(liveProd.slug),
                    image:
                      liveProd.media?.find((m) => m.is_primary)?.url ||
                      liveProd.media?.find((m) => m.type !== 'video')?.url ||
                      comp.image ||
                      '',
                  })
                }

                if (comboAvailable && validatedComponents.length > 0) {
                  validatedCart.push({
                    ...item,
                    components: validatedComponents,
                  })
                }
                continue
              }

              const liveProduct = latestProducts.find(
                (p) => String(p.id) === String(item.product_id) || p.slug === item.slug
              )

              // If product exists and has available stock
              const availableStock = liveProduct ? getProductAvailableStock(liveProduct, item.size) : 0
              if (liveProduct && liveProduct.active !== false && availableStock > 0) {
                const currentStock = Math.max(1, availableStock)
                const currentPrice = Number(liveProduct.discount_price || liveProduct.price) || 0
                const clampedQty = Math.min(Math.max(1, item.quantity), currentStock)

                validatedCart.push({
                  ...item,
                  product_id: String(liveProduct.id),
                  product_name: String(liveProduct.name),
                  slug: String(liveProduct.slug),
                  price: currentPrice,
                  original_price: Number(liveProduct.price) || currentPrice,
                  stock: currentStock,
                  quantity: clampedQty,
                  image:
                    liveProduct.media?.find((m) => m.is_primary)?.url ||
                    liveProduct.media?.find((m) => m.type !== 'video')?.url ||
                    item.image ||
                    '',
                })
              }
            }

            setCart(validatedCart)
            try {
              localStorage.setItem('thretha_cart', JSON.stringify(validatedCart))
            } catch {}
          } else {
            setCart(savedCart)
          }
          setIsLoaded(true)
        })
        .catch(() => {
          setCart(savedCart)
          setIsLoaded(true)
        })
    } else {
      setCart([])
      setIsLoaded(true)
    }

    const handleWishlistEvent = () => {
      setWishlist(getWishlist())
    }
    window.addEventListener('tc-wishlist', handleWishlistEvent)
    return () => window.removeEventListener('tc-wishlist', handleWishlistEvent)
  }, [])

  // 2. Sync cart to localStorage whenever it changes after initial hydration
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem('thretha_cart', JSON.stringify(cart))
      } catch (e) {
        console.warn('[CartContext] Failed to persist cart to storage:', e)
      }
    }
  }, [cart, isLoaded])

  // 3. Add single product to cart
  const addToCart = (product, quantity = 1, size = null) => {
    if (!product || !product.id) {
      return { success: false, reason: 'INVALID_PRODUCT' }
    }

    const selectedSize = typeof size === 'string' && size.trim() ? size.trim() : 'Free Size'
    const availableStock = getProductAvailableStock(product, selectedSize)
    if (availableStock <= 0) {
      return { success: false, reason: 'OUT_OF_STOCK' }
    }

    const parsedQty = Math.max(1, Math.floor(Number(quantity) || 1))
    let result = { success: false, reason: 'UNKNOWN' }

    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) => !item.is_combo && String(item.product_id) === String(product.id) && item.size === selectedSize
      )

      const unitPrice = Number(product.discount_price || product.price) || 0
      const primaryImage =
        product.media?.find((m) => m.is_primary)?.url ||
        product.media?.find((m) => m.type !== 'video')?.url ||
        product.media?.[0]?.url ||
        product.image ||
        ''

      if (existingIndex >= 0) {
        const existingItem = current[existingIndex]
        const currentQty = Math.max(1, Math.floor(Number(existingItem.quantity) || 1))

        if (currentQty >= availableStock) {
          result = {
            success: false,
            reason: 'MAX_STOCK_REACHED',
            currentQty,
            maxStock: availableStock,
          }
          return current
        }

        const finalQty = Math.min(currentQty + parsedQty, availableStock)
        const addedQty = finalQty - currentQty

        result = {
          success: true,
          addedQty,
          finalQty,
          maxStock: availableStock,
          isPartial: addedQty < parsedQty,
        }

        return current.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                price: unitPrice,
                stock: availableStock,
                quantity: finalQty,
              }
            : item
        )
      }

      // Fresh addition
      const initialQty = Math.min(parsedQty, availableStock)
      const newCartItemId = generateCartItemId()
      result = {
        success: true,
        addedQty: initialQty,
        finalQty: initialQty,
        maxStock: availableStock,
        isPartial: initialQty < parsedQty,
      }

      return [
        ...current,
        {
          cart_item_id: newCartItemId,
          product_id: String(product.id),
          product_name: String(product.name || 'Atelier Piece'),
          slug: String(product.slug || ''),
          price: unitPrice,
          original_price: Number(product.price) || unitPrice,
          image: primaryImage,
          size: selectedSize,
          colour: typeof product.colour === 'string' ? product.colour : '',
          stock: availableStock,
          quantity: initialQty,
        },
      ]
    })

    if (result.success) trackVisitorEvent('add_to_cart', { product_slug: product.slug })
    return result
  }

  // 4. Add Curated Combo to cart (as a fresh new cart item)
  const addComboToCart = ({ combo, selections = [], quantity = 1, pricing = {} }) => {
    if (!combo || !combo.id) {
      return { success: false, reason: 'INVALID_COMBO' }
    }

    const parsedQty = Math.max(1, Math.floor(Number(quantity) || 1))
    const comboPrice = Number(pricing.combo_price || pricing.unit_price || combo.combo_price || 0)
    const regularPrice = Number(pricing.regular_price || 0)
    const originalPrice = Number(pricing.original_price || regularPrice || comboPrice)
    const savings = Number(pricing.savings_per_unit || Math.max(0, regularPrice - comboPrice))
    const totalSavings = Number(pricing.total_savings || savings * parsedQty)

    const normalizedComponents = selections.map((s) => ({
      slot_id: s.slot_id,
      slot_name: s.slot_name || '',
      product_id: String(s.product_id),
      product_name: String(s.product_name || 'Atelier Piece'),
      slug: String(s.slug || ''),
      sku: String(s.sku || 'TC-PIECE'),
      size: typeof s.size === 'string' && s.size.trim() ? s.size.trim() : 'Free Size',
      colour: String(s.colour || ''),
      price: Math.max(0, Number(s.price) || 0),
      original_price: Math.max(0, Number(s.original_price || s.price) || 0),
      image: typeof s.image === 'string' ? s.image : '',
      quantity: Math.max(1, Number(s.quantity) || 1),
    }))

    const newComboItem = {
      cart_item_id: generateCartItemId(),
      is_combo: true,
      combo_id: String(combo.id),
      combo_slug: String(combo.slug || ''),
      combo_name: String(combo.name || 'Curated Ensemble'),
      customer_title: String(combo.customer_title || combo.name || 'Curated Combo'),
      product_name: `${combo.name || 'Curated Ensemble'} (Curated Combo)`,
      price: comboPrice,
      regular_price: regularPrice,
      original_price: originalPrice,
      savings,
      total_savings: totalSavings,
      image: combo.image || normalizedComponents[0]?.image || '',
      allow_coupons: combo.allow_coupons !== false,
      quantity: parsedQty,
      components: normalizedComponents,
    }

    setCart((current) => [...current, newComboItem])

    trackVisitorEvent('add_to_cart', { product_slug: combo.slug })

    return { success: true, addedQty: parsedQty, comboItem: newComboItem }
  }

  // 5. Update Existing Combo Selections In-Place
  const updateComboInCart = ({
    cartItemId,
    combo,
    selections = [],
    quantity,
    pricing = {},
  }) => {
    if (!cartItemId) {
      return { success: false, reason: 'MISSING_CART_ITEM_ID' }
    }

    const comboPrice = Number(pricing.combo_price || pricing.unit_price || combo?.combo_price || 0)
    const regularPrice = Number(pricing.regular_price || 0)
    const originalPrice = Number(pricing.original_price || regularPrice || comboPrice)
    const savings = Number(pricing.savings_per_unit || Math.max(0, regularPrice - comboPrice))

    const normalizedComponents = selections.map((s) => ({
      slot_id: s.slot_id,
      slot_name: s.slot_name || '',
      product_id: String(s.product_id),
      product_name: String(s.product_name || 'Atelier Piece'),
      slug: String(s.slug || ''),
      sku: String(s.sku || 'TC-PIECE'),
      size: typeof s.size === 'string' && s.size.trim() ? s.size.trim() : 'Free Size',
      colour: String(s.colour || ''),
      price: Math.max(0, Number(s.price) || 0),
      original_price: Math.max(0, Number(s.original_price || s.price) || 0),
      image: typeof s.image === 'string' ? s.image : '',
      quantity: Math.max(1, Number(s.quantity) || 1),
    }))

    let updatedItem = null

    setCart((current) => {
      const targetIndex = current.findIndex(
        (it) => String(it.cart_item_id) === String(cartItemId) || getItemKey(it) === String(cartItemId)
      )

      if (targetIndex < 0) {
        return current
      }

      const existing = current[targetIndex]
      const finalQty = quantity !== undefined ? Math.max(1, Math.floor(Number(quantity))) : existing.quantity
      const totalSavings = Number(pricing.total_savings || savings * finalQty)

      updatedItem = {
        ...existing,
        cart_item_id: existing.cart_item_id || cartItemId,
        is_combo: true,
        combo_id: String(combo?.id || existing.combo_id),
        combo_slug: String(combo?.slug || existing.combo_slug || ''),
        combo_name: String(combo?.name || existing.combo_name || 'Curated Ensemble'),
        customer_title: String(combo?.customer_title || existing.customer_title || existing.combo_name || 'Curated Combo'),
        product_name: `${combo?.name || existing.combo_name || 'Curated Ensemble'} (Curated Combo)`,
        price: comboPrice,
        regular_price: regularPrice,
        original_price: originalPrice,
        savings,
        total_savings: totalSavings,
        image: combo?.image || normalizedComponents[0]?.image || existing.image || '',
        allow_coupons: combo?.allow_coupons !== false,
        quantity: finalQty,
        components: normalizedComponents,
      }

      return current.map((it, idx) => (idx === targetIndex ? updatedItem : it))
    })

    return { success: true, updatedItem }
  }

  // 6. Retrieve Cart Item by cartItemId
  const getCartItem = (cartItemId) => {
    if (!cartItemId) return null
    return (
      cart.find(
        (it) => String(it.cart_item_id) === String(cartItemId) || getItemKey(it) === String(cartItemId)
      ) || null
    )
  }

  // 7. Update item quantity with stock boundary enforcement
  const updateQty = (keyOrId, sizeOrQty, maybeQty) => {
    let targetKey = ''
    let parsedQty = 1

    if (maybeQty !== undefined) {
      targetKey = `${keyOrId}_${sizeOrQty || 'Free Size'}`
      parsedQty = Math.floor(Number(maybeQty))
    } else {
      targetKey = String(keyOrId)
      parsedQty = Math.floor(Number(sizeOrQty))
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      removeFromCart(keyOrId, sizeOrQty)
      return
    }

    setCart((current) =>
      current.map((item) => {
        const itemKey = getItemKey(item)
        if (
          itemKey === targetKey ||
          String(item.cart_item_id) === targetKey ||
          (item.product_id === keyOrId && item.size === sizeOrQty)
        ) {
          const maxStock = item.is_combo ? 99 : Math.max(1, Number(item.stock ?? 999))
          const clampedQty = Math.min(Math.max(1, parsedQty), maxStock)
          return { ...item, quantity: clampedQty }
        }
        return item
      })
    )
  }

  // 8. Remove from cart
  const removeFromCart = (keyOrId, size) => {
    const removed = cart.find((item) => {
      const itemKey = getItemKey(item)
      return itemKey === keyOrId || String(item.cart_item_id) === keyOrId || (item.product_id === keyOrId && item.size === size)
    })
    setCart((current) =>
      current.filter((item) => {
        const itemKey = getItemKey(item)
        if (itemKey === keyOrId || String(item.cart_item_id) === keyOrId) return false
        if (item.product_id === keyOrId && item.size === size) return false
        return true
      })
    )
    if (removed) trackVisitorEvent('remove_from_cart', { product_slug: removed.slug || removed.combo_slug })
  }

  // 9. Clear cart
  const clearCart = () => {
    setCart([])
    setCoupon(null)
  }

  const restoreCartItems = useCallback((items) => {
    if (!Array.isArray(items) || !items.length) return 0
    setCart((current) => {
      const next = [...current]
      for (const item of items) {
        const productId = String(item?.product_id || '')
        const size = typeof item?.size === 'string' && item.size.trim() ? item.size.trim() : 'Free Size'
        const stock = Math.max(0, Number(item?.stock) || 0)
        if (!productId || stock <= 0) continue
        const existingIndex = next.findIndex((entry) => !entry.is_combo && String(entry.product_id) === productId && entry.size === size)
        if (existingIndex >= 0) {
          const existing = next[existingIndex]
          next[existingIndex] = { ...existing, price: Number(item.price) || 0, original_price: Number(item.original_price || item.price) || 0, stock, quantity: Math.min(stock, Math.max(1, Number(existing.quantity) || 1) + Math.max(1, Number(item.quantity) || 1)) }
          continue
        }
        next.push({
          cart_item_id: generateCartItemId(), product_id: productId,
          product_name: String(item.product_name || 'Atelier Piece'), slug: String(item.slug || ''),
          price: Math.max(0, Number(item.price) || 0), original_price: Math.max(0, Number(item.original_price || item.price) || 0),
          image: typeof item.image === 'string' ? item.image : '', size,
          colour: typeof item.colour === 'string' ? item.colour : '', stock,
          quantity: Math.min(stock, Math.max(1, Number(item.quantity) || 1)),
        })
      }
      return next
    })
    return items.length
  }, [])

  // 10. Wishlist actions
  const toggleWish = (slug) => {
    const next = toggleWishlistStorage(slug)
    setWishlist(next)
    return next
  }

  const isSaved = (slug) => inWishlistStorage(slug)

  // 12. Revalidate cart items before checkout
  const revalidateCart = async () => {
    try {
      const latestProducts = await api('/products')
      if (!Array.isArray(latestProducts) || latestProducts.length === 0) {
        return { valid: true, cart }
      }

      const validatedCart = []
      const changedIds = []
      let changed = false

      for (const item of cart) {
        if (item.is_combo) {
          let comboAvailable = true
          const validatedComponents = []
          for (const comp of item.components || []) {
            const liveProd = latestProducts.find(
              (p) => String(p.id) === String(comp.product_id) || p.slug === comp.slug
            )
            if (!liveProd || (liveProd.stock ?? 0) < comp.quantity * item.quantity) {
              comboAvailable = false
              break
            }
            validatedComponents.push({
              ...comp,
              product_id: String(liveProd.id),
              product_name: String(liveProd.name),
              slug: String(liveProd.slug),
              image:
                liveProd.media?.find((m) => m.is_primary)?.url ||
                liveProd.media?.find((m) => m.type !== 'video')?.url ||
                comp.image ||
                '',
            })
          }
          if (comboAvailable && validatedComponents.length > 0) {
            validatedCart.push({
              ...item,
              components: validatedComponents,
            })
          } else {
            changed = true
            changedIds.push(item.cart_item_id)
          }
          continue
        }

        const liveProduct = latestProducts.find(
          (p) => String(p.id) === String(item.product_id) || p.slug === item.slug
        )

        const availableStock = liveProduct ? getProductAvailableStock(liveProduct, item.size) : 0
        if (liveProduct && liveProduct.active !== false && availableStock > 0) {
          const currentStock = Math.max(1, availableStock)
          const currentPrice = Number(liveProduct.discount_price || liveProduct.price) || 0
          const clampedQty = Math.min(Math.max(1, item.quantity), currentStock)

          if (clampedQty !== item.quantity || currentPrice !== item.price) {
            changed = true
            changedIds.push(item.cart_item_id)
          }

          validatedCart.push({
            ...item,
            product_id: String(liveProduct.id),
            product_name: String(liveProduct.name),
            slug: String(liveProduct.slug),
            price: currentPrice,
            original_price: Number(liveProduct.price) || currentPrice,
            stock: currentStock,
            quantity: clampedQty,
            image:
              liveProduct.media?.find((m) => m.is_primary)?.url ||
              liveProduct.media?.find((m) => m.type !== 'video')?.url ||
              item.image ||
              '',
          })
        } else {
          changed = true
          changedIds.push(item.cart_item_id)
        }
      }

      if (changed) {
        setCart(validatedCart)
        setCartNotice('Your bag has been updated because piece availability or pricing changed.')
        setHighlightedCartItemIds(changedIds)
        return { valid: false, updated: true, cart: validatedCart, changedIds }
      }

      return { valid: true, cart: validatedCart }
    } catch {
      return { valid: true, cart }
    }
  }

  // Computed Cart Summary
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0)
  const cartSubtotal = cart.reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0
  )
  const cartRegularSubtotal = cart.reduce(
    (sum, item) => sum + (item.regular_price || item.price || 0) * (item.quantity || 1),
    0
  )
  const cartSavings = Math.max(0, cartRegularSubtotal - cartSubtotal)

  // Shipping & Free Delivery configuration from live settings
  const shippingSettings = settings?.shipping || {}
  const deliveryEnabled = shippingSettings.delivery_enabled !== false
  const defaultDeliveryCharge = Math.max(
    0,
    shippingSettings.delivery_charge !== undefined && shippingSettings.delivery_charge !== null
      ? Number(shippingSettings.delivery_charge) || 0
      : 80
  )
  const freeShippingThreshold = Math.max(
    0,
    shippingSettings.free_shipping_threshold !== undefined && shippingSettings.free_shipping_threshold !== null
      ? Number(shippingSettings.free_shipping_threshold) || 0
      : 2999
  )
  const freeThresholdEnabled = shippingSettings.free_delivery_threshold_enabled !== false
  const deliveryTimeframe = shippingSettings.delivery_timeframe || '5–7 working days'

  // Determine free delivery qualification
  const isFreeDeliveryByPromotion = Boolean(
    coupon && (coupon.isFreeShipping || coupon.freeShipping || coupon.type === 'free_delivery' || coupon.discountType === 'free_delivery')
  )
  const isFreeDeliveryByThreshold = freeThresholdEnabled && (cartSubtotal >= freeShippingThreshold || cartSubtotal === 0)
  const isFreeShipping = !deliveryEnabled || isFreeDeliveryByPromotion || isFreeDeliveryByThreshold

  const shippingCharge = !deliveryEnabled || isFreeShipping || cartSubtotal === 0 ? 0 : defaultDeliveryCharge
  const remainingForFreeShipping = freeThresholdEnabled ? Math.max(0, freeShippingThreshold - cartSubtotal) : 0
  const shippingReason = !deliveryEnabled
    ? 'DELIVERY_DISABLED'
    : isFreeDeliveryByPromotion
    ? 'PROMOTION'
    : isFreeDeliveryByThreshold
    ? 'FREE_DELIVERY_THRESHOLD'
    : 'STANDARD'

  // Calculate promotional coupon discount
  let discountAmount = 0
  if (coupon && coupon.discountAmount > 0) {
    if (coupon.category_ids && coupon.category_ids.length > 0) {
      const eligibleSubtotal = cart
        .filter((item) => coupon.category_ids.includes(item.category_id))
        .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
      discountAmount = Math.min(Number(coupon.discountAmount), eligibleSubtotal)
    } else {
      const couponEligibleSubtotal = cart
        .filter((item) => item.allow_coupons !== false)
        .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
      discountAmount = Math.min(Number(coupon.discountAmount), couponEligibleSubtotal)
    }
  }

  const cartTotal = Math.max(0, cartSubtotal - discountAmount + shippingCharge)

  return (
    <CartContext.Provider
      value={{
        isLoaded,
        cart,
        cartCount,
        cartSubtotal,
        cartRegularSubtotal,
        cartSavings,
        cartTotal,
        discountAmount,
        shippingCharge,
        freeShippingThreshold,
        isFreeShipping,
        remainingForFreeShipping,
        deliveryEnabled,
        freeThresholdEnabled,
        deliveryTimeframe,
        setStoreSettings: setSettings,
        shippingReason,
        coupon,
        setCoupon,
        cartNotice,
        clearCartNotice,
        highlightedCartItemIds,
        revalidateCart,
        addToCart,
        addComboToCart,
        updateComboInCart,
        getCartItem,
        updateQty,
        removeFromCart,
        clearCart,
        restoreCartItems,
        wishlist,
        wishCount: wishlist.length,
        toggleWish,
        isSaved,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
