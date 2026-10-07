import { DEFAULT_OCCASIONS, normalizeOccasions } from './occasions.js'

export function occasionsWithAssignments(saved, products) {
  return normalizeOccasions(saved).map((occasion) => ({
    ...occasion,
    product_ids: products.filter((product) => product.occasion_slugs?.includes(occasion.slug)).map((product) => product.id),
  }))
}

export function planOccasionProductUpdates(previous, next, products) {
  const managedSlugs = new Set([...previous, ...next].map((occasion) => occasion.slug))
  const assignments = new Map(next.map((occasion) => [occasion.slug, new Set(occasion.product_ids)]))
  return products.flatMap((product) => {
    const before = Array.isArray(product.occasion_slugs) ? product.occasion_slugs : []
    const after = [
      ...before.filter((slug) => !managedSlugs.has(slug)),
      ...next.filter((occasion) => assignments.get(occasion.slug).has(product.id)).map((occasion) => occasion.slug),
    ]
    if (before.length === after.length && new Set(before).size === new Set(after).size &&
      before.every((slug) => after.includes(slug))) return []
    return [{ id: product.id, occasion_slugs: after }]
  })
}

export function unknownOccasionProductIds(occasions, products) {
  const known = new Set(products.map((product) => product.id))
  return occasions.flatMap((occasion) => occasion.product_ids.filter((id) => !known.has(id)))
}

export async function persistOccasions(database, occasions, session) {
  const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { shop_by_occasion: 1 }, session })
  const products = await database.collection('products').find({}, { projection: { _id: 0, id: 1, occasion_slugs: 1 }, session }).toArray()
  const previous = normalizeOccasions(settings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS)
  const incoming = new Set(occasions.map((occasion) => occasion.slug))
  if (previous.some((occasion) => !incoming.has(occasion.slug))) throw new Error('OCCASION_REMOVED')
  if (unknownOccasionProductIds(occasions, products).length) throw new Error('UNKNOWN_PRODUCT')
  const changes = planOccasionProductUpdates(previous, occasions, products)
  if (changes.length) {
    await database.collection('products').bulkWrite(changes.map((change) => ({
      updateOne: { filter: { id: change.id }, update: { $set: { occasion_slugs: change.occasion_slugs, updated_at: new Date() } } },
    })), { session })
  }
  await database.collection('settings').updateOne(
    { id: 'global' },
    { $set: { 'shop_by_occasion.occasions': occasions, updated_at: new Date() } },
    { upsert: true, session },
  )
}
