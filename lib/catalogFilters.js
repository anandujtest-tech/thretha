import { getProductEffectivePrice, isProductVariantAvailable } from './productInventory.js'

export const MAX_SEARCH_LENGTH = 80

export function normalizeSearchTerm(value) {
  return String(value || '').trim().slice(0, MAX_SEARCH_LENGTH)
}

export function escapeSearchTerm(value) {
  return normalizeSearchTerm(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parsePriceRange(minRaw, maxRaw) {
  const parse = (raw) => {
    if (raw === null || raw === undefined || raw === '') return { value: null, valid: true }
    const value = Number(raw)
    return { value, valid: Number.isFinite(value) && value >= 0 }
  }
  const min = parse(minRaw)
  const max = parse(maxRaw)
  if (!min.valid || !max.valid) return { valid: false, error: 'Price filters must be valid non-negative numbers.' }
  if (min.value !== null && max.value !== null && min.value > max.value) return { valid: false, error: 'Minimum price cannot be greater than maximum price.' }
  const filter = {}
  if (min.value !== null) filter.$gte = min.value
  if (max.value !== null) filter.$lte = max.value
  return { valid: true, filter: Object.keys(filter).length ? filter : null }
}

export function filterProductsByPriceAndAvailability(products, { priceRange, availability, size } = {}) {
  const min = priceRange?.filter?.$gte
  const max = priceRange?.filter?.$lte
  return (Array.isArray(products) ? products : []).filter((product) => {
    const price = getProductEffectivePrice(product)
    if (min !== undefined && price < min) return false
    if (max !== undefined && price > max) return false
    if (availability === 'in' && !isProductVariantAvailable(product)) return false
    if (size) {
      const variants = Array.isArray(product?.sizes) ? product.sizes : []
      if (!variants.length && String(size).trim().toLowerCase() !== 'free size') return false
      if (!isProductVariantAvailable(product, size)) return false
    }
    return true
  })
}
