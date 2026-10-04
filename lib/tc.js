// Client helpers for Thretha Couture

export async function api(pathname, opts = {}) {
  let res
  try {
    res = await fetch(`/api${pathname}`, {
      cache: 'no-store',
      ...opts,
      headers: {
        ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body instanceof FormData ? opts.body
        : opts.body ? JSON.stringify(opts.body) : undefined,
    })
  } catch (networkError) {
    const err = new Error('Unable to connect right now. Please check your internet connection and try again.')
    err.code = 'NETWORK_ERROR'
    err.isNetworkError = true
    err.originalError = networkError
    throw err
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }

  if (!res.ok) {
    const rawError = data?.error
    const errorMsg =
      (typeof rawError === 'string' ? rawError : rawError?.message) ||
      data?.message ||
      (res.status >= 500
        ? 'Something went wrong on our end. Please try again shortly.'
        : 'Request could not be completed.')

    const err = new Error(errorMsg)
    err.code =
      (typeof rawError === 'object' ? rawError?.code : null) ||
      data?.code ||
      (res.status === 401
        ? 'AUTH_REQUIRED'
        : res.status === 403
        ? 'FORBIDDEN'
        : res.status === 404
        ? 'NOT_FOUND'
        : 'REQUEST_FAILED')
    err.status = res.status
    err.data = data
    err.requestId = data?.requestId || res.headers?.get?.('x-request-id') || null
    err.slotId = data?.slotId || (typeof rawError === 'object' ? rawError?.slotId : undefined)
    err.productId = data?.productId || (typeof rawError === 'object' ? rawError?.productId : undefined)
    throw err
  }

  return data
}

export function inr(n) {
  if (n === null || n === undefined || n === '') return ''
  return '₹' + Number(n).toLocaleString('en-IN')
}

// Wishlist (localStorage)
const WKEY = 'tc_wishlist'
export function getWishlist() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(WKEY) || '[]') } catch { return [] }
}
export function toggleWishlist(slug) {
  const list = getWishlist()
  const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]
  localStorage.setItem(WKEY, JSON.stringify(next))
  window.dispatchEvent(new Event('tc-wishlist'))
  return next
}
export function inWishlist(slug) {
  return getWishlist().includes(slug)
}

// Admin token
const TKEY = 'tc_admin_token'
export const auth = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TKEY)),
  set: (t) => localStorage.setItem(TKEY, t),
  clear: () => localStorage.removeItem(TKEY),
}

// tiny rotations for imperfect layout
export const rotations = ['-rotate-1', 'rotate-1', '-rotate-2', 'rotate-2', 'rotate-0']
export function rot(i) { return rotations[i % rotations.length] }
