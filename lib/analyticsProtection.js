import crypto from 'crypto'

export const ANALYTICS_DEDUPE_WINDOWS = Object.freeze({
  product_view: 30 * 60 * 1000,
  add_to_cart: 10 * 1000,
  checkout_started: 30 * 60 * 1000,
})
export const ANALYTICS_RATE_LIMITS = Object.freeze({ ip: { attempts: 600, minutes: 15 }, visitor: { attempts: 240, minutes: 15 } })

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/

export function isValidAnalyticsSlug(value) {
  return typeof value === 'string' && value.length <= 100 && SLUG_PATTERN.test(value)
}

export function validateAnalyticsPayload(body, requestedEvent, { eventNames, clientEventNames, requiredProductEvents = new Set() }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { valid: false, error: 'Invalid analytics payload.' }
  if (Object.hasOwn(body, 'timestamp') || Object.hasOwn(body, 'created_at')) {
    return { valid: false, error: 'Client timestamps are not accepted.' }
  }
  if (typeof requestedEvent !== 'string' || !eventNames.has(requestedEvent)) {
    return { valid: false, error: 'Unsupported analytics event.' }
  }
  if (clientEventNames && !clientEventNames.has(requestedEvent)) {
    return { valid: false, error: 'Unsupported page event.' }
  }
  if (typeof body.visitor_id !== 'string' || !VISITOR_ID_PATTERN.test(body.visitor_id)) {
    return { valid: false, error: 'Invalid visitor identifier.' }
  }
  if (body.session_id !== undefined && (typeof body.session_id !== 'string' || !VISITOR_ID_PATTERN.test(body.session_id))) {
    return { valid: false, error: 'Invalid visitor session.' }
  }
  if (body.page !== undefined && (typeof body.page !== 'string' || body.page.length > 500 || !body.page.startsWith('/') || body.page.startsWith('//'))) {
    return { valid: false, error: 'Invalid analytics page.' }
  }

  const productEvents = new Set(['product_view', 'quick_view', 'add_to_cart', 'remove_from_cart', ...requiredProductEvents])
  if (productEvents.has(requestedEvent) && !isValidAnalyticsSlug(body.product_slug)) {
    return { valid: false, error: 'A valid product identifier is required for this event.' }
  }
  if (body.product_slug !== undefined && body.product_slug !== null && !isValidAnalyticsSlug(body.product_slug)) {
    return { valid: false, error: 'Invalid product identifier.' }
  }
  if (requestedEvent === 'category_view' && !isValidAnalyticsSlug(body.category_slug)) {
    return { valid: false, error: 'A valid category identifier is required for this event.' }
  }
  if (body.category_slug !== undefined && body.category_slug !== null && !isValidAnalyticsSlug(body.category_slug)) {
    return { valid: false, error: 'Invalid category identifier.' }
  }
  if (requestedEvent === 'location_shared') {
    if (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90 ||
        !Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180) {
      return { valid: false, error: 'Invalid location event.' }
    }
    if (body.location_permission !== 'granted') return { valid: false, error: 'A location event requires explicit browser permission.' }
  }
  if (body.first_touch !== undefined && (!body.first_touch || typeof body.first_touch !== 'object' || Array.isArray(body.first_touch))) {
    return { valid: false, error: 'Invalid analytics attribution data.' }
  }
  return { valid: true }
}

export async function validateAnalyticsEntity(database, eventName, productSlug, categorySlug) {
  if (productSlug) {
    const product = await database.collection('products').findOne(
      { slug: productSlug, active: { $ne: false } },
      { projection: { _id: 1 } },
    )
    if (!product && ['add_to_cart', 'remove_from_cart', 'checkout_started'].includes(eventName)) {
      const combo = await database.collection('combos').findOne(
        { slug: productSlug, active: { $ne: false } },
        { projection: { _id: 1 } },
      )
      if (combo) return { valid: true }
    }
    if (!product) return { valid: false, error: 'Product not found.' }
  }
  if (categorySlug) {
    const category = await database.collection('categories').findOne(
      { slug: categorySlug, active: true },
      { projection: { _id: 1 } },
    )
    if (!category) return { valid: false, error: 'Category not found.' }
  }
  return { valid: true }
}

export function createAnalyticsDedupeKey({ visitorId, sessionId, eventName, entitySlug, now = Date.now() }) {
  const windowMs = ANALYTICS_DEDUPE_WINDOWS[eventName]
  if (!windowMs || !visitorId || !sessionId || !entitySlug) return null
  const window = Math.floor(Number(now) / windowMs)
  return crypto.createHash('sha256')
    .update(`${visitorId}\n${sessionId}\n${eventName}\n${entitySlug}\n${window}`)
    .digest('hex')
}

export async function allowAnalyticsRequest({ database, ip, visitorId, checkRateLimit }) {
  const ipKey = crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex')
  const visitorKey = crypto.createHash('sha256').update(String(visitorId || '')).digest('hex')
  const [ipResult, visitorResult] = await Promise.all([
    checkRateLimit(database, `analytics:ip:${ipKey}`, ANALYTICS_RATE_LIMITS.ip.attempts, ANALYTICS_RATE_LIMITS.ip.minutes),
    checkRateLimit(database, `analytics:visitor:${visitorKey}`, ANALYTICS_RATE_LIMITS.visitor.attempts, ANALYTICS_RATE_LIMITS.visitor.minutes),
  ])
  return { allowed: ipResult.allowed && visitorResult.allowed }
}

export async function reserveAnalyticsDedupe(database, key, expiresAt) {
  try {
    await database.collection('visitor_event_deduplication').insertOne({ key, expires_at: expiresAt, created_at: new Date() })
    return true
  } catch (error) {
    if (error?.code === 11000) return false
    throw error
  }
}
