export const DEFAULT_OCCASIONS = [
  { slug: 'wedding', name: 'Wedding', active: true },
  { slug: 'festive', name: 'Festive', active: true },
  { slug: 'onam', name: 'Onam', active: true },
  { slug: 'office', name: 'Office', active: true },
  { slug: 'casual', name: 'Casual', active: true },
  { slug: 'party', name: 'Party', active: true },
]

const OCCASION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PRODUCT_ID = /^[a-zA-Z0-9_-]{1,100}$/

export function isOccasionCoverUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
      !url.username && !url.password && !url.search && !url.hash &&
      /^\/[^/]+\/image\/upload\//.test(url.pathname)
  } catch {
    return false
  }
}

export function normalizeOccasions(value) {
  const list = Array.isArray(value) ? value : DEFAULT_OCCASIONS
  const seen = new Set()
  return list.slice(0, 30).map((item) => {
    const name = String(item?.name || '').trim().slice(0, 50)
    const slug = String(item?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim().toLowerCase()
    if (!name || !OCCASION_SLUG.test(slug) || slug.length > 64 || seen.has(slug)) return null
    seen.add(slug)
    const deleted = item?.deleted === true
    return {
      id: slug,
      slug,
      name,
      image: isOccasionCoverUrl(item?.image) ? item.image : null,
      active: !deleted && item?.active !== false,
      deleted,
      product_ids: Array.isArray(item?.product_ids)
        ? [...new Set(item.product_ids.filter((id) => typeof id === 'string' && PRODUCT_ID.test(id)))].slice(0, 1000)
        : [],
    }
  }).filter(Boolean)
}

// Used by the dedicated Admin API. Return only known fields so a request cannot
// write arbitrary settings or product properties to MongoDB.
export function parseOccasionsInput(value) {
  if (!Array.isArray(value) || value.length > 30) return { error: 'Provide up to 30 occasions.' }
  const seen = new Set()
  const occasions = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Invalid occasion.' }
    const slug = item.slug
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (typeof slug !== 'string' || slug.length > 64 || !OCCASION_SLUG.test(slug) || seen.has(slug) ||
      (item.id !== undefined && item.id !== slug)) return { error: 'Each occasion needs a unique, valid ID.' }
    if (typeof item.name !== 'string' || !name || name.length > 50) return { error: 'Occasion name must be 1–50 characters.' }
    if (typeof item.active !== 'boolean' || typeof item.deleted !== 'boolean') return { error: 'Occasion status is invalid.' }
    if (item.deleted && item.active) return { error: 'A deleted occasion cannot be active.' }
    if (item.image != null && item.image !== '' && !isOccasionCoverUrl(item.image)) return { error: 'Cover image must be a Cloudinary image URL.' }
    if (!Array.isArray(item.product_ids) || item.product_ids.length > 1000 ||
      item.product_ids.some((id) => typeof id !== 'string' || !PRODUCT_ID.test(id)) ||
      new Set(item.product_ids).size !== item.product_ids.length) return { error: 'Product assignments are invalid.' }
    seen.add(slug)
    occasions.push({ id: slug, slug, name, image: item.image || null, active: item.active, deleted: item.deleted, product_ids: item.product_ids })
  }
  return { occasions }
}

export function hasMoreOccasions(scrollLeft, scrollWidth, clientWidth) {
  return scrollWidth > clientWidth + 2 && scrollLeft + clientWidth < scrollWidth - 2
}
