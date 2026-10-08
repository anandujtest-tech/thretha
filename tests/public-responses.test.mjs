import test from 'node:test'
import assert from 'node:assert/strict'
import {
  publicSettings, publicProduct, publicCombo, publicProfile, publicAddress,
  publicOrder, publicOrderListItem, validateProfilePatch,
} from '../lib/publicResponses.js'
import { parseAccountOrderPagination, listCustomerOrders } from '../lib/accountOrders.js'
import { getSigningSecret } from '../lib/signingSecret.js'
import { CUSTOMER_COOKIE_NAME, getCustomerFromRequest, signCustomerToken, verifyCustomerToken } from '../lib/auth.js'
import { createMobileSession } from '../lib/mobileSessions.js'
import { findCustomerOrder, findCustomerAddress } from '../lib/customerOwnership.js'

const privateField = 'sensitive_internal_marker'

test('public settings retain storefront fields and exclude nested operational configuration', () => {
  const response = publicSettings({
    id: 'global', brand_name: 'Thretha', whatsapp: '123', low_stock_threshold: 3,
    hero: { title: 'Hello', images: ['/hero.png'], internal: privateField },
    homepage_content: { featured_heading: 'Featured', section_order: ['hero', 'intro'], internal: privateField },
    shipping: { delivery_charge: 0, free_shipping_threshold: 500, secret: privateField },
    instagram_feed: { enabled: true, posts_to_display: 8, last_error_message: privateField, access_token: privateField },
    checkout: { pay_online_enabled: false, internal: privateField },
    shop_by_occasion: { occasions: [{ slug: 'wedding', name: 'Wedding', active: true, product_ids: [privateField] }] },
    browser_notifications: { private_key: privateField },
    cloudinary: { api_secret: privateField },
    operational_notes: privateField,
  })
  assert.equal(response.hero.title, 'Hello')
  assert.equal(response.homepage_content.featured_heading, 'Featured')
  assert.equal(response.shipping.delivery_charge, 0)
  assert.equal(response.shipping.free_shipping_threshold, 500)
  assert.equal(response.instagram_feed.posts_to_display, 8)
  assert.equal(response.checkout.pay_online_enabled, false)
  assert.equal(response.shop_by_occasion.occasions[0].product_ids, undefined)
  assert.equal(JSON.stringify(response).includes(privateField), false)
  for (const field of ['operational_notes', 'cloudinary', 'browser_notifications', 'id']) {
    assert.equal(response[field], undefined)
  }
})

test('product and combo serializers preserve storefront contracts but omit internal fields recursively', () => {
  const product = {
    id: 'p1', slug: 'saree', name: 'Saree', price: 1000, stock: 2,
    original_price: 1100, sizes: [{ size: 'M', stock: 2, available: true, supplier: privateField }],
    media: [{ url: '/image.jpg', type: 'image', is_primary: true, private: privateField }],
    supplier_cost: privateField, internal_note: privateField,
  }
  const publicPiece = publicProduct(product)
  assert.equal(publicPiece.name, 'Saree')
  assert.equal(publicPiece.sizes[0].stock, 2)
  assert.equal(publicPiece.media[0].url, '/image.jpg')
  assert.equal(publicPiece.original_price, 1100)
  assert.equal(JSON.stringify(publicPiece).includes(privateField), false)

  const combo = publicCombo({
    id: 'c1', name: 'Ensemble', combo_price: 1500, stats: { revenue: privateField },
    slots: [{ id: 's1', name: 'Piece', source_type: 'category', product, eligible_products: [product],
      allowed_sizes: product.sizes, excluded_product_ids: [privateField] }],
  })
  assert.equal(combo.slots[0].eligible_products[0].name, 'Saree')
  assert.equal(combo.slots[0].allowed_sizes[0].size, 'M')
  assert.equal(JSON.stringify(combo).includes(privateField), false)
})

test('profile updates allow known fields and reject unknown or unsafe image values', () => {
  assert.deepEqual(validateProfilePatch({ name: ' Buyer ', phone: '123' }).update,
    { name: 'Buyer', phone: '123' })
  assert.equal(validateProfilePatch({ image: 'javascript:alert(1)' }).error !== undefined, true)
  assert.equal(validateProfilePatch({ image: 'https://example.com/image.png' }).error !== undefined, true)
  assert.equal(validateProfilePatch({ image: 'https://res.cloudinary.com/demo/image/upload/picture.png' }).error, undefined)
  assert.equal(validateProfilePatch({ role: 'admin' }).error !== undefined, true)
  assert.equal(validateProfilePatch({ phone: '', password_hash: privateField }).error !== undefined, true)
  const profile = publicProfile({ id: 'u1', email: 'user@example.com', name: 'Buyer', password_hash: privateField })
  assert.equal(profile.id, 'u1')
  assert.equal(JSON.stringify(profile).includes(privateField), false)
})

test('address and order responses expose customer display data without raw ownership/provider records', () => {
  const address = publicAddress({ id: 'a1', userId: privateField, fullName: 'Buyer', postalCode: '123456', internal: privateField })
  assert.deepEqual(address, { id: 'a1', fullName: 'Buyer', postalCode: '123456' })
  const raw = {
    id: 'o1', order_number: 'TC-1', userId: privateField, status: 'PAID',
    total: 500, items: [{ product_name: 'Saree', image: '/image.jpg', quantity: 1, price: 500, supplier: privateField }],
    customer: { name: 'Buyer', city: 'Kochi', internal: privateField },
    payment: { status: 'PAID', cashfree_payment_id: 'customer-reference', session_secret: privateField },
    webhook_payload: privateField,
  }
  assert.equal(publicOrder(raw).customer.city, 'Kochi')
  assert.equal(publicOrderListItem(raw).items[0].image, '/image.jpg')
  assert.equal(JSON.stringify(publicOrder(raw)).includes(privateField), false)
  assert.equal(JSON.stringify(publicOrderListItem(raw)).includes(privateField), false)
})

function orderCollection(rows) {
  const calls = []
  return {
    calls,
    countDocuments: async (filter) => { calls.push(['count', filter]); return rows.filter((row) => row.userId === filter.userId).length },
    find(filter) {
      calls.push(['find', filter])
      let offset = 0; let maximum = Number.MAX_SAFE_INTEGER
      const cursor = {
        sort(value) { calls.push(['sort', value]); return cursor },
        skip(value) { offset = value; calls.push(['skip', value]); return cursor },
        limit(value) { maximum = value; calls.push(['limit', value]); return cursor },
        async toArray() {
          return rows.filter((row) => row.userId === filter.userId)
            .sort((a, b) => b.created_at - a.created_at || b._id - a._id)
            .slice(offset, offset + maximum)
        },
      }
      return cursor
    },
  }
}

test('account orders preserve website array and paginate explicit mobile requests in Mongo', async () => {
  const rows = Array.from({ length: 42 }, (_, i) => ({
    _id: i + 1, id: `o${i + 1}`, userId: i === 41 ? 'other' : 'owner',
    created_at: new Date(2026, 0, Math.floor(i / 2) + 1), total: i,
  }))
  const collection = orderCollection(rows)
  const legacy = await listCustomerOrders(collection, 'owner', parseAccountOrderPagination('https://test/api/account/orders'))
  assert.equal(legacy.orders.length, 41)
  assert.equal(legacy.pagination, undefined)
  const first = await listCustomerOrders(collection, 'owner', parseAccountOrderPagination('https://test/api/account/orders?page=1&limit=20'))
  const last = await listCustomerOrders(collection, 'owner', parseAccountOrderPagination('https://test/api/account/orders?page=3&limit=20'))
  assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 41, totalPages: 3, hasNextPage: true, hasPreviousPage: false })
  assert.equal(last.orders.length, 1)
  assert.equal(last.pagination.hasPreviousPage, true)
  assert.equal(first.orders.every((row) => row.userId === undefined), true)
  assert.equal(collection.calls.some(([operation, value]) => operation === 'skip' && value === 40), true)
  assert.equal(collection.calls.some(([operation, value]) => operation === 'limit' && value === 20), true)
  assert.equal(collection.calls.some(([operation, value]) => operation === 'find' && value.userId === 'owner'), true)
})

test('order pagination bounds invalid values and reports empty/beyond-final pages', async () => {
  const parse = (suffix) => parseAccountOrderPagination(`https://test/api/account/orders?${suffix}`)
  assert.deepEqual(parse('format=paginated'), { page: 1, limit: 20 })
  assert.deepEqual(parse('page=0&limit=0'), { page: 1, limit: 20 })
  assert.deepEqual(parse('page=abc&limit=999'), { page: 1, limit: 50 })
  assert.deepEqual(parse('page=2&limit=1'), { page: 2, limit: 1 })
  const beyond = await listCustomerOrders(orderCollection([{ id: 'o1', userId: 'owner', created_at: new Date() }]), 'owner', parse('page=4&limit=1'))
  assert.equal(beyond.orders.length, 0)
  assert.deepEqual(beyond.pagination, { page: 4, limit: 1, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: true })
  const empty = await listCustomerOrders(orderCollection([]), 'owner', parse('page=1'))
  assert.equal(empty.pagination.total, 0)
  assert.equal(empty.pagination.totalPages, 0)
})

test('account order and address lookups enforce ownership, including guest claim races', async () => {
  const records = [
    { id: 'own', order_number: 'TC-1', userId: 'customer-a', customer: { email: 'a@example.com' } },
    { id: 'other', order_number: 'TC-2', userId: 'customer-b', customer: { email: 'b@example.com' } },
    { id: 'guest', order_number: 'TC-3', userId: null, customer: { email: 'a@example.com' } },
  ]
  const addresses = [
    { id: 'address-a', userId: 'customer-a', fullName: 'A' },
    { id: 'address-b', userId: 'customer-b', fullName: 'B' },
  ]
  const database = { collection(name) {
    if (name === 'orders') return {
      async findOne(filter) { return records.find((row) => filter.$or.some((item) => item.id === row.id || item.order_number === row.order_number || item.order_number?.$regex?.test(row.order_number))) || null },
      async updateOne(filter, update) {
        const record = records.find((row) => row.id === filter.id && !row.userId)
        if (!record) return { matchedCount: 0 }
        Object.assign(record, update.$set)
        return { matchedCount: 1 }
      },
    }
    if (name === 'addresses') return { findOne: async (filter) => addresses.find((row) => row.id === filter.id && row.userId === filter.userId) || null }
    throw new Error('Unexpected collection')
  } }
  const customer = { id: 'customer-a', email: 'a@example.com' }
  assert.equal((await findCustomerOrder(database, 'TC-1', customer)).status, 200)
  assert.equal((await findCustomerOrder(database, 'TC-2', customer)).status, 403)
  assert.equal((await findCustomerOrder(database, 'missing', customer)).status, 404)
  assert.equal((await findCustomerOrder(database, 'TC-3', customer)).status, 403)
  assert.equal((await findCustomerOrder(database, 'TC-3', customer, { claimGuest: true })).status, 200)
  assert.equal(records[2].userId, 'customer-a')
  assert.equal((await findCustomerOrder(database, 'TC-3', { id: 'customer-b', email: 'a@example.com' }, { claimGuest: true })).status, 403)
  assert.equal((await findCustomerAddress(database, 'address-a', customer.id)).fullName, 'A')
  assert.equal(await findCustomerAddress(database, 'address-b', customer.id), null)
})

test('configured signing works and missing production signing fails closed without exposing a value', () => {
  const previous = { nodeEnv: process.env.NODE_ENV, jwt: process.env.JWT_SECRET, auth: process.env.AUTH_SECRET }
  try {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'configured-test-secret-value'
    delete process.env.AUTH_SECRET
    assert.equal(getSigningSecret(), 'configured-test-secret-value')
    assert.equal(getSigningSecret('customer'), 'configured-test-secret-value')
    assert.equal(verifyCustomerToken(signCustomerToken({ id: 'configured-user' })).userId, 'configured-user')
    delete process.env.JWT_SECRET
    assert.throws(() => getSigningSecret(), (error) => {
      assert.equal(error.message.includes('configured-test-secret-value'), false)
      return true
    })
    assert.throws(() => signCustomerToken({ id: 'u1' }), /Signing is not configured/)
    process.env.NODE_ENV = 'test'
    assert.equal(typeof getSigningSecret(), 'string')
    assert.equal(typeof signCustomerToken({ id: 'u1' }), 'string')
  } finally {
    for (const [key, value] of [['NODE_ENV', previous.nodeEnv], ['JWT_SECRET', previous.jwt], ['AUTH_SECRET', previous.auth]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('safe profile responses work for mobile Bearer and website cookie while malformed mobile auth fails', async () => {
  const user = { id: 'u1', name: 'Buyer', email: 'buyer@example.com', status: 'ACTIVE', password_hash: privateField }
  const sessions = []
  const database = { collection(name) {
    if (name === 'users') return { findOne: async ({ id }) => id === user.id ? user : null }
    if (name === 'customer_mobile_sessions') return {
      createIndex: async () => {}, insertOne: async (record) => { sessions.push(record) },
      findOne: async ({ tokenHash }) => sessions.find((record) => record.tokenHash === tokenHash) || null,
      updateOne: async () => ({ matchedCount: 1 }),
    }
    throw new Error('Unexpected collection')
  } }
  const session = await createMobileSession(database, user.id)
  const mobile = new Request('https://test/api/account/profile', { headers: { Authorization: `Bearer ${session.accessToken}` } })
  const cookie = `${CUSTOMER_COOKIE_NAME}=${signCustomerToken(user)}`
  const website = new Request('https://test/api/account/profile', { headers: { Cookie: cookie } })
  assert.equal(publicProfile(await getCustomerFromRequest(mobile, database)).id, 'u1')
  assert.equal(publicProfile(await getCustomerFromRequest(website, database)).id, 'u1')
  const malformed = new Request('https://test/api/account/profile', { headers: { Authorization: 'Bearer tcm_bad', Cookie: cookie } })
  assert.equal(await getCustomerFromRequest(malformed, database), null)
})
