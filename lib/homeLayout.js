// IDs describe actual homepage blocks. Keep these stable when display copy changes.
export const HOME_SECTIONS = [
  { id: 'hero', name: 'Hero', description: 'Main campaign images' },
  { id: 'intro', name: 'Intro line', description: 'Short brand message' },
  { id: 'silhouette', name: 'Find Your Silhouette', description: 'Category discovery' },
  { id: 'filters', name: 'Filters', description: 'Find pieces by colour and price' },
  { id: 'new_arrivals', name: 'New Arrivals', description: 'Recently added pieces' },
  { id: 'featured_edit', name: 'Featured Edit', description: 'Editorial product feature' },
  { id: 'shop_by_occasion', name: 'Shop by Occasion', description: 'Occasion collections; controlled by its existing setting' },
  { id: 'instagram', name: 'Instagram', description: 'Feed or follow link; controlled by its existing setting' },
  { id: 'newsletter', name: 'Newsletter', description: 'Email signup' },
  { id: 'final_cta', name: 'Final CTA', description: 'Closing shop invitation' },
]

export const DEFAULT_HOME_SECTION_ORDER = HOME_SECTIONS.map(({ id }) => id)
export const DEFAULT_HOME_SECTION_VISIBILITY = Object.fromEntries(DEFAULT_HOME_SECTION_ORDER.map((id) => [id, true]))
const known = new Set(DEFAULT_HOME_SECTION_ORDER)

export function isValidHomeSectionOrderInput(value) {
  return Array.isArray(value) && value.length <= DEFAULT_HOME_SECTION_ORDER.length * 5 && value.every((id) => typeof id === 'string')
}

export function normalizeHomeSectionOrder(value) {
  if (!Array.isArray(value)) return [...DEFAULT_HOME_SECTION_ORDER]
  const seen = new Set()
  const saved = []
  for (const id of value) {
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue
    seen.add(id)
    saved.push(id)
  }
  return [...saved, ...DEFAULT_HOME_SECTION_ORDER.filter((id) => !seen.has(id))]
}

export function isValidHomeSectionVisibilityInput(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length <= DEFAULT_HOME_SECTION_ORDER.length * 5 &&
    Object.values(value).every((visible) => typeof visible === 'boolean')
}

export function normalizeHomeSectionVisibility(value) {
  if (!isValidHomeSectionVisibilityInput(value)) return { ...DEFAULT_HOME_SECTION_VISIBILITY }
  return Object.fromEntries(DEFAULT_HOME_SECTION_ORDER.map((id) => [id, !Object.hasOwn(value, id) || value[id] !== false]))
}

export function getVisibleHomeSectionIds(order, visibility) {
  const normalizedVisibility = normalizeHomeSectionVisibility(visibility)
  return normalizeHomeSectionOrder(order).filter((id) => normalizedVisibility[id])
}
