export const DEFAULT_OCCASIONS = [
  { slug: 'wedding', name: 'Wedding', active: true },
  { slug: 'festive', name: 'Festive', active: true },
  { slug: 'onam', name: 'Onam', active: true },
  { slug: 'office', name: 'Office', active: true },
  { slug: 'casual', name: 'Casual', active: true },
  { slug: 'party', name: 'Party', active: true },
]

export function normalizeOccasions(value) {
  const list = Array.isArray(value) ? value : DEFAULT_OCCASIONS
  const seen = new Set()
  return list.slice(0, 30).map((item) => {
    const name = String(item?.name || '').trim().slice(0, 50)
    const slug = String(item?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim().toLowerCase()
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) return null
    seen.add(slug)
    return { slug, name, active: item?.active !== false }
  }).filter(Boolean)
}
