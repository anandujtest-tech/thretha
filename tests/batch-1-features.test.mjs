import test from 'node:test'
import assert from 'node:assert/strict'
import { processAbandonedCartReminders, getCartRecoveryItems, createCartRecoveryToken, verifyCartRecoveryToken } from '../lib/abandonedCart.js'
import { processBackInStockSubscriptions, isVariantAvailable, saveBackInStockSubscription, unsubscribeBackInStockSubscription, backInStockUnsubscribeToken, verifyBackInStockUnsubscribeToken, createBackInStockUnsubscribeToken, verifySignedBackInStockUnsubscribeToken } from '../lib/backInStock.js'
import { getProductAvailableStock, getProductEffectivePrice, isProductVariantAvailable } from '../lib/productInventory.js'
import { filterProductsByPriceAndAvailability, parsePriceRange, escapeSearchTerm, normalizeSearchTerm } from '../lib/catalogFilters.js'
import { ANALYTICS_DEDUPE_WINDOWS, allowAnalyticsRequest, createAnalyticsDedupeKey, reserveAnalyticsDedupe, validateAnalyticsEntity, validateAnalyticsPayload } from '../lib/analyticsProtection.js'
import { orderProductsByRequestedSlugs } from '../lib/recentlyViewed.js'
import { checkRateLimit } from '../lib/auth.js'
import { createNewsletterUnsubscribeToken, verifyNewsletterUnsubscribeToken, normalizeNewsletterEmail, isValidNewsletterEmail } from '../lib/newsletter.js'

const now = new Date('2026-10-07T10:00:00.000Z')

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object)
}

function conditionMatches(value, condition, exists = value !== undefined) {
  if (condition && typeof condition === 'object' && !Array.isArray(condition) && Object.keys(condition).some((key) => key.startsWith('$'))) {
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === '$exists') return exists === expected
      if (operator === '$in') return Array.isArray(value) ? value.some((entry) => expected.includes(entry)) : expected.includes(value)
      if (operator === '$nin') return Array.isArray(value) ? !value.some((entry) => expected.includes(entry)) : !expected.includes(value)
      if (operator === '$ne') return value !== expected
      if (operator === '$lte') return value <= expected
      if (operator === '$gte') return value >= expected
      if (operator === '$lt') return value < expected
      if (operator === '$regex') return expected.test(String(value || ''))
      return false
    })
  }
  if (Array.isArray(value)) return value.includes(condition)
  return value === condition
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some((part) => matches(document, part))
    if (key === '$and') return condition.every((part) => matches(document, part))
    const value = valueAt(document, key)
    if (key.includes('.') && Array.isArray(valueAt(document, key.split('.').slice(0, -1).join('.')))) {
      const parent = valueAt(document, key.split('.').slice(0, -1).join('.'))
      return parent.some((item) => conditionMatches(item[key.split('.').at(-1)], condition))
    }
    return conditionMatches(value, condition, value !== undefined)
  })
}

class MemoryCollection {
  constructor(documents = []) { this.documents = documents }
  async createIndex() { return 'memory_index' }
  findOne(filter) { return Promise.resolve(this.documents.find((doc) => matches(doc, filter)) || null) }
  find(filter) {
    let found = this.documents.filter((doc) => matches(doc, filter))
    const cursor = {
      sort: (spec) => { const [[field, direction]] = Object.entries(spec); found = found.sort((a, b) => ((valueAt(a, field) || 0) > (valueAt(b, field) || 0) ? direction : -direction)); return cursor },
      limit: (count) => { found = found.slice(0, count); return cursor },
      toArray: async () => [...found],
    }
    return cursor
  }
  async updateOne(filter, update) {
    const document = this.documents.find((doc) => matches(doc, filter))
    if (!document) return { matchedCount: 0, modifiedCount: 0 }
    this.apply(document, update)
    return { matchedCount: 1, modifiedCount: 1 }
  }
  async updateMany(filter, update) {
    let modifiedCount = 0
    for (const document of this.documents.filter((doc) => matches(doc, filter))) { this.apply(document, update); modifiedCount += 1 }
    return { modifiedCount }
  }
  apply(document, update) {
    for (const [key, value] of Object.entries(update.$set || {})) document[key] = value
    for (const key of Object.keys(update.$unset || {})) delete document[key]
  }
  async countDocuments(filter) { return this.documents.filter((doc) => matches(doc, filter)).length }
  async insertOne(document) { this.documents.push(document); return { insertedId: document.id } }
}

function memoryDb({ reminders = [], subscriptions = [], products = [], orders = [] } = {}) {
  const collections = {
    abandoned_cart_reminders: new MemoryCollection(reminders),
    back_in_stock_subscriptions: new MemoryCollection(subscriptions),
    products: new MemoryCollection(products),
    orders: new MemoryCollection(orders),
  }
  return { collection: (name) => collections[name] || (collections[name] = new MemoryCollection()), collections }
}

const liveProduct = (overrides = {}) => ({ id: 'p1', slug: 'saree-one', name: 'Saree One', active: true, stock: 2, price: 3000, media: [{ url: 'https://res.cloudinary.com/test/image/upload/p1.jpg', is_primary: true }], sizes: [{ size: 'S', available: true, stock: 1 }, { size: 'M', available: true, stock: 1 }], ...overrides })
const reminder = (overrides = {}) => ({ id: 'r1', email: 'buyer@example.com', email_normalized: 'buyer@example.com', items: [{ id: 'p1', name: 'Saree One', path: '/product/saree-one', size: 'S', quantity: 1 }], created_at: new Date(now.getTime() - 3 * 3600_000), remind_after: new Date(now.getTime() - 3600_000), status: 'pending', ...overrides })
const subscription = (overrides = {}) => ({ id: 's1', product_id: 'p1', email: 'buyer@example.com', size: 'S', variant_key: 's', status: 'waiting', created_at: new Date(now.getTime() - 86400_000), ...overrides })

test('price filters validate all requested range cases', () => {
  assert.deepEqual(parsePriceRange('100', null).filter, { $gte: 100 })
  assert.deepEqual(parsePriceRange(null, '500').filter, { $lte: 500 })
  assert.deepEqual(parsePriceRange('100', '500').filter, { $gte: 100, $lte: 500 })
  assert.deepEqual(parsePriceRange('0', null).filter, { $gte: 0 })
  assert.equal(parsePriceRange('500', '100').valid, false)
  assert.equal(parsePriceRange('-1', null).valid, false)
  assert.equal(parsePriceRange('abc', null).valid, false)
  assert.equal(parsePriceRange('1e309', null).valid, false)
})

test('customer price filtering matches effective sale price for min/max/range and regular prices', () => {
  const products = [
    { id: 'regular', price: 1200 },
    { id: 'sale', price: 1800, discount_price: 900 },
    { id: 'sale-above-min', price: 2400, discount_price: 1600 },
  ]
  const run = (min, max) => filterProductsByPriceAndAvailability(products, { priceRange: parsePriceRange(min, max) }).map((item) => item.id)
  assert.deepEqual(run('1000', null), ['regular', 'sale-above-min'])
  assert.deepEqual(run(null, '1000'), ['sale'])
  assert.deepEqual(run('850', '1300'), ['regular', 'sale'])
  assert.deepEqual(run('0', null), ['regular', 'sale', 'sale-above-min'])
  assert.equal(filterProductsByPriceAndAvailability(products, { priceRange: parsePriceRange('1000', null) }).includes(products[1]), false)
  assert.equal(getProductEffectivePrice(products[1]), 900)
})

test('search treats regex punctuation literally and caps excessively long input', () => {
  const sample = 'dress .*+?[](){}^$| with spaces'
  const regex = new RegExp(escapeSearchTerm(sample), 'i')
  assert.equal(regex.test(sample), true)
  assert.equal(regex.test('dress anything with spaces'), false)
  assert.equal(normalizeSearchTerm(`  ${'x'.repeat(200)}  `).length, 80)
  assert.equal(normalizeSearchTerm('  hand woven  '), 'hand woven')
})

test('recently viewed ordering follows local recency, excludes current/inactive and deduplicates', () => {
  const requested = ['A', 'B', 'C', 'D', 'A', 'CURRENT']
  const result = orderProductsByRequestedSlugs(requested, [
    { id: '4', slug: 'D', active: true }, { id: '2', slug: 'B', active: true },
    { id: 'x', slug: 'X', active: true }, { id: '3', slug: 'C', active: false },
    { id: '1', slug: 'A', active: true }, { id: 'current', slug: 'CURRENT', active: true },
  ], 'current')
  assert.deepEqual(result.map((product) => product.slug), ['A', 'B', 'D'])
})

test('variant stock is authoritative for selected sizes', () => {
  const product = liveProduct({ stock: 0, sizes: [{ size: 'S', available: true, stock: 0 }, { size: 'M', available: true, stock: 3 }] })
  assert.equal(getProductAvailableStock(product, 'M'), 3)
  assert.equal(isVariantAvailable(product, 'M'), true)
  assert.equal(isVariantAvailable(product, 'S'), false)
  assert.equal(isVariantAvailable(product, 'L'), false)
})

test('availability filters follow purchasable global and size-level inventory', () => {
  const products = [
    { id: 'global-and-variant', stock: 4, sizes: [{ size: 'S', available: true, stock: 2 }] },
    { id: 'variant-without-global-stock', stock: 0, sizes: [{ size: 'M', available: true, stock: 3 }] },
    { id: 'zero-stock', stock: 0, sizes: [{ size: 'S', available: false, stock: 0 }] },
    { id: 'all-unavailable', stock: 5, sizes: [{ size: 'S', available: false, stock: 0 }, { size: 'M', available: false, stock: 0 }] },
    { id: 'one-available', stock: 5, sizes: [{ size: 'S', available: false, stock: 0 }, { size: 'M', available: true, stock: 1 }] },
    { id: 'unsized', stock: 2 },
    { id: 'malformed', stock: 'not-a-number', sizes: [{ size: 'S', available: true, stock: 'bad' }] },
  ]
  const inStock = filterProductsByPriceAndAvailability(products, { availability: 'in' }).map((item) => item.id)
  assert.deepEqual(inStock, ['global-and-variant', 'variant-without-global-stock', 'one-available', 'unsized'])
  assert.deepEqual(filterProductsByPriceAndAvailability(products, { availability: 'in', size: 'S' }).map((item) => item.id), ['global-and-variant'])
  assert.deepEqual(filterProductsByPriceAndAvailability(products, { size: 'M' }).map((item) => item.id), ['variant-without-global-stock', 'one-available'])
  assert.deepEqual(filterProductsByPriceAndAvailability(products, { size: 'Free Size' }).map((item) => item.id), ['unsized'])
  assert.equal(isProductVariantAvailable(products[2]), false)
  assert.equal(isProductVariantAvailable(products[4]), true)
  assert.equal(getProductAvailableStock(products[6], 'S'), 0)
})

test('shared rate limiting accepts allowed requests through the MongoDB 6 result shape', async () => {
  const rows = new Map()
  const collection = {
    findOne: async ({ key }) => rows.get(key) ?? null,
    updateOne: async ({ key }, update) => { rows.set(key, { key, ...update.$set }) },
    findOneAndUpdate: async ({ key }, update, options) => {
      assert.equal(options.includeResultMetadata, true)
      const row = rows.get(key)
      row.count += update.$inc.count
      return { value: { ...row } }
    },
  }
  const database = { collection: () => collection }
  assert.equal((await checkRateLimit(database, 'analytics-test', 3, 15)).allowed, true)
  assert.equal((await checkRateLimit(database, 'analytics-test', 3, 15)).allowed, true)
  assert.equal((await checkRateLimit(database, 'analytics-test', 3, 15)).allowed, true)
  assert.equal((await checkRateLimit(database, 'analytics-test', 3, 15)).allowed, false)
})

test('analytics validates event payloads and derives stable, scoped dedupe windows', async () => {
  const eventNames = new Set(['page_view', 'category_view', 'product_view', 'checkout_started', 'quick_view', 'add_to_cart', 'remove_from_cart', 'search_performed', 'location_shared'])
  const clientEvents = new Set(['quick_view', 'add_to_cart', 'checkout_started', 'remove_from_cart', 'search_performed', 'location_shared'])
  const valid = { visitor_id: 'visitor-1', session_id: 'session-1', page: '/product/saree-one', product_slug: 'saree-one' }
  assert.equal(validateAnalyticsPayload(valid, 'product_view', { eventNames, clientEventNames: new Set(['product_view']) }).valid, true)
  assert.equal(validateAnalyticsPayload({ ...valid, product_slug: '.*' }, 'product_view', { eventNames }).valid, false)
  assert.equal(validateAnalyticsPayload({ ...valid, timestamp: '2001-01-01' }, 'product_view', { eventNames }).valid, false)
  assert.equal(validateAnalyticsPayload(valid, 'arbitrary_event', { eventNames }).valid, false)
  assert.equal(validateAnalyticsPayload({ ...valid, product_slug: 'missing-product' }, 'product_view', { eventNames }).valid, true)
  const visitEvents = new Set(['page_view', 'category_view', 'product_view', 'checkout_started'])
  assert.equal(validateAnalyticsPayload({ visitor_id: 'visitor-1', session_id: 'session-1', page: '/checkout' }, 'checkout_started', { eventNames, clientEventNames: visitEvents }).valid, true)
  assert.equal(validateAnalyticsPayload({ visitor_id: 'visitor-1', session_id: 'session-1', page: '/checkout' }, 'checkout_started', { eventNames, clientEventNames: clientEvents, requiredProductEvents: new Set(['checkout_started']) }).valid, false)
  assert.equal(validateAnalyticsPayload({ visitor_id: 'visitor-1', session_id: 'session-1', page: '/', latitude: 12, longitude: 12 }, 'location_shared', { eventNames }).valid, false)
  const entityDb = memoryDb({ products: [liveProduct()], })
  entityDb.collections.products.documents[0].slug = 'saree-one'
  entityDb.collection('categories').documents.push({ slug: 'sarees', active: true })
  entityDb.collection('combos').documents.push({ slug: 'wedding-set', active: true })
  assert.equal((await validateAnalyticsEntity(entityDb, 'product_view', 'saree-one')).valid, true)
  assert.equal((await validateAnalyticsEntity(entityDb, 'product_view', 'missing-product')).valid, false)
  assert.equal((await validateAnalyticsEntity(entityDb, 'search_performed', 'valid-looking-missing-product')).valid, false)
  assert.equal((await validateAnalyticsEntity(entityDb, 'add_to_cart', 'wedding-set')).valid, true)
  assert.equal((await validateAnalyticsEntity(entityDb, 'quick_view', 'wedding-set')).valid, false)
  assert.equal((await validateAnalyticsEntity(entityDb, 'category_view', null, 'missing-category')).valid, false)
  assert.equal((await validateAnalyticsEntity(entityDb, 'category_view', null, 'sarees')).valid, true)

  const start = Math.floor(now.getTime() / ANALYTICS_DEDUPE_WINDOWS.product_view) * ANALYTICS_DEDUPE_WINDOWS.product_view
  const key = createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'product_view', entitySlug: 'saree-one', now: start + 1000 })
  assert.equal(createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'product_view', entitySlug: 'saree-one', now: start + 20_000 }), key)
  assert.notEqual(createAnalyticsDedupeKey({ visitorId: 'visitor-2', sessionId: 'session-1', eventName: 'product_view', entitySlug: 'saree-one', now: start + 1000 }), key)
  assert.notEqual(createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'product_view', entitySlug: 'saree-one', now: start + ANALYTICS_DEDUPE_WINDOWS.product_view }), key)
  assert.notEqual(createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'add_to_cart', entitySlug: 'saree-one', now: start + 1000 }), key)
  const addKey = createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'add_to_cart', entitySlug: 'saree-one', now: start + 1000 })
  assert.equal(createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'add_to_cart', entitySlug: 'saree-one', now: start + 5000 }), addKey)
  assert.notEqual(createAnalyticsDedupeKey({ visitorId: 'visitor-1', sessionId: 'session-1', eventName: 'add_to_cart', entitySlug: 'saree-one', now: start + 11_000 }), addKey)

  const rateCalls = new Map()
  const rateLimit = async (_db, keyName, maximum) => {
    const count = (rateCalls.get(keyName) || 0) + 1
    rateCalls.set(keyName, count)
    return { allowed: count <= maximum }
  }
  const database = { collection: () => ({}) }
  assert.equal((await allowAnalyticsRequest({ database, ip: '203.0.113.1', visitorId: 'visitor-1', checkRateLimit: rateLimit })).allowed, true)
  assert.equal((await allowAnalyticsRequest({ database, ip: '203.0.113.1', visitorId: 'visitor-2', checkRateLimit: rateLimit })).allowed, true)
  const abuseCounts = new Map()
  const boundedRateLimit = async (_db, keyName, maximum) => {
    const count = (abuseCounts.get(keyName) || 0) + 1
    abuseCounts.set(keyName, count)
    return { allowed: count <= maximum }
  }
  let finalVisitorResult
  for (let i = 0; i < 241; i += 1) finalVisitorResult = await allowAnalyticsRequest({ database, ip: '203.0.113.2', visitorId: 'repeating-visitor', checkRateLimit: boundedRateLimit })
  assert.equal(finalVisitorResult.allowed, false)

  const uniqueRows = new Set()
  const dedupeDb = { collection: () => ({ insertOne: async (row) => { if (uniqueRows.has(row.key)) { const error = new Error('duplicate'); error.code = 11000; throw error }; uniqueRows.add(row.key) } }) }
  const dedupeResults = await Promise.all([
    reserveAnalyticsDedupe(dedupeDb, key, new Date(start + 100_000)),
    reserveAnalyticsDedupe(dedupeDb, key, new Date(start + 100_000)),
  ])
  assert.deepEqual(dedupeResults.sort(), [false, true])
})

test('back-in-stock consent is required before writes and unsubscribe is signed, expiring, scoped, and idempotent', async () => {
  const db = memoryDb()
  const product = liveProduct({ stock: 0, sizes: [{ size: 'S', available: false, stock: 0 }] })
  assert.equal((await saveBackInStockSubscription(db, { product, email: 'buyer@example.com', size: 'S' })).status, 400)
  assert.equal((await saveBackInStockSubscription(db, { product, email: 'buyer@example.com', size: 'S', consent: false })).status, 400)
  assert.equal(db.collections.back_in_stock_subscriptions.documents.length, 0)
  const saved = await saveBackInStockSubscription(db, { product, email: 'buyer@example.com', size: 'S', consent: true, now })
  assert.equal(saved.ok, true)
  assert.equal(db.collections.back_in_stock_subscriptions.documents.length, 1)
  const duplicate = await saveBackInStockSubscription(db, { product, email: 'buyer@example.com', size: 'S', consent: true, now })
  assert.equal(duplicate.id, saved.id)
  assert.equal(db.collections.back_in_stock_subscriptions.documents.length, 1)

  const token = createBackInStockUnsubscribeToken(saved.id, 'secret', now.getTime())
  assert.equal(verifySignedBackInStockUnsubscribeToken(token, 'secret', now.getTime() + 1000), saved.id)
  assert.equal(verifySignedBackInStockUnsubscribeToken(token, 'wrong-secret', now.getTime()), null)
  assert.equal(verifySignedBackInStockUnsubscribeToken(token, 'secret', now.getTime() + 366 * 86400_000), null)
  assert.notEqual(verifyBackInStockUnsubscribeToken(token, 'secret'), saved.id)
  const legacyAbandonedCartToken = backInStockUnsubscribeToken(saved.id, 'secret')
  assert.equal(verifyBackInStockUnsubscribeToken(legacyAbandonedCartToken, 'secret'), saved.id)
  assert.deepEqual(await unsubscribeBackInStockSubscription(db, saved.id, now), { found: true, unsubscribed: true })
  assert.equal(db.collections.back_in_stock_subscriptions.documents[0].status, 'unsubscribed')
  assert.deepEqual(await unsubscribeBackInStockSubscription(db, saved.id, now), { found: true, unsubscribed: true })
  assert.deepEqual(await unsubscribeBackInStockSubscription(db, 'missing', now), { found: false, unsubscribed: false })
})

test('back-in-stock worker only sends matching available size and handles inactive/deleted products', async () => {
  const db = memoryDb({
    subscriptions: [subscription({ id: 's-m', size: 'M', variant_key: 'm' }), subscription({ id: 's-s' }), subscription({ id: 's-deleted', product_id: 'missing' }), subscription({ id: 's-inactive', product_id: 'inactive' }), subscription({ id: 's-unsub', status: 'unsubscribed' })],
    products: [liveProduct({ stock: 0, sizes: [{ size: 'S', available: true, stock: 0 }, { size: 'M', available: true, stock: 2 }] }), liveProduct({ id: 'inactive', active: false })],
  })
  const sent = []
  const result = await processBackInStockSubscriptions(db, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async (message) => sent.push(message) })
  assert.equal(result.notified, 1)
  assert.equal(sent.length, 1)
  assert.match(sent[0].subject, /Saree One/)
  assert.match(sent[0].text, /size M/)
  assert.equal(db.collections.back_in_stock_subscriptions.documents.find((item) => item.id === 's-m').status, 'notified')
  assert.equal(db.collections.back_in_stock_subscriptions.documents.find((item) => item.id === 's-s').status, 'waiting')
  assert.equal(db.collections.back_in_stock_subscriptions.documents.find((item) => item.id === 's-deleted').status, 'unavailable')
  assert.equal(db.collections.back_in_stock_subscriptions.documents.find((item) => item.id === 's-inactive').status, 'unavailable')
  assert.equal(db.collections.back_in_stock_subscriptions.documents.find((item) => item.id === 's-unsub').status, 'unsubscribed')
})

test('back-in-stock failures retry with a bound and concurrent workers claim once', async () => {
  const terminalDb = memoryDb({ subscriptions: [subscription({ attempts: 4 })], products: [liveProduct()] })
  await processBackInStockSubscriptions(terminalDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async () => { throw new Error('temporary provider failure') } })
  assert.equal(terminalDb.collections.back_in_stock_subscriptions.documents[0].status, 'failed')
  assert.equal(terminalDb.collections.back_in_stock_subscriptions.documents[0].attempts, 5)

  const concurrentDb = memoryDb({ subscriptions: [subscription()], products: [liveProduct()] })
  let deliveries = 0
  const sendEmailFn = async () => { deliveries += 1; await new Promise((resolve) => setTimeout(resolve, 5)) }
  await Promise.all([1, 2].map(() => processBackInStockSubscriptions(concurrentDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn })))
  assert.equal(deliveries, 1)
})

test('abandoned-cart only treats successful, non-cancelled orders as conversions', async (t) => {
  for (const order of [
    { payment_status: 'PENDING', status: 'NEW' },
    { payment_status: 'FAILED', status: 'NEW' },
    { payment_status: 'CANCELLED', status: 'CANCELLED' },
  ]) {
    await t.test(`${order.payment_status}/${order.status} does not suppress`, async () => {
      const db = memoryDb({ reminders: [reminder()], products: [liveProduct()], orders: [{ ...order, created_at: now, customer: { email: 'buyer@example.com' }, items: [{ product_id: 'p1' }] }] })
      let sends = 0
      await processAbandonedCartReminders(db, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async () => { sends += 1 } })
      assert.equal(sends, 1)
    })
  }
  const db = memoryDb({ reminders: [reminder()], products: [liveProduct()], orders: [{ payment_status: 'PAID', status: 'CONFIRMED', created_at: now, customer: { email: 'buyer@example.com' }, items: [{ product_id: 'p1' }] }] })
  let sends = 0
  const result = await processAbandonedCartReminders(db, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async () => { sends += 1 } })
  assert.equal(result.skippedPurchased, 1)
  assert.equal(sends, 0)
})

test('abandoned-cart filters unavailable products/variants and does not mail an empty cart', async () => {
  const partialDb = memoryDb({ reminders: [reminder({ items: [
    { id: 'p1', name: 'One', size: 'S', quantity: 1 },
    { id: 'p2', name: 'Two', size: 'Free Size', quantity: 1 },
    { id: 'p3', name: 'Three', size: 'S', quantity: 1 },
  ] })], products: [liveProduct({ stock: 0, sizes: [{ size: 'S', available: true, stock: 2 }] }), liveProduct({ id: 'p2', active: false }), liveProduct({ id: 'p3', sizes: [{ size: 'M', available: true, stock: 1 }] })] })
  let message
  await processAbandonedCartReminders(partialDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async (value) => { message = value } })
  assert.match(message.text, /One/)
  assert.doesNotMatch(message.text, /Two|Three/)
  assert.match(message.text, /cart\/recover\?token=/)
  assert.match(message.idempotencyKey, /^abandoned-cart\//)

  const emptyDb = memoryDb({ reminders: [reminder()], products: [liveProduct({ active: false })] })
  let sends = 0
  await processAbandonedCartReminders(emptyDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async () => { sends += 1 } })
  assert.equal(sends, 0)
  assert.equal(emptyDb.collections.abandoned_cart_reminders.documents[0].status, 'unavailable')
})

test('abandoned-cart retries are bounded and concurrent workers claim once', async () => {
  const retryDb = memoryDb({ reminders: [reminder({ attempts: 1 })], products: [liveProduct()] })
  await processAbandonedCartReminders(retryDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async () => { throw new Error('temporary') } })
  assert.equal(retryDb.collections.abandoned_cart_reminders.documents[0].status, 'pending')
  assert.equal(retryDb.collections.abandoned_cart_reminders.documents[0].attempts, 2)
  const terminalDb = memoryDb({ reminders: [reminder({ attempts: 4 })], products: [liveProduct()] })
  await processAbandonedCartReminders(terminalDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn: async () => { throw new Error('temporary') } })
  assert.equal(terminalDb.collections.abandoned_cart_reminders.documents[0].status, 'failed')

  const concurrentDb = memoryDb({ reminders: [reminder()], products: [liveProduct()] })
  let deliveries = 0
  const sendEmailFn = async () => { deliveries += 1; await new Promise((resolve) => setTimeout(resolve, 5)) }
  await Promise.all([1, 2].map(() => processAbandonedCartReminders(concurrentDb, { appUrl: 'https://www.thretha.in', secret: 'test-secret', nowFn: () => new Date(now), sendEmailFn })))
  assert.equal(deliveries, 1)
})

test('signed newsletter and cart tokens expire, validate purpose, and do not encode email', () => {
  const newsletter = createNewsletterUnsubscribeToken('sub-123', 'secret', now.getTime())
  assert.equal(verifyNewsletterUnsubscribeToken(newsletter, 'secret', now.getTime() + 1000), 'sub-123')
  assert.equal(verifyNewsletterUnsubscribeToken(newsletter, 'wrong-secret', now.getTime()), null)
  assert.equal(verifyNewsletterUnsubscribeToken(newsletter, 'secret', now.getTime() + 366 * 86400_000), null)
  assert.equal(normalizeNewsletterEmail('  Buyer@Example.COM '), 'buyer@example.com')
  assert.equal(isValidNewsletterEmail('buyer@example.com'), true)
  assert.equal(isValidNewsletterEmail('not-an-email'), false)
  const recovery = createCartRecoveryToken('rem-uuid', 'secret', now)
  assert.equal(verifyCartRecoveryToken(recovery, 'secret', now.getTime() + 1000), 'rem-uuid')
  assert.equal(verifyCartRecoveryToken(recovery, 'secret', now.getTime() + 31 * 86400_000), null)
  assert.equal(recovery.includes('buyer@example.com'), false)
})

test('cart recovery returns only live purchasable server-resolved product data', async () => {
  const db = memoryDb({ reminders: [reminder({ status: 'sent' })], products: [liveProduct()] })
  const items = await getCartRecoveryItems(db, 'r1')
  assert.equal(items.length, 1)
  assert.equal(items[0].product_id, 'p1')
  assert.equal(items[0].price, 3000)
  assert.equal(items[0].size, 'S')
  assert.equal(items[0].quantity, 1)
})
