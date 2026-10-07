export function getProductVariant(product, size) {
  if (!product || !size) return null
  return (Array.isArray(product.sizes) ? product.sizes : []).find(
    (variant) => String(variant?.size || '').trim().toLowerCase() === String(size).trim().toLowerCase()
  ) || null
}

// Keep catalog filters aligned with the price shown by ProductCard,
// ProductDetail, QuickView, and the cart: a truthy sale price takes precedence.
export function getProductEffectivePrice(product) {
  const value = Number(product?.discount_price || product?.price)
  return Number.isFinite(value) ? value : 0
}

export function getProductAvailableStock(product, size = '') {
  if (!product || product.active === false) return 0
  const totalStock = Math.max(0, Number(product.stock) || 0)
  if (!size) return totalStock
  const variants = Array.isArray(product.sizes) ? product.sizes : []
  if (!variants.length) return totalStock
  const variant = getProductVariant(product, size)
  if (!variant || variant.available === false) return 0
  if (variant.stock !== undefined && variant.stock !== null && variant.stock !== '') {
    const stock = Number(variant.stock)
    return Number.isFinite(stock) ? Math.max(0, stock) : 0
  }
  return totalStock
}

export function isProductVariantAvailable(product, size = '') {
  if (!product || product.active === false) return false
  if (size) return getProductAvailableStock(product, size) > 0
  const variants = Array.isArray(product.sizes) ? product.sizes : []
  if (variants.length) return variants.some((variant) => isProductVariantAvailable(product, variant?.size || ''))
  return getProductAvailableStock(product) > 0
}
