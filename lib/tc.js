// Client helpers for Thretha Couture
export async function api(pathname, opts = {}) {
  const res = await fetch(`/api${pathname}`, {
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
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
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
