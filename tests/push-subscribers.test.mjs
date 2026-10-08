import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongodb'
import { adminPushSubscriber, pushDeviceFromUserAgent, pushSubscriberPipeline } from '../lib/pushSubscribers.js'

const secret = 'push-subscriber-test-secret'
const token = (role) => jwt.sign({ id: role, role }, secret)
const subscription = (id, customer_id, active = true) => ({
  _id: new ObjectId(id.padStart(24, '0')),
  customer_id, active, created_at: new Date('2026-10-07T10:00:00Z'),
  browser: 'Chrome', platform: 'Android', device_type: 'mobile',
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: 'private-push-key', auth: 'private-auth-key' },
})
const customers = [
  { id: 'customer-a', name: 'Customer A', email: 'customer.a@example.com', phone: '9876543210' },
  { id: 'customer-b', name: 'Customer B', email: 'customer.b@example.com' },
]

function fixture() {
  const documents = [subscription('1', 'customer-a'), subscription('2', 'customer-a'), subscription('3', 'customer-b'), subscription('4', null)]
  const otherData = { customer: { id: 'customer-a' }, newsletter: { status: 'active' }, campaigns: [{ id: 'campaign-1' }] }
  const collection = {
    aggregate(pipeline) {
      let items = documents.map((item) => ({ ...item, customer: customers.find((user) => user.id === item.customer_id) }))
      for (const stage of pipeline) {
        const filter = stage.$match
        if (!filter) continue
        if (filter.active === true) items = items.filter((item) => item.active === true)
        if (filter.active?.$ne === true) items = items.filter((item) => item.active !== true)
        if (filter['customer.id']?.$exists === true) items = items.filter((item) => Boolean(item.customer?.id))
        if (filter['customer.id']?.$exists === false) items = items.filter((item) => !item.customer?.id)
        if (filter.$or) {
          const search = new RegExp(filter.$or[0]['customer.name'].$regex, 'i')
          items = items.filter((item) => item.customer && [item.customer.name, item.customer.email, item.customer.phone].some((value) => search.test(value || '')))
        }
      }
      const facet = pipeline.at(-1).$facet
      const skip = facet.items.find((stage) => '$skip' in stage).$skip
      const limit = facet.items.find((stage) => '$limit' in stage).$limit
      return { toArray: async () => [{ items: items.slice(skip, skip + limit), count: items.length ? [{ total: items.length }] : [] }] }
    },
    async updateOne(filter, update) {
      const item = documents.find((row) => row._id.equals(filter._id) && row.active === filter.active)
      if (!item) return { matchedCount: 0 }
      Object.assign(item, update.$set)
      return { matchedCount: 1 }
    },
    async findOne(filter) { return documents.find((row) => row._id.equals(filter._id)) || null },
  }
  return { documents, otherData, collection: () => collection }
}

function routeHarness() {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const start = source.indexOf("    if (route === '/admin/push/subscribers' && method === 'GET')")
  const end = source.indexOf("    if (route === '/admin/push/settings' && method === 'PUT')", start)
  assert.ok(start > 0 && end > start)
  const authHelpers = source.slice(source.indexOf('function getToken('), source.indexOf('const VISITOR_EVENT_NAMES'))
  const context = vm.createContext({ URL, ObjectId, jwt, getSigningSecret: () => secret, pushSubscriberPipeline, adminPushSubscriber, json: (body, status = 200) => ({ status, body }) })
  vm.runInContext(`${authHelpers}\nasync function handle(request, database) { const url = new URL(request.url); const route = url.pathname.replace(/^\\/api/, ''); const parts = route.split('/').filter(Boolean); const method = request.method; ${source.slice(start, end)} }; this.handle = handle`, context)
  return context.handle
}

test('device parsing stores only broad browser/platform labels', () => {
  assert.deepEqual(pushDeviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), { browser: 'Chrome', platform: 'Android', device_type: 'mobile' })
  assert.deepEqual(pushDeviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'), { browser: 'Firefox', platform: 'Windows', device_type: 'desktop' })
  assert.deepEqual(pushDeviceFromUserAgent(''), { browser: null, platform: null, device_type: null })
})

test('admin subscriber response excludes push credentials and handles legacy anonymous data', () => {
  const identified = adminPushSubscriber({ ...subscription('1', 'customer-a'), customer: customers[0] })
  const anonymous = adminPushSubscriber({ ...subscription('4', null), customer: null })
  assert.equal(identified.customer.name, 'Customer A')
  assert.equal(identified.customer.phone, '9876543210')
  assert.equal(anonymous.customer, null)
  assert.equal(anonymous.identityStatus, 'anonymous')
  assert.equal(anonymous.lastActiveAt, null)
  for (const value of ['endpoint', 'p256dh', 'auth', 'keys', 'vapidPrivateKey']) assert.equal(JSON.stringify([identified, anonymous]).includes(value), false)
})

test('subscriber list supports identity, status, search, pagination and per-device removal with Admin authorization', async () => {
  const handle = routeHarness()
  const db = fixture()
  const request = (path, role = 'admin', method = 'GET') => ({ url: `http://localhost/api${path}`, method, headers: { get: (name) => name === 'authorization' && role ? `Bearer ${token(role)}` : '' } })
  const list = (query = '', role = 'admin') => handle(request(`/admin/push/subscribers?${query}`, role), db)
  const all = await list('page=1')
  assert.equal(all.status, 200)
  assert.equal(all.body.total, 4)
  assert.equal(all.body.subscribers.filter((row) => row.customer?.name === 'Customer A').length, 2)
  assert.equal((await list('identity=identified')).body.total, 3)
  assert.equal((await list('identity=anonymous')).body.total, 1)
  assert.equal((await list('status=active')).body.total, 4)
  for (const search of ['Customer A', 'Customer', 'customer.a@example.com', '9876543210']) assert.equal((await list(`search=${encodeURIComponent(search)}`)).body.total >= 1, true)
  assert.equal((await list('search=missing')).body.total, 0)
  assert.equal((await list('status=active&identity=identified&search=Customer%20A')).body.total, 2)
  assert.equal((await list('page=2')).body.subscribers.length, 0)
  assert.equal((await list('', '')).status, 401)
  assert.equal((await list('', 'customer')).status, 401)
  assert.equal((await handle(request('/admin/push/subscribers/000000000000000000000001', '', 'DELETE'), db)).status, 401)
  assert.equal((await handle(request('/admin/push/subscribers/000000000000000000000001', 'customer', 'DELETE'), db)).status, 401)
  assert.equal((await handle(request('/admin/push/subscribers/invalid', 'admin', 'DELETE'), db)).status, 404)
  const path = '/admin/push/subscribers/000000000000000000000001'
  assert.equal((await handle(request(path, 'admin', 'DELETE'), db)).body.alreadyRemoved, false)
  assert.equal((await handle(request(path, 'admin', 'DELETE'), db)).body.alreadyRemoved, true)
  assert.equal((await list('status=removed')).body.total, 1)
  assert.equal((await list('status=active')).body.total, 3)
  assert.equal(db.documents[1].active, true)
  assert.equal(db.otherData.customer.id, 'customer-a')
  assert.equal(db.otherData.newsletter.status, 'active')
  assert.equal(db.otherData.campaigns.length, 1)
  for (const value of ['endpoint', 'p256dh', 'auth', 'keys']) assert.equal(JSON.stringify(all.body).includes(value), false)
  const paged = fixture()
  for (let number = 5; number <= 26; number++) paged.documents.push(subscription(String(number), null))
  const firstPage = await handle(request('/admin/push/subscribers?page=1'), paged)
  const secondPage = await handle(request('/admin/push/subscribers?page=2'), paged)
  assert.equal(firstPage.body.total, 26)
  assert.equal(firstPage.body.pages, 2)
  assert.equal(firstPage.body.subscribers.length, 20)
  assert.equal(secondPage.body.subscribers.length, 6)
})

test('subscriber query keeps page limits on the server and escapes identity search', () => {
  const pipeline = pushSubscriberPipeline({ page: 2, limit: 20, search: 'A.*', status: 'active', identity: 'identified' })
  const facet = pipeline.at(-1).$facet
  assert.equal(facet.items.find((stage) => '$skip' in stage).$skip, 20)
  assert.equal(facet.items.find((stage) => '$limit' in stage).$limit, 20)
  assert.equal(pipeline.find((stage) => stage.$match?.$or).$match.$or[0]['customer.name'].$regex, 'A\\.\\*')
})

test('push subscription attaches only a verified customer and broad device metadata', async () => {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const start = source.indexOf("    if (route === '/push/subscribe' && method === 'POST')")
  const end = source.indexOf("    if (route === '/push/unsubscribe' && method === 'POST')", start)
  assert.ok(start > 0 && end > start)
  const writes = []
  let existing = null
  const database = { collection: (name) => name === 'settings'
    ? { findOne: async () => ({ browser_notifications: { enabled: true } }) }
    : { findOne: async () => existing, updateOne: async (...args) => { writes.push(args); return { matchedCount: 1 } } } }
  const context = vm.createContext({
    crypto: await import('node:crypto'), getClientIp: () => '127.0.0.1',
    checkRateLimit: async () => ({ allowed: true }),
    normalizePushSubscription: (value) => value,
    getCustomerFromRequest: async (request) => request.customer || null,
    pushDeviceFromUserAgent, ensurePushIndexes: async () => {},
    isWebPushConfigured: () => true, json: (body, status = 200) => ({ body, status }),
  })
  vm.runInContext(`async function handle(request, database) { const route = '/push/subscribe'; const method = 'POST'; ${source.slice(start, end)} }; this.handle = handle`, context)
  const request = (customer, reactivate = false) => ({ customer, headers: { get: (name) => name === 'user-agent' ? 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile' : '' }, json: async () => ({ subscription: { endpoint: 'test-endpoint', keys: { p256dh: 'test-push', auth: 'test-auth' } }, reactivate }) })
  assert.equal((await context.handle(request({ id: 'customer-a' }), database)).status, 200)
  assert.equal(writes[0][1].$set.customer_id, 'customer-a')
  assert.equal(writes[0][1].$set.platform, 'Android')
  assert.equal(writes[0][1].$set.browser, 'Chrome')
  assert.ok(Number.isFinite(new Date(writes[0][1].$set.last_active_at).getTime()))
  assert.equal((await context.handle(request(null), database)).status, 200)
  assert.equal(writes[1][1].$set.customer_id, null)
  assert.equal(writes[1][0].endpoint, writes[0][0].endpoint)
  existing = { removal_reason: 'admin' }
  assert.equal((await context.handle(request(null), database)).status, 409)
  assert.equal(writes.length, 2, 'background sync must not undo Admin removal')
  assert.equal((await context.handle(request({ id: 'customer-a' }, true), database)).status, 200)
  assert.equal(writes.length, 3)
  assert.equal(writes[2][1].$set.customer_id, 'customer-a')
})

test('existing browser unsubscribe still deactivates only the matching endpoint and keys', async () => {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const start = source.indexOf("    if (route === '/push/unsubscribe' && method === 'POST')")
  const end = source.indexOf("    if (route === '/admin/push' && method === 'GET')", start)
  assert.ok(start > 0 && end > start)
  let write
  const context = vm.createContext({ normalizePushSubscription: (value) => value, json: (body, status = 200) => ({ body, status }) })
  vm.runInContext(`async function handle(request, database) { const route = '/push/unsubscribe'; const method = 'POST'; ${source.slice(start, end)} }; this.handle = handle`, context)
  const request = { json: async () => ({ subscription: { endpoint: 'test-endpoint', keys: { p256dh: 'test-key', auth: 'test-auth' } } }) }
  const database = { collection: () => ({ updateOne: async (...args) => { write = args; return { matchedCount: 1 } } }) }
  assert.equal((await context.handle(request, database)).status, 200)
  assert.equal(write[0].endpoint, 'test-endpoint')
  assert.equal(write[0]['keys.p256dh'], 'test-key')
  assert.equal(write[0]['keys.auth'], 'test-auth')
  assert.equal(write[1].$set.active, false)
})
