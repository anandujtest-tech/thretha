import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server.js'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { isIP } from 'node:net'
import { v2 as cloudinary } from 'cloudinary'
import { serveMedia, cloudinaryEnabled } from '../../../lib/storage.js'
import { sendLoginOtp } from '../../../lib/email.js'
import {
  signCustomerToken,
  getCustomerFromRequest,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  generatePKCE,
  generateOAuthState,
  verifyOAuthState,
  checkRateLimit,
  ensureAuthIndexes,
  getClientIp,
  getAppBaseUrl,
  sanitizeInternalRedirect,
  CUSTOMER_COOKIE_NAME,
} from '../../../lib/auth.js'
import { validateAddress } from '../../../lib/addressValidation.js'
import {
  createCashfreeOrder,
  fetchCashfreeOrder,
  fetchCashfreePayments,
  createCashfreeRefund,
  fetchCashfreeRefund,
  checkOrderCancellationEligibility,
  cancelAndRefundOrder,
  cancelOrderItemAndRefund,
  finalizeCompletedRefund,
  finalizeCompletedItemRefund,
  verifyCashfreeWebhookSignature,
  isCashfreeConfigured,
  getCashfreeConfig,
  getCashfreePublicBaseUrl,
  generateCashfreeOrderId,
  finalizePaidOrder,
} from '../../../lib/cashfree.js'
import {
  normalizeCouponCode,
  ensurePromotionsSeeded,
  validateCoupon,
  evaluateFreeDeliveryRules,
  calculateOrderPricing,
  recordCouponUsage,
} from '../../../lib/promotions.js'
import {
  dispatchOrderNotifications,
  getOrderNotificationSettings,
  renderCustomerOrderEmail,
  renderSalesOrderEmail,
  sendSalesWhatsAppMessage,
  formatInr,
} from '../../../lib/notifications.js'
import {
  ensureCombosSeeded,
  populateComboSlots,
  validateAndCalculateCombo,
  isComboActive,
  slugify as comboSlugify,
  normalizeAndValidateAdminSlots,
} from '../../../lib/combos.js'
import { sendEmail } from '../../../lib/email.js'
import { DELIVERY_SERVICES, validateShippingUpdate } from '../../../lib/deliveryServices.js'
import {
  ERROR_CODES,
  generateCorrelationId,
  getCustomerFacingMessage,
  sanitizeErrorMessage,
  logger,
  scrubSecrets,
} from '../../../lib/errors.js'
import {
  normalizeInstagramSettings,
  getStorefrontInstagramFeed,
  getAdminInstagramFeed,
  syncInstagramFeed,
  updateAdminInstagramPosts,
  createManualInstagramPost,
  updateManualInstagramPost,
  deleteManualInstagramPost,
} from '../../../lib/instagram.js'
import {
  generateVirtualTryOn,
  normalizeTryOnSettings,
  recordTryOnAnalytics,
  getTryOnAnalyticsSummary,
  getTryOnProvider,
} from '../../../lib/tryon.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JWT_SECRET = process.env.JWT_SECRET || 'thretha_dev_secret'

// ---------- Mongo ----------
let dbPromise

async function connectToMongo() {
  if (!process.env.MONGO_URL) {
    throw new Error('MONGO_URL environment variable is not defined in .env.local')
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const c = new MongoClient(process.env.MONGO_URL)
      await c.connect()
      const database = c.db(process.env.DB_NAME || 'thretha_couture')
      await ensureSeed(database)
      await ensureAuthIndexes(database)
      await ensurePromotionsSeeded(database)
      return database
    })().catch((err) => {
      dbPromise = undefined // allow retry on next request
      throw err
    })
  }
  return dbPromise
}

// ---------- Helpers ----------
function cors(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

function json(data, status = 200, extraHeaders = {}) {
  const response = NextResponse.json(data, { status })
  for (const [k, v] of Object.entries(extraHeaders)) {
    response.headers.set(k, v)
  }
  return cors(response)
}

function apiError({
  code = ERROR_CODES.INTERNAL_ERROR,
  message = null,
  status = 400,
  details = null,
  requestId = null,
  extra = {},
}) {
  const friendlyMessage = getCustomerFacingMessage(code, message)
  const reqId = requestId || generateCorrelationId()
  const payload = {
    success: false,
    error: {
      code,
      message: friendlyMessage,
      ...(details ? { details } : {}),
    },
    message: friendlyMessage,
    code,
    requestId: reqId,
    ...extra,
  }
  return json(payload, status, { 'X-Request-ID': reqId })
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function strip(doc) {
  if (!doc) return doc
  const { _id, password_hash, ...rest } = doc
  return rest
}

function createSafeRedirect(targetPath, request) {
  const baseUrl = getAppBaseUrl(request)
  const safePath = sanitizeInternalRedirect(targetPath)
  const normalizedPath = safePath.startsWith('/') ? safePath : `/${safePath}`
  return NextResponse.redirect(new URL(normalizedPath, baseUrl))
}

function getToken(request) {
  const h = request.headers.get('authorization') || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  return null
}

function requireAuth(request) {
  const token = getToken(request)
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (!decoded || decoded.role !== 'admin') {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

const VISITOR_EVENT_NAMES = new Set([
  'page_view', 'category_view', 'product_view', 'checkout_started',
  'quick_view', 'add_to_cart', 'remove_from_cart', 'search_performed', 'location_shared',
])
const CLIENT_VISITOR_EVENT_NAMES = new Set(['quick_view', 'add_to_cart', 'remove_from_cart', 'search_performed', 'location_shared'])

function normalizeVisitorFirstTouch(value) {
  const source = value && typeof value.source === 'string' ? value.source.slice(0, 80) : 'Unknown'
  let referrer = ''
  try {
    if (typeof value?.referrer === 'string' && value.referrer) {
      const url = new URL(value.referrer)
      referrer = url.origin.slice(0, 300)
    }
  } catch {}
  return {
    source,
    referrer,
    landing_page: typeof value?.landing_page === 'string' && value.landing_page.startsWith('/') ? value.landing_page.slice(0, 300) : '',
    utm_source: String(value?.utm_source || '').slice(0, 120),
    medium: String(value?.medium || '').slice(0, 120),
    campaign: String(value?.campaign || '').slice(0, 120),
    content: String(value?.content || '').slice(0, 120),
    term: String(value?.term || '').slice(0, 120),
  }
}

async function recordVisitorActivity(database, request, body, requestedEvent) {
  const visitorId = String(body.visitor_id || '').slice(0, 100)
  if (!visitorId) return json({ error: 'Visitor ID required' }, 400)

  const eventName = VISITOR_EVENT_NAMES.has(requestedEvent) ? requestedEvent : 'page_view'
  const page = String(body.page || '/').slice(0, 500)
  const productSlug = typeof body.product_slug === 'string' ? body.product_slug.slice(0, 200) : null
  const categorySlug = typeof body.category_slug === 'string' ? body.category_slug.slice(0, 200) : null
  const latitude = Number.isFinite(body.latitude) && body.latitude >= -90 && body.latitude <= 90 ? body.latitude : null
  const longitude = Number.isFinite(body.longitude) && body.longitude >= -180 && body.longitude <= 180 ? body.longitude : null
  const accuracy = Number.isFinite(body.location_accuracy) && body.location_accuracy > 0 && body.location_accuracy <= 100000 ? body.location_accuracy : null
  const requestedPermission = ['granted', 'denied_or_unavailable', 'not_requested'].includes(body.location_permission)
    ? body.location_permission
    : 'not_requested'
  const locationPermission = eventName === 'location_shared' && requestedPermission === 'granted' && latitude !== null && longitude !== null
    ? 'granted'
    : requestedPermission === 'granted' ? 'denied_or_unavailable' : requestedPermission
  const now = new Date()
  // Use platform/CDN client-IP headers first, then the forwarded chain used by
  // the deployment proxy. Never accept an address from the request body.
  const forwardedIp = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim()
  const ipCandidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-real-ip'),
    forwardedIp,
  ]
  const ip = ipCandidates.map((value) => value?.trim()).find((value) => value && isIP(value)) || 'unknown'
  const sessionId = String(body.session_id || 'legacy-session').slice(0, 100)
  const firstTouch = normalizeVisitorFirstTouch(body.first_touch)
  const browser = String(body.browser || 'Unknown').slice(0, 50)
  const operatingSystem = String(body.operating_system || 'Unknown').slice(0, 50)
  const clientHint = (name) => {
    const value = request.headers.get(name)?.trim().replace(/^"|"$/g, '')
    return value && value !== '?0' && value.toLowerCase() !== 'unknown' ? value.slice(0, 80) : null
  }
  const userAgent = request.headers.get('user-agent') || ''
  const hintedModel = clientHint('sec-ch-ua-model')
  const deviceModel = hintedModel || (/iphone/i.test(userAgent) ? 'iPhone' : /ipad/i.test(userAgent) ? 'iPad' : null)
  const mobileHint = request.headers.get('sec-ch-ua-mobile')?.trim()
  const deviceType = mobileHint === '?1' ? 'Mobile' : mobileHint === '?0' ? 'Desktop' : String(body.device_type || 'Unknown').slice(0, 50)
  const platformVersion = clientHint('sec-ch-ua-platform-version')
  const platform = clientHint('sec-ch-ua-platform')
  const locationUpdate = eventName === 'location_shared' && ['granted', 'denied_or_unavailable'].includes(body.location_permission)
    ? {
        latitude: { $literal: latitude },
        longitude: { $literal: longitude },
        location_accuracy: { $literal: accuracy },
        location_permission: { $literal: locationPermission },
      }
    : {}

  await database.collection('visitor_events').insertOne({
    id: uuidv4(), visitor_id: visitorId, session_id: sessionId, event_name: eventName,
    page, product_slug: productSlug, category_slug: categorySlug,
    device_type: deviceType, browser, operating_system: operatingSystem,
    first_touch: firstTouch, latitude, longitude, location_accuracy: accuracy,
    location_permission: locationPermission, created_at: now, last_seen: now,
  })

  await database.collection('visitor_sessions').updateOne({ visitor_id: visitorId }, [
    { $set: {
      id: { $ifNull: ['$id', { $literal: uuidv4() }] },
      visitor_id: { $literal: visitorId },
      ip: ip === 'unknown' ? { $ifNull: ['$ip', { $literal: 'unknown' }] } : { $literal: ip },
      page: { $literal: page },
      product_slug: { $literal: productSlug },
      device_type: { $literal: deviceType },
      browser: { $literal: browser },
      operating_system: { $literal: operatingSystem },
      ...(deviceModel ? { device_model: { $literal: deviceModel } } : {}),
      ...(platformVersion ? { platform_version: { $literal: platformVersion } } : {}),
      ...(platform ? { client_hint_platform: { $literal: platform } } : {}),
      ...locationUpdate,
      last_seen: { $literal: now },
      first_seen: { $ifNull: ['$first_seen', { $literal: now }] },
      first_touch: { $ifNull: ['$first_touch', { $literal: firstTouch }] },
    } },
  ], { upsert: true })
  return json({ ok: true }, 200, {
    'Accept-CH': 'Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model',
  })
}

const IMG = (u, w = 900) => `${u}?auto=format&fit=crop&w=${w}&q=80`

// ---------- Seed ----------
async function ensureSeed(database) {
  const settingsCol = database.collection('settings')
  const existing = await settingsCol.findOne({ id: 'global' })
  if (existing) return

  const now = new Date()

  // Admin user
  const adminHash = await bcrypt.hash('thretha@2026', 10)
  await database.collection('users').insertOne({
    id: uuidv4(),
    name: 'Thretha Admin',
    email: 'admin@threthacouture.com',
    password_hash: adminHash,
    role: 'admin',
    created_at: now,
  })

  // Categories
  const sareesId = uuidv4()
  const cropsId = uuidv4()
  await database.collection('categories').insertMany([
    {
      id: sareesId, name: 'Sarees', slug: 'sarees',
      description: 'Draped for celebrations, slow mornings and everything in between.',
      image: '/api/media/file/seed-01.jpg',
      display_order: 1, active: true, created_at: now,
    },
    {
      id: cropsId, name: 'Crop Tops', slug: 'crop-tops',
      description: 'Modern little things for easy, everyday styling.',
      image: '/api/media/file/seed-07.jpg',
      display_order: 2, active: true, created_at: now,
    },
  ])

  const sareeImgs = ['seed-01', 'seed-02', 'seed-03', 'seed-04', 'seed-05', 'seed-06'].map((s) => `/api/media/file/${s}.jpg`)
  const cropImgs = ['seed-07', 'seed-08', 'seed-09', 'seed-10', 'seed-11', 'seed-12'].map((s) => `/api/media/file/${s}.jpg`)

  const freeSize = [{ size: 'Free Size', available: true, stock: 8 }]
  const tshirtSizes = (stocks) => ['XS', 'S', 'M', 'L', 'XL'].map((s, i) => ({
    size: s, available: stocks[i] > 0, stock: stocks[i],
  }))

  const mkMedia = (urls) => urls.map((u, i) => ({
    id: uuidv4(), type: 'image', url: u, display_order: i, is_primary: i === 0,
  }))

  const products = [
    {
      name: 'Kerala Rose Saree', sku: 'TC-SR-001', category_id: sareesId, category_name: 'Sarees',
      description: 'A lightweight piece designed for easy, effortless styling — draped for celebrations and slow mornings alike.',
      price: 2499, discount_price: null, fabric: 'Cotton Blend', colour: 'Rose', material: 'Cotton',
      pattern: 'Woven', care_instructions: 'Dry clean recommended. Store folded in muslin.',
      stock: 8, sizes: freeSize, media: mkMedia([sareeImgs[0], sareeImgs[3]]),
      featured: true, new_arrival: true, best_seller: false,
    },
    {
      name: 'Marigold Silk Saree', sku: 'TC-SR-002', category_id: sareesId, category_name: 'Sarees',
      description: 'A sunlit ochre drape with a soft sheen, made for the festive season.',
      price: 3899, discount_price: 3299, fabric: 'Art Silk', colour: 'Marigold', material: 'Silk',
      pattern: 'Solid with zari border', care_instructions: 'Dry clean only.',
      stock: 5, sizes: freeSize, media: mkMedia([sareeImgs[1], sareeImgs[4]]),
      featured: true, new_arrival: true, best_seller: true,
    },
    {
      name: 'Midnight Gold Saree', sku: 'TC-SR-003', category_id: sareesId, category_name: 'Sarees',
      description: 'Deep black with delicate gold detailing — an heirloom in the making.',
      price: 4599, discount_price: null, fabric: 'Organza', colour: 'Black & Gold', material: 'Organza',
      pattern: 'Embellished', care_instructions: 'Dry clean only. Avoid direct sunlight.',
      stock: 2, sizes: freeSize, media: mkMedia([sareeImgs[2]]),
      featured: false, new_arrival: true, best_seller: false,
    },
    {
      name: 'Ivory Morning Saree', sku: 'TC-SR-004', category_id: sareesId, category_name: 'Sarees',
      description: 'A soft ivory cotton drape for unhurried, everyday elegance.',
      price: 2199, discount_price: null, fabric: 'Cotton', colour: 'Ivory', material: 'Cotton',
      pattern: 'Minimal', care_instructions: 'Gentle hand wash.',
      stock: 10, sizes: freeSize, media: mkMedia([sareeImgs[3], sareeImgs[0]]),
      featured: true, new_arrival: false, best_seller: true,
    },
    {
      name: 'Amber Festive Saree', sku: 'TC-SR-005', category_id: sareesId, category_name: 'Sarees',
      description: 'Warm amber tones with a graceful fall, styled for celebrations.',
      price: 3299, discount_price: 2899, fabric: 'Georgette', colour: 'Amber', material: 'Georgette',
      pattern: 'Solid', care_instructions: 'Dry clean recommended.',
      stock: 0, sizes: freeSize, media: mkMedia([sareeImgs[4], sareeImgs[1]]),
      featured: false, new_arrival: false, best_seller: false,
    },
    {
      name: 'Onyx Drape Saree', sku: 'TC-SR-006', category_id: sareesId, category_name: 'Sarees',
      description: 'A modern black drape with a subtle dupatta detail.',
      price: 2799, discount_price: null, fabric: 'Chiffon', colour: 'Onyx', material: 'Chiffon',
      pattern: 'Solid', care_instructions: 'Dry clean only.',
      stock: 6, sizes: freeSize, media: mkMedia([sareeImgs[5]]),
      featured: false, new_arrival: true, best_seller: false,
    },
    {
      name: 'Sunlit Crop Top', sku: 'TC-CT-001', category_id: cropsId, category_name: 'Crop Tops',
      description: 'A cheerful everyday crop, cut for comfort and easy layering.',
      price: 1299, discount_price: null, fabric: 'Cotton', colour: 'Yellow', material: 'Cotton',
      pattern: 'Solid', care_instructions: 'Machine wash cold.',
      stock: 12, sizes: tshirtSizes([2, 4, 4, 2, 0]), media: mkMedia([cropImgs[0], cropImgs[4]]),
      featured: true, new_arrival: true, best_seller: true,
    },
    {
      name: 'Cloud White Crop', sku: 'TC-CT-002', category_id: cropsId, category_name: 'Crop Tops',
      description: 'A crisp white staple that pairs with everything.',
      price: 1149, discount_price: 999, fabric: 'Linen Blend', colour: 'White', material: 'Linen',
      pattern: 'Minimal', care_instructions: 'Gentle wash.',
      stock: 9, sizes: tshirtSizes([1, 3, 3, 2, 0]), media: mkMedia([cropImgs[1]]),
      featured: false, new_arrival: true, best_seller: false,
    },
    {
      name: 'Cobalt Everyday Crop', sku: 'TC-CT-003', category_id: cropsId, category_name: 'Crop Tops',
      description: 'A rich cobalt crop with a relaxed, contemporary fit.',
      price: 1399, discount_price: null, fabric: 'Cotton', colour: 'Blue', material: 'Cotton',
      pattern: 'Solid', care_instructions: 'Machine wash cold.',
      stock: 3, sizes: tshirtSizes([0, 1, 1, 1, 0]), media: mkMedia([cropImgs[2], cropImgs[3]]),
      featured: true, new_arrival: false, best_seller: false,
    },
    {
      name: 'Terracotta Knot Crop', sku: 'TC-CT-004', category_id: cropsId, category_name: 'Crop Tops',
      description: 'An earthy terracotta crop with a soft knotted detail.',
      price: 1249, discount_price: null, fabric: 'Cotton', colour: 'Terracotta', material: 'Cotton',
      pattern: 'Solid', care_instructions: 'Machine wash cold.',
      stock: 0, sizes: tshirtSizes([0, 0, 0, 0, 0]), media: mkMedia([cropImgs[3]]),
      featured: false, new_arrival: false, best_seller: false,
    },
  ]

  const productDocs = products.map((p) => ({
    id: uuidv4(),
    slug: slugify(p.name),
    ...p,
    active: true,
    created_at: now,
    updated_at: now,
  }))
  await database.collection('products').insertMany(productDocs)

  // Settings + homepage config
  await settingsCol.insertOne({
    id: 'global',
    brand_name: 'Thretha Couture',
    instagram: 'https://www.instagram.com/thretha_couture',
    whatsapp: '918301824696',
    phone: '918301824696',
    email: 'hello@threthacouture.com',
    address: 'Kerala, India',
    logo_url: '',
    combos_enabled: true,
    low_stock_threshold: 3,
    shipping: {
      delivery_timeframe: '5–7 working days across India',
      delivery_charges: 'Flat ₹80. Free above ₹2,999.',
      free_shipping_threshold: 2999,
      return_policy: 'Easy 3-day return on unworn pieces with tags.',
      exchange_policy: 'Size exchange available within 5 days.',
    },
    hero: {
      title: 'THRETHA COUTURE',
      kicker: 'little things we love',
      subtitle: 'A wardrobe worth getting dressed for.',
      annotation: 'made for your next occasion',
      cta: 'EXPLORE COLLECTION',
      images: ['seed-01', 'seed-02', 'seed-03', 'seed-04'].map((s) => `/api/media/file/${s}.jpg`),
    },
    saree_edit_image: '/api/media/file/seed-05.jpg',
    brand_story: 'Thretha Couture is a little space for pieces we fall in love with — sarees, silhouettes and everyday favourites chosen with a soft spot for Kerala style.',
    brand_story_image: '/api/media/file/seed-04.jpg',
    created_at: now,
    updated_at: now,
  })
}

// ---------- Order number (Concurrency-Safe Atomic Generator) ----------
async function nextOrderNumber(database) {
  const year = new Date().getFullYear()
  const counterId = `order_seq_${year}`

  const counter = await database.collection('counters').findOne({ id: counterId })
  if (!counter) {
    const orders = await database.collection('orders').find({
      order_number: { $regex: new RegExp(`^TC-${year}-(\\d+)`) },
    }).toArray()
    let maxSeq = 0
    for (const o of orders) {
      const match = (o.order_number || '').match(new RegExp(`^TC-${year}-(\\d+)`))
      if (match) {
        const seq = parseInt(match[1], 10)
        if (seq > maxSeq) maxSeq = seq
      }
    }
    await database.collection('counters').updateOne(
      { id: counterId },
      { $setOnInsert: { id: counterId, seq: maxSeq, updated_at: new Date() } },
      { upsert: true }
    )
  }

  const updatedCounter = await database.collection('counters').findOneAndUpdate(
    { id: counterId },
    { $inc: { seq: 1 }, $set: { updated_at: new Date() } },
    { returnDocument: 'after', upsert: true }
  )

  const doc = (updatedCounter && typeof updatedCounter === 'object' && 'value' in updatedCounter)
    ? updatedCounter.value
    : updatedCounter
  const seq = doc?.seq || 1

  return `TC-${year}-${String(seq).padStart(4, '0')}`
}

function buildWhatsAppMessage(order, settings) {
  const items = order.items || []
  const c = order.customer || {}
  const itemLines = items.map((it, idx) => {
    const skuText = it.sku ? ` [SKU: ${it.sku}]` : ''
    const colourText = it.colour ? ` | Colour: ${it.colour}` : ''
    return `${idx + 1}. *${it.product_name}*${skuText}\n   Size: ${it.size || 'Free Size'}${colourText} | Qty: ${it.quantity} | Unit: ₹${it.price} | Total: ₹${it.price * it.quantity}`
  }).join('\n\n')

  const lines = [
    '✨ *THRETHA COUTURE — CONCIERGE ORDER REQUEST*',
    '',
    'Hello Thretha Atelier Team! 👋',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    `*Order Reference:* \`${order.order_number || ''}\``,
    `*Payment Preference:* WhatsApp Concierge`,
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Handcrafted Pieces Requested:*',
    itemLines,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    `*Subtotal:* ₹${order.subtotal || order.total}`,
    ...(order.discount > 0 ? [`*Promotional Discount:* -₹${order.discount}`] : []),
    `*Shipping:* ${order.shipping === 0 ? 'FREE' : `₹${order.shipping}`}`,
    `*Final Total:* ₹${order.total}`,
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Customer Contact Details:*',
    `• Name: ${c.name || c.fullName}`,
    `• Phone/WhatsApp: ${c.whatsapp || c.phone}`,
    ...(c.email ? [`• Email: ${c.email}`] : []),
    '',
    '*Complete Delivery Address:*',
    [c.house, c.street, c.city, c.district, c.state, c.country || 'India', `PIN: ${c.pincode || c.postalCode}`].filter(Boolean).join(', '),
    '',
    'Please confirm piece availability, custom tailoring notes, and payment instructions. Thank you! 🌸',
  ]
  const text = lines.join('\n')
  const num = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')
  return { text, url: `https://wa.me/${num}?text=${encodeURIComponent(text)}` }
}

// ---------- Router ----------
async function handleRoute(request, { params }) {
  const { path: parts = [] } = await params
  const route = `/${parts.join('/')}`
  const method = request.method
  const requestId = request.headers.get('x-request-id') || generateCorrelationId()

  try {
    // media serve does not need db seed check speed but fine
    if (parts[0] === 'media' && parts[1] === 'file' && method === 'GET') {
      return serveMedia(parts.slice(2).join('/'))
    }

    const database = await connectToMongo()
    // ===== VISITOR ANALYTICS =====
    if (route === '/analytics/visit' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        const pageEvents = new Set(['page_view', 'category_view', 'product_view', 'checkout_started'])
        if (body.event_name && !pageEvents.has(body.event_name)) return json({ error: 'Unsupported page event' }, 400)
        return await recordVisitorActivity(database, request, body, body.event_name)
      } catch (err) {
        console.error('Visitor analytics error:', err)
        return json({ ok: false }, 500)
      }
    }
    if (route === '/analytics/event' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        if (!CLIENT_VISITOR_EVENT_NAMES.has(body.event_name)) {
          return json({ error: 'Unsupported analytics event' }, 400)
        }
        return await recordVisitorActivity(database, request, body, body.event_name)
      } catch (err) {
        console.error('Visitor event error:', err)
        return json({ ok: false }, 500)
      }
    }
    // ===== VISITOR HEARTBEAT =====
    if (route === '/analytics/heartbeat' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        const visitorId = String(body.visitor_id || '').slice(0, 100)
        if (!visitorId) return json({ error: 'Visitor ID required' }, 400)
        await database.collection('visitor_sessions').updateOne(
          { visitor_id: visitorId },
          { $set: { page: String(body.page || '/').slice(0, 500), last_seen: new Date() } }
        )
        return json({ ok: true })
      } catch (err) {
        console.error('Visitor heartbeat error:', err)
        return json({ ok: false }, 500)
      }
    }
    // ===== ADMIN VISITOR ANALYTICS SUMMARY =====
    if (route === '/admin/analytics' && method === 'GET') {
      try {
        if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401)
        const events = database.collection('visitor_events')
        const sessions = database.collection('visitor_sessions')
        const now = new Date()
        const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 30))
        const visitorPage = Math.min(100, Math.max(0, Number(request.nextUrl.searchParams.get('page')) || 0))
        const visitorPageSize = 20
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
        const today = new Date(now)
        today.setHours(0, 0, 0, 0)
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000)
        const normalizeEventStage = {
          $set: {
            normalized_event: {
              $ifNull: ['$event_name', {
                $switch: {
                  branches: [
                    { case: { $regexMatch: { input: { $ifNull: ['$page', ''] }, regex: '^/product/' } }, then: 'product_view' },
                    { case: { $regexMatch: { input: { $ifNull: ['$page', ''] }, regex: '^/category/' } }, then: 'category_view' },
                    { case: { $eq: ['$page', '/checkout'] }, then: 'checkout_started' },
                  ],
                  default: 'page_view',
                },
              }],
            },
          },
        }

        const [eventAnalyticsRows, deviceStats, onlineRows, recentVisitors, newVisitorRows, orderCount] = await Promise.all([
          events.aggregate([
            { $match: { created_at: { $gte: start, $lte: now } } }, normalizeEventStage,
            { $facet: {
              uniqueVisitors: [{ $group: { _id: '$visitor_id' } }, { $count: 'count' }],
              funnel: [
                { $group: { _id: { visitor_id: '$visitor_id', event: '$normalized_event' } } },
                { $group: { _id: '$_id.event', visitors: { $sum: 1 } } },
              ],
              todayVisitors: [{ $match: { created_at: { $gte: today, $lte: now } } }, { $group: { _id: '$visitor_id' } }, { $count: 'count' }],
              todayPageViews: [{ $match: { created_at: { $gte: today, $lte: now }, normalized_event: { $in: ['page_view', 'category_view', 'product_view'] } } }, { $count: 'count' }],
              todayProductViews: [{ $match: { created_at: { $gte: today, $lte: now }, normalized_event: 'product_view' } }, { $count: 'count' }],
              todayCartEvents: [{ $match: { created_at: { $gte: today, $lte: now }, normalized_event: 'add_to_cart' } }, { $count: 'count' }],
              pages: [{ $match: { normalized_event: { $in: ['page_view', 'category_view', 'product_view'] } } }, { $group: { _id: '$page', views: { $sum: 1 } } }, { $sort: { views: -1 } }, { $limit: 10 }],
              products: [
                { $match: { normalized_event: 'product_view', product_slug: { $type: 'string' } } },
                { $group: { _id: '$product_slug', views: { $sum: 1 } } }, { $sort: { views: -1 } }, { $limit: 10 },
              ],
              sources: [
                { $match: { 'first_touch.source': { $type: 'string' } } },
                { $group: { _id: { visitor_id: '$visitor_id', source: '$first_touch.source' } } },
                { $group: { _id: '$_id.source', visitors: { $sum: 1 } } }, { $sort: { visitors: -1 } }, { $limit: 8 },
              ],
              campaigns: [
                { $match: { 'first_touch.campaign': { $type: 'string', $ne: '' } } },
                { $group: { _id: { visitor_id: '$visitor_id', source: '$first_touch.source', medium: '$first_touch.medium', campaign: '$first_touch.campaign', content: '$first_touch.content' }, events: { $addToSet: '$normalized_event' } } },
                { $group: {
                  _id: { source: '$_id.source', medium: '$_id.medium', campaign: '$_id.campaign', content: '$_id.content' },
                  visitors: { $sum: 1 },
                  product_views: { $sum: { $cond: [{ $in: ['product_view', '$events'] }, 1, 0] } },
                  add_to_cart: { $sum: { $cond: [{ $in: ['add_to_cart', '$events'] }, 1, 0] } },
                  checkouts: { $sum: { $cond: [{ $in: ['checkout_started', '$events'] }, 1, 0] } },
                } },
                { $sort: { visitors: -1 } }, { $limit: 10 },
              ],
            } },
          ]).toArray(),
          sessions.aggregate([
            { $match: { last_seen: { $gte: start, $lte: now } } },
            { $group: { _id: { visitor_id: '$visitor_id', device: '$device_type', browser: '$browser', os: '$operating_system' } } },
            { $group: { _id: '$_id.device', visitors: { $sum: 1 } } },
            { $sort: { visitors: -1 } }, { $limit: 5 },
          ]).toArray(),
          sessions.aggregate([
            { $match: { last_seen: { $gte: twoMinutesAgo, $lte: now } } },
            { $group: { _id: '$visitor_id' } }, { $count: 'count' },
          ]).toArray(),
          sessions.find({ last_seen: { $gte: start, $lte: now } }, {
            projection: { _id: 0, id: 1, visitor_id: 1, page: 1, product_slug: 1, device_type: 1, device_model: 1, platform_version: 1, browser: 1, operating_system: 1, latitude: 1, longitude: 1, location_accuracy: 1, location_permission: 1, first_seen: 1, last_seen: 1, first_touch: 1, session_count: 1 },
          }).sort({ last_seen: -1 }).skip(visitorPage * visitorPageSize).limit(visitorPageSize + 1).toArray(),
          sessions.aggregate([
            { $match: { first_seen: { $gte: start, $lte: now } } },
            { $group: { _id: '$visitor_id' } }, { $count: 'count' },
          ]).toArray(),
          database.collection('orders').countDocuments({ created_at: { $gte: today, $lte: now } }),
        ])

        const eventAnalytics = eventAnalyticsRows[0] || {}
        const funnel = Object.fromEntries((eventAnalytics.funnel || []).map((row) => [row._id, row.visitors]))
        const uniqueVisitorCount = eventAnalytics.uniqueVisitors?.[0]?.count || 0
        const onlineCount = onlineRows[0]?.count || 0
        const newVisitors = newVisitorRows[0]?.count || 0
        const locationLabel = (item) => item.location_permission === 'granted' && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
          ? (Number.isFinite(item.location_accuracy) ? `Approx. browser location ±${Math.round(item.location_accuracy)} m` : 'Approx. browser location · accuracy unavailable')
          : 'Location unavailable'

        return json({
          range_days: days,
          visitor_page: visitorPage,
          recent_has_more: recentVisitors.length > visitorPageSize,
          total_visitors: uniqueVisitorCount,
          today_visitors: eventAnalytics.todayVisitors?.[0]?.count || 0,
          today_page_views: eventAnalytics.todayPageViews?.[0]?.count || 0,
          today_product_views: eventAnalytics.todayProductViews?.[0]?.count || 0,
          today_carts: eventAnalytics.todayCartEvents?.[0]?.count || 0,
          today_orders: orderCount,
          currently_online: onlineCount,
          new_visitors: newVisitors,
          returning_visitors: Math.max(0, uniqueVisitorCount - newVisitors),
          funnel: {
            visitors: uniqueVisitorCount,
            product_views: funnel.product_view || 0,
            add_to_cart: funnel.add_to_cart || 0,
            checkout_started: funnel.checkout_started || 0,
            orders: null,
          },
          pages: (eventAnalytics.pages || []).map((item) => ({ page: item._id || '/', views: item.views })),
          products: (eventAnalytics.products || []).map((item) => ({ product_slug: item._id, views: item.views })),
          traffic_sources: (eventAnalytics.sources || []).map((item) => ({ source: item._id || 'Unknown', visitors: item.visitors })),
          campaigns: (eventAnalytics.campaigns || []).map((item) => ({ ...item._id, visitors: item.visitors })),
          devices: deviceStats.map((item) => ({ device: item._id || 'Unknown', visitors: item.visitors })),
          recent_visitors: recentVisitors.slice(0, visitorPageSize).map((item) => ({
            id: item.id, visitor_id: item.visitor_id, page: item.page, product_slug: item.product_slug,
            device_type: item.device_type || 'Unknown', browser: !item.browser || item.browser === 'Browser' ? 'Unknown' : item.browser,
            device_model: item.device_model || 'Unknown',
            operating_system: !item.operating_system || item.operating_system === 'OS' ? 'Unknown' : item.operating_system, latitude: item.latitude ?? null,
            longitude: item.longitude ?? null, location_accuracy: item.location_accuracy ?? null,
            location_permission: item.location_permission || 'not_requested',
            location: locationLabel(item), first_touch: item.first_touch || null,
            first_seen: item.first_seen, last_seen: item.last_seen,
            session_count: item.session_count || null,
            online: Boolean(item.last_seen && new Date(item.last_seen) >= twoMinutesAgo),
          })),
        })
      } catch (err) {
        console.error('Visitor analytics summary error:', err)
        return json({ error: 'Failed to load visitor analytics' }, 500)
      }
    }
    if (route === '/admin/analytics/visitor' && method === 'GET') {
      try {
        if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401)
        const visitorId = String(request.nextUrl.searchParams.get('visitor_id') || '').slice(0, 100)
        if (!visitorId) return json({ error: 'Visitor ID required' }, 400)
        const eventStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        const [visitor, events, sessionCount, pageCount] = await Promise.all([
          database.collection('visitor_sessions').findOne({ visitor_id: visitorId }, {
            projection: { _id: 0, id: 1, visitor_id: 1, ip: 1, page: 1, product_slug: 1, device_type: 1, device_model: 1, platform_version: 1, client_hint_platform: 1, browser: 1, operating_system: 1, latitude: 1, longitude: 1, location_accuracy: 1, location_permission: 1, first_seen: 1, last_seen: 1, first_touch: 1, session_count: 1 },
          }),
          database.collection('visitor_events').find({ visitor_id: visitorId, created_at: { $gte: eventStart } }, {
            projection: { _id: 0, event_name: 1, page: 1, product_slug: 1, category_slug: 1, session_id: 1, created_at: 1, first_touch: 1 },
          }).sort({ created_at: -1 }).limit(100).toArray(),
          database.collection('visitor_events').aggregate([
            { $match: { visitor_id: visitorId, created_at: { $gte: eventStart }, session_id: { $type: 'string' } } },
            { $group: { _id: '$session_id' } }, { $count: 'count' },
          ]).toArray(),
          database.collection('visitor_events').countDocuments({
            visitor_id: visitorId,
            created_at: { $gte: eventStart },
            $or: [
              { event_name: { $in: ['page_view', 'category_view', 'product_view'] } },
              { event_name: { $exists: false } },
            ],
          }),
        ])
        if (!visitor) return json({ error: 'Visitor not found' }, 404)
        const online = Boolean(visitor.last_seen && new Date(visitor.last_seen) >= new Date(Date.now() - 2 * 60 * 1000))
        return json({
          visitor: {
            id: visitor.id, visitor_id: visitor.visitor_id, page: visitor.page,
            product_slug: visitor.product_slug, device_type: visitor.device_type || 'Unknown',
            device_model: visitor.device_model || 'Unknown',
            platform_version: visitor.platform_version || null,
            platform: visitor.client_hint_platform || (!visitor.operating_system || visitor.operating_system === 'OS' ? 'Unknown' : visitor.operating_system),
            browser: !visitor.browser || visitor.browser === 'Browser' ? 'Unknown' : visitor.browser,
            operating_system: !visitor.operating_system || visitor.operating_system === 'OS' ? 'Unknown' : visitor.operating_system,
            ip_address: visitor.ip && isIP(visitor.ip) ? visitor.ip : 'Unknown',
            latitude: visitor.location_permission === 'granted' ? visitor.latitude ?? null : null,
            longitude: visitor.location_permission === 'granted' ? visitor.longitude ?? null : null,
            location_accuracy: visitor.location_accuracy ?? null,
            location_permission: visitor.location_permission || 'not_requested',
            first_seen: visitor.first_seen, last_seen: visitor.last_seen,
            session_count: sessionCount[0]?.count || 0,
            page_count: pageCount, page_count_days: 90, first_touch: visitor.first_touch || null, online,
          },
          events: events.map((event) => ({
            event_name: event.event_name || (String(event.page || '').startsWith('/product/') ? 'product_view' : String(event.page || '').startsWith('/category/') ? 'category_view' : event.page === '/checkout' ? 'checkout_started' : 'page_view'),
            page: event.page, product_slug: event.product_slug, category_slug: event.category_slug,
            created_at: event.created_at,
          })),
        })
      } catch (err) {
        console.error('Visitor detail error:', err)
        return json({ error: 'Failed to load visitor details' }, 500)
      }
    }
    if (route === '/health' && method === 'GET') return json({ ok: true })

    // Helper to format settings consistently with robust shipping fields
    const normalizeSettingsDoc = (s) => {
      const stripped = strip(s) || {}
      stripped.combos_enabled = s?.combos_enabled !== false

      const ship = s?.shipping || {}
      const deliveryEnabled = ship.delivery_enabled !== false
      const deliveryCharge = Math.max(
        0,
        ship.delivery_charge !== undefined && ship.delivery_charge !== null
          ? Number(ship.delivery_charge) || 0
          : 80
      )
      const freeThreshold = Math.max(
        0,
        ship.free_shipping_threshold !== undefined && ship.free_shipping_threshold !== null
          ? Number(ship.free_shipping_threshold) || 0
          : 2999
      )
      const freeThresholdEnabled = ship.free_delivery_threshold_enabled !== false
      const deliveryTimeframe = ship.delivery_timeframe || '5–7 working days'

      stripped.shipping = {
        delivery_enabled: deliveryEnabled,
        delivery_charge: deliveryCharge,
        free_shipping_threshold: freeThreshold,
        free_delivery_threshold_enabled: freeThresholdEnabled,
        delivery_timeframe: deliveryTimeframe,
        default_courier: ship.default_courier || '',
        delivery_charges: ship.delivery_charges || `Flat ₹${deliveryCharge}. Free above ₹${freeThreshold.toLocaleString('en-IN')}.`,
        return_policy: ship.return_policy || 'Easy 3-day return on unworn pieces with tags.',
        exchange_policy: ship.exchange_policy || 'Size exchange available within 5 days.',
      }

      stripped.instagram_feed = normalizeInstagramSettings(s?.instagram_feed)
      stripped.pwa = {
        install_prompt_enabled: s?.pwa?.install_prompt_enabled !== false,
      }
      return stripped
    }

    // ===== PUBLIC SETTINGS =====
    if (route === '/settings' && method === 'GET') {
      const s = await database.collection('settings').findOne({ id: 'global' })
      return json(normalizeSettingsDoc(s), 200, { 'Cache-Control': 'no-store, max-age=0' })
    }

    // ===== PUBLIC INSTAGRAM FEED =====
    if (route === '/instagram/feed' && method === 'GET') {
      const feed = await getStorefrontInstagramFeed(database)
      return json(feed)
    }

    // ===== PUBLIC VIRTUAL TRY-ON =====
    if (route === '/tryon/settings' && method === 'GET') {
      const s = await database.collection('settings').findOne({ id: 'global' })
      const tryonSettings = normalizeTryOnSettings(s?.ai_tryon)
      return json({
        enabled: tryonSettings.enabled,
        product_tryon_enabled: tryonSettings.product_tryon_enabled,
        combo_tryon_enabled: tryonSettings.combo_tryon_enabled,
        allow_guests: tryonSettings.allow_guests,
        show_privacy_notice: tryonSettings.show_privacy_notice,
        disclaimer_text: tryonSettings.disclaimer_text,
      }, 200, { 'Cache-Control': 'no-store, max-age=0' })
    }

    if (route === '/tryon/generate' && method === 'POST') {
      const authCustomer = await getCustomerFromRequest(request, database).catch(() => null)
      const userId = authCustomer?.id || null
      const contentType = request.headers.get('content-type') || ''

      let personImageBuffer, personImageMime, personImageSize, mode, productId, colour, size, comboSlug, comboSelections, sessionId

      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData()
        const file = form.get('person_image') || form.get('image') || form.get('file')
        if (file && typeof file !== 'string') {
          personImageBuffer = Buffer.from(await file.arrayBuffer())
          personImageMime = file.type || 'image/jpeg'
          personImageSize = file.size
        }
        mode = form.get('mode') || 'single'
        productId = form.get('product_id')
        colour = form.get('colour')
        size = form.get('size')
        comboSlug = form.get('combo_slug') || form.get('combo_id')
        const selStr = form.get('selections')
        if (selStr) {
          try {
            comboSelections = JSON.parse(selStr)
          } catch {}
        }
        sessionId = form.get('session_id') || request.headers.get('x-session-id')
      } else {
        const body = await request.json()
        if (body.image_base64 || body.person_image_base64) {
          const raw = body.image_base64 || body.person_image_base64
          const matches = String(raw).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
          if (matches && matches.length === 3) {
            personImageMime = matches[1]
            personImageBuffer = Buffer.from(matches[2], 'base64')
          } else {
            personImageBuffer = Buffer.from(raw, 'base64')
            personImageMime = 'image/jpeg'
          }
          personImageSize = personImageBuffer.length
        }
        mode = body.mode || 'single'
        productId = body.product_id
        colour = body.colour
        size = body.size
        comboSlug = body.combo_slug || body.combo_id
        comboSelections = body.selections
        sessionId = body.session_id || request.headers.get('x-session-id')
      }

      if (!sessionId) {
        sessionId = generateCorrelationId()
      }

      try {
        const result = await generateVirtualTryOn(database, {
          personImageBuffer,
          personImageMime,
          personImageSize,
          mode,
          productId,
          colour,
          size,
          comboSlug,
          comboSelections,
          sessionId,
          userId,
        })

        return json(result)
      } catch (err) {
        const code = err.code || ERROR_CODES.TRYON_GENERATION_FAILED
        const userMsg = getCustomerFacingMessage(code, err.message)
        let status = 400
        if (code === ERROR_CODES.AUTH_REQUIRED) status = 401
        else if (
          code === ERROR_CODES.TRYON_RATE_LIMITED ||
          code === ERROR_CODES.PIXELAPI_RATE_LIMITED ||
          code === ERROR_CODES.GEMINI_RATE_LIMITED
        ) status = 429
        else if (
          code === ERROR_CODES.TRYON_NOT_CONFIGURED ||
          code === ERROR_CODES.PIXELAPI_CONFIGURATION_ERROR ||
          code === ERROR_CODES.GEMINI_CONFIGURATION_ERROR
        ) status = 503
        else if (
          code === ERROR_CODES.PIXELAPI_TIMEOUT ||
          code === ERROR_CODES.TRYON_PROVIDER_TIMEOUT ||
          code === ERROR_CODES.GEMINI_TIMEOUT
        ) status = 504
        else if (code === ERROR_CODES.TRYON_INVALID_PRODUCT) status = 404

        return apiError({
          code,
          message: userMsg,
          status,
          requestId,
        })
      }
    }

    if (route === '/tryon/analytics' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        const authCustomer = await getCustomerFromRequest(request, database).catch(() => null)
        await recordTryOnAnalytics(database, {
          event: body.event,
          productId: body.product_id,
          comboSlug: body.combo_slug,
          colour: body.colour,
          size: body.size,
          userId: authCustomer?.id || null,
          sessionId: body.session_id,
        })
        return json({ ok: true })
      } catch {
        return json({ ok: true })
      }
    }

    // ===== CATEGORIES =====
    if (route === '/categories' && method === 'GET') {
      const cats = await database.collection('categories')
        .find({ active: true }).sort({ display_order: 1 }).toArray()
      // attach counts
      const out = await Promise.all(cats.map(async (c) => {
        const count = await database.collection('products').countDocuments({ category_id: c.id, active: true })
        return { ...strip(c), product_count: count }
      }))
      return json(out)
    }

    // ===== PRODUCTS (public) =====
    if (route === '/products' && method === 'GET') {
      const url = new URL(request.url)
      const q = url.searchParams
      const filter = { active: true }
      if (q.get('category')) {
        const cat = await database.collection('categories').findOne({ slug: q.get('category') })
        if (cat) filter.category_id = cat.id
        else return json([])
      }
      if (q.get('new') === 'true') filter.new_arrival = true
      if (q.get('featured') === 'true') filter.featured = true
      if (q.get('colour')) filter.colour = { $regex: q.get('colour'), $options: 'i' }
      if (q.get('search')) {
        const rx = { $regex: q.get('search'), $options: 'i' }
        filter.$or = [{ name: rx }, { sku: rx }, { category_name: rx }, { colour: rx }]
      }
      const min = q.get('minPrice'); const max = q.get('maxPrice')
      if (min || max) {
        filter.price = {}
        if (min) filter.price.$gte = Number(min)
        if (max) filter.price.$lte = Number(max)
      }
      let list = await database.collection('products').find(filter).toArray()
      if (q.get('availability') === 'in') list = list.filter((p) => p.stock > 0)
      if (q.get('size')) list = list.filter((p) => (p.sizes || []).some((s) => s.size === q.get('size') && s.available))
      const sort = q.get('sort')
      if (sort === 'price_asc') list.sort((a, b) => (a.discount_price || a.price) - (b.discount_price || b.price))
      else if (sort === 'price_desc') list.sort((a, b) => (b.discount_price || b.price) - (a.discount_price || a.price))
      else if (sort === 'featured') list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
      else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      return json(list.map(strip))
    }

    if ((parts[0] === 'products' || parts[0] === 'product') && parts.length === 2 && method === 'GET') {
      const rawParam = decodeURIComponent(parts[1]).trim()
      const safeRegex = rawParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const p = await database.collection('products').findOne({
        $and: [
          {
            $or: [
              { slug: rawParam },
              { slug: slugify(rawParam) },
              { slug: { $regex: new RegExp(`^${safeRegex}$`, 'i') } },
              { id: rawParam },
            ],
          },
          { active: { $ne: false } },
        ],
      })
      if (!p) return json({ error: 'Product not found' }, 404)
      return json(strip(p))
    }

    // ===== PROMOTIONS & COUPONS (public validation & preview) =====
    if ((route === '/promotions/apply-coupon' || route === '/coupons/validate') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { code, items = [], cart_subtotal = 0, customer = {} } = body
      if (!code) return json({ valid: false, error: 'Coupon code is required.' }, 400)

      const authCustomer = await getCustomerFromRequest(request, database)
      const userId = authCustomer?.id || null

      let orderItems = items
      // If items not provided or empty, validate against subtotal only
      if (!orderItems.length && cart_subtotal > 0) {
        const subtotal = Number(cart_subtotal) || 0
        const couponRes = await validateCoupon({
          database,
          couponCode: code,
          subtotal,
          verifiedItems: [],
          customer,
          userId,
        })
        if (!couponRes.valid) {
          return json({ valid: false, error: couponRes.error }, 400)
        }
        return json({
          valid: true,
          coupon: couponRes.coupon,
          discount: couponRes.discountAmount,
        })
      }

      const pricing = await calculateOrderPricing({
        database,
        items: orderItems,
        couponCode: code,
        customer,
        userId,
      })

      if (!pricing.success) {
        return json({ valid: false, error: pricing.error }, 400)
      }

      if (pricing.couponError || !pricing.appliedCoupon) {
        return json({ valid: false, error: pricing.couponError || 'Coupon is invalid for this order.' }, 400)
      }

      return json({
        valid: true,
        coupon: pricing.appliedCoupon,
        discount: pricing.discount,
        subtotal: pricing.subtotal,
        shipping: pricing.shipping,
        total: pricing.total,
        isFreeShipping: pricing.isFreeShipping,
        freeDeliveryReason: pricing.freeDeliveryReason,
      })
    }

    if (route === '/promotions/free-delivery-rules' && method === 'GET') {
      await ensurePromotionsSeeded(database)
      const rules = await database.collection('free_delivery_rules').find({ isActive: true }).toArray()
      const settings = await database.collection('settings').findOne({ id: 'global' })
      return json({
        rules: rules.map(strip),
        defaultThreshold: Number(settings?.shipping?.free_shipping_threshold) || 2999,
      })
    }

    // ===== COMBOS & BUNDLES (public routes) =====
    if (route === '/combos' && method === 'GET') {
      await ensureCombosSeeded(database)
      const settings = await database.collection('settings').findOne({ id: 'global' })
      if (settings && settings.combos_enabled === false) {
        return json([])
      }

      const allCombos = await database
        .collection('combos')
        .find({ active: { $ne: false } })
        .sort({ display_order: 1, created_at: -1 })
        .toArray()

      const activeCombos = allCombos.filter((c) => isComboActive(c))
      const populated = await Promise.all(
        activeCombos.map((combo) => populateComboSlots({ database, combo }))
      )
      return json(populated.map(strip))
    }

    if (route === '/combos/validate' && method === 'POST') {
      await ensureCombosSeeded(database)
      const settings = await database.collection('settings').findOne({ id: 'global' })
      if (settings && settings.combos_enabled === false) {
        return json({ valid: false, error: 'Curated Combos & Ensembles are currently disabled.' }, 400)
      }

      const body = await request.json().catch(() => ({}))
      const { combo_id, selections = [], quantity = 1 } = body
      if (!combo_id) {
        return json({ valid: false, error: 'Combo ID is required.' }, 400)
      }

      const res = await validateAndCalculateCombo({
        database,
        comboId: combo_id,
        selections,
        quantity,
      })

      if (!res.success) {
        return json({ valid: false, error: res.error, slotId: res.slotId, productId: res.productId }, 400)
      }

      return json({ valid: true, ...res })
    }

    if (route.startsWith('/combos/') && method === 'GET') {
      await ensureCombosSeeded(database)
      const settings = await database.collection('settings').findOne({ id: 'global' })
      if (settings && settings.combos_enabled === false) {
        return json({ error: 'Combos are currently unavailable.' }, 404)
      }

      const identifier = decodeURIComponent(route.replace('/combos/', '')).trim()
      if (!identifier) return json({ error: 'Combo identifier required' }, 400)

      const combo = await database.collection('combos').findOne({
        $or: [{ slug: identifier }, { id: identifier }],
      })

      if (!combo || !isComboActive(combo)) {
        return json({ error: 'Combo not found or currently unavailable' }, 404)
      }

      const populated = await populateComboSlots({ database, combo })
      return json(strip(populated))
    }

    // ===== ORDER TRACKING =====
    if (route === '/orders/track' && method === 'GET') {
      const url = new URL(request.url)
      const orderNumber = (url.searchParams.get('order_number') || '').trim()
      const contact = (url.searchParams.get('contact') || '').trim().toLowerCase()

      if (!orderNumber) {
        return json({ error: 'Order reference number is required' }, 400)
      }

      const order = await database.collection('orders').findOne({
        order_number: { $regex: new RegExp(`^${orderNumber}$`, 'i') },
      })

      if (!order) {
        return json({ error: 'No order found with the provided reference number.' }, 404)
      }

      // If contact provided, verify
      if (contact) {
        const custPhone = (order.customer?.whatsapp || order.customer?.phone || '').replace(/[^0-9]/g, '')
        const custEmail = (order.customer?.email || '').toLowerCase()
        const matchPhone = custPhone && custPhone.includes(contact.replace(/[^0-9]/g, ''))
        const matchEmail = custEmail && custEmail.includes(contact)

        if (!matchPhone && !matchEmail) {
          return json({ error: 'Verification failed. Please enter the phone number or email used during order placement.' }, 403)
        }
      }

      return json({
        order_number: order.order_number,
        status: order.status || 'NEW',
        payment_status: order.payment_status || 'PENDING',
        payment_method: order.payment_method || 'WHATSAPP_CONCIERGE',
        created_at: order.created_at,
        updated_at: order.updated_at,
        items: order.items || [],
        subtotal: order.subtotal || order.total,
        discount: order.discount || 0,
        shipping: order.shipping || 0,
        total: order.total,
        shipping_info: {
          courier: order.courier || null,
          tracking_number: order.tracking_number || null,
          estimated_delivery: order.estimated_delivery || '5–7 Business Days',
          destination_city: order.customer?.city || 'India',
        },
      })
    }

    // ===== GET SINGLE ORDER (confirmation/receipt) =====
    if (parts[0] === 'orders' && parts.length === 2 && method === 'GET') {
      const ref = parts[1]
      const order = await database.collection('orders').findOne({
        $or: [
          { id: ref },
          { order_number: ref },
          { order_number: { $regex: new RegExp(`^${ref}$`, 'i') } },
          { cashfree_order_id: ref },
          { 'payment.cashfree_order_id': ref },
        ],
      })
      if (!order) return json({ error: 'Order not found' }, 404)
      return json(strip(order))
    }

    // ===== CASHFREE PAYMENT INTEGRATION =====
    // 1. Create Cashfree Order
    if ((route === '/payments/cashfree/create-order' || route === '/checkout/create-cashfree-order') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { items = [], customer: incomingCustomer = {}, coupon_code } = body

      if (!items.length) {
        return json({ error: 'Shopping bag is empty' }, 400)
      }

      const authCustomer = await getCustomerFromRequest(request, database)
      const userId = authCustomer?.id || null

      // Validate address & customer
      const validation = validateAddress(incomingCustomer, { requireDistrict: false })
      const customer = validation.isValid ? validation.sanitized : {
        fullName: incomingCustomer.name || incomingCustomer.fullName || authCustomer?.name || 'Guest Customer',
        phone: incomingCustomer.phone || incomingCustomer.whatsapp || authCustomer?.phone || '9999999999',
        whatsapp: incomingCustomer.whatsapp || incomingCustomer.phone || authCustomer?.phone || '9999999999',
        email: incomingCustomer.email || authCustomer?.email || 'care@thretha.in',
        addressLine1: incomingCustomer.house || incomingCustomer.addressLine1 || '',
        addressLine2: incomingCustomer.street || incomingCustomer.addressLine2 || '',
        city: incomingCustomer.city || '',
        district: incomingCustomer.district || '',
        state: incomingCustomer.state || 'Kerala',
        postalCode: incomingCustomer.pincode || incomingCustomer.postalCode || '',
        country: 'India',
      }

      // Authoritative pricing & validation calculation
      const pricing = await calculateOrderPricing({
        database,
        items,
        couponCode: coupon_code,
        customer,
        userId,
      })

      if (!pricing.success) {
        return json({ error: pricing.error }, 400)
      }

      const subtotal = pricing.subtotal
      const discount = pricing.discount
      const shipping = pricing.shipping
      const total = pricing.total
      const verifiedItems = pricing.items

      if (!isCashfreeConfigured()) {
        return json({
          ok: false,
          configured: false,
          error: 'Cashfree payment gateway is not yet configured with API keys. Please select WhatsApp Concierge or add CASHFREE_APP_ID & CASHFREE_SECRET_KEY to .env.local.',
        }, 400)
      }

      const orderNumber = await nextOrderNumber(database)
      const orderId = uuidv4()
      const cashfreeOrderId = generateCashfreeOrderId(orderNumber)

      try {
        const cfRes = await createCashfreeOrder({
          orderId: cashfreeOrderId,
          orderAmount: total,
          customer: {
            id: userId || `cust_${uuidv4().slice(0, 8)}`,
            name: customer.fullName || customer.name,
            email: customer.email,
            phone: customer.phone || customer.whatsapp,
          },
          orderNote: `Thretha Couture Order ${orderNumber}`,
          orderTags: { order_number: orderNumber },
        })

        const order = {
          id: orderId,
          order_number: orderNumber,
          userId: userId,
          customer_id: uuidv4(),
          customer: customer,
          items: verifiedItems,
          subtotal,
          discount,
          shipping,
          shipping_reason: pricing.shippingReason || (shipping === 0 ? 'FREE_DELIVERY' : 'STANDARD'),
          shipping_rule_snapshot: pricing.shipping_rule_snapshot || null,
          total,
          promotion: pricing.appliedPromotion ? {
            type: pricing.appliedPromotion.type,
            code: pricing.appliedPromotion.code,
            couponCode: pricing.appliedPromotion.code,
            ruleId: pricing.appliedPromotion.type === 'free_delivery' ? pricing.appliedPromotion.id : null,
            discountType: pricing.appliedPromotion.discountType,
            discountValue: pricing.appliedPromotion.discountValue,
            discountAmount: pricing.discount,
            shippingDiscount: pricing.appliedPromotion.type === 'free_delivery' ? (pricing.shipping_rule_snapshot?.delivery_charge || 80) : 0,
          } : null,
          payment_method: 'CASHFREE',
          payment_status: 'PENDING',
          status: 'PENDING',
          cashfree_order_id: cashfreeOrderId,
          cashfree_session_id: cfRes.payment_session_id,
          payment: {
            provider: 'cashfree',
            cashfree_order_id: cashfreeOrderId,
            cf_order_id: cfRes.cf_order_id,
            status: 'PENDING',
            amount: total,
            currency: 'INR',
          },
          courier: pricing.shipping_rule_snapshot?.default_courier || null,
          tracking_number: null,
          created_at: new Date(),
          updated_at: new Date(),
        }

        await database.collection('orders').insertOne(order)

        return json({
          ok: true,
          configured: true,
          payment_session_id: cfRes.payment_session_id,
          order_id: cashfreeOrderId,
          cf_order_id: cfRes.cf_order_id,
          order_number: orderNumber,
          mode: getCashfreeConfig().env,
          order: strip(order),
        })
      } catch (err) {
        console.error('[Cashfree:CreateOrder] Error:', err.message)
        return json({ error: 'Online payment is temporarily unavailable. Please try again later.' }, 500)
      }
    }

    // 2. Verify Cashfree Payment
    if ((route === '/payments/cashfree/verify' || route === '/checkout/verify-payment') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { order_id, cashfree_order_id, cf_payment_id } = body
      const targetCfOrderId = cashfree_order_id || order_id

      if (!targetCfOrderId) {
        return json({ error: 'Missing Cashfree order identifier' }, 400)
      }

      // Find target order in MongoDB
      const order = await database.collection('orders').findOne({
        $or: [
          { cashfree_order_id: targetCfOrderId },
          { 'payment.cashfree_order_id': targetCfOrderId },
          { id: targetCfOrderId },
          { order_number: targetCfOrderId },
          { order_number: { $regex: new RegExp(`^${targetCfOrderId}$`, 'i') } },
        ],
      })

      if (!order) {
        return json({ error: 'Order not found' }, 404)
      }

      // Idempotency: If already paid, return immediately
      if (order.payment_status === 'PAID') {
        return json({
          verified: true,
          payment_status: 'PAID',
          payment_id: order.payment?.cashfree_payment_id || order.payment_id,
          order_number: order.order_number,
          order_id: order.id,
          order: strip(order),
        })
      }

      if (!isCashfreeConfigured()) {
        return json({ error: 'Cashfree API keys not configured on server' }, 500)
      }

      try {
        const cfOrderId = order.cashfree_order_id || targetCfOrderId
        const [cfOrderRes, cfPaymentsRes] = await Promise.all([
          fetchCashfreeOrder(cfOrderId),
          fetchCashfreePayments(cfOrderId).catch(() => ({ payments: [] })),
        ])

        const cfOrder = cfOrderRes.order
        const successfulPayment = cfPaymentsRes.payments?.find((p) => p.payment_status === 'SUCCESS')
        const isPaid = cfOrder?.order_status === 'PAID' || Boolean(successfulPayment)

        if (isPaid) {
          const verifiedPaymentId = successfulPayment?.cf_payment_id || cf_payment_id || cfOrder?.cf_order_id
          const { order: finalizedOrder } = await finalizePaidOrder({
            database,
            orderId: order.id,
            paymentId: verifiedPaymentId,
            paymentData: successfulPayment || {},
          })

          const finalDoc = finalizedOrder || order

          // Trigger idempotent order notifications safely
          dispatchOrderNotifications({
            database,
            orderId: finalDoc.id || order.id,
            event: 'ORDER_CONFIRMED',
            appUrl: getCashfreePublicBaseUrl(request),
          }).catch((e) => console.error('[Notifications:Verify] Error:', e.message))

          return json({
            verified: true,
            payment_status: 'PAID',
            payment_id: verifiedPaymentId,
            order_number: finalDoc.order_number || order.order_number,
            order_id: finalDoc.id || order.id,
            order: strip(finalDoc),
          })
        }

        const failedPayment = cfPaymentsRes.payments?.find((p) => p.payment_status === 'FAILED' || p.payment_status === 'USER_DROPPED' || p.payment_status === 'CANCELLED')
        if (failedPayment || cfOrder?.order_status === 'EXPIRED') {
          const failStatus = failedPayment?.payment_status || cfOrder?.order_status || 'FAILED'
          await database.collection('orders').updateOne(
            { id: order.id },
            {
              $set: {
                'payment.status': failStatus,
                'payment.failure_reason': failedPayment?.payment_message || `Payment ${failStatus}`,
                updated_at: new Date(),
              },
            }
          )
          return json({
            verified: false,
            payment_status: failStatus,
            error: failedPayment?.payment_message || 'Payment transaction failed or was cancelled.',
          }, 400)
        }

        // Pending / Active
        return json({
          verified: false,
          payment_status: cfOrder?.order_status || 'PENDING',
          message: 'Payment verification in progress.',
        })
      } catch (err) {
        console.error('[Cashfree:Verify] Error:', err.message)
        return json({ error: err.message || 'Payment verification request failed.' }, 500)
      }
    }

    // 3. Cashfree Webhook
    if (route === '/payments/cashfree/webhook' && method === 'POST') {
      const rawBody = await request.text().catch(() => '')
      const timestamp = (
        request.headers.get('x-webhook-timestamp') ||
        request.headers.get('x-cf-timestamp') ||
        request.headers.get('x-cashfree-timestamp') ||
        request.headers.get('x-event-time') ||
        ''
      ).trim()
      const signature = (
        request.headers.get('x-webhook-signature') ||
        request.headers.get('x-cf-signature') ||
        request.headers.get('x-cashfree-signature') ||
        ''
      ).trim()

      if (!rawBody) {
        return json({ error: 'Empty webhook payload' }, 400)
      }

      const isValid = verifyCashfreeWebhookSignature({ rawBody, timestamp, signature })
      if (!isValid) {
        console.warn('[Cashfree:Webhook] Invalid signature received')
        return json({ error: 'Invalid webhook signature' }, 401)
      }

      let payload = {}
      try {
        payload = JSON.parse(rawBody)
      } catch {
        return json({ error: 'Invalid JSON payload' }, 400)
      }

      const eventType = payload.type || payload.event
      const data = payload.data || {}
      const cfOrderId = data.order?.order_id || data.payment?.order_id || data.refund?.order_id

      if (!cfOrderId) {
        return json({ ok: true, message: 'Ignored webhook without order_id' })
      }

      const order = await database.collection('orders').findOne({
        $or: [
          { cashfree_order_id: cfOrderId },
          { 'payment.cashfree_order_id': cfOrderId },
          { id: cfOrderId },
          { order_number: cfOrderId },
        ],
      })

      if (!order) {
        console.warn('[Cashfree:Webhook] No matching order for order_id:', cfOrderId)
        return json({ ok: true, message: 'Order not found' })
      }

      const isPaymentSuccess =
        eventType === 'PAYMENT_SUCCESS_WEBHOOK' ||
        eventType === 'ORDER_PAID_WEBHOOK' ||
        data.payment?.payment_status === 'SUCCESS'

      if (isPaymentSuccess) {
        const paymentId = data.payment?.cf_payment_id || data.payment?.payment_id || 'webhook_success'
        const { order: finalizedOrder } = await finalizePaidOrder({
          database,
          orderId: order.id,
          paymentId,
          paymentData: data.payment || {},
        })

        const finalDoc = finalizedOrder || order

        // Trigger idempotent order notifications safely
        dispatchOrderNotifications({
          database,
          orderId: finalDoc.id || order.id,
          event: 'ORDER_CONFIRMED',
          appUrl: getCashfreePublicBaseUrl(request),
        }).catch((e) => console.error('[Notifications:Webhook] Error:', e.message))

        return json({ ok: true, message: 'Payment successfully processed via webhook' })
      }

      if (eventType === 'PAYMENT_FAILED_WEBHOOK' || data.payment?.payment_status === 'FAILED') {
        await database.collection('orders').updateOne(
          { id: order.id },
          {
            $set: {
              'payment.status': 'FAILED',
              'payment.failure_reason': data.payment?.payment_message || 'Payment Failed Webhook',
              updated_at: new Date(),
            },
          }
        )
      }

      if (eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' || data.payment?.payment_status === 'USER_DROPPED') {
        await database.collection('orders').updateOne(
          { id: order.id },
          {
            $set: {
              'payment.status': 'USER_DROPPED',
              'payment.failure_reason': 'User dropped payment modal',
              updated_at: new Date(),
            },
          }
        )
      }

      // Cashfree Refund Webhooks (STATUS_CHANGE, SUCCESS, FAILED)
      const isRefundWebhook =
        eventType === 'REFUND_STATUS_CHANGE_WEBHOOK' ||
        eventType === 'REFUND_SUCCESS_WEBHOOK' ||
        eventType === 'REFUND_FAILED_WEBHOOK' ||
        Boolean(data.refund)

      if (isRefundWebhook) {
        const refundInfo = data.refund || {}
        const isSuccess = eventType === 'REFUND_SUCCESS_WEBHOOK' || refundInfo.refund_status === 'SUCCESS'
        const isFailed = eventType === 'REFUND_FAILED_WEBHOOK' || refundInfo.refund_status === 'FAILED'

        const itemRefundIndex = refundInfo.refund_id ? (order.items || []).findIndex(item => item.cancellation?.refund_id === refundInfo.refund_id) : -1
        if (itemRefundIndex >= 0 && isSuccess) {
          await finalizeCompletedItemRefund({ database, orderId: order.id, refundId: refundInfo.refund_id, refundData: refundInfo })
          return json({ ok: true, message: 'Item refund completion processed' })
        }
        if (itemRefundIndex >= 0 && isFailed) {
          await database.collection('orders').updateOne(
            { id: order.id, [`items.${itemRefundIndex}.cancellation.refund_id`]: refundInfo.refund_id },
            { $set: { [`items.${itemRefundIndex}.cancellation.status`]: 'FAILED', [`items.${itemRefundIndex}.cancellation.refund_status`]: 'FAILED', [`items.${itemRefundIndex}.cancellation.failure_confirmed`]: true, [`items.${itemRefundIndex}.cancellation.failure_reason`]: refundInfo.status_description || 'Cashfree item refund failed', updated_at: new Date() } }
          )
          return json({ ok: true, message: 'Item refund failure processed' })
        }

        if (isSuccess) {
          await finalizeCompletedRefund({
            database,
            orderId: order.id,
            refundData: refundInfo,
            appUrl: getCashfreePublicBaseUrl(request),
          })
          return json({ ok: true, message: 'Refund completed webhook successfully processed' })
        }

        if (isFailed) {
          await database.collection('orders').updateOne(
            { id: order.id, 'refund.id': refundInfo.refund_id || order.refund?.id },
            {
              $set: {
                status: order.cancellation?.previous_status || 'CONFIRMED',
                'cancellation.status': 'REJECTED',
                'payment.refund_status': 'FAILED',
                'payment.refund_failure_reason': refundInfo.status_description || 'Cashfree Refund Failed',
                'refund.status': 'FAILED',
                'refund.failure_confirmed': true,
                'refund.failure_reason': refundInfo.status_description || 'Cashfree Refund Failed',
                'refund.failed_at': new Date(),
                updated_at: new Date(),
              },
            }
          )

          dispatchOrderNotifications({
            database,
            orderId: order.id,
            event: 'REFUND_FAILED',
            appUrl: getCashfreePublicBaseUrl(request),
          }).catch((e) => console.error('[Notifications:WebhookRefundFailed] Error:', e.message))

          return json({ ok: true, message: 'Refund failure webhook successfully processed' })
        }

        return json({ ok: true, message: 'Refund webhook status received' })
      }

      return json({ ok: true })
    }

    // 4. Cashfree Return / Callback URL (User redirect handler)
    if (route === '/payments/cashfree/callback' && method === 'GET') {
      const url = new URL(request.url)
      const cfOrderId = url.searchParams.get('order_id')
      if (!cfOrderId) {
        return createSafeRedirect('/checkout', request)
      }

      const order = await database.collection('orders').findOne({
        $or: [
          { cashfree_order_id: cfOrderId },
          { 'payment.cashfree_order_id': cfOrderId },
        ],
      })

      if (!order) {
        return createSafeRedirect('/checkout?error=order_not_found', request)
      }

      if (order.payment_status === 'PAID') {
        return createSafeRedirect(`/order/${order.order_number || order.id}?payment=success`, request)
      }

      // Check with Cashfree API
      try {
        const cfOrderRes = await fetchCashfreeOrder(cfOrderId)
        const cfPaymentsRes = await fetchCashfreePayments(cfOrderId).catch(() => ({ payments: [] }))
        const successfulPayment = cfPaymentsRes.payments?.find((p) => p.payment_status === 'SUCCESS')
        const isPaid = cfOrderRes.order?.order_status === 'PAID' || Boolean(successfulPayment)

        if (isPaid) {
          const verifiedPaymentId = successfulPayment?.cf_payment_id || cfOrderRes.order?.cf_order_id
          const { order: finalizedOrder } = await finalizePaidOrder({
            database,
            orderId: order.id,
            paymentId: verifiedPaymentId,
            paymentData: successfulPayment || {},
          })

          const finalDoc = finalizedOrder || order

          // Trigger idempotent order notifications safely
          dispatchOrderNotifications({
            database,
            orderId: finalDoc.id || order.id,
            event: 'ORDER_CONFIRMED',
            appUrl: getCashfreePublicBaseUrl(request),
          }).catch((e) => console.error('[Notifications:Callback] Error:', e.message))

          return createSafeRedirect(`/order/${finalDoc.order_number || finalDoc.id}?payment=success`, request)
        }

        const failed = cfPaymentsRes.payments?.find((p) => p.payment_status === 'FAILED' || p.payment_status === 'USER_DROPPED')
        if (failed) {
          return createSafeRedirect(`/order/${order.order_number || order.id}?payment=failed`, request)
        }

        return createSafeRedirect(`/order/${order.order_number || order.id}?payment=pending`, request)
      } catch (err) {
        console.error('[Cashfree:Callback] Error:', err.message)
        return createSafeRedirect(`/order/${order.order_number || order.id}?payment=pending`, request)
      }
    }

    // ===== ORDERS (public create) =====
    if (route === '/orders' && method === 'POST') {
      const body = await request.json()
      const { customer, item, items: incomingItems, coupon_code, payment_method = 'WHATSAPP_CONCIERGE' } = body

      // Server-side authoritative validation of customer address & contact
      const addressValidation = validateAddress(customer, { requireDistrict: false })
      if (!addressValidation.isValid) {
        const firstError = Object.values(addressValidation.errors)[0] || 'Please provide valid customer details.'
        return json({ error: firstError, errors: addressValidation.errors }, 400)
      }

      const sanitizedCustomer = {
        ...customer,
        name: addressValidation.sanitized.fullName,
        fullName: addressValidation.sanitized.fullName,
        phone: addressValidation.sanitized.phone,
        whatsapp: addressValidation.sanitized.whatsapp,
        house: addressValidation.sanitized.addressLine1,
        street: addressValidation.sanitized.addressLine2 || '',
        city: addressValidation.sanitized.city,
        district: addressValidation.sanitized.district || '',
        state: addressValidation.sanitized.state || 'Kerala',
        country: addressValidation.sanitized.country || 'India',
        pincode: addressValidation.sanitized.postalCode,
        postalCode: addressValidation.sanitized.postalCode,
        email: addressValidation.sanitized.email || customer?.email || '',
      }

      // Normalize items list (supports single piece or multi-item bag)
      const rawItems = incomingItems && incomingItems.length ? incomingItems : item ? [item] : []
      if (!rawItems.length) {
        return json({ error: 'No items in order request' }, 400)
      }

      // Attach authenticated customer userId if logged in
      const authCustomer = await getCustomerFromRequest(request, database)
      const userId = authCustomer?.id || null

      if (authCustomer && authCustomer.email) {
        sanitizedCustomer.email = authCustomer.email
      }

      // Authoritative pricing & validation calculation
      const pricing = await calculateOrderPricing({
        database,
        items: rawItems,
        couponCode: coupon_code,
        customer: sanitizedCustomer,
        userId,
      })

      if (!pricing.success) {
        return json({ error: pricing.error }, 400)
      }

      const subtotal = pricing.subtotal
      const discount = pricing.discount
      const shipping = pricing.shipping
      const total = pricing.total
      const verifiedItems = pricing.items

      // Save customer record
      const custId = uuidv4()
      await database.collection('customers').insertOne({
        id: custId,
        ...sanitizedCustomer,
        created_at: new Date(),
      })

      // Generate order number
      const orderNumber = await nextOrderNumber(database)

      // --- FLOW A: PAY ONLINE (CASHFREE) ---
      if (payment_method === 'CASHFREE' || payment_method === 'RAZORPAY') {
        if (!isCashfreeConfigured()) {
          return json({
            ok: false,
            configured: false,
            error: 'Cashfree payment gateway is not yet configured with API keys. Please select WhatsApp Concierge or add CASHFREE_APP_ID & CASHFREE_SECRET_KEY to .env.local.',
          }, 400)
        }

        const orderId = uuidv4()
        const cashfreeOrderId = generateCashfreeOrderId(orderNumber)

        try {
          const cfRes = await createCashfreeOrder({
            orderId: cashfreeOrderId,
            orderAmount: total,
            orderCurrency: 'INR',
            customerDetails: {
              customerId: custId || `cust_${orderId.slice(0, 8)}`,
              customerName: sanitizedCustomer.fullName || sanitizedCustomer.name,
              customerEmail: sanitizedCustomer.email,
              customerPhone: sanitizedCustomer.phone || sanitizedCustomer.whatsapp,
              name: sanitizedCustomer.fullName || sanitizedCustomer.name,
              email: sanitizedCustomer.email,
              phone: sanitizedCustomer.phone || sanitizedCustomer.whatsapp,
            },
            orderNote: `Thretha Couture Order ${orderNumber}`,
            orderTags: { order_number: orderNumber },
          })

          const order = {
            id: orderId,
            order_number: orderNumber,
            userId: userId,
            customer_id: custId,
            customer: sanitizedCustomer,
            items: verifiedItems,
            subtotal,
            discount,
            shipping,
            shipping_reason: pricing.shippingReason || (shipping === 0 ? 'FREE_DELIVERY' : 'STANDARD'),
            shipping_rule_snapshot: pricing.shipping_rule_snapshot || null,
            total,
            promotion: pricing.appliedPromotion ? {
              type: pricing.appliedPromotion.type,
              code: pricing.appliedPromotion.code,
              couponCode: pricing.appliedPromotion.code,
              ruleId: pricing.appliedPromotion.type === 'free_delivery' ? pricing.appliedPromotion.id : null,
              discountType: pricing.appliedPromotion.discountType,
              discountValue: pricing.appliedPromotion.discountValue,
              discountAmount: pricing.discount,
              shippingDiscount: pricing.appliedPromotion.type === 'free_delivery' ? (pricing.shipping_rule_snapshot?.delivery_charge || 80) : 0,
            } : null,
            payment_method: 'CASHFREE',
            payment_status: 'PENDING',
            status: 'PENDING',
            cashfree_order_id: cashfreeOrderId,
            cashfree_session_id: cfRes.payment_session_id,
            payment: {
              provider: 'cashfree',
              cashfree_order_id: cashfreeOrderId,
              cf_order_id: cfRes.cf_order_id,
              amount: total,
              currency: 'INR',
              status: 'PENDING',
            },
            courier: pricing.shipping_rule_snapshot?.default_courier || null,
            tracking_number: null,
            created_at: new Date(),
            updated_at: new Date(),
          }

          await database.collection('orders').insertOne(order)

          return json({
            ok: true,
            order: strip(order),
            cashfree: {
              configured: true,
              payment_session_id: cfRes.payment_session_id,
              order_id: cashfreeOrderId,
              cf_order_id: cfRes.cf_order_id,
              amount: total,
              currency: 'INR',
              mode: getCashfreeConfig().env,
            },
          })
        } catch (err) {
          console.error('[Cashfree:POST/orders] Error:', err.message)
          return json({ error: 'Online payment is temporarily unavailable. Please try again later.' }, 500)
        }
      }

      // --- FLOW B: WHATSAPP CONCIERGE ---
      const orderId = uuidv4()
      const order = {
        id: orderId,
        order_number: orderNumber,
        userId: userId,
        customer_id: custId,
        customer: sanitizedCustomer,
        items: verifiedItems,
        subtotal,
        discount,
        shipping,
        shipping_reason: pricing.shippingReason || (shipping === 0 ? 'FREE_DELIVERY' : 'STANDARD'),
        shipping_rule_snapshot: pricing.shipping_rule_snapshot || null,
        total,
        promotion: pricing.appliedPromotion ? {
          type: pricing.appliedPromotion.type,
          code: pricing.appliedPromotion.code,
          couponCode: pricing.appliedPromotion.code,
          ruleId: pricing.appliedPromotion.type === 'free_delivery' ? pricing.appliedPromotion.id : null,
          discountType: pricing.appliedPromotion.discountType,
          discountValue: pricing.appliedPromotion.discountValue,
          discountAmount: pricing.discount,
          shippingDiscount: pricing.appliedPromotion.type === 'free_delivery' ? (pricing.shipping_rule_snapshot?.delivery_charge || 80) : 0,
        } : null,
        payment_method: 'WHATSAPP_CONCIERGE',
        payment_status: 'PENDING_WHATSAPP',
        status: 'CONFIRMED',
        payment: {
          provider: 'whatsapp_concierge',
          status: 'PENDING_WHATSAPP',
          amount: total,
          currency: 'INR',
        },
        courier: pricing.shipping_rule_snapshot?.default_courier || null,
        tracking_number: null,
        created_at: new Date(),
        updated_at: new Date(),
      }

      await database.collection('orders').insertOne(order)

      // Safely dispatch order notifications (Customer confirmation email + Sales team alerts)
      dispatchOrderNotifications({
        database,
        orderId: order.id,
        event: 'ORDER_CONFIRMED',
        appUrl: getCashfreePublicBaseUrl(request),
      }).catch((e) => console.error('[Notifications:ConciergeOrder] Error:', e.message))

      // Atomically decrement stock for WhatsApp orders
      for (const it of verifiedItems) {
        await database.collection('products').updateOne(
          { id: it.product_id },
          { $inc: { stock: -it.quantity } }
        )
      }

      // Atomically record coupon usage for WhatsApp orders if coupon applied
      if (pricing.appliedCoupon?.code) {
        await recordCouponUsage({
          database,
          couponCode: pricing.appliedCoupon.code,
          orderId,
          orderNumber,
          customer: sanitizedCustomer,
          userId,
          discountAmount: pricing.discount,
        })
      }

      const settings = await database.collection('settings').findOne({ id: 'global' })
      const wa = buildWhatsAppMessage(order, settings)
      return json({ ok: true, order: strip(order), whatsapp: wa })
    }

    // ==========================================
    // ===== CUSTOMER AUTHENTICATION SYSTEM =====
    // ==========================================

    // 1. Email OTP Request
    if (route === '/auth/email/send-otp' && method === 'POST') {
      const { email } = await request.json().catch(() => ({}))
      const cleanEmail = String(email || '').trim().toLowerCase()
      const clientIp = getClientIp(request)

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return json({ error: 'Please enter a valid email address.' }, 400)
      }

      // 1a. IP-based rate limiting (Max 10 requests per IP per 10 mins)
      const ipCheck = await checkRateLimit(database, `otp_req_ip_${clientIp}`, 10, 10)
      if (!ipCheck.allowed) {
        return json({
          error: `Too many requests from this device. Please wait ${ipCheck.resetInMinutes || 5} minute(s) before trying again.`,
        }, 429)
      }

      // 1b. Email-based rate limiting (Max 4 requests per email per 10 mins)
      const emailCheck = await checkRateLimit(database, `otp_req_email_${cleanEmail}`, 4, 10)
      if (!emailCheck.allowed) {
        return json({
          error: `Too many verification requests for this email. Please wait ${emailCheck.resetInMinutes || 5} minute(s) before trying again.`,
        }, 429)
      }

      const otp = generateOtp()
      const hashedOtp = await hashOtp(otp)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

      // Invalidate previous verification tokens for this email
      await database.collection('verification_tokens').deleteMany({ identifier: cleanEmail })

      await database.collection('verification_tokens').insertOne({
        id: uuidv4(),
        identifier: cleanEmail,
        token_hash: hashedOtp,
        attempts: 0,
        expires_at: expiresAt,
        created_at: new Date(),
      })

      // Send OTP via configured email provider (or dev console fallback)
      try {
        await sendLoginOtp({ email: cleanEmail, otp })
      } catch (err) {
        console.error('[Auth:Email] Failed to dispatch OTP:', err)
        return json({ error: 'Failed to dispatch verification email. Please try again.' }, 500)
      }

      // Mask email for user-facing response (e.g. an***@gmail.com) without leaking email existence
      const [userPart, domainPart] = cleanEmail.split('@')
      const maskedEmail = userPart.length <= 2
        ? `${userPart[0]}***@${domainPart}`
        : `${userPart.slice(0, 2)}***@${domainPart}`

      return json({
        ok: true,
        message: 'A 6-digit verification code has been dispatched to your email.',
        email: maskedEmail,
      })
    }

    // 2. Email OTP Verification & Login
    if (route === '/auth/email/verify-otp' && method === 'POST') {
      const { email, otp } = await request.json().catch(() => ({}))
      const cleanEmail = String(email || '').trim().toLowerCase()
      const cleanOtp = String(otp || '').trim()
      const clientIp = getClientIp(request)

      if (!cleanEmail || !cleanOtp || cleanOtp.length !== 6) {
        return json({ error: 'Please enter the 6-digit verification code sent to your email.' }, 400)
      }

      // Rate limit check on verification attempts (Per IP: 20 per 10 mins; Per Email: 10 per 10 mins)
      const ipCheck = await checkRateLimit(database, `otp_verify_ip_${clientIp}`, 20, 10)
      const emailCheck = await checkRateLimit(database, `otp_verify_email_${cleanEmail}`, 10, 10)
      if (!ipCheck.allowed || !emailCheck.allowed) {
        return json({ error: 'Too many incorrect attempts. Please request a new verification code.' }, 429)
      }

      const tokenRecord = await database.collection('verification_tokens').findOne({
        identifier: cleanEmail,
      })

      if (!tokenRecord || new Date() > new Date(tokenRecord.expires_at)) {
        if (tokenRecord) await database.collection('verification_tokens').deleteOne({ _id: tokenRecord._id })
        return json({ error: 'Verification code has expired or is invalid. Please request a new code.' }, 400)
      }

      if (tokenRecord.attempts >= 5) {
        await database.collection('verification_tokens').deleteOne({ _id: tokenRecord._id })
        return json({ error: 'Too many incorrect attempts. Please request a new verification code.' }, 400)
      }

      const isValid = await verifyOtpHash(cleanOtp, tokenRecord.token_hash)
      if (!isValid) {
        await database.collection('verification_tokens').updateOne(
          { _id: tokenRecord._id },
          { $inc: { attempts: 1 } }
        )
        const remainingAttempts = 5 - (tokenRecord.attempts + 1)
        return json({
          error: `Incorrect verification code. ${Math.max(0, remainingAttempts)} attempt(s) remaining.`,
        }, 400)
      }

      // Atomic single-use consumption: findOneAndDelete ensures that two concurrent requests
      // cannot both successfully verify and consume the same token.
      const consumed = await database.collection('verification_tokens').findOneAndDelete({
        _id: tokenRecord._id,
      })

      if (!consumed || (!consumed.value && !consumed._id)) {
        return json({ error: 'Verification code has already been consumed. Please request a new code.' }, 400)
      }

      // Find or create customer user (Guarantees unified single user identity)
      let user = await database.collection('users').findOne({ email: cleanEmail })
      const now = new Date()

      if (!user) {
        const newUserId = uuidv4()
        user = {
          id: newUserId,
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          phone: '',
          role: 'customer',
          status: 'ACTIVE',
          emailVerified: now,
          created_at: now,
          updated_at: now,
          last_login_at: now,
        }
        await database.collection('users').insertOne(user)
      } else {
        if (user.status && user.status !== 'ACTIVE') {
          return json({ error: 'Your account is currently disabled. Please contact customer care.' }, 403)
        }
        await database.collection('users').updateOne(
          { id: user.id },
          { $set: { emailVerified: user.emailVerified || now, last_login_at: now } }
        )
      }

      // Link email identity in accounts collection
      await database.collection('accounts').updateOne(
        { provider: 'email', providerAccountId: cleanEmail },
        {
          $set: {
            userId: user.id,
            provider: 'email',
            providerAccountId: cleanEmail,
            updated_at: now,
          },
          $setOnInsert: { created_at: now },
        },
        { upsert: true }
      )

      // Associate/claim any historical guest orders created with this email
      await database.collection('orders').updateMany(
        {
          $or: [{ userId: null }, { userId: { $exists: false } }, { userId: '' }],
          'customer.email': { $regex: new RegExp(`^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        },
        { $set: { userId: user.id, updated_at: now } }
      )

      // Sign session JWT
      const sessionToken = signCustomerToken(user)
      const res = json({
        ok: true,
        message: 'Signed in successfully',
        user: strip(user),
      })

      // Set HTTP-only secure cookie
      res.cookies.set({
        name: CUSTOMER_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      })

      return res
    }

    // 3. Google OAuth URL with PKCE
    if (route === '/auth/google/url' && method === 'GET') {
      const urlObj = new URL(request.url)
      const requestedRedirect = urlObj.searchParams.get('redirect_to') || '/account'
      const safeRedirect = sanitizeInternalRedirect(requestedRedirect)
      const clientId = process.env.GOOGLE_CLIENT_ID
      const appBaseUrl = getAppBaseUrl(request)
      const redirectUri = `${appBaseUrl}/api/auth/google/callback`

      console.log('[GOOGLE OAUTH] redirect_uri =', redirectUri)
      console.log('[GOOGLE OAUTH] appBaseUrl =', appBaseUrl)
      console.log('[GOOGLE OAUTH] client_id =', clientId)

      if (!clientId) {
        return json({
          configured: false,
          message: 'Google Sign-In is temporarily unavailable. Please use email login.',
        })
      }

      const { verifier, challenge } = generatePKCE()
      const state = generateOAuthState(safeRedirect, verifier)
      const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      googleAuthUrl.searchParams.set('client_id', clientId)
      googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
      googleAuthUrl.searchParams.set('response_type', 'code')
      googleAuthUrl.searchParams.set('scope', 'openid email profile')
      googleAuthUrl.searchParams.set('state', state)
      googleAuthUrl.searchParams.set('code_challenge', challenge)
      googleAuthUrl.searchParams.set('code_challenge_method', 'S256')
      googleAuthUrl.searchParams.set('prompt', 'select_account')

      // Support both browser navigation and JSON API fetch requests
      const acceptHeader = (request.headers.get('accept') || '').toLowerCase()
      const formatParam = urlObj.searchParams.get('format')
      const isBrowserNavigation = !formatParam && acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')

      if (isBrowserNavigation) {
        return NextResponse.redirect(googleAuthUrl.toString())
      }

      return json({
        configured: true,
        url: googleAuthUrl.toString(),
      })
    }

    // 4. Google OAuth Callback with PKCE validation & Safe Linking
    if (route === '/auth/google/callback' && method === 'GET') {
      const urlObj = new URL(request.url)
      const code = urlObj.searchParams.get('code')
      const state = urlObj.searchParams.get('state')
      const errorParam = urlObj.searchParams.get('error')

      if (errorParam) {
        const mappedError = errorParam === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed'
        return createSafeRedirect(`/login?error=${mappedError}`, request)
      }

      const stateData = verifyOAuthState(state)
      if (!code || !stateData) {
        return createSafeRedirect('/login?error=oauth_invalid_state', request)
      }

      const fallbackRedirect = sanitizeInternalRedirect(stateData?.redirectTo)

      try {
        const clientId = process.env.GOOGLE_CLIENT_ID
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET
        const appBaseUrl = getAppBaseUrl(request)
        const redirectUri = `${appBaseUrl}/api/auth/google/callback`

        if (!clientId || !clientSecret) {
          return createSafeRedirect('/login?error=oauth_config_missing', request)
        }

        const tokenBody = {
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }
        if (stateData.codeVerifier) {
          tokenBody.code_verifier = stateData.codeVerifier
        }

        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(tokenBody),
        })

        if (!tokenRes.ok) {
          const errBody = await tokenRes.json().catch(() => ({}))
          console.error('[OAuth:Google] Code exchange error:', errBody)
          throw new Error('Failed to exchange authorization code with Google')
        }

        const tokenData = await tokenRes.json()

        // Fetch user profile from Google
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })

        if (!profileRes.ok) {
          throw new Error('Failed to fetch Google profile')
        }

        const gUser = await profileRes.json()
        const gEmail = String(gUser.email || '').toLowerCase().trim()
        const now = new Date()

        if (!gEmail) {
          return createSafeRedirect('/login?error=oauth_no_email', request)
        }

        let user = await database.collection('users').findOne({ email: gEmail })

        if (!user) {
          user = {
            id: uuidv4(),
            email: gEmail,
            name: gUser.name || gEmail.split('@')[0],
            image: gUser.picture || null,
            phone: '',
            role: 'customer',
            status: 'ACTIVE',
            emailVerified: now,
            created_at: now,
            updated_at: now,
            last_login_at: now,
          }
          await database.collection('users').insertOne(user)
        } else {
          if (user.status === 'DELETED') {
            return createSafeRedirect('/login?error=account_deleted', request)
          }
          if (user.status && user.status !== 'ACTIVE') {
            return createSafeRedirect('/login?error=account_disabled', request)
          }

          const updateFields = {
            emailVerified: user.emailVerified || now,
            last_login_at: now,
            updated_at: now,
          }
          // Do not overwrite manual profile data if user already has it
          if (!user.name && gUser.name) {
            updateFields.name = gUser.name
          }
          if (!user.image && gUser.picture) {
            updateFields.image = gUser.picture
          }

          await database.collection('users').updateOne(
            { id: user.id },
            { $set: updateFields }
          )
        }

        // Link identity in accounts collection
        await database.collection('accounts').updateOne(
          { provider: 'google', providerAccountId: gUser.id },
          {
            $set: {
              userId: user.id,
              provider: 'google',
              providerAccountId: gUser.id,
              updated_at: now,
            },
            $setOnInsert: { created_at: now },
          },
          { upsert: true }
        )

        // Associate/claim any historical guest orders created with this email
        await database.collection('orders').updateMany(
          {
            $or: [{ userId: null }, { userId: { $exists: false } }, { userId: '' }],
            'customer.email': { $regex: new RegExp(`^${gEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          },
          { $set: { userId: user.id, updated_at: now } }
        )

        const sessionToken = signCustomerToken(user)
        const redirectResponse = createSafeRedirect(fallbackRedirect, request)

        redirectResponse.cookies.set({
          name: CUSTOMER_COOKIE_NAME,
          value: sessionToken,
          httpOnly: true,
          secure: appBaseUrl.startsWith('https://') || process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        })

        return redirectResponse
      } catch (err) {
        console.error('[OAuth:Google] Error during callback:', err.message)
        return createSafeRedirect('/login?error=oauth_exchange_failed', request)
      }
    }

    // 5. Customer Session Check
    if ((route === '/auth/session' || route === '/account/me') && method === 'GET') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) {
        return json({ authenticated: false, user: null })
      }
      return json({ authenticated: true, user: customer })
    }

    // 6. Customer Logout
    if (route === '/auth/logout' && method === 'POST') {
      const res = json({ ok: true, message: 'Logged out successfully' })
      res.cookies.set({
        name: CUSTOMER_COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
      return res
    }

    // ==========================================
    // ===== CUSTOMER ACCOUNT & PROFILE APIS =====
    // ==========================================

    // Profile (GET / PATCH)
    if (route === '/account/profile') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to access your profile' }, 401)

      if (method === 'GET') {
        return json({ user: customer })
      }

      if (method === 'PATCH') {
        const { name, phone, image } = await request.json().catch(() => ({}))
        const updateData = { updated_at: new Date() }
        if (name && typeof name === 'string') updateData.name = name.trim()
        if (phone !== undefined) updateData.phone = String(phone).trim()
        if (image !== undefined) updateData.image = image

        await database.collection('users').updateOne(
          { id: customer.id },
          { $set: updateData }
        )

        const updated = await database.collection('users').findOne({ id: customer.id })
        return json({ ok: true, user: strip(updated) })
      }
    }

    // Customer Orders List (GET)
    if (route === '/account/orders' && method === 'GET') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to view your orders' }, 401)

      const safeEmail = (customer.email || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      // Automatically claim any unclaimed historical guest orders matching this verified email
      if (safeEmail) {
        await database.collection('orders').updateMany(
          {
            $or: [{ userId: null }, { userId: { $exists: false } }, { userId: '' }],
            'customer.email': { $regex: new RegExp(`^${safeEmail}$`, 'i') },
          },
          { $set: { userId: customer.id, updated_at: new Date() } }
        )
      }

      // Query ONLY orders strictly owned by this authenticated customer
      const customerOrders = await database.collection('orders')
        .find({ userId: customer.id })
        .sort({ created_at: -1 })
        .toArray()

      return json({ orders: customerOrders.map(strip) })
    }

    // Customer Single Order (GET with IDOR Ownership Verification)
    if (route.startsWith('/account/orders/') && !route.endsWith('/cancel') && !route.endsWith('/eligibility') && method === 'GET') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to view this order' }, 401)

      const orderId = route.split('/')[3]
      const order = await database.collection('orders').findOne({
        $or: [
          { id: orderId },
          { order_number: orderId },
          { order_number: { $regex: new RegExp(`^${orderId}$`, 'i') } },
        ],
      })

      if (!order) {
        return json({ error: 'Order not found' }, 404)
      }

      // If it is an unclaimed guest order with matching email, claim it now
      const isUnclaimedGuest = (!order.userId || order.userId === '') &&
        order.customer?.email &&
        order.customer.email.toLowerCase() === (customer.email || '').toLowerCase()

      if (isUnclaimedGuest) {
        await database.collection('orders').updateOne(
          { id: order.id, $or: [{ userId: null }, { userId: { $exists: false } }, { userId: '' }] },
          { $set: { userId: customer.id, updated_at: new Date() } }
        )
        order.userId = customer.id
      }

      // Authoritative ownership check: Must strictly match customer.id
      if (order.userId !== customer.id) {
        return json({ error: 'You are not authorized to view this order.' }, 403)
      }

      const cancellationEligibility = checkOrderCancellationEligibility(order)

      return json({
        order: strip(order),
        cancellation_eligibility: cancellationEligibility,
      })
    }

    // Customer Order Cancellation Eligibility (GET)
    if (route.startsWith('/account/orders/') && route.endsWith('/eligibility') && method === 'GET') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to check cancellation eligibility' }, 401)

      const orderId = route.split('/')[3]
      const order = await database.collection('orders').findOne({
        $or: [
          { id: orderId },
          { order_number: orderId },
          { order_number: { $regex: new RegExp(`^${orderId}$`, 'i') } },
        ],
      })

      if (!order) return json({ error: 'Order not found' }, 404)

      if (order.userId !== customer.id) {
        return json({ error: 'You are not authorized to view this order' }, 403)
      }

      const eligibility = checkOrderCancellationEligibility(order)
      return json({ ok: true, ...eligibility })
    }

    // Customer Order Cancellation (POST)
    if (route.startsWith('/account/orders/') && route.endsWith('/cancel') && method === 'POST') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to cancel this order' }, 401)

      const orderId = route.split('/')[3]
      if (!orderId) return json({ error: 'Order reference is required' }, 400)

      const body = await request.json().catch(() => ({}))
      const cancellationReason = (body.reason || 'Customer requested cancellation').trim()

      const result = await cancelAndRefundOrder({
        database,
        orderId,
        customerUserId: customer.id,
        cancellationReason,
        isAdmin: false,
        appUrl: getAppBaseUrl(request),
      })

      if (!result.success) {
        return json({ error: result.error, reason: result.reason }, result.status || 400)
      }

      return json({
        ok: true,
        order_number: result.order_number,
        order_status: result.order_status,
        payment_status: result.payment_status,
        refund_status: result.refund_status,
        refund_amount: result.refund_amount,
        cf_refund_id: result.cf_refund_id,
        message: result.message,
      })
    }

    // Saved Addresses CRUD
    if (route === '/account/addresses') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to manage your addresses' }, 401)

      if (method === 'GET') {
        const addresses = await database.collection('addresses')
          .find({ userId: customer.id })
          .sort({ isDefault: -1, created_at: -1 })
          .toArray()
        return json({ addresses: addresses.map(strip) })
      }

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const validation = validateAddress(body, { requireDistrict: false })

        if (!validation.isValid) {
          const firstError = Object.values(validation.errors)[0] || 'Please provide valid address details.'
          return json({ error: firstError, errors: validation.errors }, 400)
        }

        const addressId = uuidv4()
        const existingCount = await database.collection('addresses').countDocuments({ userId: customer.id })
        // If this is the user's first address or explicitly requested as default
        const makeDefault = Boolean(validation.sanitized.isDefault || existingCount === 0)

        if (makeDefault) {
          await database.collection('addresses').updateMany(
            { userId: customer.id },
            { $set: { isDefault: false } }
          )
        }

        const addressDoc = {
          id: addressId,
          userId: customer.id,
          label: validation.sanitized.label || 'Home',
          fullName: validation.sanitized.fullName,
          phone: validation.sanitized.phone,
          addressLine1: validation.sanitized.addressLine1,
          addressLine2: validation.sanitized.addressLine2 || '',
          city: validation.sanitized.city,
          district: validation.sanitized.district || '',
          state: validation.sanitized.state || 'Kerala',
          country: validation.sanitized.country || 'India',
          postalCode: validation.sanitized.postalCode,
          isDefault: makeDefault,
          created_at: new Date(),
          updated_at: new Date(),
        }

        await database.collection('addresses').insertOne(addressDoc)
        return json({ ok: true, address: strip(addressDoc) }, 201)
      }
    }

    // Single Address Modification / Deletion (with Ownership & IDOR Protection)
    if (route.startsWith('/account/addresses/') && (method === 'PATCH' || method === 'DELETE')) {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in' }, 401)

      const addressId = route.split('/')[3]
      const existing = await database.collection('addresses').findOne({ id: addressId, userId: customer.id })

      if (!existing) {
        return json({ error: 'Address not found or unauthorized' }, 404)
      }

      if (method === 'DELETE') {
        await database.collection('addresses').deleteOne({ id: addressId, userId: customer.id })

        // If the deleted address was default, safely promote the newest remaining address to default
        if (existing.isDefault) {
          const nextAddr = await database.collection('addresses').findOne(
            { userId: customer.id },
            { sort: { created_at: -1 } }
          )
          if (nextAddr) {
            await database.collection('addresses').updateOne(
              { id: nextAddr.id, userId: customer.id },
              { $set: { isDefault: true } }
            )
          }
        }
        return json({ ok: true, message: 'Address removed successfully' })
      }

      if (method === 'PATCH') {
        const updates = await request.json().catch(() => ({}))
        const merged = { ...existing, ...updates }
        const validation = validateAddress(merged, { requireDistrict: false })

        if (!validation.isValid) {
          const firstError = Object.values(validation.errors)[0] || 'Invalid address updates.'
          return json({ error: firstError, errors: validation.errors }, 400)
        }

        const makeDefault = Boolean(updates.isDefault)
        if (makeDefault) {
          await database.collection('addresses').updateMany(
            { userId: customer.id },
            { $set: { isDefault: false } }
          )
        }

        const sanitizedUpdate = {
          label: validation.sanitized.label || existing.label || 'Home',
          fullName: validation.sanitized.fullName,
          phone: validation.sanitized.phone,
          addressLine1: validation.sanitized.addressLine1,
          addressLine2: validation.sanitized.addressLine2 || '',
          city: validation.sanitized.city,
          district: validation.sanitized.district || '',
          state: validation.sanitized.state || 'Kerala',
          country: validation.sanitized.country || 'India',
          postalCode: validation.sanitized.postalCode,
          isDefault: makeDefault || (existing.isDefault && updates.isDefault === undefined),
          updated_at: new Date(),
        }

        await database.collection('addresses').updateOne(
          { id: addressId, userId: customer.id },
          { $set: sanitizedUpdate }
        )

        const updatedDoc = await database.collection('addresses').findOne({ id: addressId, userId: customer.id })
        return json({ ok: true, address: strip(updatedDoc) })
      }
    }

    // Customer Wishlist Sync & Management
    if (route === '/account/wishlist') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in to access your wishlist' }, 401)

      if (method === 'GET') {
        const records = await database.collection('wishlists')
          .find({ userId: customer.id })
          .toArray()

        const slugs = records.map((r) => r.slug || r.productId).filter(Boolean)
        return json({ slugs, count: slugs.length })
      }

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const { slug, slugs } = body
        const now = new Date()

        // Batch merge guest wishlist
        if (Array.isArray(slugs) && slugs.length > 0) {
          for (const s of slugs) {
            if (s && typeof s === 'string') {
              await database.collection('wishlists').updateOne(
                { userId: customer.id, slug: s },
                { $set: { userId: customer.id, slug: s, updated_at: now }, $setOnInsert: { created_at: now } },
                { upsert: true }
              )
            }
          }
        } else if (slug && typeof slug === 'string') {
          // Toggle single slug
          const existing = await database.collection('wishlists').findOne({ userId: customer.id, slug })
          if (existing) {
            await database.collection('wishlists').deleteOne({ _id: existing._id })
            return json({ ok: true, action: 'removed', slug })
          } else {
            await database.collection('wishlists').insertOne({
              id: uuidv4(),
              userId: customer.id,
              slug,
              created_at: now,
            })
            return json({ ok: true, action: 'added', slug })
          }
        }

        const allRecords = await database.collection('wishlists').find({ userId: customer.id }).toArray()
        return json({ ok: true, slugs: allRecords.map((r) => r.slug) })
      }
    }

    if (route.startsWith('/account/wishlist/') && method === 'DELETE') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Please sign in' }, 401)

      const slugOrId = route.split('/')[3]
      await database.collection('wishlists').deleteMany({
        userId: customer.id,
        $or: [{ slug: slugOrId }, { productId: slugOrId }],
      })
      return json({ ok: true, message: 'Item removed from wishlist' })
    }

    // Account Deletion (with Order Anonymization)
    if (route === '/account' && method === 'DELETE') {
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Unauthorized' }, 401)

      // 1. Anonymize personal details in historical orders (preserves accounting/stock audit trail)
      await database.collection('orders').updateMany(
        { userId: customer.id },
        {
          $set: {
            'customer.name': 'Anonymized Customer',
            'customer.phone': '—',
            'customer.whatsapp': '—',
            'customer.email': '—',
            'customer.house': '—',
            'customer.street': '—',
            anonymized: true,
          },
        }
      )

      // 2. Remove saved addresses, wishlist items, accounts
      await database.collection('addresses').deleteMany({ userId: customer.id })
      await database.collection('wishlists').deleteMany({ userId: customer.id })
      await database.collection('accounts').deleteMany({ userId: customer.id })

      // 3. Mark user status as DELETED
      await database.collection('users').updateOne(
        { id: customer.id },
        { $set: { status: 'DELETED', email: `deleted_${customer.id}@deleted.invalid`, name: 'Deleted Customer' } }
      )

      // 4. Clear session cookie
      const res = json({ ok: true, message: 'Account and personal data have been removed.' })
      res.cookies.set({
        name: CUSTOMER_COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
      return res
    }

    // ===== ADMIN LOGIN =====
    if (route === '/admin/login' && method === 'POST') {
      const { email, password } = await request.json()
      const user = await database.collection('users').findOne({ email: (email || '').toLowerCase() })
      if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
        return json({ error: 'Invalid email or password' }, 401)
      }
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
      return json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    }

    // ===== ADMIN (protected) =====
    if (parts[0] === 'admin' && route !== '/admin/login') {
      const auth = requireAuth(request)
      if (!auth) return json({ error: 'Unauthorized' }, 401)

      if (route === '/admin/media/signature' && method === 'POST') {
        if (!cloudinaryEnabled()) return json({ error: 'Cloudinary uploads are not configured.' }, 503)

        const body = await request.json().catch(() => ({}))
        const resourceType = body.resourceType === 'video' ? 'video' : 'image'
        const requestedFolder = String(body.folder || 'catalog')
        const safeFolder = requestedFolder
          .replace(/[^a-zA-Z0-9/_-]/g, '')
          .replace(/\/{2,}/g, '/')
          .replace(/^\/+|\/+$/g, '')
          .slice(0, 60) || 'catalog'
        const folder = `thretha/${safeFolder}`
        const timestamp = Math.floor(Date.now() / 1000)
        const signature = cloudinary.utils.api_sign_request(
          { folder, timestamp },
          process.env.CLOUDINARY_API_SECRET
        )

        return json({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          timestamp,
          folder,
          resource_type: resourceType,
          signature,
        })
      }

      if (route === '/admin/me' && method === 'GET') return json({ user: auth })
      // ---- Change admin password ----
      if (route === '/admin/change-password' && method === 'POST') {
        const { currentPassword, newPassword } = await request.json()

        if (!currentPassword || !newPassword) {
          return json({ error: 'Current password and new password are required' }, 400)
        }

        if (newPassword.length < 8) {
          return json({ error: 'New password must be at least 8 characters' }, 400)
        }

        const user = await database.collection('users').findOne({ id: auth.id })

        if (!user) {
          return json({ error: 'Admin user not found' }, 404)
        }

        const valid = await bcrypt.compare(currentPassword, user.password_hash)

        if (!valid) {
          return json({ error: 'Current password is incorrect' }, 401)
        }

        const password_hash = await bcrypt.hash(newPassword, 12)

        await database.collection('users').updateOne(
          { id: auth.id },
          {
            $set: {
              password_hash,
              updated_at: new Date(),
            },
          }
        )

        return json({ message: 'Password changed successfully' })
      }

      if (route === '/admin/stats' && method === 'GET') {
        const [products, categories, orders, s] = await Promise.all([
          database.collection('products').countDocuments({}),
          database.collection('categories').countDocuments({}),
          database.collection('orders').countDocuments({}),
          database.collection('settings').findOne({ id: 'global' }),
        ])
        const threshold = s?.low_stock_threshold ?? 3
        const lowStock = await database.collection('products')
          .find({ stock: { $lte: threshold } }).toArray()
        const newOrders = await database.collection('orders').countDocuments({ status: 'NEW' })
        const confirmed = await database.collection('orders').countDocuments({ status: 'CONFIRMED' })
        const delivered = await database.collection('orders').countDocuments({ status: 'DELIVERED' })
        const recentOrders = await database.collection('orders')
          .find({}).sort({ created_at: -1 }).limit(6).toArray()
        const recentProducts = await database.collection('products')
          .find({}).sort({ created_at: -1 }).limit(6).toArray()
        return json({
          products, categories, orders,
          new_orders: newOrders, confirmed_orders: confirmed, delivered_orders: delivered,
          low_stock: lowStock.map(strip),
          low_stock_count: lowStock.length,
          recent_orders: recentOrders.map(strip),
          recent_products: recentProducts.map(strip),
        })
      }

      // ---- Admin products ----
      if (route === '/admin/products' && method === 'GET') {
        const list = await database.collection('products').find({}).sort({ created_at: -1 }).toArray()
        return json(list.map(strip))
      }
      if (route === '/admin/products' && method === 'POST') {
        const b = await request.json()
        const cat = b.category_id ? await database.collection('categories').findOne({ id: b.category_id }) : null
        const doc = {
          id: uuidv4(),
          name: b.name || 'Untitled',
          slug: slugify(b.name || `product-${Date.now()}`),
          sku: b.sku || `TC-${Date.now().toString().slice(-6)}`,
          category_id: b.category_id || null,
          category_name: cat?.name || '',
          description: b.description || '',
          price: Number(b.price) || 0,
          discount_price: b.discount_price ? Number(b.discount_price) : null,
          fabric: b.fabric || '', colour: b.colour || '', material: b.material || '',
          pattern: b.pattern || '', care_instructions: b.care_instructions || '',
          stock: Number(b.stock) || 0,
          sizes: Array.isArray(b.sizes) ? b.sizes : [],
          media: Array.isArray(b.media) ? b.media : [],
          featured: !!b.featured, new_arrival: !!b.new_arrival, best_seller: !!b.best_seller,
          active: b.active !== false,
          created_at: new Date(), updated_at: new Date(),
        }
        await database.collection('products').insertOne(doc)
        return json(strip(doc))
      }
      if (parts[0] === 'admin' && parts[1] === 'products' && parts.length === 3) {
        const id = parts[2]
        if (method === 'PUT') {
          const b = await request.json()
          const update = { ...b, updated_at: new Date() }
          delete update.id; delete update._id
          if (b.name) update.slug = slugify(b.name)
          if (b.category_id) {
            const cat = await database.collection('categories').findOne({ id: b.category_id })
            update.category_name = cat?.name || ''
          }
          if (b.price !== undefined) update.price = Number(b.price)
          if (b.discount_price !== undefined) update.discount_price = b.discount_price ? Number(b.discount_price) : null
          if (b.stock !== undefined) update.stock = Number(b.stock)
          await database.collection('products').updateOne({ id }, { $set: update })
          const p = await database.collection('products').findOne({ id })
          return json(strip(p))
        }
        if (method === 'DELETE') {
          await database.collection('products').deleteOne({ id })
          return json({ ok: true })
        }
      }
      if (parts[0] === 'admin' && parts[1] === 'products' && parts[3] === 'duplicate' && method === 'POST') {
        const src = await database.collection('products').findOne({ id: parts[2] })
        if (!src) return json({ error: 'Not found' }, 404)
        const { _id, ...rest } = src
        const copy = {
          ...rest, id: uuidv4(),
          name: `${src.name} (Copy)`, slug: slugify(`${src.name}-copy-${Date.now()}`),
          sku: `${src.sku}-C`, created_at: new Date(), updated_at: new Date(),
        }
        await database.collection('products').insertOne(copy)
        return json(strip(copy))
      }

      // ---- Admin categories ----
      if (route === '/admin/categories' && method === 'GET') {
        const list = await database.collection('categories').find({}).sort({ display_order: 1 }).toArray()
        return json(list.map(strip))
      }
      if (route === '/admin/categories' && method === 'POST') {
        const b = await request.json()
        const count = await database.collection('categories').countDocuments({})
        const doc = {
          id: uuidv4(), name: b.name || 'New Category', slug: slugify(b.name || `category-${Date.now()}`),
          description: b.description || '', image: b.image || '',
          display_order: b.display_order ?? count + 1, active: b.active !== false, created_at: new Date(),
        }
        await database.collection('categories').insertOne(doc)
        return json(strip(doc))
      }
      if (parts[0] === 'admin' && parts[1] === 'categories' && parts.length === 3) {
        const id = parts[2]
        if (method === 'PUT') {
          const b = await request.json()
          const update = { ...b }; delete update.id; delete update._id
          if (b.name) update.slug = slugify(b.name)
          await database.collection('categories').updateOne({ id }, { $set: update })
          const c = await database.collection('categories').findOne({ id })
          return json(strip(c))
        }
        if (method === 'DELETE') {
          await database.collection('categories').deleteOne({ id })
          return json({ ok: true })
        }
      }

      // ---- Admin orders ----
      if (route === '/admin/orders' && method === 'GET') {
        const list = await database.collection('orders').find({}).sort({ created_at: -1 }).toArray()
        return json(list.map(strip))
      }
      if (parts[0] === 'admin' && parts[1] === 'orders' && parts[3] === 'items' && parts.length === 6 && parts[5] === 'cancel' && method === 'POST') {
        const itemIndex = Number(parts[4])
        if (!Number.isInteger(itemIndex) || itemIndex < 0) return json({ error: 'Invalid order item.' }, 400)
        const body = await request.json().catch(() => ({}))
        const result = await cancelOrderItemAndRefund({ database, orderId: parts[2], itemIndex, reason: body.reason || 'Admin cancelled this product' })
        if (!result.success) return json({ error: result.error, reason: result.reason }, result.status || 400)
        return json({ ok: true, ...result, order: strip(result.order) })
      }
      if (parts[0] === 'admin' && parts[1] === 'orders' && parts[3] === 'items' && parts.length === 6 && parts[5] === 'sync-refund' && method === 'POST') {
        const itemIndex = Number(parts[4])
        if (!Number.isInteger(itemIndex) || itemIndex < 0) return json({ error: 'Invalid order item.' }, 400)
        const order = await database.collection('orders').findOne({ $or: [{ id: parts[2] }, { order_number: parts[2] }] })
        const item = order?.items?.[itemIndex]
        const refundId = item?.cancellation?.refund_id
        if (!order || !refundId) return json({ error: 'Item refund not found.' }, 404)
        try {
          const cfOrderId = order.cashfree_order_id || order.payment?.cashfree_order_id || order.id
          const response = await fetchCashfreeRefund({ orderId: cfOrderId, refundId })
          const refund = response.refund
          if (refund.refund_status === 'SUCCESS') await finalizeCompletedItemRefund({ database, orderId: order.id, refundId, refundData: refund })
          if (refund.refund_status === 'FAILED') await database.collection('orders').updateOne(
            { id: order.id, [`items.${itemIndex}.cancellation.refund_id`]: refundId },
            { $set: { [`items.${itemIndex}.cancellation.status`]: 'FAILED', [`items.${itemIndex}.cancellation.refund_status`]: 'FAILED', [`items.${itemIndex}.cancellation.failure_confirmed`]: true, [`items.${itemIndex}.cancellation.failure_reason`]: refund.status_description || 'Cashfree item refund failed' } }
          )
          return json({ ok: true, refund, order: strip(await database.collection('orders').findOne({ id: order.id })) })
        } catch (error) {
          return json({ error: error.message || 'Could not sync item refund.' }, 502)
        }
      }
      if (parts[0] === 'admin' && parts[1] === 'orders' && parts.length === 3 && method === 'PUT') {
        const b = await request.json()
        const updateFields = { updated_at: new Date() }
        if (b.status !== undefined) {
          const current = await database.collection('orders').findOne({ id: parts[2] })
          if (!current) return json({ error: 'Order not found' }, 404)
          const refundStatus = String(current.refund?.status || current.payment?.refund_status || '').toUpperCase()
          if (b.status === 'CANCELLED' && current.status !== 'CANCELLED') {
            return json({ error: 'Use the cancellation/refund action so order inventory and payment state remain consistent.' }, 409)
          }
          if (current.status === 'CANCELLATION_PENDING' && b.status !== current.status) {
            return json({ error: 'Order status cannot change while Cashfree is processing a cancellation refund.' }, 409)
          }
          if (current.status === 'CANCELLED' && b.status !== 'CANCELLED') {
            return json({ error: 'A cancelled order cannot be returned to the shipping lifecycle.' }, 409)
          }
          const hasUnresolvedItemCancellation = (current.items || []).some(item => ['PENDING', 'FAILED'].includes(String(item.cancellation?.status || '').toUpperCase()))
          if (b.status === 'SHIPPED' && (current.status === 'CANCELLATION_PENDING' || ['PENDING', 'INITIATED'].includes(refundStatus) || hasUnresolvedItemCancellation)) {
            return json({ error: 'This order cannot be shipped while a cancellation/refund request is pending.' }, 409)
          }
          if (['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(String(current.status || '').toUpperCase()) && ['NEW', 'PENDING', 'CONFIRMED', 'PACKED', 'WHATSAPP CONTACTED'].includes(b.status)) {
            return json({ error: 'A shipped order cannot be moved back into the pre-shipping lifecycle.' }, 409)
          }
          if (refundStatus === 'COMPLETED' && b.status !== 'CANCELLED') {
            return json({ error: 'A refunded order must remain cancelled.' }, 409)
          }
          updateFields.status = b.status
        }
        if (b.courier !== undefined || b.tracking_number !== undefined) {
          const existing = await database.collection('orders').findOne({ id: parts[2] })
          if (!existing) return json({ error: 'Order not found' }, 404)

          const shippingUpdate = validateShippingUpdate(b, existing)
          if (shippingUpdate.error) return json({ error: shippingUpdate.error }, 400)
          Object.assign(updateFields, shippingUpdate.fields)
        }
        if (b.estimated_delivery !== undefined) updateFields.estimated_delivery = b.estimated_delivery
        if (b.payment_status !== undefined) updateFields.payment_status = b.payment_status

        await database.collection('orders').updateOne(
          { id: parts[2] }, { $set: updateFields }
        )
        const o = await database.collection('orders').findOne({ id: parts[2] })
        return json(strip(o))
      }

      // Admin Initiate / Retry Refund
      if (parts[0] === 'admin' && parts[1] === 'orders' && parts[3] === 'refund' && method === 'POST') {
        const orderId = parts[2]
        const b = await request.json().catch(() => ({}))
        const reason = (b.reason || 'Admin initiated refund').trim()

        const result = await cancelAndRefundOrder({
          database,
          orderId,
          isAdmin: true,
          cancellationReason: reason,
          appUrl: getAppBaseUrl(request),
        })

        if (!result.success) {
          return json({ error: result.error, reason: result.reason }, result.status || 400)
        }

        const updatedOrder = await database.collection('orders').findOne({
          $or: [{ id: orderId }, { order_number: orderId }],
        })
        return json({ ok: true, result, order: strip(updatedOrder) })
      }

      // Admin Sync Refund Status from Cashfree
      if (parts[0] === 'admin' && parts[1] === 'orders' && parts[3] === 'sync-refund' && method === 'POST') {
        const orderId = parts[2]
        const order = await database.collection('orders').findOne({
          $or: [{ id: orderId }, { order_number: orderId }],
        })

        if (!order) return json({ error: 'Order not found' }, 404)

        const refundId = order.refund?.id || order.payment?.refund_id
        const cfOrderId = order.cashfree_order_id || order.payment?.cashfree_order_id || order.id

        if (!refundId && !cfOrderId) {
          return json({ error: 'No Cashfree refund or order reference found for this order' }, 400)
        }

        try {
          let refundData = null
          if (refundId && cfOrderId) {
            const cfRes = await fetchCashfreeRefund({ orderId: cfOrderId, refundId })
            refundData = cfRes.refund
          }

          if (refundData?.refund_status === 'SUCCESS') {
            await finalizeCompletedRefund({
              database,
              orderId: order.id,
              refundData,
              appUrl: getAppBaseUrl(request),
            })
          } else if (refundData?.refund_status === 'FAILED') {
            await database.collection('orders').updateOne(
              { id: order.id },
              {
                $set: {
                  status: order.cancellation?.previous_status || 'CONFIRMED',
                  'cancellation.status': 'REJECTED',
                  'payment.refund_status': 'FAILED',
                  'payment.refund_failure_reason': refundData.status_description || 'Refund Failed',
                  'refund.status': 'FAILED',
                  'refund.failure_confirmed': true,
                  'refund.failure_reason': refundData.status_description || 'Refund Failed',
                  updated_at: new Date(),
                },
              }
            )
          }

          const freshOrder = await database.collection('orders').findOne({ id: order.id })
          return json({ ok: true, refund: refundData, order: strip(freshOrder) })
        } catch (err) {
          return json({ error: err.message || 'Failed to sync refund status' }, 500)
        }
      }

      // ---- Admin settings ----
      if (route === '/admin/settings' && method === 'GET') {
        const s = await database.collection('settings').findOne({ id: 'global' })
        return json(normalizeSettingsDoc(s))
      }
      if (route === '/admin/settings' && method === 'PUT') {
        const b = await request.json()

        if (b.pwa?.install_prompt_enabled !== undefined && typeof b.pwa.install_prompt_enabled !== 'boolean') {
          return json({ error: 'PWA install prompt setting must be enabled or disabled.' }, 400)
        }

        if (b.shipping) {
          if (b.shipping.default_courier !== undefined && b.shipping.default_courier !== '' &&
              !DELIVERY_SERVICES.some(service => service.value === b.shipping.default_courier)) {
            return json({ error: 'Select a supported default delivery service.' }, 400)
          }
          if (b.shipping.delivery_charge !== undefined) {
            const charge = Number(b.shipping.delivery_charge)
            if (isNaN(charge) || charge < 0) {
              return json({ error: 'Default delivery charge must be a non-negative number (>= 0).' }, 400)
            }
          }
          if (b.shipping.free_shipping_threshold !== undefined) {
            const threshold = Number(b.shipping.free_shipping_threshold)
            if (isNaN(threshold) || threshold < 0) {
              return json({ error: 'Free delivery threshold must be a non-negative number (>= 0).' }, 400)
            }
          }
          if (b.shipping.delivery_timeframe !== undefined && !String(b.shipping.delivery_timeframe).trim()) {
            return json({ error: 'Delivery timeframe is required and cannot be empty.' }, 400)
          }
        }

        const update = { ...b, updated_at: new Date() }
        delete update.id; delete update._id
        const expectedDefaultCourier = b.shipping?.default_courier
        if (b.shipping && typeof b.shipping === 'object') {
          // Write shipping fields independently so a stale/partial settings
          // payload cannot replace the whole shipping document. In particular,
          // the delivery-agent selector persists at shipping.default_courier.
          delete update.shipping
          for (const [key, value] of Object.entries(b.shipping)) {
            update[`shipping.${key}`] = value
          }
        }
        if (b.instagram_feed) {
          const currentSettings = await database.collection('settings').findOne({ id: 'global' })
          update.instagram_feed = normalizeInstagramSettings({
            ...currentSettings?.instagram_feed,
            ...b.instagram_feed,
          })
        }
        await database.collection('settings').updateOne({ id: 'global' }, { $set: update }, { upsert: true })
        const s = await database.collection('settings').findOne({ id: 'global' })
        if (expectedDefaultCourier !== undefined && s?.shipping?.default_courier !== expectedDefaultCourier) {
          console.error('[Admin Settings] Courier readback mismatch after save', {
            expected: expectedDefaultCourier,
            actual: s?.shipping?.default_courier ?? null,
          })
          return json({ error: 'The delivery service was not saved. Reload settings and try again.' }, 500)
        }
        revalidatePath('/', 'page')
        return json(normalizeSettingsDoc(s))
      }

      // ---- Admin Instagram Feed & Post Management ----
      if (route === '/admin/instagram/feed' && method === 'GET') {
        const adminFeed = await getAdminInstagramFeed(database)
        return json(adminFeed)
      }

      if (route === '/admin/instagram/refresh' && method === 'POST') {
        const syncResult = await syncInstagramFeed(database, { force: true })
        const adminFeed = await getAdminInstagramFeed(database)
        return json({
          ...adminFeed,
          syncResult,
        })
      }

      if (route === '/admin/instagram/posts' && method === 'PUT') {
        const b = await request.json()
        const updates = Array.isArray(b?.updates) ? b.updates : Array.isArray(b?.posts) ? b.posts : []
        await updateAdminInstagramPosts(database, updates)
        const adminFeed = await getAdminInstagramFeed(database)
        return json(adminFeed)
      }

      // ---- Admin Manual Instagram Post CRUD ----
      if (route === '/admin/instagram/manual-post' && method === 'POST') {
        const body = await request.json()
        const newPost = await createManualInstagramPost(database, body)
        const adminFeed = await getAdminInstagramFeed(database)
        return json({
          ok: true,
          post: newPost,
          adminFeed,
        })
      }

      if (route === '/admin/instagram/manual-post' && method === 'PUT') {
        const body = await request.json()
        const postId = String(body.id || '')
        const updatedPost = await updateManualInstagramPost(database, postId, body)
        const adminFeed = await getAdminInstagramFeed(database)
        return json({
          ok: true,
          post: updatedPost,
          adminFeed,
        })
      }

      if (route === '/admin/instagram/manual-post' && method === 'DELETE') {
        const url = new URL(request.url)
        const postId = url.searchParams.get('id') || (await request.json().catch(() => ({})))?.id
        const res = await deleteManualInstagramPost(database, postId)
        const adminFeed = await getAdminInstagramFeed(database)
        return json({
          ok: true,
          deleted: res.deleted,
          id: res.id,
          adminFeed,
        })
      }

      // ---- Admin AI Virtual Try-On Dashboard & Controls ----
      if (route === '/admin/tryon/dashboard' && method === 'GET') {
        const s = await database.collection('settings').findOne({ id: 'global' })
        const tryonSettings = normalizeTryOnSettings(s?.ai_tryon)
        const analytics = await getTryOnAnalyticsSummary(database)
        const provider = getTryOnProvider(tryonSettings.provider)
        const health = await provider.checkHealth()

        return json({
          settings: tryonSettings,
          provider_status: health.status,
          provider_message: health.message || null,
          analytics,
        })
      }

      if (route === '/admin/tryon/settings' && method === 'PUT') {
        const b = await request.json()
        const normalized = normalizeTryOnSettings(b)
        await database.collection('settings').updateOne(
          { id: 'global' },
          { $set: { ai_tryon: normalized, updated_at: new Date() } },
          { upsert: true }
        )
        const s = await database.collection('settings').findOne({ id: 'global' })
        revalidatePath('/', 'page')
        const analytics = await getTryOnAnalyticsSummary(database)
        const provider = getTryOnProvider(normalized.provider)
        const health = await provider.checkHealth()

        return json({
          settings: normalizeTryOnSettings(s?.ai_tryon),
          provider_status: health.status,
          provider_message: health.message || null,
          analytics,
        })
      }

      if (route === '/admin/tryon/test-connection' && method === 'POST') {
        const b = await request.json().catch(() => ({}))
        const s = await database.collection('settings').findOne({ id: 'global' })
        const tryonSettings = normalizeTryOnSettings({ ...s?.ai_tryon, ...b })
        const provider = getTryOnProvider(tryonSettings.provider)
        const health = await provider.checkHealth()
        return json(health)
      }

      // ---- Admin Order Notifications Settings & Recipients ----
      if (route === '/admin/notifications/settings' && method === 'GET') {
        const notifSettings = await getOrderNotificationSettings(database)
        return json(notifSettings)
      }

      if (route === '/admin/notifications/settings' && method === 'PUT') {
        const b = await request.json()
        const current = await getOrderNotificationSettings(database)
        const updated = {
          ...current,
          customer_email_enabled: b.customer_email_enabled !== undefined ? Boolean(b.customer_email_enabled) : current.customer_email_enabled,
          sales_email: {
            enabled: b.sales_email?.enabled !== undefined ? Boolean(b.sales_email.enabled) : current.sales_email.enabled,
            recipients: Array.isArray(b.sales_email?.recipients) ? b.sales_email.recipients : current.sales_email.recipients,
          },
          sales_whatsapp: {
            enabled: b.sales_whatsapp?.enabled !== undefined ? Boolean(b.sales_whatsapp.enabled) : current.sales_whatsapp.enabled,
            recipients: Array.isArray(b.sales_whatsapp?.recipients) ? b.sales_whatsapp.recipients : current.sales_whatsapp.recipients,
          },
          events: {
            ...current.events,
            ...(b.events || {}),
          },
        }

        await database.collection('settings').updateOne(
          { id: 'global' },
          { $set: { order_notifications: updated, updated_at: new Date() } },
          { upsert: true }
        )

        return json(updated)
      }

      if (route === '/admin/notifications/recipients' && method === 'POST') {
        const { type, name, email, phone, active } = await request.json()
        if (type !== 'email' && type !== 'whatsapp') {
          return json({ error: 'Type must be "email" or "whatsapp"' }, 400)
        }

        const cleanName = String(name || '').trim()
        if (!cleanName) return json({ error: 'Recipient name is required' }, 400)

        const current = await getOrderNotificationSettings(database)
        const newId = `rec_${type}_${uuidv4().slice(0, 8)}`

        if (type === 'email') {
          const cleanEmail = String(email || '').trim().toLowerCase()
          if (!cleanEmail || !cleanEmail.includes('@')) {
            return json({ error: 'Valid email address is required' }, 400)
          }
          const recipients = [...(current.sales_email?.recipients || [])]
          recipients.push({
            id: newId,
            name: cleanName,
            email: cleanEmail,
            active: active !== false,
          })
          current.sales_email.recipients = recipients
        } else {
          const cleanPhone = String(phone || '').trim()
          if (!cleanPhone || cleanPhone.length < 8) {
            return json({ error: 'Valid WhatsApp number is required (with country code)' }, 400)
          }
          const recipients = [...(current.sales_whatsapp?.recipients || [])]
          recipients.push({
            id: newId,
            name: cleanName,
            phone: cleanPhone,
            active: active !== false,
          })
          current.sales_whatsapp.recipients = recipients
        }

        await database.collection('settings').updateOne(
          { id: 'global' },
          { $set: { order_notifications: current, updated_at: new Date() } },
          { upsert: true }
        )

        return json(current)
      }

      if (parts[0] === 'admin' && parts[1] === 'notifications' && parts[2] === 'recipients' && parts[3] && method === 'PUT') {
        const id = parts[3]
        const { name, email, phone, active } = await request.json()
        const current = await getOrderNotificationSettings(database)

        let found = false
        if (current.sales_email?.recipients) {
          current.sales_email.recipients = current.sales_email.recipients.map((r) => {
            if (r.id === id) {
              found = true
              return {
                ...r,
                name: name !== undefined ? String(name).trim() : r.name,
                email: email !== undefined ? String(email).trim().toLowerCase() : r.email,
                active: active !== undefined ? Boolean(active) : r.active,
              }
            }
            return r
          })
        }

        if (current.sales_whatsapp?.recipients) {
          current.sales_whatsapp.recipients = current.sales_whatsapp.recipients.map((r) => {
            if (r.id === id) {
              found = true
              return {
                ...r,
                name: name !== undefined ? String(name).trim() : r.name,
                phone: phone !== undefined ? String(phone).trim() : r.phone,
                active: active !== undefined ? Boolean(active) : r.active,
              }
            }
            return r
          })
        }

        if (!found) return json({ error: 'Recipient not found' }, 404)

        await database.collection('settings').updateOne(
          { id: 'global' },
          { $set: { order_notifications: current, updated_at: new Date() } },
          { upsert: true }
        )

        return json(current)
      }

      if (parts[0] === 'admin' && parts[1] === 'notifications' && parts[2] === 'recipients' && parts[3] && method === 'DELETE') {
        const id = parts[3]
        const current = await getOrderNotificationSettings(database)

        if (current.sales_email?.recipients) {
          current.sales_email.recipients = current.sales_email.recipients.filter((r) => r.id !== id)
        }
        if (current.sales_whatsapp?.recipients) {
          current.sales_whatsapp.recipients = current.sales_whatsapp.recipients.filter((r) => r.id !== id)
        }

        await database.collection('settings').updateOne(
          { id: 'global' },
          { $set: { order_notifications: current, updated_at: new Date() } },
          { upsert: true }
        )

        return json(current)
      }

      if (route === '/admin/notifications/test-email' && method === 'POST') {
        const { to, type = 'customer' } = await request.json()
        const targetEmail = String(to || '').trim()
        if (!targetEmail || !targetEmail.includes('@')) {
          return json({ error: 'Please provide a valid destination email address' }, 400)
        }

        const sampleOrder = {
          id: 'test_' + uuidv4().slice(0, 8),
          order_number: 'TC-2026-TEST-SAMPLE',
          customer: {
            fullName: 'Test Customer',
            name: 'Test Customer',
            email: targetEmail,
            phone: '+91 98765 43210',
            house: 'Thretha Atelier Test Villa',
            street: 'Panampilly Nagar',
            city: 'Kochi',
            state: 'Kerala',
            postalCode: '682036',
          },
          items: [
            {
              product_name: 'Kasavu Tissue Sari with Zari Weave',
              sku: 'TC-KAS-01',
              size: 'Free Size',
              colour: 'Ivory Gold',
              quantity: 1,
              price: 4999,
            },
          ],
          subtotal: 4999,
          discount: 0,
          shipping: 0,
          total: 4999,
          payment_method: 'CASHFREE',
          payment_status: 'PAID',
          created_at: new Date(),
        }

        const settings = await database.collection('settings').findOne({ id: 'global' })
        const appUrl = getCashfreePublicBaseUrl(request)

        try {
          let emailContent
          if (type === 'sales') {
            emailContent = renderSalesOrderEmail({ order: sampleOrder, settings, appUrl })
          } else {
            emailContent = renderCustomerOrderEmail({ order: sampleOrder, settings, appUrl })
          }

          const res = await sendEmail({
            to: targetEmail,
            subject: `[TEST] ${emailContent.subject}`,
            text: emailContent.text,
            html: emailContent.html,
          })

          return json({
            success: true,
            message: `Test email dispatched successfully to ${targetEmail}`,
            provider: res.provider,
            provider_id: res.id,
          })
        } catch (err) {
          return json({ success: false, error: err.message }, 500)
        }
      }

      if (route === '/admin/notifications/test-whatsapp' && method === 'POST') {
        const { phone } = await request.json()
        const targetPhone = String(phone || '').trim()
        if (!targetPhone) {
          return json({ error: 'Please provide a valid destination phone number' }, 400)
        }

        const testMessage = `✨ *THRETHA COUTURE — TEST NOTIFICATION*\n\n` +
          `This is a test notification from the Thretha Couture Admin Panel.\n` +
          `Timestamp: ${new Date().toLocaleString('en-IN')}\n` +
          `Status: System operational.`

        try {
          const res = await sendSalesWhatsAppMessage({
            phone: targetPhone,
            message: testMessage,
          })

          if (!res.success) {
            return json({ success: false, error: res.error || 'WhatsApp message failed' }, 400)
          }

          return json({
            success: true,
            messageId: res.messageId,
            message: `Test WhatsApp notification sent successfully to ${targetPhone}`,
          })
        } catch (err) {
          return json({ success: false, error: err.message }, 500)
        }
      }

      if (route === '/admin/notifications/logs' && method === 'GET') {
        const logs = await database.collection('order_notifications_log')
          .find({})
          .sort({ created_at: -1 })
          .limit(50)
          .toArray()
        return json(logs.map(strip))
      }

      // ---- Admin Promotions: Coupons ----
      if (route === '/admin/promotions/coupons' && method === 'GET') {
        await ensurePromotionsSeeded(database)
        const coupons = await database.collection('coupons').find({}).sort({ createdAt: -1 }).toArray()
        return json(coupons.map(strip))
      }

      if (route === '/admin/promotions/coupons' && method === 'POST') {
        await ensurePromotionsSeeded(database)
        const body = await request.json()
        const code = normalizeCouponCode(body.code)
        if (!code) return json({ error: 'Coupon code is required' }, 400)
        if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
          return json({ error: 'Coupon code must be 2–30 uppercase alphanumeric characters (hyphens and underscores allowed)' }, 400)
        }

        const discountType = body.discountType === 'fixed' ? 'fixed' : 'percentage'
        const discountValue = Number(body.discountValue)
        if (isNaN(discountValue) || discountValue <= 0) {
          return json({ error: 'Discount value must be greater than 0' }, 400)
        }
        if (discountType === 'percentage' && discountValue > 100) {
          return json({ error: 'Percentage discount cannot exceed 100%' }, 400)
        }

        const minOrderValue = Math.max(0, Number(body.minOrderValue) || 0)
        const maxDiscount = body.maxDiscount ? Math.max(0, Number(body.maxDiscount)) : null
        const usageLimit = body.usageLimit ? Math.max(1, Math.floor(Number(body.usageLimit))) : null
        const perCustomerLimit = body.perCustomerLimit ? Math.max(1, Math.floor(Number(body.perCustomerLimit))) : null

        if (body.startAt && body.expiresAt && new Date(body.expiresAt) <= new Date(body.startAt)) {
          return json({ error: 'Expiry date must be after start date' }, 400)
        }

        const existing = await database.collection('coupons').findOne({ code })
        if (existing) {
          return json({ error: `Coupon code "${code}" already exists` }, 400)
        }

        const now = new Date()
        const doc = {
          id: uuidv4(),
          code,
          description: String(body.description || '').trim(),
          discountType,
          discountValue,
          minOrderValue,
          maxDiscount,
          usageLimit,
          usageCount: 0,
          perCustomerLimit,
          startAt: body.startAt ? new Date(body.startAt) : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          firstOrderOnly: Boolean(body.firstOrderOnly),
          appliesTo: ['categories', 'products'].includes(body.appliesTo) ? body.appliesTo : 'all',
          categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds : [],
          productIds: Array.isArray(body.productIds) ? body.productIds : [],
          isActive: body.isActive !== false,
          createdAt: now,
          updatedAt: now,
        }

        await database.collection('coupons').insertOne(doc)
        return json(strip(doc))
      }

      if (parts[0] === 'admin' && parts[1] === 'promotions' && parts[2] === 'coupons' && parts.length >= 4) {
        const id = parts[3]
        if (parts.length === 5 && parts[4] === 'usages' && method === 'GET') {
          const usages = await database.collection('coupon_usages').find({ couponId: id }).sort({ createdAt: -1 }).toArray()
          return json(usages.map(strip))
        }

        if (parts.length === 4 && method === 'GET') {
          const c = await database.collection('coupons').findOne({ id })
          if (!c) return json({ error: 'Coupon not found' }, 404)
          return json(strip(c))
        }

        if (parts.length === 4 && (method === 'PATCH' || method === 'PUT')) {
          const body = await request.json()
          const update = { updatedAt: new Date() }

          if (body.code !== undefined) {
            const code = normalizeCouponCode(body.code)
            if (!code || !/^[A-Z0-9_-]{2,30}$/.test(code)) {
              return json({ error: 'Invalid coupon code format' }, 400)
            }
            const duplicate = await database.collection('coupons').findOne({ code, id: { $ne: id } })
            if (duplicate) {
              return json({ error: `Coupon code "${code}" is already in use by another coupon` }, 400)
            }
            update.code = code
          }

          if (body.description !== undefined) update.description = String(body.description || '').trim()
          if (body.discountType !== undefined) update.discountType = body.discountType === 'fixed' ? 'fixed' : 'percentage'
          if (body.discountValue !== undefined) {
            const val = Number(body.discountValue)
            if (isNaN(val) || val <= 0) return json({ error: 'Discount value must be greater than 0' }, 400)
            if ((body.discountType || update.discountType) === 'percentage' && val > 100) {
              return json({ error: 'Percentage discount cannot exceed 100%' }, 400)
            }
            update.discountValue = val
          }
          if (body.minOrderValue !== undefined) update.minOrderValue = Math.max(0, Number(body.minOrderValue) || 0)
          if (body.maxDiscount !== undefined) update.maxDiscount = body.maxDiscount ? Math.max(0, Number(body.maxDiscount)) : null
          if (body.usageLimit !== undefined) update.usageLimit = body.usageLimit ? Math.max(1, Math.floor(Number(body.usageLimit))) : null
          if (body.perCustomerLimit !== undefined) update.perCustomerLimit = body.perCustomerLimit ? Math.max(1, Math.floor(Number(body.perCustomerLimit))) : null
          if (body.startAt !== undefined) update.startAt = body.startAt ? new Date(body.startAt) : null
          if (body.expiresAt !== undefined) update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
          if (body.firstOrderOnly !== undefined) update.firstOrderOnly = Boolean(body.firstOrderOnly)
          if (body.appliesTo !== undefined) update.appliesTo = ['categories', 'products'].includes(body.appliesTo) ? body.appliesTo : 'all'
          if (body.categoryIds !== undefined) update.categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : []
          if (body.productIds !== undefined) update.productIds = Array.isArray(body.productIds) ? body.productIds : []
          if (body.isActive !== undefined) update.isActive = Boolean(body.isActive)

          await database.collection('coupons').updateOne({ id }, { $set: update })
          const c = await database.collection('coupons').findOne({ id })
          if (!c) return json({ error: 'Coupon not found' }, 404)
          return json(strip(c))
        }

        if (parts.length === 4 && method === 'DELETE') {
          await database.collection('coupons').deleteOne({ id })
          return json({ ok: true })
        }
      }

      // ---- Admin Promotions: Free Delivery Rules ----
      if (route === '/admin/promotions/free-delivery-rules' && method === 'GET') {
        await ensurePromotionsSeeded(database)
        const rules = await database.collection('free_delivery_rules').find({}).sort({ createdAt: -1 }).toArray()
        return json(rules.map(strip))
      }

      if (route === '/admin/promotions/free-delivery-rules' && method === 'POST') {
        const body = await request.json()
        const name = String(body.name || '').trim()
        if (!name) return json({ error: 'Rule name is required' }, 400)

        const minOrderValue = Math.max(0, Number(body.minOrderValue) || 0)
        const maxOrderValue = body.maxOrderValue ? Math.max(0, Number(body.maxOrderValue)) : null
        const couponCode = body.couponCode ? normalizeCouponCode(body.couponCode) : null

        const now = new Date()
        const ruleDoc = {
          id: uuidv4(),
          name,
          minOrderValue,
          maxOrderValue,
          appliesTo: ['categories', 'products'].includes(body.appliesTo) ? body.appliesTo : 'all',
          categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds : [],
          productIds: Array.isArray(body.productIds) ? body.productIds : [],
          couponCode,
          startAt: body.startAt ? new Date(body.startAt) : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: body.isActive !== false,
          createdAt: now,
          updatedAt: now,
        }

        await database.collection('free_delivery_rules').insertOne(ruleDoc)
        return json(strip(ruleDoc))
      }

      if (parts[0] === 'admin' && parts[1] === 'promotions' && parts[2] === 'free-delivery-rules' && parts.length === 4) {
        const id = parts[3]
        if (method === 'GET') {
          const r = await database.collection('free_delivery_rules').findOne({ id })
          if (!r) return json({ error: 'Rule not found' }, 404)
          return json(strip(r))
        }

        if (method === 'PATCH' || method === 'PUT') {
          const body = await request.json()
          const update = { updatedAt: new Date() }
          if (body.name !== undefined) update.name = String(body.name || '').trim()
          if (body.minOrderValue !== undefined) update.minOrderValue = Math.max(0, Number(body.minOrderValue) || 0)
          if (body.maxOrderValue !== undefined) update.maxOrderValue = body.maxOrderValue ? Math.max(0, Number(body.maxOrderValue)) : null
          if (body.couponCode !== undefined) update.couponCode = body.couponCode ? normalizeCouponCode(body.couponCode) : null
          if (body.appliesTo !== undefined) update.appliesTo = ['categories', 'products'].includes(body.appliesTo) ? body.appliesTo : 'all'
          if (body.categoryIds !== undefined) update.categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds : []
          if (body.productIds !== undefined) update.productIds = Array.isArray(body.productIds) ? body.productIds : []
          if (body.startAt !== undefined) update.startAt = body.startAt ? new Date(body.startAt) : null
          if (body.expiresAt !== undefined) update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
          if (body.isActive !== undefined) update.isActive = Boolean(body.isActive)

          await database.collection('free_delivery_rules').updateOne({ id }, { $set: update })
          const r = await database.collection('free_delivery_rules').findOne({ id })
          if (!r) return json({ error: 'Rule not found' }, 404)
          return json(strip(r))
        }

        if (method === 'DELETE') {
          await database.collection('free_delivery_rules').deleteOne({ id })
          return json({ ok: true })
        }
      }

      // ---- Admin Combos & Bundles ----
      if (route === '/admin/combos' && method === 'GET') {
        await ensureCombosSeeded(database)
        const combos = await database.collection('combos').find({}).sort({ display_order: 1, created_at: -1 }).toArray()
        return json(combos.map(strip))
      }

      if (route === '/admin/combos/stats' && method === 'GET') {
        await ensureCombosSeeded(database)
        const combos = await database.collection('combos').find({}).toArray()
        let totalRevenue = 0
        let totalUnits = 0
        let totalOrders = 0
        let totalSavings = 0
        for (const c of combos) {
          totalRevenue += Number(c.stats?.revenue_generated || 0)
          totalUnits += Number(c.stats?.units_sold || 0)
          totalOrders += Number(c.stats?.times_purchased || 0)
          totalSavings += Number(c.stats?.total_savings || 0)
        }
        return json({
          totalCombos: combos.length,
          activeCombos: combos.filter((c) => c.active !== false).length,
          totalOrders,
          totalUnits,
          totalRevenue,
          totalSavings,
        })
      }

      if (route === '/admin/combos' && method === 'POST') {
        await ensureCombosSeeded(database)
        const body = await request.json()
        if (!body.name || !String(body.name).trim()) {
          return json({ error: 'Combo name is required' }, 400)
        }
        if (!Array.isArray(body.slots) || body.slots.length === 0) {
          return json({ error: 'At least one slot is required in a combo' }, 400)
        }

        const comboType = ['FIXED', 'PICK_AND_CHOOSE', 'BUY_X_FOR_Y', 'MULTI_CATEGORY', 'CURATED_OUTFIT'].includes(body.type)
          ? body.type
          : 'CURATED_OUTFIT'

        const validation = await normalizeAndValidateAdminSlots({
          database,
          comboType,
          slots: body.slots,
        })
        if (!validation.valid) {
          return json({ error: validation.error }, 400)
        }

        const now = new Date()
        const id = uuidv4()
        let baseSlug = body.slug ? comboSlugify(body.slug) : comboSlugify(body.name)
        if (!baseSlug) baseSlug = `combo-${id.slice(0, 8)}`

        let finalSlug = baseSlug
        const existingSlug = await database.collection('combos').findOne({ slug: finalSlug })
        if (existingSlug) {
          finalSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
        }

        const doc = {
          id,
          name: String(body.name).trim(),
          customer_title: String(body.customer_title || body.name).trim(),
          slug: finalSlug,
          description: String(body.description || '').trim(),
          image: body.image || body.media?.[0]?.url || '',
          media: Array.isArray(body.media) ? body.media : [],
          type: comboType,
          pricing_method: ['fixed_price', 'percentage_discount', 'flat_discount'].includes(body.pricing_method)
            ? body.pricing_method
            : 'fixed_price',
          combo_price: Math.max(0, Number(body.combo_price) || 0),
          discount_value: Math.max(0, Number(body.discount_value) || 0),
          min_value: Math.max(0, Number(body.min_value) || 0),
          max_discount: body.max_discount ? Math.max(0, Number(body.max_discount)) : null,
          allow_coupons: body.allow_coupons !== false,
          start_date: body.start_date ? new Date(body.start_date) : null,
          expiry_date: body.expiry_date ? new Date(body.expiry_date) : null,
          active: body.active !== false,
          display_order: Number(body.display_order) || 0,
          slots: validation.slots,
          stats: {
            added_to_cart_count: 0,
            times_purchased: 0,
            units_sold: 0,
            revenue_generated: 0,
            total_savings: 0,
            popular_products: {},
          },
          created_at: now,
          updated_at: now,
        }

        await database.collection('combos').insertOne(doc)
        return json(strip(doc), 201)
      }

      if (parts[0] === 'admin' && parts[1] === 'combos' && parts.length >= 3) {
        const id = parts[2]
        const action = parts[3]

        if (action === 'toggle' && method === 'POST') {
          const combo = await database.collection('combos').findOne({ id })
          if (!combo) return json({ error: 'Combo not found' }, 404)
          const newActive = !combo.active
          await database.collection('combos').updateOne({ id }, { $set: { active: newActive, updated_at: new Date() } })
          return json({ ok: true, active: newActive })
        }

        if (action === 'duplicate' && method === 'POST') {
          const combo = await database.collection('combos').findOne({ id })
          if (!combo) return json({ error: 'Combo not found' }, 404)

          const newId = uuidv4()
          const newSlug = `${combo.slug}-copy-${Math.random().toString(36).slice(2, 6)}`
          const cloned = {
            ...combo,
            _id: undefined,
            id: newId,
            name: `${combo.name} (Copy)`,
            customer_title: combo.customer_title ? `${combo.customer_title} (Copy)` : `${combo.name} (Copy)`,
            slug: newSlug,
            active: false,
            stats: {
              added_to_cart_count: 0,
              times_purchased: 0,
              units_sold: 0,
              revenue_generated: 0,
              total_savings: 0,
              popular_products: {},
            },
            created_at: new Date(),
            updated_at: new Date(),
          }
          delete cloned._id

          await database.collection('combos').insertOne(cloned)
          return json(strip(cloned))
        }

        if (method === 'GET') {
          const combo = await database.collection('combos').findOne({ id })
          if (!combo) return json({ error: 'Combo not found' }, 404)
          return json(strip(combo))
        }

        if (method === 'PATCH' || method === 'PUT') {
          const combo = await database.collection('combos').findOne({ id })
          if (!combo) return json({ error: 'Combo not found' }, 404)

          const body = await request.json()
          const update = { updated_at: new Date() }

          const effectiveType = body.type !== undefined
            ? (['FIXED', 'PICK_AND_CHOOSE', 'BUY_X_FOR_Y', 'MULTI_CATEGORY', 'CURATED_OUTFIT'].includes(body.type) ? body.type : 'CURATED_OUTFIT')
            : (combo.type || 'CURATED_OUTFIT')

          if (body.name !== undefined) update.name = String(body.name).trim()
          if (body.customer_title !== undefined) update.customer_title = String(body.customer_title).trim()
          if (body.slug !== undefined) update.slug = comboSlugify(body.slug)
          if (body.description !== undefined) update.description = String(body.description).trim()
          if (body.image !== undefined) update.image = body.image
          if (body.media !== undefined) update.media = Array.isArray(body.media) ? body.media : []
          if (body.type !== undefined) update.type = effectiveType
          if (body.pricing_method !== undefined) update.pricing_method = body.pricing_method
          if (body.combo_price !== undefined) update.combo_price = Math.max(0, Number(body.combo_price) || 0)
          if (body.discount_value !== undefined) update.discount_value = Math.max(0, Number(body.discount_value) || 0)
          if (body.min_value !== undefined) update.min_value = Math.max(0, Number(body.min_value) || 0)
          if (body.max_discount !== undefined) update.max_discount = body.max_discount ? Math.max(0, Number(body.max_discount)) : null
          if (body.allow_coupons !== undefined) update.allow_coupons = Boolean(body.allow_coupons)
          if (body.start_date !== undefined) update.start_date = body.start_date ? new Date(body.start_date) : null
          if (body.expiry_date !== undefined) update.expiry_date = body.expiry_date ? new Date(body.expiry_date) : null
          if (body.active !== undefined) update.active = Boolean(body.active)
          if (body.display_order !== undefined) update.display_order = Number(body.display_order) || 0

          if (body.slots !== undefined) {
            const validation = await normalizeAndValidateAdminSlots({
              database,
              comboType: effectiveType,
              slots: body.slots,
            })
            if (!validation.valid) {
              return json({ error: validation.error }, 400)
            }
            update.slots = validation.slots
          }

          await database.collection('combos').updateOne({ id }, { $set: update })
          const updated = await database.collection('combos').findOne({ id })
          if (!updated) return json({ error: 'Combo not found' }, 404)
          return json(strip(updated))
        }

        if (method === 'DELETE') {
          await database.collection('combos').deleteOne({ id })
          return json({ ok: true })
        }
      }

      // ---- Media upload (admin) ----
      if (route === '/admin/media' && method === 'POST') {
        return json({ error: 'Use the signed direct-to-Cloudinary upload flow.' }, 410)
      }
    }

    return apiError({
      code: ERROR_CODES.NOT_FOUND,
      message: `Route ${route} not found`,
      status: 404,
      requestId,
    })
  } catch (error) {
    logger.error({
      requestId,
      route,
      method,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: error?.message,
      error,
    })
    return apiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Something went wrong. Please try again. If the problem continues, contact us.',
      status: 500,
      requestId,
    })
  }
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 200 }))
}
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
