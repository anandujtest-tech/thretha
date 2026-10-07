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
import {
  cleanCampaignInput,
  getNextPushOccurrence,
  getPushSubscriberCooldownMinutes,
  getVapidPublicKey,
  isValidPushSubscriberCooldownMinutes,
  isWebPushConfigured,
  normalizePushSchedule,
  normalizePushSubscription,
} from '../../../lib/pushNotifications.js'
import { ensurePushIndexes, processPushQueue, suppressDuePushCampaigns } from '../../../lib/pushScheduler.js'
import { normalizeOccasions, DEFAULT_OCCASIONS } from '../../../lib/occasions.js'
import { ensureProductReviewIndexes, normalizeReviewText, isCloudinaryImageUrl } from '../../../lib/productReviews.js'
import { ensureBackInStockIndexes, isVariantAvailable, saveBackInStockSubscription, unsubscribeBackInStockSubscription, verifyBackInStockUnsubscribeToken, verifySignedBackInStockUnsubscribeToken } from '../../../lib/backInStock.js'
import { ensureAbandonedCartIndexes, createCartKey, getCartRecoveryItems, createCartRecoveryToken, verifyCartRecoveryToken, backInStockUnsubscribeToken as createCartUnsubscribeToken, verifyBackInStockUnsubscribeToken as verifyCartUnsubscribeToken } from '../../../lib/abandonedCart.js'
import { ensureNewsletterIndexes, createNewsletterUnsubscribeToken, verifyNewsletterUnsubscribeToken, normalizeNewsletterEmail, isValidNewsletterEmail } from '../../../lib/newsletter.js'
import { validateNewsletterDraft, renderNewsletterEmail } from '../../../lib/newsletterCampaigns.js'
import { countNewsletterAudience, ensureNewsletterCampaignIndexes } from '../../../lib/newsletterScheduler.js'
import { normalizeSearchTerm, escapeSearchTerm, parsePriceRange, filterProductsByPriceAndAvailability } from '../../../lib/catalogFilters.js'
import { getProductEffectivePrice } from '../../../lib/productInventory.js'
import { isValidHomeSectionOrderInput, isValidHomeSectionVisibilityInput, normalizeHomeSectionOrder, normalizeHomeSectionVisibility } from '../../../lib/homeLayout.js'
import { DEFAULT_HOMEPAGE_CONTENT } from '../../../lib/homepageContent.js'
import { ANALYTICS_DEDUPE_WINDOWS, allowAnalyticsRequest, createAnalyticsDedupeKey, reserveAnalyticsDedupe, validateAnalyticsEntity, validateAnalyticsPayload } from '../../../lib/analyticsProtection.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
      await ensureProductReviewIndexes(database)
      await ensureBackInStockIndexes(database)
      await ensureAbandonedCartIndexes(database)
      await database.collection('visitor_events').createIndex({ event_name: 1, created_at: 1, product_slug: 1 })
      await database.collection('visitor_event_deduplication').createIndex({ key: 1 }, { unique: true })
      await database.collection('visitor_event_deduplication').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
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

function getCheckoutAvailability(settings) {
  return {
    pay_online_enabled: settings?.checkout?.pay_online_enabled !== false,
    whatsapp_order_enabled: settings?.checkout?.whatsapp_order_enabled !== false,
  }
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

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function strip(doc) {
  if (!doc) return doc
  const { _id, password_hash, ...rest } = doc
  return rest
}

function normalizeIndianMobile(value) {
  const raw = String(value ?? '').trim()
  if (!raw || !/^[+\d\s().-]+$/.test(raw) || (raw.includes('+') && (!raw.startsWith('+') || raw.indexOf('+', 1) !== -1))) return null
  const digits = raw.replace(/\D/g, '')
  if (raw.startsWith('+') && !/^91[6-9]\d{9}$/.test(digits)) return null
  const local = digits.length === 10 ? digits
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : null
  return local && /^[6-9]\d{9}$/.test(local) ? local : null
}

function guestContactMatches(order, contact) {
  const suppliedEmail = String(contact ?? '').trim().toLowerCase()
  const orderEmail = String(order.customer?.email ?? '').trim().toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail) && suppliedEmail === orderEmail) return true
  const suppliedPhone = normalizeIndianMobile(contact)
  return Boolean(suppliedPhone && [order.customer?.phone, order.customer?.whatsapp]
    .some((phone) => normalizeIndianMobile(phone) === suppliedPhone))
}

function orderReferenceFilter(reference) {
  const normalized = String(reference).trim()
  return { $or: [
    { id: normalized },
    { order_number: normalized },
    { order_number: normalized.toUpperCase() },
    { cashfree_order_id: normalized },
    { 'payment.cashfree_order_id': normalized },
  ] }
}

function publicOrderReceipt(order) {
  return {
    id: order.id,
    order_number: order.order_number,
    status: order.status || 'NEW',
    payment_status: order.payment_status || 'PENDING',
    payment_method: order.payment_method || 'WHATSAPP_CONCIERGE',
    created_at: order.created_at,
    updated_at: order.updated_at,
    customer: {
      name: order.customer?.fullName || order.customer?.name || '',
      house: order.customer?.addressLine1 || order.customer?.house || '',
      street: order.customer?.addressLine2 || order.customer?.street || '',
      city: order.customer?.city || '',
      district: order.customer?.district || '',
      state: order.customer?.state || '',
      pincode: order.customer?.postalCode || order.customer?.pincode || '',
      whatsapp: order.customer?.whatsapp || '',
      phone: order.customer?.phone || '',
      email: order.customer?.email || '',
    },
    items: (order.items || []).map((item) => ({
      product_id: item.product_id || null,
      product_name: item.product_name || item.combo_name || '',
      sku: item.sku || null,
      size: item.size || null,
      colour: item.colour || null,
      quantity: item.quantity,
      price: item.price,
      is_combo: item.is_combo === true,
      combo_name: item.combo_name || null,
      customer_title: item.customer_title || null,
      savings: item.savings || 0,
      components: item.is_combo && Array.isArray(item.components)
        ? item.components.map((component) => ({ product_name: component.product_name, size: component.size || null, quantity: component.quantity }))
        : [],
    })),
    subtotal: order.subtotal ?? order.total,
    discount: order.discount || 0,
    shipping: order.shipping || 0,
    total: order.total,
    courier: order.courier || null,
    tracking_number: order.tracking_number || null,
    estimated_delivery: order.estimated_delivery || null,
    refund_status: order.refund?.status || order.payment?.refund_status || order.refund_status || null,
    refund_amount: order.refund?.amount ?? order.payment?.refund_amount ?? order.refund_amount ?? null,
    refund: { status: order.refund?.status || null, amount: order.refund?.amount ?? null },
    payment: {
      cashfree_payment_id: order.payment?.cashfree_payment_id || null,
      failure_reason: order.payment?.failure_reason || null,
      refund_status: order.payment?.refund_status || null,
      refund_amount: order.payment?.refund_amount ?? null,
    },
    payment_id: order.payment_id || null,
    cancellation_reason: order.cancellation_reason || null,
  }
}

function adminNewsletterCampaign(campaign) {
  return {
    id: campaign.id,
    subject: campaign.subject,
    preview_text: campaign.preview_text || '',
    blocks: campaign.blocks || [],
    audience: campaign.audience || 'active',
    status: campaign.status,
    recipient_count: campaign.recipient_count || 0,
    sent_count: campaign.sent_count || 0,
    failed_count: campaign.failed_count || 0,
    unknown_count: campaign.unknown_count || 0,
    skipped_count: campaign.skipped_count || 0,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at,
    started_at: campaign.started_at || null,
    completed_at: campaign.completed_at || null,
  }
}

function reviewOrderOwnerFilter(customer) {
  const owners = [{ userId: customer.id }]
  const email = String(customer.email || '').trim()
  if (email.includes('@')) {
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    owners.push({ userId: null, 'customer.email': { $regex: new RegExp(`^${escaped}$`, 'i') } })
  }
  return { $or: owners }
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
const CLIENT_VISITOR_EVENT_NAMES = new Set(['quick_view', 'add_to_cart', 'checkout_started', 'remove_from_cart', 'search_performed', 'location_shared'])

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

async function recordVisitorActivity(database, request, body, requestedEvent, acceptedEvents = null, requiredProductEvents = new Set()) {
  const validation = validateAnalyticsPayload(body, requestedEvent, {
    eventNames: VISITOR_EVENT_NAMES,
    clientEventNames: acceptedEvents,
    requiredProductEvents,
  })
  if (!validation.valid) return json({ error: validation.error }, 400)

  const visitorId = body.visitor_id
  const eventName = requestedEvent
  const page = body.page || '/'
  const productSlug = typeof body.product_slug === 'string' ? body.product_slug : null
  const categorySlug = typeof body.category_slug === 'string' ? body.category_slug : null
  const sessionId = body.session_id || 'legacy-session'

  // Bound both traffic per source IP and bursts from one claimed visitor.
  // Visitor IDs are client supplied, so the IP limit remains the abuse backstop.
  const forwardedIpForLimit = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim()
  const ipCandidatesForLimit = [request.headers.get('cf-connecting-ip'), request.headers.get('x-vercel-forwarded-for'), request.headers.get('x-real-ip'), forwardedIpForLimit]
  const rateLimitIp = ipCandidatesForLimit.map((value) => value?.trim()).find((value) => value && isIP(value)) || getClientIp(request)
  const rate = await allowAnalyticsRequest({ database, ip: rateLimitIp, visitorId, checkRateLimit })
  if (!rate.allowed) return json({ error: 'Analytics request limit reached.' }, 429)

  const entityValidation = await validateAnalyticsEntity(database, eventName, productSlug, categorySlug)
  if (!entityValidation.valid) return json({ error: entityValidation.error }, 400)

  // Product views count once per visitor/session/product in a 30-minute window;
  // cart adds are deduped for 10 seconds; checkout starts once per 30 minutes.
  // Other events retain their existing raw-event semantics.
  const eventNow = Date.now()
  const dedupeKey = createAnalyticsDedupeKey({ visitorId, sessionId, eventName, entitySlug: productSlug, now: eventNow })
  if (dedupeKey) {
    const windowMs = ANALYTICS_DEDUPE_WINDOWS[eventName]
    const expiresAt = new Date((Math.floor(eventNow / windowMs) + 1) * windowMs + 60_000)
    if (!await reserveAnalyticsDedupe(database, dedupeKey, expiresAt)) return json({ ok: true, deduplicated: true })
  }

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
    // ===== BROWSER WEB PUSH =====
    if (route === '/push/config' && method === 'GET') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { browser_notifications: 1 } })
      const configured = isWebPushConfigured()
      return json({ enabled: settings?.browser_notifications?.enabled === true && configured, configured, vapidPublicKey: configured ? getVapidPublicKey() : '' }, 200, { 'Cache-Control': 'no-store, max-age=0' })
    }
    if (route === '/push/subscribe' && method === 'POST') {
      try {
        const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { browser_notifications: 1 } })
        if (settings?.browser_notifications?.enabled !== true) return json({ error: 'Browser notifications are currently disabled.' }, 403)
        if (!isWebPushConfigured()) return json({ error: 'Browser notifications are not configured yet.' }, 503)
        const ipHash = crypto.createHash('sha256').update(getClientIp(request)).digest('hex')
        const rate = await checkRateLimit(database, `push_subscribe_${ipHash}`, 20, 60)
        if (!rate.allowed) return json({ error: 'Too many subscription attempts. Please try again later.' }, 429)
        const body = await request.json().catch(() => ({}))
        const subscription = normalizePushSubscription(body.subscription)
        const now = new Date()
        await ensurePushIndexes(database)
        await database.collection('push_subscriptions').updateOne(
          { endpoint: subscription.endpoint },
          {
            $set: { keys: subscription.keys, active: true, updated_at: now, last_failure: null },
            $setOnInsert: { created_at: now, last_success_at: null, success_count: 0, failure_count: 0 },
          },
          { upsert: true },
        )
        return json({ ok: true })
      } catch (error) {
        return json({ error: error.message || 'Unable to save this push subscription.' }, 400)
      }
    }
    if (route === '/push/unsubscribe' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        const subscription = normalizePushSubscription(body.subscription)
        await database.collection('push_subscriptions').updateOne(
          { endpoint: subscription.endpoint, 'keys.p256dh': subscription.keys.p256dh, 'keys.auth': subscription.keys.auth },
          { $set: { active: false, updated_at: new Date(), unsubscribed_at: new Date() } },
        )
        return json({ ok: true })
      } catch (error) {
        return json({ error: error.message || 'Unable to unsubscribe this browser.' }, 400)
      }
    }
    if (route === '/admin/push' && method === 'GET') {
      if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401)
      await ensurePushIndexes(database)
      const now = new Date()
      const indiaDate = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((part) => [part.type, part.value]))
      const today = new Date(`${indiaDate.year}-${indiaDate.month}-${indiaDate.day}T00:00:00+05:30`)
      const [setting, subscriberCount, scheduledCount, sentToday, campaigns] = await Promise.all([
        database.collection('settings').findOne({ id: 'global' }, { projection: { browser_notifications: 1, notifications: 1 } }),
        database.collection('push_subscriptions').countDocuments({ active: true }),
        database.collection('notification_campaigns').countDocuments({ status: { $in: ['scheduled', 'active', 'paused', 'sending'] } }),
        database.collection('notification_deliveries').countDocuments({ status: 'sent', completed_at: { $gte: today } }),
        database.collection('notification_campaigns').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray(),
      ])
      return json({
        enabled: setting?.browser_notifications?.enabled === true,
        configured: isWebPushConfigured(),
        cooldown_minutes: getPushSubscriberCooldownMinutes(setting?.notifications?.push_subscriber_cooldown_minutes),
        subscriber_count: subscriberCount,
        scheduled_count: scheduledCount,
        sent_today: sentToday,
        campaigns,
      })
    }
    if (route === '/admin/push/settings' && method === 'PUT') {
      if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const hasEnabled = typeof body.enabled === 'boolean'
      const hasCooldown = Object.hasOwn(body, 'cooldown_minutes')
      if (!hasEnabled && !hasCooldown) return json({ error: 'Choose a notification setting to update.' }, 400)
      if (hasCooldown && !isValidPushSubscriberCooldownMinutes(body.cooldown_minutes)) {
        return json({ error: 'Cooldown must be a whole number from 0 to 10080 minutes.' }, 400)
      }
      if (hasEnabled && body.enabled && !isWebPushConfigured()) return json({ error: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT before enabling browser push.' }, 400)
      const settingsCollection = database.collection('settings')
      const current = await settingsCollection.findOne({ id: 'global' }, { projection: { browser_notifications: 1, notifications: 1 } })
      const previous = current?.browser_notifications || {}
      const now = new Date()
      const update = { updated_at: now }
      let browserNotifications = previous
      if (hasEnabled) {
        if (body.enabled && previous.enabled !== true && previous.disabled_at) await suppressDuePushCampaigns(database, now)
        browserNotifications = body.enabled
          ? { ...previous, enabled: true, disabled_at: null }
          : { ...previous, enabled: false, disabled_at: previous.enabled === false && previous.disabled_at ? previous.disabled_at : now }
        update.browser_notifications = browserNotifications
      }
      if (hasCooldown) update['notifications.push_subscriber_cooldown_minutes'] = body.cooldown_minutes
      await settingsCollection.updateOne({ id: 'global' }, { $set: update }, { upsert: true })
      if (hasEnabled && !body.enabled) await suppressDuePushCampaigns(database, now)
      return json({
        enabled: hasEnabled ? browserNotifications.enabled : previous.enabled === true,
        configured: isWebPushConfigured(),
        cooldown_minutes: getPushSubscriberCooldownMinutes(hasCooldown ? body.cooldown_minutes : current?.notifications?.push_subscriber_cooldown_minutes),
      })
    }
    if (route === '/admin/push/campaigns' && method === 'POST') {
      const admin = requireAuth(request)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      if (!isWebPushConfigured()) return json({ error: 'Configure VAPID environment variables before creating campaigns.' }, 400)
      const body = await request.json().catch(() => ({}))
      let content
      let sendMode
      let schedule
      try {
        content = cleanCampaignInput(body)
        sendMode = body.send_mode || 'now'
        schedule = normalizePushSchedule(sendMode, body.schedule)
      } catch (error) {
        return json({ error: error.message || 'Unable to create notification.' }, 400)
      }
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { browser_notifications: 1 } })
      if (schedule.type === 'now' && settings?.browser_notifications?.enabled !== true) return json({ error: 'Enable Browser Notifications before sending.' }, 409)
      const now = new Date()
      const nextRun = schedule.type === 'once' ? schedule.scheduled_at : schedule.type === 'now' ? now : getNextPushOccurrence(schedule, new Date(now.getTime() - 1))
      if (!nextRun) return json({ error: 'This schedule has no upcoming delivery.' }, 400)
      const campaign = {
        id: uuidv4(), ...content, audience: 'all_active', schedule,
        status: schedule.type === 'repeat' ? 'active' : 'scheduled',
        next_run_at: nextRun,
        created_by: String(admin.email || admin.sub || 'admin').slice(0, 160),
        created_at: now, updated_at: now,
        targeted_count: 0, success_count: 0, failed_count: 0,
        run_count: 0,
      }
      try {
        await ensurePushIndexes(database)
        await database.collection('notification_campaigns').insertOne(campaign)
      } catch {
        return json({ error: 'Unable to create notification.' }, 500)
      }

      if (schedule.type !== 'now') {
        return json({ ok: true, status: 'scheduled', campaign: { ...campaign, _id: undefined } }, 201)
      }

      let result
      try {
        result = await processPushQueue(database, new Date(), { campaignId: campaign.id })
      } catch {
        return json({
          error: 'The notification was created but immediate delivery could not be completed. It remains queued for Cron retry.',
          campaignId: campaign.id,
          retryable: true,
        }, 503)
      }
      const response = {
        ok: result.status !== 'failed',
        campaignId: campaign.id,
        status: ['sending', 'claimed_elsewhere'].includes(result.status) ? 'processing' : result.status,
        targeted: result.targeted || 0,
        sent: result.sent || 0,
        failed: result.failed || 0,
        skipped: result.skipped || 0,
        remaining: result.remaining === true || result.status === 'sending',
      }
      if (result.status === 'failed') {
        return json({ ...response, error: 'Immediate delivery could not be completed for all eligible subscribers.' }, 502)
      }
      return json(response)
    }
    if (parts[0] === 'admin' && parts[1] === 'push' && parts[2] === 'campaigns' && parts[3] && method === 'PUT') {
      const admin = requireAuth(request)
      if (!admin) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      try {
        const content = cleanCampaignInput(body)
        const sendMode = body.send_mode || body.schedule?.type || 'once'
        const schedule = normalizePushSchedule(sendMode, body.schedule)
        const nextRun = schedule.type === 'once' ? schedule.scheduled_at : getNextPushOccurrence(schedule, new Date(Date.now() - 1))
        if (!nextRun) return json({ error: 'This schedule has no upcoming delivery.' }, 400)
        const result = await database.collection('notification_campaigns').updateOne(
          { id: parts[3], status: { $in: ['scheduled', 'active', 'paused'] } },
          { $set: { ...content, schedule, next_run_at: nextRun, status: schedule.type === 'repeat' ? 'active' : 'scheduled', updated_at: new Date(), edited_by: String(admin.email || admin.sub || 'admin').slice(0, 160) }, $unset: { current_run_key: '', run_cursor: '', claim_expires_at: '', paused_from_status: '' } },
        )
        if (!result.matchedCount) return json({ error: 'Campaign not found or is already sending/completed.' }, 404)
        return json({ ok: true })
      } catch (error) {
        return json({ error: error.message || 'Unable to edit notification.' }, 400)
      }
    }
    if (parts[0] === 'admin' && parts[1] === 'push' && parts[2] === 'campaigns' && parts[3] && parts[4] === 'action' && method === 'POST') {
      if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401)
      const body = await request.json().catch(() => ({}))
      const campaigns = database.collection('notification_campaigns')
      const campaign = await campaigns.findOne({ id: parts[3] })
      if (!campaign) return json({ error: 'Campaign not found.' }, 404)
      const now = new Date()
      if (body.action === 'pause' && ['scheduled', 'active'].includes(campaign.status)) {
        await campaigns.updateOne({ id: campaign.id, status: campaign.status }, { $set: { status: 'paused', paused_from_status: campaign.status, updated_at: now }, $unset: { claim_expires_at: '' } })
      } else if (body.action === 'resume' && campaign.status === 'paused') {
        const status = campaign.schedule?.type === 'repeat' ? 'active' : 'scheduled'
        const nextRun = campaign.schedule?.type === 'repeat' && campaign.next_run_at <= now ? getNextPushOccurrence(campaign.schedule, now) : campaign.next_run_at
        if (!nextRun) return json({ error: 'This campaign has no remaining scheduled run.' }, 409)
        await campaigns.updateOne({ id: campaign.id, status: 'paused' }, { $set: { status, next_run_at: nextRun, updated_at: now }, $unset: { paused_from_status: '' } })
      } else if (body.action === 'cancel' && ['scheduled', 'active', 'paused'].includes(campaign.status)) {
        await campaigns.updateOne({ id: campaign.id, status: campaign.status }, { $set: { status: 'cancelled', cancelled_at: now, updated_at: now }, $unset: { next_run_at: '', claim_expires_at: '' } })
      } else return json({ error: 'That action is not available for this campaign.' }, 409)
      return json({ ok: true })
    }
    // ===== VISITOR ANALYTICS =====
    if (route === '/analytics/visit' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        const pageEvents = new Set(['page_view', 'category_view', 'product_view', 'checkout_started'])
        return await recordVisitorActivity(database, request, body, body.event_name, pageEvents)
      } catch (err) {
        console.error('Visitor analytics error:', err)
        return json({ ok: false }, 500)
      }
    }
    if (route === '/analytics/event' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}))
        return await recordVisitorActivity(database, request, body, body.event_name, CLIENT_VISITOR_EVENT_NAMES, new Set(['quick_view', 'add_to_cart', 'checkout_started', 'remove_from_cart']))
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

    if (route === '/newsletter/subscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = normalizeNewsletterEmail(body.email)
      if (body.consent !== true) return json({ error: 'Please consent to receive newsletter emails.' }, 400)
      if (!isValidNewsletterEmail(email)) return json({ error: 'Enter a valid email address.' }, 400)
      const ipKey = crypto.createHash('sha256').update(getClientIp(request)).digest('hex')
      const rate = await checkRateLimit(database, `newsletter:${ipKey}`, 5, 60)
      if (!rate.allowed) return json({ error: 'Please wait before trying another subscription.' }, 429)
      const subscribers = database.collection('newsletter_subscribers')
      await ensureNewsletterIndexes(database)
      let subscriber = await subscribers.findOne({ email_normalized: email })
      const now = new Date()
      const alreadySubscribed = subscriber?.status === 'active'
      if (subscriber && !alreadySubscribed) {
        await subscribers.updateOne({ id: subscriber.id }, { $set: { status: 'active', consented_at: now, updated_at: now, source: 'storefront' }, $unset: { unsubscribed_at: '' } })
      } else if (!subscriber) {
        subscriber = { id: uuidv4(), email_normalized: email, status: 'active', source: 'storefront', consented_at: now, created_at: now, updated_at: now }
        try { await subscribers.insertOne(subscriber) }
        catch (error) {
          if (error?.code !== 11000) throw error
          const duplicate = await subscribers.findOne({ email_normalized: email })
          if (!duplicate) throw error
          if (duplicate.status !== 'active') await subscribers.updateOne({ id: duplicate.id }, { $set: { status: 'active', consented_at: now, updated_at: now, source: 'storefront' }, $unset: { unsubscribed_at: '' } })
          subscriber = duplicate
        }
      }
      const unsubscribeToken = createNewsletterUnsubscribeToken(subscriber.id, JWT_SECRET)
      const unsubscribeUrl = `${getAppBaseUrl(request)}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      let unsubscribeEmailSent = false
      try {
        await sendEmail({
          to: email,
          subject: 'You are subscribed to The Thretha Edit',
          text: `Thank you for subscribing to The Thretha Edit. You can unsubscribe at any time: ${unsubscribeUrl}`,
          html: `<p>Thank you for subscribing to The Thretha Edit.</p><p><a href="${unsubscribeUrl}">Unsubscribe at any time</a></p>`,
          idempotencyKey: `newsletter-welcome/${subscriber.id}/${now.getTime()}`,
        })
        unsubscribeEmailSent = true
      } catch {
        // Subscription persistence succeeds independently; Admin can still unsubscribe the record.
      }
      return json({ ok: true, alreadySubscribed, unsubscribeEmailSent, message: alreadySubscribed ? 'You are already subscribed to The Thretha Edit.' : 'You are subscribed to The Thretha Edit.' }, alreadySubscribed ? 200 : 201)
    }

    if (route === '/newsletter/unsubscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const id = verifyNewsletterUnsubscribeToken(body.token, JWT_SECRET)
      if (!id) return json({ error: 'This unsubscribe link is invalid or has expired.' }, 400)
      const subscribers = database.collection('newsletter_subscribers')
      const existing = await subscribers.findOne({ id }, { projection: { status: 1 } })
      if (!existing) return json({ error: 'This subscription could not be found.' }, 404)
      if (existing.status !== 'unsubscribed') {
        await subscribers.updateOne({ id, status: 'active' }, { $set: { status: 'unsubscribed', unsubscribed_at: new Date(), updated_at: new Date() } })
      }
      return json({ ok: true, unsubscribed: true })
    }

    if (route === '/back-in-stock/subscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      if (body.consent !== true) return json({ error: 'Please consent to receive a back-in-stock email.' }, 400)
      const email = String(body.email || '').trim().toLowerCase()
      const slug = String(body.product_slug || '').trim().slice(0, 100)
      const size = String(body.size || '').trim().slice(0, 40)
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      const product = await database.collection('products').findOne({ slug, active: { $ne: false } }, { projection: { id: 1, slug: 1, stock: 1, sizes: 1 } })
      if (!product) return json({ error: 'Product not found.' }, 404)
      if (isVariantAvailable(product, size)) return json({ error: 'This item is currently available.' }, 409)
      if (size && !(product.sizes || []).some((variant) => String(variant?.size || '').toLowerCase() === size.toLowerCase())) return json({ error: 'Select a valid product size.' }, 400)
      const ipKey = crypto.createHash('sha256').update(getClientIp(request)).digest('hex')
      const emailKey = crypto.createHash('sha256').update(email).digest('hex')
      const rate = await checkRateLimit(database, `back_in_stock:${ipKey}:${emailKey}`, 5, 60)
      if (!rate.allowed) return json({ error: 'Please wait before requesting another stock alert.' }, 429)
      const saved = await saveBackInStockSubscription(database, { product, email, size, consent: body.consent })
      if (!saved.ok) return json({ error: saved.error }, saved.status)
      return json({ ok: true, message: 'We will email you when this piece is available.' }, 201)
    }

    if (route === '/back-in-stock/unsubscribe' && method === 'GET') {
      const token = new URL(request.url).searchParams.get('token') || ''
      const id = verifySignedBackInStockUnsubscribeToken(token, process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret')
      if (!id) return json({ error: 'Unsubscribe link is invalid or expired.' }, 400)
      const subscription = await database.collection('back_in_stock_subscriptions').findOne({ id }, { projection: { _id: 1 } })
      if (!subscription) return json({ error: 'This stock alert could not be found.' }, 404)
      return json({ ok: true, valid: true })
    }

    if (route === '/back-in-stock/unsubscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const id = verifySignedBackInStockUnsubscribeToken(body.token, process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret')
      if (!id) return json({ error: 'Unsubscribe link is invalid or expired.' }, 400)
      const result = await unsubscribeBackInStockSubscription(database, id)
      if (!result.found) return json({ error: 'This stock alert could not be found.' }, 404)
      return json({ ok: true, unsubscribed: true })
    }

    if (route === '/abandoned-cart/subscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = String(body.email || '').trim().toLowerCase()
      if (body.consent !== true) return json({ error: 'Please consent to receive a cart reminder.' }, 400)
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return json({ error: 'Your bag could not be saved for a reminder.' }, 400)
      const ids = [...new Set(body.items.map((item) => String(item?.product_id || '')).filter((id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].slice(0, 20)
      if (!ids.length) return json({ error: 'Cart reminders are available for product pieces only.' }, 400)
      const productList = await database.collection('products').find({ id: { $in: ids }, active: { $ne: false } }, { projection: { id: 1, slug: 1, name: 1 } }).toArray()
      const byId = new Map(productList.map((product) => [String(product.id), product]))
      const items = body.items.flatMap((item) => {
        const product = byId.get(String(item?.product_id || ''))
        if (!product) return []
        const quantity = Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)))
        return [{ id: product.id, name: product.name, path: `/product/${encodeURIComponent(product.slug)}`, size: String(item.size || '').slice(0, 40), quantity }]
      }).slice(0, 20)
      if (!items.length) return json({ error: 'Those products are no longer available.' }, 409)
      const ipKey = crypto.createHash('sha256').update(getClientIp(request)).digest('hex')
      const emailKey = crypto.createHash('sha256').update(email).digest('hex')
      const rate = await checkRateLimit(database, `abandoned_cart:${ipKey}:${emailKey}`, 3, 1440)
      if (!rate.allowed) return json({ error: 'Please wait before requesting another cart reminder.' }, 429)
      const cartKey = createCartKey(email, items)
      const collection = database.collection('abandoned_cart_reminders')
      const existing = await collection.findOne({ cart_key: cartKey })
      const now = new Date()
      if (existing?.status === 'sent' || existing?.status === 'converted') return json({ ok: true, active: false, message: 'A reminder was already sent for this bag.' })
      let reminderId = existing?.id
      if (existing) {
        await collection.updateOne({ id: existing.id, status: { $nin: ['sent', 'converted'] } }, { $set: { status: 'pending', email, email_normalized: email, items, consented_at: now, last_activity_at: now, remind_after: new Date(now.getTime() + 2 * 60 * 60 * 1000), delivery_key: crypto.randomUUID(), attempts: 0, updated_at: now }, $unset: { claimed_at: '', claim_token: '', retry_after: '', failed_at: '', last_error: '', closed_reason: '', closed_at: '' } })
      } else {
        const reminder = { id: uuidv4(), cart_key: cartKey, email, email_normalized: email, items, consented_at: now, created_at: now, last_activity_at: now, remind_after: new Date(now.getTime() + 2 * 60 * 60 * 1000), status: 'pending', attempts: 0, delivery_key: crypto.randomUUID(), created_via: 'explicit_cart_consent' }
        try { await collection.insertOne(reminder); reminderId = reminder.id } catch (error) {
          if (error?.code !== 11000) throw error
          await collection.updateOne({ cart_key: cartKey, status: { $nin: ['sent', 'converted'] } }, { $set: { status: 'pending', consented_at: now, last_activity_at: now, remind_after: new Date(now.getTime() + 2 * 60 * 60 * 1000), delivery_key: crypto.randomUUID(), attempts: 0 }, $unset: { retry_after: '', failed_at: '', last_error: '', closed_reason: '', closed_at: '' } })
          reminderId = (await collection.findOne({ cart_key: cartKey, status: 'pending' }, { projection: { id: 1 } }))?.id
        }
      }
      if (!reminderId) return json({ error: 'This bag could not be saved for a reminder.' }, 409)
      return json({ ok: true, active: true, unsubscribeToken: createCartUnsubscribeToken(reminderId, process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret'), message: 'We will send one reminder if this bag is still waiting in two hours.' }, 201)
    }

    if (route === '/abandoned-cart/unsubscribe' && method === 'GET') {
      const token = new URL(request.url).searchParams.get('token') || ''
      const id = verifyCartUnsubscribeToken(token, process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret')
      if (!id) return json({ error: 'Unsubscribe link is invalid or expired.' }, 400)
      const result = await database.collection('abandoned_cart_reminders').updateOne({ id, status: { $ne: 'unsubscribed' } }, { $set: { status: 'unsubscribed', unsubscribed_at: new Date(), updated_at: new Date() } })
      return json({ ok: true, unsubscribed: result.matchedCount > 0 })
    }

    if (route === '/abandoned-cart/unsubscribe' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const id = verifyCartUnsubscribeToken(body.token, process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret')
      if (!id) return json({ error: 'Reminder preference is invalid.' }, 400)
      const collection = database.collection('abandoned_cart_reminders')
      const result = await collection.updateOne({ id, status: { $ne: 'unsubscribed' } }, { $set: { status: 'unsubscribed', unsubscribed_at: new Date(), updated_at: new Date() } })
      if (!result.matchedCount && !(await collection.findOne({ id }, { projection: { id: 1 } }))) return json({ error: 'Reminder preference was not found.' }, 404)
      return json({ ok: true, unsubscribed: true })
    }

    if (route === '/abandoned-cart/recover' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const id = verifyCartRecoveryToken(body.token, process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret')
      if (!id) return json({ error: 'This cart recovery link is invalid or has expired.' }, 400)
      const items = await getCartRecoveryItems(database, id)
      if (!items) return json({ error: 'This cart can no longer be restored.' }, 404)
      if (!items.length) return json({ error: 'None of the saved pieces are currently available.' }, 409)
      return json({ items })
    }

    // Helper to format settings consistently with robust shipping fields
    const normalizeSettingsDoc = (s) => {
      const stripped = strip(s) || {}
      delete stripped.browser_notifications
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
      stripped.reviews = { enabled: s?.reviews?.enabled !== false }
      stripped.shop_by_occasion = {
        enabled: s?.shop_by_occasion?.enabled !== false,
        occasions: normalizeOccasions(s?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS),
      }
      stripped.checkout = getCheckoutAvailability(s)
      return stripped
    }

    // ===== PUBLIC SETTINGS =====
    if (route === '/settings' && method === 'GET') {
      const s = await database.collection('settings').findOne({ id: 'global' })
      return json(normalizeSettingsDoc(s), 200, { 'Cache-Control': 'no-store, max-age=0' })
    }

    if (route === '/occasions' && method === 'GET') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { shop_by_occasion: 1 } })
      if (settings?.shop_by_occasion?.enabled === false) return json({ enabled: false, occasions: [] })
      return json({ enabled: true, occasions: normalizeOccasions(settings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS).filter((occasion) => occasion.active) })
    }

    // ===== PUBLIC INSTAGRAM FEED =====
    if (route === '/instagram/feed' && method === 'GET') {
      const feed = await getStorefrontInstagramFeed(database)
      return json(feed)
    }

    // ===== PRODUCT REVIEWS =====
    if (route === '/reviews/eligible' && method === 'GET') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { reviews: 1 } })
      if (settings?.reviews?.enabled === false) return json({ error: 'Product reviews are currently disabled.', code: 'REVIEWS_DISABLED' }, 403)
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Sign in to check review eligibility.' }, 401)
      const slug = String(new URL(request.url).searchParams.get('product') || '').trim().slice(0, 100)
      const product = await database.collection('products').findOne({ slug, active: { $ne: false } }, { projection: { id: 1 } })
      if (!product) return json({ error: 'Product not found.' }, 404)
      const orders = await database.collection('orders').find({
        $and: [reviewOrderOwnerFilter(customer), { $or: [{ payment_status: 'PAID' }, { status: 'DELIVERED' }] }, { 'items.product_id': product.id }],
      }, { projection: { _id: 0, id: 1, order_number: 1 } }).sort({ created_at: -1 }).limit(30).toArray()
      const reviewed = await database.collection('product_reviews').find({ user_id: customer.id, product_id: product.id }, { projection: { order_id: 1 } }).toArray()
      const reviewedIds = new Set(reviewed.map((review) => review.order_id))
      return json({ orders: orders.filter((order) => !reviewedIds.has(order.id)).map((order) => ({ id: order.id, order_number: order.order_number || order.id })) })
    }
    if (route === '/reviews/mine' && method === 'GET') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { reviews: 1 } })
      if (settings?.reviews?.enabled === false) return json({ error: 'Product reviews are currently disabled.', code: 'REVIEWS_DISABLED' }, 403)
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Sign in to manage your reviews.' }, 401)
      const slug = String(new URL(request.url).searchParams.get('product') || '').trim().slice(0, 100)
      const product = await database.collection('products').findOne({ slug }, { projection: { id: 1 } })
      if (!product) return json({ error: 'Product not found.' }, 404)
      const review = await database.collection('product_reviews').findOne({ user_id: customer.id, product_id: product.id }, { projection: { _id: 0 } })
      return json({ review: review || null })
    }
    if (route === '/reviews' && method === 'GET') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { reviews: 1 } })
      if (settings?.reviews?.enabled === false) return json({ enabled: false, count: 0, average: 0, distribution: [], reviews: [] })
      const slug = String(new URL(request.url).searchParams.get('product') || '').trim().slice(0, 100)
      if (!slug) return json({ error: 'Product is required.' }, 400)
      const product = await database.collection('products').findOne({ slug, active: { $ne: false } }, { projection: { id: 1, slug: 1 } })
      if (!product) return json({ error: 'Product not found.' }, 404)
      const [reviews, reviewStats, count] = await Promise.all([
        database.collection('product_reviews').find(
        { product_id: product.id, status: 'approved' },
        { projection: { _id: 0, id: 1, rating: 1, text: 1, photo_url: 1, verified_purchase: 1, customer_name: 1, created_at: 1 } }
        ).sort({ created_at: -1 }).limit(50).toArray(),
        database.collection('product_reviews').aggregate([
          { $match: { product_id: product.id, status: 'approved' } },
          { $group: { _id: '$rating', count: { $sum: 1 } } },
        ]).toArray(),
        database.collection('product_reviews').countDocuments({ product_id: product.id, status: 'approved' }),
      ])
      const ratingCount = new Map(reviewStats.map((row) => [Number(row._id), row.count]))
      const ratingTotal = reviewStats.reduce((sum, row) => sum + Number(row._id) * row.count, 0)
      const average = count ? Math.round((ratingTotal / count) * 10) / 10 : 0
      const distribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: ratingCount.get(rating) || 0 }))
      return json({ enabled: true, count, average, distribution, reviews })
    }

    if (route === '/reviews' && method === 'POST') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { reviews: 1 } })
      if (settings?.reviews?.enabled === false) return json({ error: 'Product reviews are currently disabled.', code: 'REVIEWS_DISABLED' }, 403)
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Sign in to submit a product review.' }, 401)
      const body = await request.json().catch(() => ({}))
      const productSlug = String(body.product_slug || '').trim().slice(0, 100)
      const orderRef = String(body.order_number || '').trim().slice(0, 80)
      const rating = Number(body.rating)
      const text = normalizeReviewText(body.text)
      if (!productSlug || !orderRef || !Number.isInteger(rating) || rating < 1 || rating > 5 || text.length < 8) {
        return json({ error: 'Choose a rating, enter at least 8 characters, and select an eligible order.' }, 400)
      }
      if (body.photo_url && !isCloudinaryImageUrl(body.photo_url, customer.id)) return json({ error: 'Review photos must be uploaded to your secure review image folder.' }, 400)
      const reviewLimit = await checkRateLimit(database, `product_review:${customer.id}`, 5, 1440)
      if (!reviewLimit.allowed) return json({ error: 'You have reached the daily review submission limit.' }, 429)
      const product = await database.collection('products').findOne({ slug: productSlug, active: { $ne: false } }, { projection: { id: 1, slug: 1, name: 1 } })
      if (!product) return json({ error: 'Product not found.' }, 404)
      const order = await database.collection('orders').findOne({
        $and: [
          { $or: [{ id: orderRef }, { order_number: orderRef }] },
          reviewOrderOwnerFilter(customer),
          { $or: [{ payment_status: 'PAID' }, { status: 'DELIVERED' }] },
          { 'items.product_id': product.id },
        ],
      }, { projection: { id: 1, order_number: 1, items: 1 } })
      if (!order) return json({ error: 'A completed purchase of this product in your account is required.' }, 403)
      const item = (order.items || []).find((entry) => String(entry.product_id) === String(product.id))
      const doc = {
        id: uuidv4(), product_id: product.id, product_slug: product.slug, product_name: product.name,
        user_id: customer.id, order_id: order.id, order_number: order.order_number || order.id,
        customer_name: customer.name || 'Thretha customer', rating, text,
        photo_url: body.photo_url || null, verified_purchase: true, status: 'pending',
        variant: { size: item?.size || null, colour: item?.colour || null },
        created_at: new Date(), updated_at: new Date(),
      }
      try {
        await database.collection('product_reviews').insertOne(doc)
      } catch (error) {
        if (error?.code === 11000) return json({ error: 'You have already reviewed this product for this order.' }, 409)
        throw error
      }
      return json({ ok: true, review: { id: doc.id, status: 'pending' }, status: 'pending', message: 'Thank you. Your review will appear after moderation.' }, 201)
    }

    if (route === '/reviews/photo/signature' && method === 'POST') {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { reviews: 1 } })
      if (settings?.reviews?.enabled === false) return json({ error: 'Product reviews are currently disabled.', code: 'REVIEWS_DISABLED' }, 403)
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Sign in to upload a review photo.' }, 401)
      if (!cloudinaryEnabled()) return json({ error: 'Review photo uploads are unavailable.' }, 503)
      const body = await request.json().catch(() => ({}))
      const productSlug = String(body.product_slug || '').trim().slice(0, 100)
      const orderRef = String(body.order_number || '').trim().slice(0, 80)
      const product = await database.collection('products').findOne({ slug: productSlug, active: { $ne: false } }, { projection: { id: 1 } })
      const eligible = product && await database.collection('orders').findOne({
        $and: [
          { $or: [{ id: orderRef }, { order_number: orderRef }] }, reviewOrderOwnerFilter(customer),
          { $or: [{ payment_status: 'PAID' }, { status: 'DELIVERED' }] }, { 'items.product_id': product.id },
        ],
      }, { projection: { _id: 1 } })
      if (!eligible) return json({ error: 'A completed purchase of this product in your account is required.' }, 403)
      const folder = `thretha/reviews/${String(customer.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, process.env.CLOUDINARY_API_SECRET)
      return json({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, timestamp, folder, resource_type: 'image', signature })
    }

    if (parts[0] === 'reviews' && parts[1] && (method === 'PATCH' || method === 'DELETE')) {
      const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { reviews: 1 } })
      if (settings?.reviews?.enabled === false) return json({ error: 'Product reviews are currently disabled.', code: 'REVIEWS_DISABLED' }, 403)
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ error: 'Sign in to manage your review.' }, 401)
      const collection = database.collection('product_reviews')
      const filter = { id: parts[1], user_id: customer.id }
      const existing = await collection.findOne(filter)
      if (!existing) return json({ error: 'Review not found.' }, 404)
      if (method === 'DELETE') {
        await collection.deleteOne(filter)
        return json({ ok: true })
      }
      const body = await request.json().catch(() => ({}))
      const rating = Number(body.rating)
      const text = normalizeReviewText(body.text)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || text.length < 8) return json({ error: 'Choose a rating and enter at least 8 characters.' }, 400)
      if (body.photo_url && !isCloudinaryImageUrl(body.photo_url, customer.id)) return json({ error: 'Review photos must be uploaded to your secure review image folder.' }, 400)
      await collection.updateOne(filter, { $set: { rating, text, photo_url: body.photo_url || null, status: 'pending', updated_at: new Date() } })
      return json({ ok: true, status: 'pending' })
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
      if (q.get('slugs')) {
        const slugs = [...new Set(q.get('slugs').split(',').map((value) => value.trim()).filter((value) => /^[a-z0-9-]{1,100}$/i.test(value)))].slice(0, 12)
        if (!slugs.length) return json([])
        filter.slug = { $in: slugs }
      }
      if (q.get('occasion')) {
        const occasionSettings = await database.collection('settings').findOne({ id: 'global' }, { projection: { shop_by_occasion: 1 } })
        if (occasionSettings?.shop_by_occasion?.enabled === false) return json([])
        const occasion = normalizeOccasions(occasionSettings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS)
          .find((item) => item.active && item.slug === q.get('occasion'))
        if (!occasion) return json([])
        filter.occasion_slugs = occasion.slug
      }
      if (q.get('category')) {
        const cat = await database.collection('categories').findOne({ slug: q.get('category') })
        if (cat) filter.category_id = cat.id
        else return json([])
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
      if (!priceRange.valid) return json({ error: priceRange.error }, 400)
      let list = await database.collection('products').find(filter).toArray()
      list = filterProductsByPriceAndAvailability(list, {
        priceRange,
        availability: q.get('availability'),
        size: q.get('size') || '',
      })
      const sort = q.get('sort')
      if (sort === 'price_asc') list.sort((a, b) => getProductEffectivePrice(a) - getProductEffectivePrice(b))
      else if (sort === 'price_desc') list.sort((a, b) => getProductEffectivePrice(b) - getProductEffectivePrice(a))
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
    if (route === '/orders/track' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const orderNumber = String(body.order_number || '').trim()
      const contact = String(body.contact || '').trim()

      if (!orderNumber || orderNumber.length > 100) {
        return json({ error: 'Order reference number is required' }, 400)
      }

      if (!contact || contact.length > 254) return json({ error: 'Enter the phone number or email used during order placement.' }, 400)
      const ipKey = crypto.createHash('sha256').update(getClientIp(request)).digest('hex')
      const rate = await checkRateLimit(database, `guest_order_track:${ipKey}`, 8, 15)
      if (!rate.allowed) return json({ error: 'Too many tracking attempts. Please try again later.' }, 429)
      const order = await database.collection('orders').findOne({
        $or: [{ order_number: orderNumber }, { order_number: orderNumber.toUpperCase() }],
      })
      if (!order || !guestContactMatches(order, contact)) return json({ error: 'The order reference and contact details could not be verified.' }, 403)

      return json({
        order_number: order.order_number,
        status: order.status || 'NEW',
        payment_status: order.payment_status || 'PENDING',
        payment_method: order.payment_method || 'WHATSAPP_CONCIERGE',
        created_at: order.created_at,
        updated_at: order.updated_at,
        items: (order.items || []).map((item) => ({ product_name: item.product_name, sku: item.sku || null, size: item.size || null, colour: item.colour || null, quantity: item.quantity, price: item.price })),
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

    // ===== GUEST ORDER CONTACT VERIFICATION =====
    if (parts[0] === 'orders' && parts.length === 3 && parts[2] === 'verify' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const ref = String(parts[1] || '').trim()
      const contact = String(body.contact || '').trim()
      if (!ref || ref.length > 100 || !contact || contact.length > 254) return json({ error: 'A valid order reference and contact are required.' }, 400)
      const ipKey = crypto.createHash('sha256').update(getClientIp(request)).digest('hex')
      const rate = await checkRateLimit(database, `guest_order_verify:${ipKey}`, 8, 15)
      if (!rate.allowed) return json({ error: 'Too many verification attempts. Please try again later.' }, 429)
      const order = await database.collection('orders').findOne(orderReferenceFilter(ref))
      if (!order || !guestContactMatches(order, contact)) return json({ error: 'The order reference and contact details could not be verified.' }, 403)
      return json({ order: publicOrderReceipt(order) })
    }

    // ===== GET SINGLE ORDER (confirmation/receipt) =====
    if (parts[0] === 'orders' && parts.length === 2 && method === 'GET') {
      const ref = parts[1]
      const customer = await getCustomerFromRequest(request, database)
      if (!customer) return json({ requires_contact_verification: true })
      if (!ref || ref.length > 100) return json({ error: 'Order not found' }, 404)
      const order = await database.collection('orders').findOne(orderReferenceFilter(ref))
      if (!order || order.userId !== customer.id) return json({ error: 'Order not found' }, 404)
      return json(publicOrderReceipt(order))
    }

    // ===== CASHFREE PAYMENT INTEGRATION =====
    // 1. Create Cashfree Order
    if ((route === '/payments/cashfree/create-order' || route === '/checkout/create-cashfree-order') && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { items = [], customer: incomingCustomer = {}, coupon_code } = body

      if (!items.length) {
        return json({ error: 'Shopping bag is empty' }, 400)
      }

      const checkoutSettings = await database.collection('settings').findOne({ id: 'global' }, { projection: { checkout: 1 } })
      const checkoutAvailability = getCheckoutAvailability(checkoutSettings)
      if (!checkoutAvailability.pay_online_enabled) {
        return json({ error: 'Pay Online is currently unavailable. Please choose another checkout method.', code: 'CHECKOUT_METHOD_DISABLED', checkout: checkoutAvailability }, 409)
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

      const checkoutSettings = await database.collection('settings').findOne({ id: 'global' }, { projection: { checkout: 1 } })
      const checkoutAvailability = getCheckoutAvailability(checkoutSettings)
      const requestsOnlinePayment = payment_method === 'CASHFREE' || payment_method === 'RAZORPAY'
      const requestsWhatsAppOrder = payment_method === 'WHATSAPP_CONCIERGE'
      if (!requestsOnlinePayment && !requestsWhatsAppOrder) {
        return json({ error: 'Choose a supported checkout method.' }, 400)
      }
      if ((requestsOnlinePayment && !checkoutAvailability.pay_online_enabled)
        || (requestsWhatsAppOrder && !checkoutAvailability.whatsapp_order_enabled)) {
        return json({
          error: requestsOnlinePayment
            ? 'Pay Online is currently unavailable. Please choose another checkout method.'
            : 'WhatsApp ordering is currently unavailable. Please choose another checkout method.',
          code: 'CHECKOUT_METHOD_DISABLED',
          checkout: checkoutAvailability,
        }, 409)
      }

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

      if (route === '/admin/newsletter-subscribers' && method === 'GET') {
        const url = new URL(request.url)
        const status = url.searchParams.get('status') || 'all'
        if (!['all', 'active', 'unsubscribed'].includes(status)) return json({ error: 'Invalid subscriber status filter.' }, 400)
        const search = String(url.searchParams.get('q') || '').trim().slice(0, 120)
        const filter = { ...(status === 'all' ? {} : { status }), ...(search ? { email_normalized: { $regex: escapeRegex(search), $options: 'i' } } : {}) }
        const subscribers = database.collection('newsletter_subscribers')
        if (url.searchParams.get('export') === 'csv') {
          const active = await subscribers.find({ status: 'active', ...(search ? { email_normalized: { $regex: escapeRegex(search), $options: 'i' } } : {}) }, { projection: { _id: 0, email_normalized: 1, consented_at: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray()
          const quote = (value) => `"${String(value ?? '').replace(/[\r\n]/g, ' ').replace(/"/g, '""')}"`
          const protectCsv = (value) => /^[=+@\-\t\r]/.test(String(value || '')) ? `'${value}` : value
          const rows = [['email', 'consented_at', 'created_at'], ...active.map((item) => [protectCsv(item.email_normalized), item.consented_at?.toISOString?.() || '', item.created_at?.toISOString?.() || ''])]
          return cors(new Response(rows.map((row) => row.map(quote).join(',')).join('\r\n'), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="thretha-newsletter-subscribers.csv"', 'Cache-Control': 'no-store' } }))
        }
        const rawPage = Number(url.searchParams.get('page') || 1)
        const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1
        const limit = 50
        const [items, total, activeCount, unsubscribedCount] = await Promise.all([
          subscribers.find(filter, { projection: { _id: 0, id: 1, email_normalized: 1, status: 1, source: 1, consented_at: 1, unsubscribed_at: 1, created_at: 1, updated_at: 1 } }).sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
          subscribers.countDocuments(filter),
          subscribers.countDocuments({ status: 'active' }),
          subscribers.countDocuments({ status: 'unsubscribed' }),
        ])
        return json({ subscribers: items, total, activeCount, unsubscribedCount, page, pages: Math.max(1, Math.ceil(total / limit)) })
      }
      if (parts[0] === 'admin' && parts[1] === 'newsletter-subscribers' && parts[2] && method === 'PATCH') {
        const body = await request.json().catch(() => ({}))
        if (body.action !== 'unsubscribe') return json({ error: 'Unsupported subscriber action.' }, 400)
        const now = new Date()
        const result = await database.collection('newsletter_subscribers').updateOne(
          { id: parts[2], status: { $ne: 'unsubscribed' } },
          { $set: { status: 'unsubscribed', unsubscribed_at: now, updated_at: now } },
        )
        const existing = result.matchedCount ? null : await database.collection('newsletter_subscribers').findOne({ id: parts[2] }, { projection: { status: 1 } })
        if (!result.matchedCount && !existing) return json({ error: 'Subscriber not found.' }, 404)
        return json({ ok: true, status: 'unsubscribed' })
      }

      // Newsletter campaigns use the existing Admin token and the protected cron worker.
      if (route === '/admin/newsletter-campaigns/audience' && method === 'GET') {
        return json({ audience: 'active', recipient_count: await countNewsletterAudience(database) })
      }
      if (route === '/admin/newsletter-campaigns/preview' && method === 'POST') {
        const body = await request.json().catch(() => null)
        const baseUrl = getAppBaseUrl(request)
        const validated = validateNewsletterDraft(body, baseUrl)
        if (validated.error) return json({ error: validated.error }, 400)
        const html = renderNewsletterEmail(validated.value, {
          baseUrl,
          unsubscribeUrl: `${baseUrl}/newsletter/unsubscribe?token=preview`,
        })
        return json({ html })
      }
      if (route === '/admin/newsletter-campaigns' && method === 'GET') {
        const campaigns = await database.collection('newsletter_campaigns').find({}, {
          projection: { _id: 0, id: 1, subject: 1, status: 1, recipient_count: 1, sent_count: 1, failed_count: 1, unknown_count: 1, skipped_count: 1, created_at: 1, completed_at: 1 },
        }).sort({ created_at: -1 }).limit(50).toArray()
        return json({ campaigns })
      }
      if (route === '/admin/newsletter-campaigns' && method === 'POST') {
        const body = await request.json().catch(() => null)
        const validated = validateNewsletterDraft(body, getAppBaseUrl(request))
        if (validated.error) return json({ error: validated.error }, 400)
        await ensureNewsletterCampaignIndexes(database)
        const now = new Date()
        const campaign = {
          id: uuidv4(), ...validated.value, status: 'DRAFT', recipient_count: 0, sent_count: 0,
          failed_count: 0, unknown_count: 0, skipped_count: 0, retry_generation: 0,
          created_at: now, updated_at: now, created_by: String(auth.id || auth.email || 'admin').slice(0, 160),
        }
        await database.collection('newsletter_campaigns').insertOne(campaign)
        return json({ campaign: adminNewsletterCampaign(campaign) }, 201)
      }
      if (parts[0] === 'admin' && parts[1] === 'newsletter-campaigns' && parts.length >= 3) {
        const campaignId = String(parts[2] || '')
        if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return json({ error: 'Campaign not found.' }, 404)
        const campaigns = database.collection('newsletter_campaigns')
        if (parts.length === 3 && method === 'GET') {
          const campaign = await campaigns.findOne({ id: campaignId })
          if (!campaign) return json({ error: 'Campaign not found.' }, 404)
          const failures = await database.collection('newsletter_deliveries').find({ campaign_id: campaignId, status: { $in: ['FAILED', 'UNKNOWN'] } }, {
            projection: { _id: 0, status: 1, failure_reason: 1, completed_at: 1 },
          }).sort({ completed_at: -1 }).limit(20).toArray()
          return json({ campaign: adminNewsletterCampaign(campaign), failures })
        }
        if (parts.length === 3 && method === 'PATCH') {
          const body = await request.json().catch(() => null)
          const validated = validateNewsletterDraft(body, getAppBaseUrl(request))
          if (validated.error) return json({ error: validated.error }, 400)
          const changed = await campaigns.updateOne({ id: campaignId, status: 'DRAFT' }, { $set: { ...validated.value, updated_at: new Date() } })
          if (!changed.matchedCount) return json({ error: 'Only existing drafts can be edited.' }, 409)
          const campaign = await campaigns.findOne({ id: campaignId })
          return json({ campaign: adminNewsletterCampaign(campaign) })
        }
        if (parts.length === 4 && method === 'POST') {
          const body = await request.json().catch(() => ({}))
          if (!body || Array.isArray(body) || Object.keys(body).length) return json({ error: 'Unsupported campaign action data.' }, 400)
          const action = parts[3]
          const campaign = await campaigns.findOne({ id: campaignId })
          if (!campaign) return json({ error: 'Campaign not found.' }, 404)
          if (action === 'send') {
            if (campaign.status !== 'DRAFT') return json({ error: 'Only drafts can be queued.' }, 409)
            if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return json({ error: 'Newsletter email is not configured.' }, 503)
            const queuedAt = new Date()
            const recipientCount = await countNewsletterAudience(database, queuedAt)
            if (!recipientCount) return json({ error: 'No active subscribers available.' }, 409)
            const changed = await campaigns.updateOne({ id: campaignId, status: 'DRAFT' }, {
              $set: { status: 'QUEUED', queued_at: queuedAt, recipient_count: recipientCount, cursor_email: '', retry_only: false, updated_at: queuedAt },
            })
            if (!changed.matchedCount) return json({ error: 'Campaign has already been queued.' }, 409)
          } else if (action === 'retry-failed') {
            if (!['PARTIAL', 'FAILED'].includes(campaign.status) || !(campaign.failed_count > 0)) return json({ error: 'There are no failed deliveries to retry.' }, 409)
            const changed = await campaigns.updateOne({ id: campaignId, status: campaign.status }, {
              $set: { status: 'QUEUED', retry_only: true, updated_at: new Date() },
              $inc: { retry_generation: 1 },
              $unset: { completed_at: '' },
            })
            if (!changed.matchedCount) return json({ error: 'Campaign status changed. Refresh and retry.' }, 409)
          } else if (action === 'cancel') {
            const changed = await campaigns.updateOne({ id: campaignId, status: { $in: ['QUEUED', 'SENDING'] } }, {
              $set: { status: 'CANCELLED', completed_at: new Date(), updated_at: new Date() },
              $unset: { claim_token: '', claim_expires_at: '' },
            })
            if (!changed.matchedCount) return json({ error: 'Only queued or sending campaigns can be cancelled.' }, 409)
          } else return json({ error: 'Unsupported campaign action.' }, 400)
          return json({ campaign: adminNewsletterCampaign(await campaigns.findOne({ id: campaignId })) })
        }
      }

      if (route === '/admin/reviews' && method === 'GET') {
        const status = String(new URL(request.url).searchParams.get('status') || 'all')
        const filter = status === 'all' ? {} : { status }
        const reviews = await database.collection('product_reviews').find(filter).sort({ created_at: -1 }).limit(200).toArray()
        return json(reviews.map(strip))
      }
      if (parts[0] === 'admin' && parts[1] === 'reviews' && parts[2] && method === 'PATCH') {
        const body = await request.json().catch(() => ({}))
        const update = { updated_at: new Date() }
        if (body.status !== undefined) {
          if (!['pending', 'approved', 'rejected', 'hidden'].includes(body.status)) return json({ error: 'Invalid review status.' }, 400)
          update.status = body.status
        }
        if (body.remove_photo === true) update.photo_url = null
        if (Object.keys(update).length === 1) return json({ error: 'No moderation changes provided.' }, 400)
        const result = await database.collection('product_reviews').updateOne({ id: parts[2] }, { $set: update })
        if (!result.matchedCount) return json({ error: 'Review not found.' }, 404)
        return json({ ok: true })
      }
      if (parts[0] === 'admin' && parts[1] === 'reviews' && parts[2] && method === 'DELETE') {
        const result = await database.collection('product_reviews').updateOne(
          { id: parts[2] }, { $set: { status: 'hidden', removed_at: new Date(), updated_at: new Date() } }
        )
        if (!result.matchedCount) return json({ error: 'Review not found.' }, 404)
        return json({ ok: true })
      }

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

      if (route === '/admin/product-performance' && method === 'GET') {
        const rawDays = Number(new URL(request.url).searchParams.get('days') || 30)
        const days = Number.isInteger(rawDays) ? Math.max(1, Math.min(90, rawDays)) : 30
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        const [products, events, purchases] = await Promise.all([
          database.collection('products').find({ active: { $ne: false } }, { projection: { _id: 0, id: 1, slug: 1, name: 1 } }).sort({ name: 1 }).toArray(),
          database.collection('visitor_events').aggregate([
            { $match: { created_at: { $gte: since }, event_name: { $in: ['product_view', 'add_to_cart', 'checkout_started'] }, product_slug: { $type: 'string' } } },
            { $group: { _id: { slug: '$product_slug', event: '$event_name' }, count: { $sum: 1 } } },
          ]).toArray(),
          database.collection('orders').aggregate([
            { $match: { created_at: { $gte: since }, $or: [{ payment_status: 'PAID' }, { status: 'DELIVERED' }] } },
            { $unwind: '$items' },
            { $group: { _id: '$items.product_id', orders: { $addToSet: '$id' }, units: { $sum: { $ifNull: ['$items.quantity', 1] } } } },
          ]).toArray(),
        ])
        const eventMap = new Map(events.map((event) => [`${event._id.slug}:${event._id.event}`, event.count]))
        const purchaseMap = new Map(purchases.map((row) => [String(row._id), { orders: row.orders.filter(Boolean).length, units: row.units }]))
        return json({ days, products: products.map((product) => {
          const views = eventMap.get(`${product.slug}:product_view`) || 0
          const carts = eventMap.get(`${product.slug}:add_to_cart`) || 0
          const checkouts = eventMap.get(`${product.slug}:checkout_started`) || 0
          const purchase = purchaseMap.get(String(product.id)) || { orders: 0, units: 0 }
          return { ...product, views, add_to_bag: carts, checkout_started: checkouts, orders: purchase.orders, conversion: views ? Math.round(purchase.orders / views * 10000) / 100 : 0 }
        }) })
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
          occasion_slugs: Array.isArray(b.occasion_slugs) ? [...new Set(b.occasion_slugs.filter((slug) => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))].slice(0, 30) : [],
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
          if (b.occasion_slugs !== undefined) {
            if (!Array.isArray(b.occasion_slugs) || b.occasion_slugs.some((slug) => typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
              return json({ error: 'Product occasions are invalid.' }, 400)
            }
            update.occasion_slugs = [...new Set(b.occasion_slugs)].slice(0, 30)
          }
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

      // ---- Homepage section order (update only this setting; never overwrite other settings) ----
      if (route === '/admin/home-layout' && method === 'GET') {
        const settings = await database.collection('settings').findOne({ id: 'global' }, { projection: { 'homepage_content.section_order': 1, 'homepage_content.section_visibility': 1 } })
        return json({
          section_order: normalizeHomeSectionOrder(settings?.homepage_content?.section_order),
          section_visibility: normalizeHomeSectionVisibility(settings?.homepage_content?.section_visibility),
        })
      }
      if (route === '/admin/home-layout' && method === 'PUT') {
        const body = await request.json().catch(() => null)
        if (!isValidHomeSectionOrderInput(body?.section_order)) {
          return json({ error: 'Homepage section order must be a list of section IDs.' }, 400)
        }
        if (body.section_visibility !== undefined && !isValidHomeSectionVisibilityInput(body.section_visibility)) {
          return json({ error: 'Homepage section visibility must contain boolean values.' }, 400)
        }
        const sectionOrder = normalizeHomeSectionOrder(body.section_order)
        const existing = body.section_visibility === undefined
          ? await database.collection('settings').findOne({ id: 'global' }, { projection: { 'homepage_content.section_visibility': 1 } })
          : null
        const sectionVisibility = normalizeHomeSectionVisibility(body.section_visibility ?? existing?.homepage_content?.section_visibility)
        await database.collection('settings').updateOne({ id: 'global' }, { $set: { 'homepage_content.section_order': sectionOrder, 'homepage_content.section_visibility': sectionVisibility, updated_at: new Date() } }, { upsert: true })
        revalidatePath('/', 'page')
        return json({ section_order: sectionOrder, section_visibility: sectionVisibility })
      }

      // ---- Admin settings ----
      if (route === '/admin/settings' && method === 'GET') {
        const s = await database.collection('settings').findOne({ id: 'global' })
        return json(normalizeSettingsDoc(s))
      }
      if (route === '/admin/settings' && method === 'PUT') {
        const b = await request.json()
        let checkoutUpdate

        if (b.checkout !== undefined) {
          if (!b.checkout || typeof b.checkout !== 'object' || Array.isArray(b.checkout)) {
            return json({ error: 'Checkout payment settings must be an object.' }, 400)
          }
          for (const key of ['pay_online_enabled', 'whatsapp_order_enabled']) {
            if (b.checkout[key] !== undefined && typeof b.checkout[key] !== 'boolean') {
              return json({ error: 'Checkout payment settings must be enabled or disabled.' }, 400)
            }
          }
          const currentSettings = await database.collection('settings').findOne({ id: 'global' }, { projection: { checkout: 1 } })
          const currentMethods = getCheckoutAvailability(currentSettings)
          checkoutUpdate = {
            pay_online_enabled: b.checkout.pay_online_enabled ?? currentMethods.pay_online_enabled,
            whatsapp_order_enabled: b.checkout.whatsapp_order_enabled ?? currentMethods.whatsapp_order_enabled,
          }
          if (!checkoutUpdate.pay_online_enabled && !checkoutUpdate.whatsapp_order_enabled) {
            return json({ error: 'At least one checkout method must remain enabled.' }, 400)
          }
        }

        if (b.pwa?.install_prompt_enabled !== undefined && typeof b.pwa.install_prompt_enabled !== 'boolean') {
          return json({ error: 'PWA install prompt setting must be enabled or disabled.' }, 400)
        }
        for (const [key, label] of [['reviews', 'Reviews'], ['shop_by_occasion', 'Shop by Occasion']]) {
          if (b[key] !== undefined && (!b[key] || typeof b[key] !== 'object' || Array.isArray(b[key]))) {
            return json({ error: `${label} settings must be an object.` }, 400)
          }
          if (b[key]?.enabled !== undefined && typeof b[key].enabled !== 'boolean') {
            return json({ error: `${label} must be enabled or disabled.` }, 400)
          }
        }
        if (b.shop_by_occasion?.occasions !== undefined) {
          if (!Array.isArray(b.shop_by_occasion.occasions)) return json({ error: 'Occasions must be a list.' }, 400)
          const normalizedOccasions = normalizeOccasions(b.shop_by_occasion.occasions)
          if (normalizedOccasions.length !== b.shop_by_occasion.occasions.length) return json({ error: 'Each occasion needs a unique, valid name and URL key.' }, 400)
          b.shop_by_occasion.occasions = normalizedOccasions
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
        if (checkoutUpdate) update.checkout = checkoutUpdate
        if (b.homepage_content && typeof b.homepage_content === 'object' && !Array.isArray(b.homepage_content)) {
          delete update.homepage_content
          for (const [key, value] of Object.entries(b.homepage_content)) {
            if (Object.hasOwn(DEFAULT_HOMEPAGE_CONTENT, key)) update[`homepage_content.${key}`] = value
          }
        }
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
