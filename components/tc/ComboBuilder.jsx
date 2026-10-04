'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  Check,
  CheckCircle2,
  ChevronRight,
  ShoppingBag,
  ArrowRight,
  AlertCircle,
  Layers,
  ArrowLeft,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inr, api } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { useCart } from './CartContext'
import ColourSwatchPicker from './ColourSwatchPicker'
import VirtualTryOnModal from './VirtualTryOnModal'
import { useTryOnAvailability } from './TryOnSettingsContext'

/**
 * Authoritatively extracts the list of available colour variants directly from a product object.
 * The product is the single source of truth for its colours.
 */
export function extractProductColours(product) {
  if (!product) return []
  if (Array.isArray(product.colours) && product.colours.length > 0) {
    return product.colours
      .map((c) => (typeof c === 'string' ? c.trim() : String(c?.name || c?.colour || '')))
      .filter(Boolean)
  }
  if (typeof product.colour === 'string' && product.colour.trim()) {
    if (product.colour.includes(',')) {
      return product.colour.split(',').map((c) => c.trim()).filter(Boolean)
    }
    if (product.colour.includes('/')) {
      return product.colour.split('/').map((c) => c.trim()).filter(Boolean)
    }
    return [product.colour.trim()]
  }
  return ['Standard']
}

/**
 * Checks if a product has overall atelier stock for the required quantity.
 */
function isProductInStock(product, requiredQty = 1) {
  if (!product || product.active === false) return false
  const totalStock = Math.max(0, Number(product.stock ?? 0))
  if (totalStock < requiredQty) return false

  // If explicit size variants exist, at least one size variant must have stock
  if (Array.isArray(product.sizes) && product.sizes.length > 0) {
    return product.sizes.some((s) => {
      if (typeof s === 'string') return totalStock >= requiredQty
      return s.available !== false && (s.stock === undefined || Number(s.stock) >= requiredQty)
    })
  }
  return true
}

/**
 * Checks if a specific size of a product is in stock for the required quantity.
 */
function isSizeInStock(product, sizeName, requiredQty = 1) {
  if (!product || product.active === false) return false
  const totalStock = Math.max(0, Number(product.stock ?? 0))
  if (totalStock < requiredQty) return false
  if (!sizeName) return false

  if (!Array.isArray(product.sizes) || product.sizes.length === 0) {
    return totalStock >= requiredQty
  }

  const cleanSize = String(sizeName).trim().toLowerCase()
  const matched = product.sizes.find(
    (s) => String(typeof s === 'string' ? s : s.size).trim().toLowerCase() === cleanSize
  )

  if (!matched) {
    return totalStock >= requiredQty
  }

  if (typeof matched === 'string') return totalStock >= requiredQty
  return matched.available !== false && (matched.stock === undefined || Number(matched.stock) >= requiredQty)
}

/**
 * Returns available in-stock sizes for a product.
 */
function getAvailableSizes(product, requiredQty = 1) {
  if (!product || !Array.isArray(product.sizes)) return []
  return product.sizes.filter((s) => {
    const sName = typeof s === 'string' ? s : s.size
    return isSizeInStock(product, sName, requiredQty)
  })
}

/**
 * Checks if a colour is available for the given product and selected size.
 */
function isColourInStock(product, colourName, selectedSize, requiredQty = 1) {
  if (!product || product.active === false) return false
  const totalStock = Math.max(0, Number(product.stock ?? 0))
  if (totalStock < requiredQty) return false

  if (selectedSize && !isSizeInStock(product, selectedSize, requiredQty)) {
    return false
  }
  return true
}

/**
 * Returns available colours list for a product directly from the product object.
 */
function getAvailableColours(product, selectedSize, requiredQty = 1) {
  if (!product || Number(product.stock ?? 0) < requiredQty) return []
  const baseColours = extractProductColours(product)
  return baseColours.filter((c) => isColourInStock(product, c, selectedSize, requiredQty))
}

/**
 * Checks whether a slot has ANY available piece with in-stock variants.
 */
function isSlotAvailable(slot, requiredQty = 1) {
  if (!slot) return false
  const eligible = slot.eligible_products || (slot.product ? [slot.product] : [])
  return eligible.some((p) => isProductInStock(p, requiredQty))
}

function ComboBuilderInner({ combo }) {
  const { available: globalTryOnAvailable, settings: tryOnSettings } = useTryOnAvailability('combo')
  const router = useRouter()
  const searchParams = useSearchParams()
  const editCartItemId = searchParams?.get('editCartItem') || ''

  const { cart, addComboToCart, updateComboInCart, getCartItem } = useCart()

  const slots = Array.isArray(combo?.slots) ? combo.slots : []
  const isCuratedOutfit = combo?.type === 'CURATED_OUTFIT'

  // Retrieve existing cart item if in edit mode
  const editingCartItem = editCartItemId ? getCartItem(editCartItemId) : null
  const isEditMode = Boolean(editingCartItem)

  // Image Gallery state for Curated Outfit
  const comboMedia =
    Array.isArray(combo?.media) && combo.media.length > 0
      ? combo.media
      : [{ url: combo?.image || '/api/media/file/seed-01.jpg' }]
  const [activeMediaUrl, setActiveMediaUrl] = useState(
    combo?.image || comboMedia[0]?.url || '/api/media/file/seed-01.jpg'
  )

  const [activeSlotIdx, setActiveSlotIdx] = useState(0)
  const [selections, setSelections] = useState({}) // { [slotId]: { slot_id, slot_name, product_id, product_name, size, colour, price, original_price, image, quantity: 1 } }
  const [addingToCart, setAddingToCart] = useState(false)
  const [addedSuccess, setAddedSuccess] = useState(false)
  const [isTryOnOpen, setIsTryOnOpen] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [inventoryNotice, setInventoryNotice] = useState('')
  const [highlightedSlotId, setHighlightedSlotId] = useState('')

  useEffect(() => {
    if (!globalTryOnAvailable) setIsTryOnOpen(false)
  }, [globalTryOnAvailable])

  // Pre-populate selections from editingCartItem or in-stock first options
  useEffect(() => {
    if (editingCartItem && Array.isArray(editingCartItem.components) && editingCartItem.components.length > 0) {
      // 1. Edit Mode: verify each component's stock
      const initial = {}
      let hasUnavailableSavedItem = false
      let firstInvalidSlot = ''

      slots.forEach((slot) => {
        const comp = editingCartItem.components.find((c) => String(c.slot_id) === String(slot.id))
        const reqQty = slot.quantity || 1
        const eligible = slot.eligible_products || (slot.product ? [slot.product] : [])

        if (comp) {
          const liveProduct =
            eligible.find((p) => String(p.id) === String(comp.product_id)) || slot.product
          const isProdStock = isProductInStock(liveProduct, reqQty)
          const isSzStock = isProdStock && isSizeInStock(liveProduct, comp.size, reqQty)

          if (isProdStock && isSzStock) {
            initial[slot.id] = {
              slot_id: slot.id,
              slot_name: slot.name,
              product_id: String(liveProduct.id),
              product_name: liveProduct.name,
              slug: liveProduct.slug,
              sku: liveProduct.sku || 'TC-PIECE',
              price: Number(liveProduct.discount_price || liveProduct.price || comp.price) || 0,
              original_price: Number(liveProduct.price || comp.original_price) || 0,
              image: comp.image || liveProduct.image || '',
              size: comp.size || 'Free Size',
              colour: comp.colour || 'Standard',
              quantity: reqQty,
            }
          } else {
            hasUnavailableSavedItem = true
            if (!firstInvalidSlot) firstInvalidSlot = slot.id

            if (isProdStock) {
              const availableSizes = getAvailableSizes(liveProduct, reqQty)
              const firstValidSize = availableSizes[0]
              const szName =
                typeof firstValidSize === 'string'
                  ? firstValidSize
                  : firstValidSize?.size || 'Free Size'
              const validColours = getAvailableColours(liveProduct, szName, reqQty)

              initial[slot.id] = {
                slot_id: slot.id,
                slot_name: slot.name,
                product_id: String(liveProduct.id),
                product_name: liveProduct.name,
                slug: liveProduct.slug,
                sku: liveProduct.sku || 'TC-PIECE',
                price: Number(liveProduct.discount_price || liveProduct.price) || 0,
                original_price: Number(liveProduct.price) || 0,
                image: liveProduct.image || '',
                size: szName,
                colour: validColours[0] || 'Standard',
                quantity: reqQty,
              }
            } else {
              // Whole product is out of stock -> attempt fallback to another in-stock product in slot
              const inStockProd = eligible.find((p) => isProductInStock(p, reqQty))
              if (inStockProd) {
                const availableSizes = getAvailableSizes(inStockProd, reqQty)
                const firstValidSize = availableSizes[0]
                const szName =
                  typeof firstValidSize === 'string'
                    ? firstValidSize
                    : firstValidSize?.size || 'Free Size'
                const validColours = getAvailableColours(inStockProd, szName, reqQty)

                initial[slot.id] = {
                  slot_id: slot.id,
                  slot_name: slot.name,
                  product_id: String(inStockProd.id),
                  product_name: inStockProd.name,
                  slug: inStockProd.slug,
                  sku: inStockProd.sku || 'TC-PIECE',
                  price: Number(inStockProd.discount_price || inStockProd.price) || 0,
                  original_price: Number(inStockProd.price) || 0,
                  image: inStockProd.image || '',
                  size: szName,
                  colour: validColours[0] || 'Standard',
                  quantity: reqQty,
                }
              }
            }
          }
        }
      })

      setSelections(initial)
      if (hasUnavailableSavedItem) {
        setInventoryNotice(
          'Some items in your previous ensemble selection are no longer available in the atelier. Please choose from available options.'
        )
        if (firstInvalidSlot) setHighlightedSlotId(firstInvalidSlot)
      }
    } else if (slots.length > 0 && Object.keys(selections).length === 0) {
      // 2. New Combo: ONLY pre-select products/variants that have stock > 0!
      const initial = {}
      slots.forEach((slot) => {
        const reqQty = slot.quantity || 1
        const eligible = slot.eligible_products || (slot.product ? [slot.product] : [])
        const inStockProds = eligible.filter((p) => isProductInStock(p, reqQty))

        if (inStockProds.length > 0) {
          const firstProd = inStockProds[0]
          const availableSizes = getAvailableSizes(firstProd, reqQty)
          const firstSize = availableSizes[0]
          const defaultSize =
            typeof firstSize === 'string' ? firstSize : firstSize?.size || 'Free Size'

          const availableColours = getAvailableColours(firstProd, defaultSize, reqQty)
          const defaultColour =
            availableColours[0] || extractProductColours(firstProd)[0] || 'Standard'

          initial[slot.id] = {
            slot_id: slot.id,
            slot_name: slot.name,
            product_id: String(firstProd.id),
            product_name: firstProd.name,
            slug: firstProd.slug,
            sku: firstProd.sku || 'TC-PIECE',
            price: Number(firstProd.discount_price || firstProd.price) || 0,
            original_price: Number(firstProd.price) || 0,
            image:
              firstProd.media?.find((m) => m.is_primary)?.url ||
              firstProd.media?.find((m) => m.type !== 'video')?.url ||
              firstProd.image ||
              '',
            size: defaultSize,
            colour: defaultColour,
            quantity: reqQty,
          }
        }
      })
      setSelections(initial)
    }
  }, [combo, slots, editingCartItem])

  const currentSlot = slots[activeSlotIdx]
  const eligibleProducts =
    currentSlot?.eligible_products || (currentSlot?.product ? [currentSlot.product] : [])

  // Check if any slot is completely out of stock
  const unavailableSlots = slots.filter((slot) => !isSlotAvailable(slot, slot.quantity || 1))
  const hasUnavailableRequiredSlot = unavailableSlots.some((slot) => slot.required !== false)

  // Check which slots have valid in-stock selections
  const completedSlotsCount = slots.filter((slot) => {
    const sel = selections[slot.id]
    if (!sel || !sel.product_id || !sel.size) return false
    const reqQty = slot.quantity || 1
    const eligible = slot.eligible_products || (slot.product ? [slot.product] : [])
    const prod = eligible.find((p) => String(p.id) === String(sel.product_id)) || slot.product
    return isProductInStock(prod, reqQty) && isSizeInStock(prod, sel.size, reqQty)
  }).length

  const allSlotsCompleted =
    completedSlotsCount === slots.length && slots.length > 0 && !hasUnavailableRequiredSlot

  const selectedProducts = Object.entries(selections).map(([slotId, selection]) => {
    const slot = slots.find((item) => String(item.id) === String(slotId))
    const eligible = slot?.eligible_products || (slot?.product ? [slot.product] : [])
    return eligible.find((product) => String(product.id) === String(selection?.product_id))
  }).filter(Boolean)
  const tryOnAvailable = globalTryOnAvailable && selectedProducts.every((product) => product.ai_tryon_enabled !== false)

  useEffect(() => {
    if (!tryOnAvailable) setIsTryOnOpen(false)
  }, [tryOnAvailable])

  // Calculate live regular price & savings
  let liveRegularPrice = 0
  Object.values(selections).forEach((sel) => {
    if (sel && sel.price) {
      liveRegularPrice += sel.price * (sel.quantity || 1)
    }
  })

  let liveComboPrice = liveRegularPrice
  let liveSavings = 0

  if (combo?.pricing_method === 'fixed_price') {
    liveComboPrice = Number(combo.combo_price) || 0
    liveSavings = Math.max(0, liveRegularPrice - liveComboPrice)
  } else if (combo?.pricing_method === 'percentage_discount') {
    const discPct = Math.min(100, Math.max(0, Number(combo.discount_value) || 0))
    let discAmt = Math.round((liveRegularPrice * discPct) / 100)
    if (combo.max_discount && combo.max_discount > 0) {
      discAmt = Math.min(discAmt, Number(combo.max_discount))
    }
    liveSavings = discAmt
    liveComboPrice = Math.max(0, liveRegularPrice - discAmt)
  } else if (combo?.pricing_method === 'flat_discount') {
    const discAmt = Math.min(liveRegularPrice, Number(combo.discount_value) || 0)
    liveSavings = discAmt
    liveComboPrice = Math.max(0, liveRegularPrice - discAmt)
  }

  const handleSelectProduct = (slot, product) => {
    setValidationError('')
    setInventoryNotice('')
    setHighlightedSlotId('')

    const reqQty = slot.quantity || 1
    if (!isProductInStock(product, reqQty)) {
      setValidationError(`"${product.name}" is temporarily out of stock.`)
      return
    }

    const availableSizes = getAvailableSizes(product, reqQty)
    const firstSize = availableSizes[0]
    const defaultSize =
      typeof firstSize === 'string' ? firstSize : firstSize?.size || 'Free Size'

    const availableColours = getAvailableColours(product, defaultSize, reqQty)
    const defaultColour =
      availableColours[0] || extractProductColours(product)[0] || 'Standard'

    setSelections((prev) => ({
      ...prev,
      [slot.id]: {
        slot_id: slot.id,
        slot_name: slot.name,
        product_id: String(product.id),
        product_name: product.name,
        slug: product.slug,
        sku: product.sku || 'TC-PIECE',
        price: Number(product.discount_price || product.price) || 0,
        original_price: Number(product.price) || 0,
        image:
          product.media?.find((m) => m.is_primary)?.url ||
          product.media?.find((m) => m.type !== 'video')?.url ||
          product.image ||
          '',
        size: defaultSize,
        colour: defaultColour,
        quantity: reqQty,
      },
    }))
  }

  const handleSelectSize = (slotId, sizeName) => {
    setValidationError('')
    setInventoryNotice('')
    setHighlightedSlotId('')

    const slot = slots.find((s) => s.id === slotId)
    const currentSel = selections[slotId]
    const eligible = slot?.eligible_products || (slot?.product ? [slot.product] : [])
    const product =
      eligible.find((p) => String(p.id) === String(currentSel?.product_id)) || slot?.product

    const reqQty = slot?.quantity || 1
    if (!isSizeInStock(product, sizeName, reqQty)) {
      setValidationError(`Size "${sizeName}" for "${product?.name || 'this piece'}" is out of stock.`)
      return
    }

    setSelections((prev) => {
      const existing = prev[slotId]
      if (!existing) return prev

      let nextColour = existing.colour
      const availColours = getAvailableColours(product, sizeName, reqQty)
      if (availColours.length > 0 && !availColours.includes(nextColour)) {
        nextColour = availColours[0]
      }

      return {
        ...prev,
        [slotId]: {
          ...existing,
          size: sizeName,
          colour: nextColour,
        },
      }
    })
  }

  const handleSelectColour = (slotId, colourName) => {
    setValidationError('')
    setInventoryNotice('')
    setHighlightedSlotId('')

    const slot = slots.find((s) => s.id === slotId)
    const currentSel = selections[slotId]
    const eligible = slot?.eligible_products || (slot?.product ? [slot.product] : [])
    const product =
      eligible.find((p) => String(p.id) === String(currentSel?.product_id)) || slot?.product

    const reqQty = slot?.quantity || 1
    if (!isColourInStock(product, colourName, currentSel?.size, reqQty)) {
      setValidationError(`Colour "${colourName}" is out of stock.`)
      return
    }

    setSelections((prev) => {
      const existing = prev[slotId]
      if (!existing) return prev
      return {
        ...prev,
        [slotId]: {
          ...existing,
          colour: colourName,
        },
      }
    })
  }

  const handleAddToCart = async () => {
    if (addingToCart) return

    // 1. Client-Side Validation
    for (const slot of slots) {
      const isReq = slot.required !== false
      const sel = selections[slot.id]
      const reqQty = slot.quantity || 1
      const eligible = slot.eligible_products || (slot.product ? [slot.product] : [])
      const prod = eligible.find((p) => String(p.id) === String(sel?.product_id)) || slot.product

      if (isReq && (!sel || !sel.product_id)) {
        setValidationError(`Please choose an in-stock piece for "${slot.name}".`)
        setHighlightedSlotId(slot.id)
        return
      }
      if (sel && (!sel.size || !isSizeInStock(prod, sel.size, reqQty))) {
        setValidationError(
          `Selected size for "${sel.product_name || slot.name}" is out of stock. Please select an available size.`
        )
        setHighlightedSlotId(slot.id)
        return
      }
    }

    setAddingToCart(true)
    setValidationError('')
    setInventoryNotice('')

    try {
      const selectionsArray = Object.values(selections).filter(Boolean)
      const targetQty = isEditMode && editingCartItem?.quantity ? editingCartItem.quantity : 1

      // 2. Authoritative Server-Side Validation
      const validationRes = await api('/combos/validate', {
        method: 'POST',
        body: {
          combo_id: combo.id,
          selections: selectionsArray,
          quantity: targetQty,
        },
      })

      if (!validationRes?.valid) {
        setValidationError(
          validationRes?.slotId || validationRes?.productId
            ? 'One or more selected pieces are no longer available. Please update your selections.'
            : (validationRes?.error || 'One or more selected pieces are no longer available. Please update your selections.')
        )
        if (validationRes?.slotId) setHighlightedSlotId(validationRes.slotId)
        setAddingToCart(false)
        return
      }

      const verifiedPricing = validationRes.pricing || {
        combo_price: liveComboPrice,
        regular_price: liveRegularPrice,
        original_price: liveRegularPrice,
        savings_per_unit: liveSavings,
        total_savings: liveSavings * targetQty,
      }

      if (isEditMode) {
        // 3A. Update Existing Cart Item In-Place
        const updateRes = updateComboInCart({
          cartItemId: editCartItemId,
          combo,
          selections: validationRes.verifiedComponents || selectionsArray,
          quantity: targetQty,
          pricing: verifiedPricing,
        })

        if (!updateRes?.success) {
          setValidationError(updateRes?.reason || 'Could not update ensemble in bag.')
          setAddingToCart(false)
          return
        }
      } else {
        // 3B. Fresh Addition to Cart
        const addRes = addComboToCart({
          combo,
          selections: validationRes.verifiedComponents || selectionsArray,
          quantity: 1,
          pricing: verifiedPricing,
        })

        if (!addRes?.success) {
          setValidationError(addRes?.reason || 'Could not add ensemble to bag.')
          setAddingToCart(false)
          return
        }
      }

      setAddedSuccess(true)
      router.push('/cart')
    } catch (err) {
      console.error('[ComboBuilder] Error validating or adding combo:', err)
      const isStockErr =
        err.slotId ||
        err.productId ||
        /stock|insufficient|unavailable/i.test(err.message || '')

      setValidationError(
        isStockErr
          ? 'One or more selected pieces are no longer available. Please update your selections.'
          : (err.message || 'One or more selected pieces are no longer available. Please update your selections.')
      )
      if (err.slotId) setHighlightedSlotId(err.slotId)
      setAddingToCart(false)
    }
  }

  const ctaButtonText = addingToCart
    ? isEditMode
      ? 'Updating Ensemble in Bag…'
      : 'Adding Ensemble to Bag…'
    : hasUnavailableRequiredSlot
    ? 'Piece Unavailable — Out of Stock'
    : !allSlotsCompleted
    ? `Select Available Pieces (${completedSlotsCount}/${slots.length})`
    : isEditMode
    ? `Update Ensemble in Bag — ${inr(liveComboPrice)}`
    : `Add Ensemble to Bag — ${inr(liveComboPrice)}`

  return (
    <div className="min-h-screen bg-paper pb-48 sm:pb-36 text-ink font-sans">
      {/* Navigation Breadcrumb & Edit Status */}
      <div className="border-b border-ink/10 bg-cream px-4 sm:px-8 py-3">
        <div className="mx-auto max-w-7xl flex items-center justify-between text-xs text-cocoa">
          <div className="flex items-center gap-2 truncate">
            <Link href="/combos" className="hover:text-ink flex items-center gap-1 transition shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Curated Combos
            </Link>
            <span>/</span>
            <span className="text-ink font-medium truncate">{combo.name}</span>
          </div>

          {isEditMode && (
            <Link
              href="/cart"
              className="text-[11px] font-bold uppercase tracking-wider text-mango-dark hover:underline shrink-0 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Cancel Edit
            </Link>
          )}
        </div>
      </div>

      {/* Edit Mode Alert Banner */}
      {isEditMode && (
        <div className="border-b border-gold/40 bg-gold/10 px-4 sm:px-8 py-3">
          <div className="mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-ink">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-mango-dark shrink-0" />
              <span>
                <strong>Editing Ensemble Selections:</strong> Changes will update the existing item in your bag (Qty: {editingCartItem.quantity}).
              </span>
            </div>
            <Link
              href="/cart"
              className="text-[11px] font-bold uppercase tracking-wider text-coral hover:underline shrink-0"
            >
              Return to Bag without saving
            </Link>
          </div>
        </div>
      )}

      {/* Inventory Notice Banner */}
      {inventoryNotice && (
        <div className="border-b border-amber-400/50 bg-amber-50 px-4 sm:px-8 py-3">
          <div className="mx-auto max-w-7xl flex items-center gap-2.5 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
            <span>{inventoryNotice}</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW A: CURATED OUTFIT / FIXED ENSEMBLE VIEW                              */}
      {/* ========================================================================= */}
      {isCuratedOutfit ? (
        <main className="mx-auto max-w-7xl px-4 sm:px-8 py-6 sm:py-10">
          {validationError && (
            <div className="mb-6 border border-coral/40 bg-coral-light/20 p-4 text-xs text-coral flex items-center gap-2.5 shadow-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {addedSuccess && (
            <div className="mb-6 border border-emerald-500/40 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>{isEditMode ? 'Ensemble Updated!' : 'Ensemble Added!'}</strong> Proceeding to bag…
                </span>
              </div>
              <Link href="/cart">
                <Button size="sm" className="rounded-none bg-emerald-800 text-cream text-[11px] uppercase tracking-wider">
                  View Bag
                </Button>
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Responsive Imagery & Gallery */}
            <div className="lg:col-span-6 space-y-3.5 lg:sticky lg:top-20">
              <div className="relative aspect-[3/4] sm:aspect-[4/5] max-h-[480px] sm:max-h-[580px] w-full overflow-hidden bg-sand/30 border border-ink/10 shadow-sm mx-auto">
                <img
                  src={activeMediaUrl}
                  alt={combo.name}
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = '/api/media/file/seed-01.jpg'
                  }}
                  className="h-full w-full object-cover transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 bg-[#141312]/90 backdrop-blur-xs px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gold-light border border-gold/20 shadow-xs">
                  Curated Outfit
                </div>
              </div>

              {/* Gallery Thumbnails */}
              {comboMedia.length > 1 && (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 no-scrollbar touch-pan-x">
                  {comboMedia.map((m, idx) => (
                    <button
                      key={m.id || idx}
                      type="button"
                      onClick={() => setActiveMediaUrl(m.url)}
                      className={cn(
                        'h-16 w-14 sm:h-20 sm:w-16 shrink-0 overflow-hidden border transition bg-sand/30',
                        activeMediaUrl === m.url
                          ? 'border-mango-dark ring-2 ring-mango-dark/30 shadow-xs'
                          : 'border-ink/10 opacity-70 hover:opacity-100'
                      )}
                    >
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Outfit Customizer & Independent Component Variants */}
            <div className="lg:col-span-6 space-y-6 sm:space-y-8">
              {/* Header Title & Pricing Summary */}
              <div className="space-y-3 border-b border-ink/10 pb-5">
                <div className="inline-flex items-center gap-1.5 border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-mango-dark">
                  <Sparkles className="h-3 w-3" /> Curated Ensemble
                </div>
                <h1 className="font-display text-2xl sm:text-4xl text-ink font-light leading-tight">
                  {combo.name}
                </h1>
                <p className="text-xs sm:text-sm font-medium text-cocoa-dark">{combo.customer_title}</p>
                {combo.description && (
                  <p className="text-xs text-cocoa leading-relaxed font-light pt-0.5">
                    {combo.description}
                  </p>
                )}

                {/* Pricing Block */}
                <div className="mt-3 p-3.5 sm:p-4 bg-cream border border-ink/10 flex items-center justify-between flex-wrap gap-3 shadow-2xs">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-cocoa-light block">
                      Ensemble Value
                    </span>
                    <div className="flex items-baseline gap-2.5 mt-0.5">
                      <span className="font-display text-2xl sm:text-3xl font-bold text-ink">
                        {inr(liveComboPrice)}
                      </span>
                      {liveRegularPrice > liveComboPrice && (
                        <span className="text-xs sm:text-sm text-cocoa-light line-through">
                          {inr(liveRegularPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                  {liveSavings > 0 && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] font-bold uppercase tracking-wider shadow-2xs">
                      Save {inr(liveSavings)}
                    </span>
                  )}
                </div>
              </div>

              {/* "Customize Your Look" Component Sections */}
              <div className="space-y-5 sm:space-y-6">
                <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                  <h2 className="font-display text-lg sm:text-xl text-ink font-normal">
                    Customize Pieces ({slots.length})
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">
                    Independent Swatches &amp; Sizes
                  </span>
                </div>

                {slots.map((slot, sIdx) => {
                  const product = slot.product || slot.eligible_products?.[0]
                  const reqQty = slot.quantity || 1
                  const isPieceStock = isProductInStock(product, reqQty)
                  const isSlotHighlight = highlightedSlotId === slot.id

                  const productColours = extractProductColours(product)
                  const productSizes = Array.isArray(product?.sizes) && product.sizes.length > 0
                    ? product.sizes
                    : [{ size: 'Free Size', available: true, stock: product?.stock || 0 }]

                  const currentSel = selections[slot.id]
                  const selectedColour =
                    currentSel?.colour || productColours[0] || 'Standard'
                  const selectedSize =
                    currentSel?.size ||
                    getAvailableSizes(product, reqQty)[0]?.size ||
                    productSizes[0]?.size ||
                    'Free Size'

                  const availableColoursList = getAvailableColours(
                    product,
                    selectedSize,
                    reqQty
                  )

                  return (
                    <div
                      key={slot.id || sIdx}
                      id={`slot-${slot.id}`}
                      className={cn(
                        'border bg-cream p-4 sm:p-6 space-y-4 shadow-2xs transition-all duration-200',
                        isSlotHighlight
                          ? 'border-coral ring-2 ring-coral/30'
                          : !isPieceStock
                          ? 'border-coral/40 bg-coral-light/5'
                          : 'border-ink/10'
                      )}
                    >
                      {/* Component Header */}
                      <div className="flex items-start justify-between gap-3 border-b border-ink/8 pb-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-mango-dark block">
                            Piece {sIdx + 1}: {slot.name}
                          </span>
                          <h3 className="font-display text-base sm:text-lg text-ink font-normal mt-0.5 truncate">
                            {product?.name || slot.name}
                          </h3>
                        </div>
                        {product?.media?.[0]?.url && (
                          <img
                            src={product.media[0].url}
                            alt=""
                            className="h-12 w-10 sm:h-14 sm:w-11 object-cover border border-ink/10 bg-sand/30 shrink-0"
                          />
                        )}
                      </div>

                      {/* Out of Stock Notice if Entire Piece is Unavailable */}
                      {!isPieceStock ? (
                        <div className="border border-coral/30 bg-coral-light/20 p-3.5 text-xs text-coral space-y-1">
                          <p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> CURRENTLY UNAVAILABLE
                          </p>
                          <p className="text-cocoa font-light">
                            This piece is temporarily out of stock in the atelier.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Visual Colour Swatches with Availability */}
                          {productColours.length > 0 && (
                            <ColourSwatchPicker
                              colours={productColours}
                              selectedColour={selectedColour}
                              availableColours={availableColoursList}
                              onSelectColour={(col) => handleSelectColour(slot.id, col)}
                              label="Select Colour"
                              size="md"
                            />
                          )}

                          {/* Independent Size Selector with Availability */}
                          <div className="space-y-2 border-t border-ink/8 pt-2.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold uppercase tracking-[0.2em] text-cocoa-light text-[10px]">
                                Select Size:
                              </span>
                              <span className="font-semibold text-ink text-xs">{selectedSize}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {productSizes.map((sObj, sIdx2) => {
                                const sName = typeof sObj === 'string' ? sObj : sObj.size || 'Free Size'
                                const isSizeStock = isSizeInStock(product, sName, reqQty)
                                const isSizeActive = selectedSize === sName

                                return (
                                  <button
                                    key={sIdx2}
                                    type="button"
                                    disabled={!isSizeStock}
                                    aria-disabled={!isSizeStock}
                                    title={!isSizeStock ? `${sName} (Out of Stock)` : sName}
                                    onClick={() => isSizeStock && handleSelectSize(slot.id, sName)}
                                    className={cn(
                                      'min-w-[42px] px-3.5 py-2 text-xs uppercase font-semibold tracking-wider transition border',
                                      !isSizeStock
                                        ? 'opacity-35 cursor-not-allowed bg-sand/30 border-ink/10 text-cocoa line-through'
                                        : isSizeActive
                                        ? 'bg-mango-dark text-cream border-mango-dark shadow-xs'
                                        : 'bg-paper text-ink border-ink/20 hover:border-ink/50'
                                    )}
                                  >
                                    {sName}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Main Desktop CTA */}
              <div className="pt-2">
                <Button
                  type="button"
                  disabled={!allSlotsCompleted || addingToCart}
                  onClick={handleAddToCart}
                  className={cn(
                    'w-full rounded-none py-6 sm:py-7 text-xs uppercase tracking-[0.2em] font-semibold transition shadow-md flex items-center justify-center gap-2.5',
                    allSlotsCompleted
                      ? 'bg-mango-dark text-cream hover:bg-mango'
                      : 'bg-sand/60 text-cocoa-light cursor-not-allowed'
                  )}
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>{ctaButtonText}</span>
                </Button>

                {/* AI Complete Look Try-On CTA Button */}
                {tryOnAvailable && <Button
                  type="button"
                  variant="outline"
                  disabled={!allSlotsCompleted || addingToCart}
                  onClick={() => setIsTryOnOpen(true)}
                  className="w-full mt-2.5 rounded-none py-5 text-xs uppercase tracking-[0.2em] font-semibold border border-gold-dark/40 bg-sand/20 hover:bg-gold-light/30 text-ink shadow-2xs transition-all flex items-center justify-center gap-2 min-h-[46px]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-gold-dark" />
                  <span>Try The Complete Look ✦</span>
                </Button>}
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* ========================================================================= */
        /* VIEW B: PICK & CHOOSE STEP-BY-STEP BUILDER VIEW                           */
        /* ========================================================================= */
        <>
          {/* Header Banner */}
          <section className="border-b border-ink/10 bg-[#141312] px-4 sm:px-8 py-8 sm:py-10 text-cream">
            <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-gold-light">
                  <Sparkles className="h-3 w-3" /> Curated Ensemble Builder
                </div>
                <h1 className="font-display text-2xl sm:text-4xl text-cream font-light">
                  {combo.name}
                </h1>
                <p className="text-xs sm:text-sm text-gold-light font-medium">{combo.customer_title}</p>
                {combo.description && (
                  <p className="max-w-2xl text-xs text-cream/70 leading-relaxed pt-1">
                    {combo.description}
                  </p>
                )}
              </div>

              <div className="shrink-0 bg-white/5 border border-white/10 p-3.5 sm:p-4 text-left sm:text-right">
                <span className="text-[10px] uppercase tracking-wider text-gold-light block">
                  Curated Bundle Price
                </span>
                <div className="flex items-baseline justify-start sm:justify-end gap-2 mt-1">
                  <span className="font-display text-2xl sm:text-3xl text-cream font-semibold">
                    {inr(liveComboPrice)}
                  </span>
                  {liveRegularPrice > liveComboPrice && (
                    <span className="text-xs text-cream/50 line-through">
                      {inr(liveRegularPrice)}
                    </span>
                  )}
                </div>
                {liveSavings > 0 && (
                  <span className="inline-block mt-1 bg-rose-900/60 text-rose-200 border border-rose-700/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Save {inr(liveSavings)}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Step Navigation Tabs */}
          <div className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-4 sm:px-8">
              <div className="flex items-center gap-2 overflow-x-auto py-3 no-scrollbar">
                {slots.map((slot, idx) => {
                  const reqQty = slot.quantity || 1
                  const isSlotAvail = isSlotAvailable(slot, reqQty)
                  const isSelected = Boolean(selections[slot.id]?.product_id)
                  const isActive = activeSlotIdx === idx
                  const selectedItem = selections[slot.id]

                  return (
                    <button
                      key={slot.id || idx}
                      type="button"
                      onClick={() => setActiveSlotIdx(idx)}
                      className={cn(
                        'flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs uppercase tracking-wider font-medium whitespace-nowrap transition border',
                        isActive
                          ? 'bg-[#141312] text-cream border-[#141312] shadow-sm'
                          : !isSlotAvail
                          ? 'bg-coral-light/20 text-coral border-coral/30'
                          : isSelected
                          ? 'bg-cream text-ink border-ink/15 hover:border-ink/30'
                          : 'bg-sand/30 text-cocoa-light border-ink/10 hover:text-cocoa'
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold',
                          isActive
                            ? 'bg-gold text-[#141312]'
                            : !isSlotAvail
                            ? 'bg-coral text-cream'
                            : isSelected
                            ? 'bg-emerald-700 text-cream'
                            : 'bg-ink/10 text-cocoa'
                        )}
                      >
                        {isSelected ? <Check className="h-3 w-3" /> : idx + 1}
                      </span>
                      <span>{slot.name}</span>
                      {!isSlotAvail && <span className="text-[9px] font-bold text-coral">(Out of Stock)</span>}
                      {selectedItem && isSlotAvail && (
                        <span className="hidden sm:inline text-[10px] opacity-75 font-normal">
                          ({selectedItem.product_name} · {selectedItem.size})
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Main Product Selection Grid */}
          <main className="mx-auto max-w-7xl px-4 sm:px-8 py-6 sm:py-8 space-y-6">
            {validationError && (
              <div className="border border-coral/40 bg-coral-light/20 p-4 text-xs text-coral flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {addedSuccess && (
              <div className="border border-emerald-500/40 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>{isEditMode ? 'Ensemble Updated!' : 'Ensemble Added!'}</strong> Redirecting to bag…
                  </span>
                </div>
                <Link href="/cart">
                  <Button
                    size="sm"
                    className="rounded-none bg-emerald-800 text-cream text-[11px] uppercase tracking-wider hover:bg-emerald-900"
                  >
                    View Bag
                  </Button>
                </Link>
              </div>
            )}

            {currentSlot && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-ink/10 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-mango-dark">
                      Step {activeSlotIdx + 1} of {slots.length}
                    </span>
                    <h2 className="font-display text-xl sm:text-2xl text-ink font-normal">{currentSlot.name}</h2>
                    <p className="text-xs text-cocoa mt-0.5">
                      Select your preferred handcrafted piece, colour swatch, and bespoke size.
                    </p>
                  </div>

                  {activeSlotIdx < slots.length - 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveSlotIdx(activeSlotIdx + 1)}
                      className="self-start sm:self-auto rounded-none border-ink/20 text-xs uppercase tracking-wider text-ink hover:bg-sand/30"
                    >
                      Next Step <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {eligibleProducts.length === 0 ? (
                  <div className="border border-dashed border-ink/20 bg-cream p-12 text-center text-xs text-cocoa">
                    No eligible products currently configured for this slot.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {eligibleProducts.map((product) => {
                      const reqQty = currentSlot.quantity || 1
                      const isProductStock = isProductInStock(product, reqQty)
                      const currentSelection = selections[currentSlot.id]
                      const isSelected = currentSelection?.product_id === String(product.id)

                      const productColours = extractProductColours(product)
                      const productSizes = Array.isArray(product.sizes) && product.sizes.length > 0
                        ? product.sizes
                        : [{ size: 'Free Size', available: true, stock: product.stock || 0 }]

                      const availableSizes = getAvailableSizes(product, reqQty)
                      const chosenSize = isSelected
                        ? currentSelection?.size
                        : availableSizes[0]?.size || productSizes[0]?.size || 'Free Size'

                      const availableColoursList = getAvailableColours(
                        product,
                        chosenSize,
                        reqQty
                      )
                      const chosenColour = isSelected
                        ? currentSelection?.colour
                        : availableColoursList[0] || productColours[0] || 'Standard'

                      const primaryImage =
                        product.media?.find((m) => m.is_primary)?.url ||
                        product.media?.find((m) => m.type !== 'video')?.url ||
                        product.image ||
                        ''

                      return (
                        <div
                          key={product.id}
                          className={cn(
                            'group flex flex-col justify-between border bg-cream transition-all duration-300 relative',
                            !isProductStock
                              ? 'border-ink/10 opacity-60 bg-sand/10'
                              : isSelected
                              ? 'border-mango-dark ring-2 ring-mango-dark/20 shadow-md'
                              : 'border-ink/10 hover:border-ink/30'
                          )}
                        >
                          {/* Selected or Out of Stock Badge */}
                          {isSelected && isProductStock && (
                            <div className="absolute top-2 right-2 z-10 bg-mango-dark text-cream px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                              <Check className="h-3 w-3" /> Selected Piece
                            </div>
                          )}
                          {!isProductStock && (
                            <div className="absolute top-2 right-2 z-10 bg-ink/90 text-cream px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/10">
                              Out of Stock
                            </div>
                          )}

                          <div>
                            {/* Image */}
                            <div
                              onClick={() => isProductStock && handleSelectProduct(currentSlot, product)}
                              className={cn(
                                'relative aspect-[3/4] w-full overflow-hidden bg-sand/30',
                                isProductStock ? 'cursor-pointer' : 'cursor-not-allowed'
                              )}
                            >
                              {primaryImage ? (
                                <img
                                  src={primaryImage}
                                  alt={product.name}
                                  onError={(e) => {
                                    e.currentTarget.onerror = null
                                    e.currentTarget.src = '/api/media/file/seed-01.jpg'
                                  }}
                                  className={cn(
                                    'h-full w-full object-cover transition-transform duration-700',
                                    isProductStock ? 'group-hover:scale-105' : 'grayscale-30'
                                  )}
                                />
                              ) : (
                                <div className="grid h-full place-items-center text-xs text-cocoa-light">
                                  Atelier Piece
                                </div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="p-4 space-y-3">
                              <div>
                                <h3
                                  onClick={() => isProductStock && handleSelectProduct(currentSlot, product)}
                                  className={cn(
                                    'font-medium text-sm text-ink leading-snug',
                                    isProductStock
                                      ? 'group-hover:text-mango-dark transition cursor-pointer'
                                      : 'cursor-not-allowed text-cocoa'
                                  )}
                                >
                                  {product.name}
                                </h3>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span className="font-semibold text-xs text-ink">
                                    {inr(product.discount_price || product.price)}
                                  </span>
                                  {product.discount_price && product.discount_price < product.price && (
                                    <span className="text-[11px] text-cocoa-light line-through">
                                      {inr(product.price)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Visual Colour Swatches */}
                              {productColours.length > 1 && isProductStock && (
                                <div className="border-t border-ink/10 pt-2">
                                  <ColourSwatchPicker
                                    colours={productColours}
                                    selectedColour={chosenColour}
                                    availableColours={availableColoursList}
                                    onSelectColour={(col) => {
                                      if (!isSelected) {
                                        handleSelectProduct(currentSlot, product)
                                      }
                                      handleSelectColour(currentSlot.id, col)
                                    }}
                                    label="Colour"
                                    size="sm"
                                  />
                                </div>
                              )}

                              {/* Size Picker with In-Stock checks */}
                              <div className="space-y-1.5 border-t border-ink/10 pt-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light block">
                                  Select Size:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {productSizes.map((sObj, sIdx) => {
                                    const sName = typeof sObj === 'string' ? sObj : sObj.size || 'Free Size'
                                    const isSizeStock = isSizeInStock(product, sName, reqQty)
                                    const isSizeSelected = isSelected && chosenSize === sName

                                    return (
                                      <button
                                        key={sIdx}
                                        type="button"
                                        disabled={!isSizeStock || !isProductStock}
                                        aria-disabled={!isSizeStock || !isProductStock}
                                        title={!isSizeStock ? `${sName} (Out of Stock)` : sName}
                                        onClick={() => {
                                          if (isSizeStock && isProductStock) {
                                            if (!isSelected) {
                                              handleSelectProduct(currentSlot, product)
                                            }
                                            handleSelectSize(currentSlot.id, sName)
                                          }
                                        }}
                                        className={cn(
                                          'px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition border',
                                          !isSizeStock || !isProductStock
                                            ? 'opacity-35 cursor-not-allowed bg-sand/30 border-ink/10 text-cocoa line-through'
                                            : isSizeSelected
                                            ? 'bg-[#141312] text-cream border-[#141312]'
                                            : 'bg-paper text-ink border-ink/20 hover:border-ink/50'
                                        )}
                                      >
                                        {sName}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Select Button */}
                          <div className="p-4 pt-0">
                            <Button
                              type="button"
                              disabled={!isProductStock}
                              aria-disabled={!isProductStock}
                              onClick={() => {
                                if (isProductStock) {
                                  handleSelectProduct(currentSlot, product)
                                  if (activeSlotIdx < slots.length - 1) {
                                    setActiveSlotIdx(activeSlotIdx + 1)
                                  }
                                }
                              }}
                              className={cn(
                                'w-full rounded-none text-xs uppercase tracking-wider font-semibold py-2 transition',
                                !isProductStock
                                  ? 'bg-sand/60 text-cocoa cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-emerald-700 text-cream hover:bg-emerald-800'
                                  : 'bg-ink text-cream hover:bg-cocoa-dark'
                              )}
                            >
                              {!isProductStock
                                ? 'Out of Stock'
                                : isSelected
                                ? 'Selected (Click to Proceed)'
                                : 'Choose This Piece'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </main>
        </>
      )}

      {/* Sticky Bottom Bar for Mobile & Desktop Summary */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/15 bg-paper/95 backdrop-blur-md p-3 sm:p-4 shadow-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
          {/* Selections Preview */}
          <div className="hidden sm:flex items-center gap-2.5 overflow-x-auto no-scrollbar">
            {slots.map((slot, idx) => {
              const reqQty = slot.quantity || 1
              const isSlotAvail = isSlotAvailable(slot, reqQty)
              const sel = selections[slot.id]

              return (
                <div
                  key={slot.id || idx}
                  onClick={() => !isCuratedOutfit && setActiveSlotIdx(idx)}
                  className={cn(
                    'flex items-center gap-2 p-1.5 pr-2.5 border transition shrink-0 bg-cream',
                    !isCuratedOutfit && activeSlotIdx === idx
                      ? 'border-mango-dark ring-1 ring-mango-dark'
                      : 'border-ink/10 hover:border-ink/30',
                    isCuratedOutfit ? 'cursor-default' : 'cursor-pointer'
                  )}
                >
                  <div className="h-9 w-7 bg-sand/30 overflow-hidden shrink-0">
                    {sel?.image ? (
                      <img src={sel.image} alt={sel.product_name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-[9px] text-cocoa-light">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cocoa-light truncate max-w-[100px]">
                      {slot.name}
                    </p>
                    <p className="text-[11px] font-medium text-ink truncate max-w-[110px]">
                      {!isSlotAvail
                        ? 'Out of Stock'
                        : sel?.product_name || 'Not selected'}
                    </p>
                    {sel && isSlotAvail && (
                      <p className="text-[9px] text-cocoa truncate max-w-[110px]">
                        {sel.colour && <span>{sel.colour} · </span>}
                        <strong>{sel.size}</strong>
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pricing & Add to Bag CTA */}
          <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-6 shrink-0 w-full md:w-auto">
            <div className="text-left md:text-right">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-cocoa-light block">
                Total Ensemble Value
              </span>
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="font-display text-xl sm:text-2xl font-bold text-ink">
                  {inr(liveComboPrice)}
                </span>
                {liveRegularPrice > liveComboPrice && (
                  <span className="text-[11px] sm:text-xs text-cocoa-light line-through">
                    {inr(liveRegularPrice)}
                  </span>
                )}
                {liveSavings > 0 && (
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1 py-0.2 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">
                    Save {inr(liveSavings)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 md:flex-none">
              {tryOnAvailable && <Button
                type="button"
                variant="outline"
                disabled={!allSlotsCompleted || addingToCart}
                onClick={() => setIsTryOnOpen(true)}
                className="rounded-none px-3 sm:px-4 py-5 sm:py-6 text-xs uppercase tracking-wider font-semibold border-gold-dark/40 bg-sand/20 hover:bg-gold-light/30 text-ink shadow-2xs flex items-center justify-center gap-1.5 shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5 text-gold-dark" />
                <span className="hidden sm:inline">Try Complete Look ✦</span>
                <span className="sm:hidden">Try On ✦</span>
              </Button>}

              <Button
                type="button"
                disabled={!allSlotsCompleted || addingToCart}
                aria-disabled={!allSlotsCompleted || addingToCart}
                onClick={handleAddToCart}
                className={cn(
                  'rounded-none px-4 sm:px-6 py-5 sm:py-6 text-xs uppercase tracking-wider sm:tracking-widest font-semibold transition shadow-md flex items-center justify-center gap-2 flex-1 md:flex-none',
                  allSlotsCompleted
                    ? 'bg-mango-dark text-cream hover:bg-mango'
                    : 'bg-sand/60 text-cocoa-light cursor-not-allowed'
                )}
              >
                <ShoppingBag className="h-4 w-4" />
                <span>
                  {addingToCart
                    ? isEditMode
                      ? 'Updating…'
                      : 'Adding…'
                    : ctaButtonText}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* AI Virtual Try-On Modal for Combo Ensemble */}
      {tryOnAvailable && <VirtualTryOnModal
        isOpen={isTryOnOpen}
        onClose={() => setIsTryOnOpen(false)}
        mode="combo"
        combo={combo}
        comboSelections={selections}
        onAddToCart={handleAddToCart}
        settings={tryOnSettings}
      />}
    </div>
  )
}

export default function ComboBuilder(props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-paper py-32 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
          <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">Loading Ensemble…</p>
        </div>
      }
    >
      <ComboBuilderInner {...props} />
    </Suspense>
  )
}
