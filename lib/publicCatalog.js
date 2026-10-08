import { normalizeOccasions, DEFAULT_OCCASIONS } from './occasions.js'
import { normalizeSearchTerm, escapeSearchTerm, parsePriceRange, filterProductsByPriceAndAvailability } from './catalogFilters.js'
import { getProductEffectivePrice } from './productInventory.js'

const PUBLIC_PRODUCT_FIELDS = [
  'id', 'slug', 'name', 'sku', 'category_id', 'category_name', 'description',
  'price', 'discount_price', 'fabric', 'colour', 'material', 'pattern',
  'care_instructions', 'stock', 'sizes', 'media', 'image', 'occasion_slugs',
  'featured', 'new_arrival', 'best_seller', 'active', 'created_at',
]
const project = Object.fromEntries(PUBLIC_PRODUCT_FIELDS.map((field) => [field, 1]))
project._id = 0

const numeric = (value) => ({ $convert: { input: value, to: 'double', onError: 0, onNull: 0 } })
const positive = (value) => ({ $gt: [numeric(value), 0] })
const variants = { $cond: [{ $isArray: '$sizes' }, '$sizes', []] }
const variantStock = (variant) => ({ $cond: [
  { $in: [`${variant}.stock`, [null, '']] }, '$stock', `${variant}.stock`,
] })
const variantAvailable = (variant) => ({ $and: [
  { $ne: [`${variant}.available`, false] }, positive(variantStock(variant)),
] })

// Mirrors isProductVariantAvailable: an explicit size checks that variant;
// unsized products accept only Free Size, and variant stock is authoritative.
export function mongoAvailabilityExpression(size = '') {
  const normalized = String(size).trim().toLowerCase()
  const matchingVariant = (variant) => ({ $and: [
    { $eq: [{ $toLower: { $trim: { input: { $convert: { input: `${variant}.size`, to: 'string', onError: '', onNull: '' } } } } }, normalized] },
    variantAvailable(variant),
  ] })
  const eligible = { $filter: { input: variants, as: 'variant', cond: normalized
    ? matchingVariant('$$variant') : variantAvailable('$$variant') } }
  return { $cond: [
    { $gt: [{ $size: variants }, 0] },
    { $gt: [{ $size: eligible }, 0] },
    normalized ? { $and: [{ $eq: [normalized, 'free size'] }, positive('$stock')] } : positive('$stock'),
  ] }
}

export const mongoEffectivePriceExpression = {
  $convert: {
    input: { $cond: [
      { $in: ['$discount_price', [null, false, 0, '']] }, '$price', '$discount_price',
    ] },
    to: 'double', onError: 0, onNull: 0,
  },
}

function parsePagination(q) {
  const enabled = q.has('page') || q.has('limit') || q.get('format') === 'paginated'
  if (!enabled) return null
  const integer = (raw, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    if (raw === null || !/^[1-9]\d*$/.test(raw)) return fallback
    const value = Number(raw)
    return Number.isSafeInteger(value) ? Math.min(value, maximum) : fallback
  }
  return { page: integer(q.get('page'), 1), limit: integer(q.get('limit'), 20, 50) }
}

const emptyResult = (pagination) => pagination ? {
  products: [], pagination: { ...pagination, total: 0, totalPages: 0,
    hasNextPage: false, hasPreviousPage: pagination.page > 1 },
} : []

function stableSort(sort) {
  if (sort === 'price_asc') return { _effectivePrice: 1, _id: 1 }
  if (sort === 'price_desc') return { _effectivePrice: -1, _id: 1 }
  if (sort === 'featured') return { featured: -1, _id: 1 }
  return { created_at: -1, _id: -1 }
}

export function paginatedProductPipeline(filter, q, pagination, priceRange) {
  const derivedMatch = {}
  if (priceRange.filter?.$gte !== undefined || priceRange.filter?.$lte !== undefined) {
    derivedMatch._effectivePrice = priceRange.filter
  }
  const size = q.get('size') || ''
  if (size || q.get('availability') === 'in') derivedMatch._available = true
  const stages = [{ $match: filter }]
  const derivedFields = {}
  if (derivedMatch._effectivePrice || ['price_asc', 'price_desc'].includes(q.get('sort'))) {
    derivedFields._effectivePrice = mongoEffectivePriceExpression
  }
  if (derivedMatch._available) derivedFields._available = mongoAvailabilityExpression(size)
  if (Object.keys(derivedFields).length) stages.push({ $addFields: derivedFields })
  if (Object.keys(derivedMatch).length) stages.push({ $match: derivedMatch })
  const skip = (pagination.page - 1) * pagination.limit
  // A safe integer page can still overflow multiplication. Such pages are empty.
  const safeSkip = Number.isSafeInteger(skip) ? skip : Number.MAX_SAFE_INTEGER
  return {
    count: [...stages, { $count: 'total' }],
    products: [...stages, { $sort: stableSort(q.get('sort')) }, { $skip: safeSkip },
      { $limit: pagination.limit }, { $project: project }],
  }
}

export async function handlePublicProducts(request, database) {
  const q = new URL(request.url).searchParams
  const pagination = parsePagination(q)
  const filter = { active: true }
  if (q.get('slugs')) {
    const slugs = [...new Set(q.get('slugs').split(',').map((value) => value.trim()).filter((value) => /^[a-z0-9-]{1,100}$/i.test(value)))].slice(0, 12)
    if (!slugs.length) return { status: 200, body: emptyResult(pagination) }
    filter.slug = { $in: slugs }
  }
  if (q.get('occasion')) {
    const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { shop_by_occasion: 1 } })
    if (settings?.shop_by_occasion?.enabled === false) return { status: 200, body: emptyResult(pagination) }
    const occasion = normalizeOccasions(settings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS)
      .find((item) => item.active && item.slug === q.get('occasion'))
    if (!occasion) return { status: 200, body: emptyResult(pagination) }
    filter.occasion_slugs = occasion.slug
  }
  if (q.get('category')) {
    const category = await database.collection('categories').findOne({ slug: q.get('category') })
    if (!category) return { status: 200, body: emptyResult(pagination) }
    filter.category_id = category.id
  }
  if (q.get('new') === 'true') filter.new_arrival = true
  if (q.get('featured') === 'true') filter.featured = true
  if (q.get('colour')) filter.colour = { $regex: q.get('colour'), $options: 'i' }
  const search = normalizeSearchTerm(q.get('search'))
  if (search) {
    const rx = { $regex: escapeSearchTerm(search), $options: 'i' }
    filter.$or = [{ name: rx }, { sku: rx }, { category_name: rx }, { colour: rx }]
  }
  const priceRange = parsePriceRange(q.get('minPrice'), q.get('maxPrice'))
  if (!priceRange.valid) return { status: 400, body: { error: priceRange.error } }

  if (pagination) {
    const collection = database.collection('products')
    const skip = (pagination.page - 1) * pagination.limit
    let total, pageProducts
    const derived = Boolean(priceRange.filter || q.get('size') || q.get('availability') === 'in' ||
      ['price_asc', 'price_desc'].includes(q.get('sort')))
    if (derived) {
      const pipeline = paginatedProductPipeline(filter, q, pagination, priceRange)
      const [counts, products] = await Promise.all([
        collection.aggregate(pipeline.count).toArray(),
        collection.aggregate(pipeline.products, { allowDiskUse: true }).toArray(),
      ])
      total = counts[0]?.total || 0
      pageProducts = products
    } else {
      const [count, products] = await Promise.all([
        collection.countDocuments(filter),
        collection.find(filter, { projection: project })
          .sort(stableSort(q.get('sort')))
          .skip(Number.isSafeInteger(skip) ? skip : Number.MAX_SAFE_INTEGER)
          .limit(pagination.limit).toArray(),
      ])
      total = count
      pageProducts = products
    }
    const totalPages = Math.ceil(total / pagination.limit)
    return { status: 200, body: {
      products: pageProducts,
      pagination: { ...pagination, total, totalPages,
        hasNextPage: pagination.page < totalPages, hasPreviousPage: pagination.page > 1 },
    } }
  }

  // Existing website callers expect a complete array. Keep that response until
  // the storefront gains its own pagination UI; mobile opts in with page/limit.
  let list = await database.collection('products').find(filter).toArray()
  list = filterProductsByPriceAndAvailability(list, {
    priceRange, availability: q.get('availability'), size: q.get('size') || '',
  })
  const sort = q.get('sort')
  if (sort === 'price_asc') list.sort((a, b) => getProductEffectivePrice(a) - getProductEffectivePrice(b))
  else if (sort === 'price_desc') list.sort((a, b) => getProductEffectivePrice(b) - getProductEffectivePrice(a))
  else if (sort === 'featured') list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
  else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return { status: 200, body: list.map(({ _id, password_hash, ...rest }) => rest) }
}
