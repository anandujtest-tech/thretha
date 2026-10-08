import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import fs from 'node:fs'
import vm from 'node:vm'
import { v4 as uuidv4 } from 'uuid'
import { validateNewsletterDraft, renderNewsletterEmail } from '../lib/newsletterCampaigns.js'
import { countNewsletterAudience, ensureNewsletterCampaignIndexes, processNewsletterQueue, NEWSLETTER_BATCH_SIZE } from '../lib/newsletterScheduler.js'
import { createNewsletterUnsubscribeToken, verifyNewsletterUnsubscribeToken } from '../lib/newsletter.js'

process.env.RESEND_API_KEY = 'local-test-placeholder'
process.env.EMAIL_FROM = 'Thretha Test <test@example.com>'
const appUrl = 'https://www.thretha.in'
const secret = 'newsletter-test-signing-secret'
const queuedAt = new Date('2026-10-08T10:00:00Z')
const draft = { subject: 'The Festive Edit', preview_text: 'New arrivals', audience: 'active', blocks: [
  { type: 'heading', text: 'Welcome **home**' },
  { type: 'paragraph', text: 'Explore [our edit](/shop) and *new styles*.' },
  { type: 'image', url: 'https://res.cloudinary.com/example/image/upload/look.jpg', alt: 'Festive look' },
  { type: 'button', text: 'Shop now', url: '/shop' },
  { type: 'divider' },
] }

function getValue(document, path) { return path.split('.').reduce((value, key) => value?.[key], document) }
function equal(left, right) { return left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right }
function matches(document, filter = {}) {
  return Object.entries(filter).every(([field, expected]) => {
    if (field === '$or') return expected.some((part) => matches(document, part))
    if (field === '$and') return expected.every((part) => matches(document, part))
    const actual = getValue(document, field)
    if (expected instanceof RegExp) return expected.test(String(actual || ''))
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) return Object.entries(expected).every(([operator, target]) => {
      if (operator === '$lte') return actual <= target
      if (operator === '$gt') return actual > target
      if (operator === '$ne') return !equal(actual, target)
      if (operator === '$in') return target.includes(actual)
      if (operator === '$type') return target === 'date' && actual instanceof Date
      if (operator === '$regex') return (target instanceof RegExp ? target : new RegExp(target, expected.$options || '')).test(String(actual || ''))
      if (operator === '$options') return true
      throw Error(`Unsupported test operator ${operator}`)
    })
    return equal(actual, expected)
  })
}
class Collection {
  constructor(name, documents = []) { this.name = name; this.documents = documents }
  async createIndex() { return 'test-index' }
  async findOne(filter, options = {}) {
    const items = this.documents.filter((item) => matches(item, filter))
    if (options.sort) this.sortItems(items, options.sort)
    return items[0] || null
  }
  sortItems(items, spec) { const [key, direction] = Object.entries(spec)[0]; items.sort((a, b) => (getValue(a, key) < getValue(b, key) ? -1 : getValue(a, key) > getValue(b, key) ? 1 : 0) * direction) }
  find(filter = {}) {
    let items = this.documents.filter((item) => matches(item, filter))
    const cursor = {
      sort: (spec) => { this.sortItems(items, spec); return cursor },
      skip: (number) => { items = items.slice(number); return cursor },
      limit: (limit) => { items = items.slice(0, limit); return cursor },
      toArray: async () => [...items],
    }
    return cursor
  }
  async countDocuments(filter = {}) { return this.documents.filter((item) => matches(item, filter)).length }
  aggregate(stages) {
    const match = stages.find((stage) => stage.$match)?.$match || {}
    const emails = new Set(this.documents.filter((item) => matches(item, match)).map((item) => item.email_normalized))
    return { toArray: async () => emails.size ? [{ total: emails.size }] : [] }
  }
  async insertOne(document) {
    if (this.name === 'newsletter_deliveries' && this.documents.some((item) => item.campaign_id === document.campaign_id && item.email_normalized === document.email_normalized)) {
      const error = new Error('duplicate'); error.code = 11000; throw error
    }
    this.documents.push(document)
    return { insertedId: document.id }
  }
  apply(document, update) {
    for (const [key, value] of Object.entries(update.$set || {})) document[key] = value
    for (const key of Object.keys(update.$unset || {})) delete document[key]
    for (const [key, value] of Object.entries(update.$inc || {})) document[key] = (document[key] || 0) + value
  }
  async updateOne(filter, update) { const item = await this.findOne(filter); if (!item) return { matchedCount: 0, modifiedCount: 0 }; this.apply(item, update); return { matchedCount: 1, modifiedCount: 1 } }
  async updateMany(filter, update) { const items = this.documents.filter((item) => matches(item, filter)); items.forEach((item) => this.apply(item, update)); return { matchedCount: items.length, modifiedCount: items.length } }
  async findOneAndUpdate(filter, update) { const item = this.documents.find((entry) => matches(entry, filter)); if (!item) return { value: null }; this.apply(item, update); return { value: item } }
}
function database({ subscribers = [], campaigns = [], deliveries = [] } = {}) {
  const collections = {
    newsletter_subscribers: new Collection('newsletter_subscribers', subscribers),
    newsletter_campaigns: new Collection('newsletter_campaigns', campaigns),
    newsletter_deliveries: new Collection('newsletter_deliveries', deliveries),
  }
  return { collections, collection: (name) => collections[name] }
}
function subscriber(number, overrides = {}) { return { id: `sub-${number}`, email_normalized: `buyer${number}@example.com`, status: 'active', consented_at: new Date('2026-10-07T10:00:00Z'), ...overrides } }
function campaign(overrides = {}) { return { id: 'campaign-1', ...draft, status: 'QUEUED', queued_at: queuedAt, created_at: queuedAt, updated_at: queuedAt, recipient_count: 1, sent_count: 0, failed_count: 0, unknown_count: 0, skipped_count: 0, retry_generation: 0, cursor_email: '', retry_only: false, ...overrides } }

test('draft validation rejects missing fields, unsafe URLs, arbitrary sender and empty content', () => {
  assert.ok(validateNewsletterDraft(draft, appUrl).value)
  for (const input of [
    { ...draft, subject: '' }, { ...draft, blocks: [{ type: 'divider' }] },
    { ...draft, blocks: [{ type: 'button', text: 'Open', url: 'javascript:alert(1)' }] },
    { ...draft, blocks: [{ type: 'image', url: 'data:text/html,<script>x</script>', alt: 'Image' }] },
    { ...draft, audience: 'all' }, { ...draft, from: 'attacker@example.com' },
    { ...draft, subject: 'Title\nBcc: bad@example.com' },
  ]) assert.ok(validateNewsletterDraft(input, appUrl).error)
})

test('selected audience validates identifiers and preserves existing active drafts', () => {
  assert.equal(validateNewsletterDraft(draft, appUrl).value.audience, 'active')
  const selected = validateNewsletterDraft({ ...draft, name: 'Festive audience', audience: 'selected', recipient_ids: ['sub-1', 'sub-2'] }, appUrl)
  assert.equal(selected.value.name, 'Festive audience')
  assert.deepEqual(selected.value.recipient_ids, ['sub-1', 'sub-2'])
  assert.ok(validateNewsletterDraft({ ...draft, audience: 'selected', recipient_ids: [] }, appUrl).error)
  assert.ok(validateNewsletterDraft({ ...draft, audience: 'selected', recipient_ids: ['sub-1', 'sub-1'] }, appUrl).error)
  assert.ok(validateNewsletterDraft({ ...draft, audience: 'active', recipient_ids: ['sub-1'] }, appUrl).error)
  assert.deepEqual(validateNewsletterDraft({ ...draft, audience: 'active', recipient_ids: [] }, appUrl).value.recipient_ids, [])
})

test('selected campaigns count and deliver only active consented selected IDs', async () => {
  const contacts = [subscriber(1), subscriber(2), subscriber(3), subscriber(4, { status: 'unsubscribed' })]
  const db = database({ subscribers: contacts, campaigns: [campaign({ audience: 'selected', recipient_ids: ['sub-1', 'sub-2', 'sub-4'], recipient_count: 2 })] })
  assert.equal(await countNewsletterAudience(db, queuedAt, ['sub-1', 'sub-2', 'sub-4']), 2)
  const sent = []
  await processNewsletterQueue(db, { appUrl, secret, now: queuedAt, send: async ({ to }) => { sent.push(to); return { id: 'mock' } } })
  assert.deepEqual(sent.sort(), ['buyer1@example.com', 'buyer2@example.com'])
  assert.equal(db.collections.newsletter_campaigns.documents[0].status, 'COMPLETED')
})

test('email preview and send share one escaped responsive template with a signed unsubscribe link', () => {
  const normalized = validateNewsletterDraft({ ...draft, blocks: [{ type: 'paragraph', text: '<script>alert(1)</script> **safe** [shop](/shop)' }] }, appUrl).value
  const token = createNewsletterUnsubscribeToken('sub-1', secret, queuedAt.getTime())
  const url = `${appUrl}/newsletter/unsubscribe?token=${token}`
  const html = renderNewsletterEmail(normalized, { baseUrl: appUrl, unsubscribeUrl: url })
  assert.ok(html.includes('width:100%;max-width:600px'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('https://www.thretha.in/shop'))
  assert.ok(html.includes(url))
  assert.equal(verifyNewsletterUnsubscribeToken(token, secret, queuedAt.getTime()), 'sub-1')
  assert.equal(verifyNewsletterUnsubscribeToken(`${token}x`, secret, queuedAt.getTime()), null)
  assert.equal(verifyNewsletterUnsubscribeToken(token, 'different-secret', queuedAt.getTime()), null)
})

test('audience counts only unique active, consented, valid email addresses', async () => {
  const db = database({ subscribers: [subscriber(1), subscriber(1, { id: 'duplicate-record' }), subscriber(2, { status: 'unsubscribed' }), subscriber(3, { email_normalized: 'invalid' }), subscriber(4, { consented_at: new Date('2026-10-09T10:00:00Z') })] })
  assert.equal(await countNewsletterAudience(db, queuedAt), 1)
})

test('worker sends in bounded batches, handles concurrent cron calls, and never resends successes', async () => {
  const contacts = Array.from({ length: 25 }, (_, number) => subscriber(number))
  const db = database({ subscribers: contacts, campaigns: [campaign({ recipient_count: contacts.length })] })
  const sent = []
  const send = async (message) => { sent.push(message.to); assert.ok(message.html.includes('Unsubscribe')); return { id: `provider-${sent.length}` } }
  const options = { appUrl, secret, send, now: queuedAt }
  const parallel = await Promise.all([processNewsletterQueue(db, options), processNewsletterQueue(db, options)])
  assert.ok(parallel.every((result) => result.processed <= NEWSLETTER_BATCH_SIZE))
  assert.equal(new Set(sent).size, sent.length)
  for (let turn = 0; turn < 5 && db.collections.newsletter_campaigns.documents[0].status !== 'COMPLETED'; turn++) await processNewsletterQueue(db, options)
  assert.equal(sent.length, 25)
  assert.equal(new Set(sent).size, 25)
  assert.equal(db.collections.newsletter_campaigns.documents[0].status, 'COMPLETED')
  assert.equal(db.collections.newsletter_campaigns.documents[0].sent_count, 25)
  await processNewsletterQueue(db, options)
  assert.equal(sent.length, 25)
})

test('a definite failed recipient does not stop others; manual retry sends failed only', async () => {
  const db = database({ subscribers: [subscriber(1), subscriber(2), subscriber(3)], campaigns: [campaign({ recipient_count: 3 })] })
  const attempts = []
  const send = async (message) => {
    attempts.push(message.to)
    if (message.to === 'buyer2@example.com' && attempts.filter((email) => email === message.to).length === 1) { const error = new Error('rejected'); error.status = 429; throw error }
    return { id: 'accepted' }
  }
  await processNewsletterQueue(db, { appUrl, secret, send, now: queuedAt })
  const doc = db.collections.newsletter_campaigns.documents[0]
  assert.equal(doc.status, 'PARTIAL')
  assert.equal(doc.sent_count, 2)
  assert.equal(doc.failed_count, 1)
  Object.assign(doc, { status: 'QUEUED', retry_only: true, retry_generation: 1 })
  await processNewsletterQueue(db, { appUrl, secret, send, now: queuedAt })
  assert.equal(doc.status, 'COMPLETED')
  assert.equal(doc.sent_count, 3)
  assert.equal(doc.failed_count, 0)
  assert.equal(attempts.filter((email) => email === 'buyer1@example.com').length, 1)
  assert.equal(attempts.filter((email) => email === 'buyer3@example.com').length, 1)
})

test('unsubscribed before its batch is skipped; uncertain interrupted sends are never retried', async () => {
  const contacts = Array.from({ length: 11 }, (_, number) => subscriber(number))
  const db = database({ subscribers: contacts, campaigns: [campaign({ recipient_count: 11 })] })
  const sent = []
  const send = async ({ to }) => { sent.push(to); return { id: 'ok' } }
  await processNewsletterQueue(db, { appUrl, secret, send, now: queuedAt })
  contacts[9].status = 'unsubscribed'
  await processNewsletterQueue(db, { appUrl, secret, send, now: queuedAt })
  assert.equal(sent.length, 10)
  assert.equal(db.collections.newsletter_campaigns.documents[0].status, 'COMPLETED')
  assert.equal(db.collections.newsletter_campaigns.documents[0].skipped_count, 1)

  const stale = database({ subscribers: [subscriber(1)], campaigns: [campaign({ status: 'SENDING', claim_expires_at: new Date('2026-10-08T09:00:00Z') })], deliveries: [
    { id: 'delivery-1', campaign_id: 'campaign-1', subscriber_id: 'sub-1', email_normalized: 'buyer1@example.com', status: 'SENDING', started_at: new Date('2026-10-08T09:00:00Z') },
  ] })
  const noSend = []
  await processNewsletterQueue(stale, { appUrl, secret, now: queuedAt, send: async (message) => { noSend.push(message); return { id: 'bad' } } })
  assert.equal(noSend.length, 0)
  assert.equal(stale.collections.newsletter_deliveries.documents[0].status, 'UNKNOWN')
  assert.equal(stale.collections.newsletter_campaigns.documents[0].status, 'FAILED')
})

test('an unsubscribed duplicate email suppresses delivery and cancellation stops future batches', async () => {
  const duplicated = database({ subscribers: [subscriber(1), subscriber(1, { id: 'old-record', status: 'unsubscribed' })], campaigns: [campaign()] })
  let sends = 0
  await processNewsletterQueue(duplicated, { appUrl, secret, now: queuedAt, send: async () => { sends++; return { id: 'mock' } } })
  assert.equal(sends, 0)
  assert.equal(duplicated.collections.newsletter_campaigns.documents[0].skipped_count, 1)

  const contacts = Array.from({ length: 20 }, (_, index) => subscriber(index))
  const cancelling = database({ subscribers: contacts, campaigns: [campaign({ recipient_count: 20 })] })
  await processNewsletterQueue(cancelling, { appUrl, secret, now: queuedAt, send: async () => {
    sends++
    cancelling.collections.newsletter_campaigns.documents[0].status = 'CANCELLED'
    return { id: 'mock' }
  } })
  assert.ok(sends <= 2)
  assert.equal(cancelling.collections.newsletter_campaigns.documents[0].status, 'CANCELLED')
  assert.equal(cancelling.collections.newsletter_deliveries.documents.length, sends)
})

test('Admin token helper denies guests and non-admins', () => {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const helpers = source.slice(source.indexOf('function getToken('), source.indexOf('const VISITOR_EVENT_NAMES'))
  const context = vm.createContext({ jwt, JWT_SECRET: secret })
  vm.runInContext(`${helpers}\nthis.check = requireAuth`, context)
  const request = (token) => ({ headers: { get: () => token ? `Bearer ${token}` : '' } })
  assert.equal(context.check(request('')), null)
  assert.equal(context.check(request(jwt.sign({ id: 'user', role: 'customer' }, secret))), null)
  assert.equal(context.check(request(jwt.sign({ id: 'admin', role: 'admin' }, secret))).id, 'admin')
  assert.ok(source.includes("if (!auth) return json({ error: 'Unauthorized' }, 401)"))
})

test('eligible recipient search is paginated and excludes unsubscribed or unconsented records', async () => {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const campaignImports = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/lib\/newsletterCampaigns\.js['"]/)?.[1] || ''
  assert.match(campaignImports, /\bactiveNewsletterAudienceFilter\b/, 'the real API route must import the filter used by its eligible-list branch')
  const branch = source.slice(source.indexOf("      if (route === '/admin/newsletter-subscribers' && method === 'GET')"), source.indexOf("      if (parts[0] === 'admin' && parts[1] === 'newsletter-subscribers'"))
  const context = vm.createContext({ URL, activeNewsletterAudienceFilter: (await import('../lib/newsletterCampaigns.js')).activeNewsletterAudienceFilter, escapeRegex: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), json: (data, status = 200) => ({ status, data }) })
  vm.runInContext(`async function handle(request, database) { const route = '/admin/newsletter-subscribers'; const method = 'GET'; const parts = ['admin', 'newsletter-subscribers']; ${branch} }; this.handle = handle`, context)
  const db = database({ subscribers: [subscriber(1), subscriber(2), subscriber(3, { status: 'unsubscribed' }), subscriber(4, { consented_at: null }), subscriber(5, { email_normalized: 'invalid' })] })
  const request = (query) => ({ url: `${appUrl}/api/admin/newsletter-subscribers?eligible=1&status=active&page=1${query}` })
  const all = await context.handle(request(''), db)
  assert.equal(all.data.total, 2)
  assert.deepEqual(all.data.subscribers.map((item) => item.id).sort(), ['sub-1', 'sub-2'])
  const searched = await context.handle(request('&q=buyer2'), db)
  assert.equal(searched.data.total, 1)
  assert.equal(searched.data.subscribers[0].id, 'sub-2')
  const empty = await context.handle(request('&q=missing'), db)
  assert.equal(empty.status, 200)
  assert.equal(empty.data.total, 0)
  assert.deepEqual(empty.data.subscribers, [])
  assert.equal(empty.data.pages, 1)
  const many = database({ subscribers: Array.from({ length: 55 }, (_, index) => subscriber(index + 1, { created_at: new Date(2026, 0, index + 1) })) })
  const firstPage = await context.handle(request(''), many)
  const secondPage = await context.handle({ url: `${appUrl}/api/admin/newsletter-subscribers?eligible=1&status=active&page=2` }, many)
  assert.equal(firstPage.data.total, 55)
  assert.equal(firstPage.data.subscribers.length, 50)
  assert.equal(firstPage.data.pages, 2)
  assert.equal(secondPage.data.subscribers.length, 5)
  assert.equal(secondPage.data.page, 2)
})

test('real Admin campaign route branches enforce draft, audience, preview, confirmation and allowed actions', async () => {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const authHelpers = source.slice(source.indexOf('function getToken('), source.indexOf('const VISITOR_EVENT_NAMES'))
  const campaignHelper = source.slice(source.indexOf('function adminNewsletterCampaign('), source.indexOf('function reviewOrderOwnerFilter('))
  const branch = source.slice(source.indexOf('      // Newsletter campaigns use the existing Admin token'), source.indexOf("      if (route === '/admin/reviews'"))
  const context = vm.createContext({ jwt, JWT_SECRET: secret, URL, process, uuidv4, countNewsletterAudience, ensureNewsletterCampaignIndexes, validateNewsletterDraft, renderNewsletterEmail, getAppBaseUrl: () => appUrl, json: (data, status = 200) => ({ status, data }) })
  vm.runInContext(`${authHelpers}\n${campaignHelper}\nasync function handle(request, database) { const route = new URL(request.url).pathname.replace(/^\\/api/, ''); const parts = route.split('/').filter(Boolean); const method = request.method; const auth = requireAuth(request); if (!auth) return json({ error: 'Unauthorized' }, 401); ${branch} return json({ error: 'Not found' }, 404) }; this.handle = handle`, context)
  const adminToken = jwt.sign({ id: 'admin-1', role: 'admin' }, secret)
  const customerToken = jwt.sign({ id: 'customer-1', role: 'customer' }, secret)
  const request = (path, method = 'GET', body = {}, token = adminToken) => ({ url: `${appUrl}/api${path}`, method, headers: { get: () => token ? `Bearer ${token}` : '' }, json: async () => body })
  const db = database({ subscribers: [subscriber(1)] })
  assert.equal((await context.handle(request('/admin/newsletter-campaigns', 'GET', {}, ''), db)).status, 401)
  assert.equal((await context.handle(request('/admin/newsletter-campaigns', 'GET', {}, customerToken), db)).status, 401)
  assert.equal((await context.handle(request('/admin/newsletter-campaigns', 'POST', { ...draft, from: 'attacker@example.com' }), db)).status, 400)
  assert.equal((await context.handle(request('/admin/newsletter-campaigns', 'POST', { ...draft, subject: '' }), db)).status, 400)
  const created = await context.handle(request('/admin/newsletter-campaigns', 'POST', draft), db)
  assert.equal(created.status, 201)
  assert.equal(created.data.campaign.status, 'DRAFT')
  const campaignId = created.data.campaign.id
  assert.equal((await context.handle(request('/admin/newsletter-campaigns/audience'), db)).data.recipient_count, 1)
  assert.equal((await context.handle(request('/admin/newsletter-campaigns/audience', 'POST', { recipient_ids: ['sub-1'] }), db)).data.recipient_count, 1)
  assert.equal((await context.handle(request('/admin/newsletter-campaigns/audience', 'POST', { recipient_ids: ['missing'] }), db)).data.recipient_count, 0)
  assert.equal((await context.handle(request('/admin/newsletter-campaigns/audience', 'POST', { recipient_ids: ['sub-1', 'sub-1'] }), db)).status, 400)
  const preview = await context.handle(request('/admin/newsletter-campaigns/preview', 'POST', draft), db)
  assert.equal(preview.status, 200)
  assert.ok(preview.data.html.includes('Unsubscribe'))
  assert.ok(!JSON.stringify(created.data).includes('local-test-placeholder'))
  const queued = await context.handle(request(`/admin/newsletter-campaigns/${campaignId}/send`, 'POST'), db)
  assert.equal(queued.status, 200)
  assert.equal(queued.data.campaign.status, 'QUEUED')
  assert.equal(queued.data.campaign.recipient_count, 1)
  assert.equal((await context.handle(request(`/admin/newsletter-campaigns/${campaignId}/send`, 'POST'), db)).status, 409)
  assert.equal((await context.handle(request(`/admin/newsletter-campaigns/${campaignId}`, 'PATCH', draft), db)).status, 409)
  assert.equal((await context.handle(request(`/admin/newsletter-campaigns/${campaignId}/cancel`, 'POST'), db)).data.campaign.status, 'CANCELLED')

  const noAudience = database()
  const emptyDraft = await context.handle(request('/admin/newsletter-campaigns', 'POST', draft), noAudience)
  assert.equal((await context.handle(request(`/admin/newsletter-campaigns/${emptyDraft.data.campaign.id}/send`, 'POST'), noAudience)).status, 409)

  const selectedDb = database({ subscribers: [subscriber(1), subscriber(2), subscriber(3, { status: 'unsubscribed' })] })
  const selectedDraft = { ...draft, name: 'Selected edit', audience: 'selected', recipient_ids: ['sub-1', 'sub-3'] }
  const savedSelected = await context.handle(request('/admin/newsletter-campaigns', 'POST', selectedDraft), selectedDb)
  assert.equal(savedSelected.data.campaign.name, 'Selected edit')
  assert.deepEqual(selectedDb.collections.newsletter_campaigns.documents[0].recipient_ids, ['sub-1', 'sub-3'])
  const selectedQueued = await context.handle(request(`/admin/newsletter-campaigns/${savedSelected.data.campaign.id}/send`, 'POST'), selectedDb)
  assert.equal(selectedQueued.data.campaign.recipient_count, 1)
  assert.equal((await context.handle(request(`/admin/newsletter-campaigns/${savedSelected.data.campaign.id}/send`, 'POST'), selectedDb)).status, 409)
})

test('1,000 mock recipients are processed in bounded cron batches without duplicate delivery', async () => {
  const contacts = Array.from({ length: 1000 }, (_, number) => subscriber(number))
  const db = database({ subscribers: contacts, campaigns: [campaign({ recipient_count: contacts.length })] })
  const delivered = new Set()
  const send = async ({ to }) => { assert.ok(!delivered.has(to)); delivered.add(to); return { id: 'mock-only' } }
  for (let run = 0; run < 102 && db.collections.newsletter_campaigns.documents[0].status !== 'COMPLETED'; run++) {
    const result = await processNewsletterQueue(db, { appUrl, secret, send, now: queuedAt })
    assert.ok(result.processed <= NEWSLETTER_BATCH_SIZE)
  }
  assert.equal(delivered.size, 1000)
  assert.equal(db.collections.newsletter_campaigns.documents[0].status, 'COMPLETED')
  assert.equal(db.collections.newsletter_deliveries.documents.length, 1000)
})
