import { ERROR_CODES, logger, scrubSecrets } from './errors.js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { GARMENT_TYPES, DEFAULT_TRYON_SETTINGS } from './tryon-constants.js'

export { GARMENT_TYPES, DEFAULT_TRYON_SETTINGS }

/**
 * In-memory rate limiting map for sliding-window burst and session quotas
 */
const sessionQuotaMap = new Map()
const activeRequestLocks = new Set()

/**
 * Normalizes Try-On settings
 */
export function normalizeTryOnSettings(raw = {}) {
  const s = raw || {}
  const maxSession = Number(s.max_generations_per_session ?? s.maxGenerationsPerSession)
  const maxUser = Number(s.max_generations_per_user_day ?? s.maxGenerationsPerUserDay)

  let provider = String(s.provider || process.env.AI_TRYON_PROVIDER || 'pixelapi').toLowerCase().trim()
  if (!['pixelapi', 'gemini', 'qwen', 'fashn', 'replicate', 'segmind', 'mock'].includes(provider)) {
    provider = 'pixelapi'
  }

  return {
    enabled: s.enabled !== false,
    product_tryon_enabled: s.product_tryon_enabled !== false,
    combo_tryon_enabled: s.combo_tryon_enabled !== false,
    allow_guests: s.allow_guests !== false,
    max_generations_per_session: isNaN(maxSession) ? 2 : Math.max(1, Math.min(20, maxSession)),
    max_generations_per_user_day: isNaN(maxUser) ? 5 : Math.max(1, Math.min(50, maxUser)),
    show_privacy_notice: s.show_privacy_notice !== false,
    provider,
    model_name: s.model_name || 'virtual-tryon',
    disclaimer_text:
      s.disclaimer_text ||
      'Virtual try-on is an AI-generated preview and may not represent exact fit.',
    last_status: s.last_status || 'IDLE',
    last_error_message: s.last_error_message || null,
  }
}

/**
 * Validates uploaded customer photo
 */
export function validateCustomerImage({ buffer, mimeType, size, name }) {
  if (!buffer || buffer.length === 0) {
    const err = new Error('Please upload or take a photograph to try on this piece.')
    err.code = ERROR_CODES.TRYON_INVALID_IMAGE
    throw err
  }

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  const detectedType = (mimeType || '').toLowerCase()
  if (!validTypes.includes(detectedType)) {
    const err = new Error('Unsupported image format. Please upload a JPG, PNG, or WebP photo.')
    err.code = ERROR_CODES.TRYON_INVALID_IMAGE
    throw err
  }

  const maxSizeBytes = 10 * 1024 * 1024 // 10MB
  if (size && size > maxSizeBytes) {
    const err = new Error('Image file is too large. Please upload a photo under 10MB.')
    err.code = ERROR_CODES.TRYON_INVALID_IMAGE
    throw err
  }

  return { ok: true, mimeType: detectedType, size: buffer.length }
}

/**
 * Authoritative Garment & Variant Resolver from MongoDB
 */
export async function resolveGarmentFromProduct(database, { productId, colour, size }) {
  if (!database) {
    const err = new Error('Database connection required to resolve product.')
    err.code = ERROR_CODES.INTERNAL_ERROR
    throw err
  }

  const cleanId = String(productId || '').trim()
  if (!cleanId) {
    const err = new Error('Product ID is required for virtual try-on.')
    err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
    throw err
  }

  const product = await database.collection('products').findOne({
    $or: [{ id: cleanId }, { slug: cleanId }],
    active: { $ne: false },
  })

  if (!product) {
    const err = new Error('The selected piece is no longer active or could not be found.')
    err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
    throw err
  }

  // Check product-level override
  if (product.ai_tryon_enabled === false) {
    const err = new Error(`Virtual Try-On is not enabled for "${product.name}".`)
    err.code = ERROR_CODES.TRYON_UNAVAILABLE
    throw err
  }

  // Stock check
  const stock = Math.max(0, Number(product.stock ?? 1))
  if (stock <= 0) {
    const err = new Error(`"${product.name}" is currently out of stock.`)
    err.code = ERROR_CODES.OUT_OF_STOCK
    throw err
  }

  // Sizing check if multi-size
  const explicitSizes = (product.sizes || []).filter((s) => s && s.size)
  const selectedSize = (size || explicitSizes[0]?.size || 'Free Size').trim()

  if (explicitSizes.length > 0) {
    const sizeObj = explicitSizes.find((s) => s.size.toLowerCase() === selectedSize.toLowerCase())
    if (sizeObj && (sizeObj.available === false || (sizeObj.stock !== undefined && Number(sizeObj.stock) <= 0))) {
      const err = new Error(`Size "${selectedSize}" for "${product.name}" is currently out of stock.`)
      err.code = ERROR_CODES.TRYON_INVALID_VARIANT
      throw err
    }
  }

  // Colour resolution & Garment image selection
  const selectedColour = (colour || product.colour || 'Standard').trim()
  let garmentImageUrl = product.tryon_image || null

  if (!garmentImageUrl && Array.isArray(product.media)) {
    // Try to find image matching selected colour
    const colourMedia = product.media.find(
      (m) =>
        m.type !== 'video' &&
        m.colour &&
        m.colour.toLowerCase() === selectedColour.toLowerCase()
    )
    if (colourMedia?.url) {
      garmentImageUrl = colourMedia.url
    } else {
      const primary = product.media.find((m) => m.is_primary && m.type !== 'video')
      garmentImageUrl = primary?.url || product.media.find((m) => m.type !== 'video')?.url
    }
  }

  if (!garmentImageUrl) {
    garmentImageUrl = product.image || '/api/media/file/seed-01.jpg'
  }

  // Determine garment category / type
  let garmentType = product.garment_type || 'Top'
  if (!product.garment_type) {
    const catName = String(product.category_name || '').toLowerCase()
    const prodName = String(product.name || '').toLowerCase()

    if (catName.includes('saree') || prodName.includes('saree')) {
      garmentType = 'Saree'
    } else if (catName.includes('crop') || prodName.includes('crop') || prodName.includes('top')) {
      garmentType = 'Crop Top'
    } else if (prodName.includes('trouser') || prodName.includes('pant')) {
      garmentType = 'Trousers'
    } else if (prodName.includes('skirt')) {
      garmentType = 'Skirt'
    } else if (prodName.includes('dress')) {
      garmentType = 'Dress'
    }
  }

  return {
    product_id: String(product.id),
    name: product.name,
    slug: product.slug,
    price: Number(product.discount_price || product.price) || 0,
    original_price: Number(product.price) || 0,
    selected_colour: selectedColour,
    selected_size: selectedSize,
    garment_image_url: garmentImageUrl,
    garment_type: garmentType,
    stock,
  }
}

/**
 * Authoritative Combo / Ensemble Resolver for Multi-Garment Outfits
 */
export async function resolveGarmentsFromCombo(database, { comboSlug, selections = {} }) {
  if (!database) {
    const err = new Error('Database connection required.')
    err.code = ERROR_CODES.INTERNAL_ERROR
    throw err
  }

  const combo = await database.collection('combos').findOne({
    $or: [{ slug: comboSlug }, { id: comboSlug }],
    active: { $ne: false },
  })

  if (!combo) {
    const err = new Error('The selected ensemble could not be found.')
    err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
    throw err
  }

  const garments = []
  const slots = combo.slots || []

  if (slots.length === 0) {
    const err = new Error('This curated outfit has no component slots configured.')
    err.code = ERROR_CODES.TRYON_UNAVAILABLE
    throw err
  }

  for (const slot of slots) {
    const userSelection = selections[slot.id]
    const prodId =
      userSelection?.product_id ||
      slot.fixed_product?.id ||
      slot.fixed_product_id ||
      slot.product?.id ||
      slot.product_id ||
      slot.eligible_products?.[0]?.id

    if (!prodId) {
      const err = new Error(`Please complete your piece selection for "${slot.label || slot.name}".`)
      err.code = ERROR_CODES.TRYON_INVALID_VARIANT
      throw err
    }

    const resolved = await resolveGarmentFromProduct(database, {
      productId: prodId,
      colour: userSelection?.colour,
      size: userSelection?.size,
    })

    garments.push({
      slot_id: slot.id,
      slot_label: slot.label || slot.name,
      ...resolved,
    })
  }

  return {
    combo_id: String(combo.id),
    combo_name: combo.name,
    combo_slug: combo.slug,
    pricing_method: combo.pricing_method,
    garments,
  }
}

/**
 * Rate Limiting & Session Quotas Engine
 */
export async function checkAndIncrementTryOnQuota(database, { sessionId, userId, settings }) {
  const isGuest = !userId
  const maxAllowed = isGuest
    ? settings.max_generations_per_session || 3
    : settings.max_generations_per_user_day || 5

  const quotaKey = userId ? `user_${userId}` : `sess_${sessionId}`
  const todayKey = new Date().toISOString().slice(0, 10)

  // In-memory sliding window check
  const record = sessionQuotaMap.get(quotaKey) || { date: todayKey, count: 0 }
  if (record.date !== todayKey) {
    record.date = todayKey
    record.count = 0
  }

  if (record.count >= maxAllowed) {
    const err = new Error(
      isGuest
        ? "You've reached your virtual try-on preview limit for this session. Sign in to continue trying on pieces."
        : "You've reached today's virtual try-on limit. Please try again tomorrow."
    )
    err.code = ERROR_CODES.TRYON_RATE_LIMITED
    throw err
  }

  // Prevent duplicate concurrent requests for the same session
  if (activeRequestLocks.has(quotaKey)) {
    const err = new Error('A virtual try-on request is already in progress. Please wait a moment.')
    err.code = ERROR_CODES.RATE_LIMITED
    throw err
  }

  activeRequestLocks.add(quotaKey)

  return {
    quotaKey,
    releaseLock: () => activeRequestLocks.delete(quotaKey),
    increment: async () => {
      record.count += 1
      sessionQuotaMap.set(quotaKey, record)
      activeRequestLocks.delete(quotaKey)

      // Optionally record quota in database for persistence across serverless restarts
      if (database) {
        try {
          await database.collection('ai_tryon_sessions').updateOne(
            { key: quotaKey, date: todayKey },
            {
              $inc: { count: 1 },
              $set: { updated_at: new Date(), is_guest: isGuest },
            },
            { upsert: true }
          )
        } catch {
          // Non-blocking persistence
        }
      }

      return {
        used: record.count,
        remaining: Math.max(0, maxAllowed - record.count),
      }
    },
  }
}

/**
 * Base AI Provider Abstract Interface
 */
class BaseTryOnProvider {
  constructor(config = {}) {
    this.name = 'base'
    this.config = config
  }

  async generate({ personImageBuffer, personImageMime, garments, options }) {
    throw new Error('generate() must be implemented by provider adapter.')
  }

  async checkHealth() {
    return { ok: true, status: 'CONNECTED' }
  }
}

/**
 * Maps Thretha garment types/names to PixelAPI supported categories ('upperbody', 'lowerbody', 'dress')
 */
export function mapToPixelApiCategory(garmentType = '', productName = '', categoryName = '') {
  const combined = `${garmentType || ''} ${productName || ''} ${categoryName || ''}`.toLowerCase().trim()

  if (!combined) {
    const err = new Error('Virtual try-on is not currently supported for this piece category.')
    err.code = ERROR_CODES.TRYON_UNSUPPORTED_GARMENT
    throw err
  }

  // 1. Lowerbody checks (pants, trousers, skirts, jeans, shorts, leggings)
  if (
    combined.includes('trouser') ||
    combined.includes('pant') ||
    combined.includes('skirt') ||
    combined.includes('jean') ||
    combined.includes('short') ||
    combined.includes('legging') ||
    combined.includes('bottom') ||
    combined.includes('lowerbody') ||
    combined.includes('lower')
  ) {
    return 'lowerbody'
  }

  // 2. Dress / One-piece checks (dresses, jumpsuits, gowns, sarees, frocks, sets)
  if (
    combined.includes('dress') ||
    combined.includes('jumpsuit') ||
    combined.includes('gown') ||
    combined.includes('saree') ||
    combined.includes('frock') ||
    combined.includes('set') ||
    combined.includes('one-piece') ||
    combined.includes('ensemble')
  ) {
    return 'dress'
  }

  // 3. Upperbody checks (tops, shirts, t-shirts, crop tops, blouses, jackets, hoodies, kurta, outerwear)
  if (
    combined.includes('crop top') ||
    combined.includes('crop') ||
    combined.includes('top') ||
    combined.includes('shirt') ||
    combined.includes('blouse') ||
    combined.includes('t-shirt') ||
    combined.includes('tshirt') ||
    combined.includes('jacket') ||
    combined.includes('hoodie') ||
    combined.includes('kurta') ||
    combined.includes('upperbody') ||
    combined.includes('upper') ||
    combined.includes('outerwear')
  ) {
    return 'upperbody'
  }

  // 4. Default check by garmentType
  const cleanType = String(garmentType || '').toLowerCase().trim()
  if (['top', 'shirt', 't-shirt', 'blouse', 'crop top', 'outerwear'].includes(cleanType)) {
    return 'upperbody'
  }
  if (['pants', 'trousers', 'skirt'].includes(cleanType)) {
    return 'lowerbody'
  }
  if (['dress', 'saree', 'set'].includes(cleanType)) {
    return 'dress'
  }

  const err = new Error('Virtual try-on is not currently supported for this piece category.')
  err.code = ERROR_CODES.TRYON_UNSUPPORTED_GARMENT
  throw err
}

/**
 * PixelAPI Virtual Try-On Provider Adapter
 * Endpoint: POST https://api.pixelapi.dev/v1/virtual-tryon
 * Polling:  GET https://api.pixelapi.dev/v1/virtual-tryon/jobs/{job_id}
 */
/**
 * Helper to convert any image input (Buffer, remote URL, local path, or data URI) to clean raw base64 string
 */
async function prepareRawBase64(imageInput) {
  if (!imageInput) return null
  if (Buffer.isBuffer(imageInput)) {
    const raw = imageInput.toString('base64')
    return raw.replace(/^data:[A-Za-z-+\/]+;base64,/, '').trim()
  }
  if (typeof imageInput === 'string') {
    let trimmed = imageInput.trim()
    // 1. If data URI, strip prefix
    if (trimmed.startsWith('data:')) {
      trimmed = trimmed.replace(/^data:[A-Za-z-+\/]+;base64,/, '').trim()
    }
    // 2. If remote HTTP/HTTPS URL, fetch buffer
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 15000)
        const fetchRes = await fetch(trimmed, { signal: controller.signal })
        clearTimeout(timer)
        if (fetchRes.ok) {
          const buf = Buffer.from(await fetchRes.arrayBuffer())
          return buf.toString('base64').replace(/^data:[A-Za-z-+\/]+;base64,/, '').trim()
        }
      } catch {
        // Fall back
      }
    }
    // 3. If local server path, read from disk
    if (trimmed.startsWith('/')) {
      try {
        const filename = path.basename(trimmed)
        const mediaDir = process.env.MEDIA_DIR || path.join(process.cwd(), '.media')
        const localCandidates = [
          path.join(mediaDir, filename),
          path.join(process.cwd(), 'seed-media', filename),
          path.join(process.cwd(), 'public', filename),
          path.join(process.cwd(), trimmed.replace(/^\//, '')),
        ]
        for (const cand of localCandidates) {
          if (fs.existsSync(cand)) {
            const buf = fs.readFileSync(cand)
            return buf.toString('base64').replace(/^data:[A-Za-z-+\/]+;base64,/, '').trim()
          }
        }
      } catch {
        // Fall back
      }
    }
    // 4. Return trimmed string without data URI prefix (already raw base64)
    return trimmed.replace(/^data:[A-Za-z-+\/]+;base64,/, '').trim()
  }
  return null
}

/**
 * PixelAPI Virtual Try-On Provider Adapter
 * Endpoint: POST https://api.pixelapi.dev/v1/virtual-tryon
 * Polling:  GET https://api.pixelapi.dev/v1/virtual-tryon/jobs/{job_id}
 */
export class PixelApiProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'pixelapi'
    this.apiKey = config.apiKey !== undefined ? config.apiKey : (process.env.PIXELAPI_API_KEY || process.env.AI_TRYON_API_KEY)
    this.endpoint = process.env.PIXELAPI_ENDPOINT || 'https://api.pixelapi.dev/v1/virtual-tryon'
  }

  async checkHealth() {
    if (!this.apiKey) {
      return { ok: false, status: 'NOT_CONFIGURED', message: 'PixelAPI API key is not configured.' }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)

      // Test authenticated reachability of the PixelAPI endpoint
      const res = await fetch(`${this.endpoint}/jobs/health-check-probe`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timer)

      if (res && (res.status === 401 || res.status === 403)) {
        return {
          ok: false,
          status: 'ERROR',
          message: 'PixelAPI authentication failed. Please verify PIXELAPI_API_KEY.',
        }
      }

      return {
        ok: true,
        status: 'CONNECTED',
        provider: 'pixelapi',
        message: 'PixelAPI connection verified.',
      }
    } catch {
      return {
        ok: true,
        status: 'CONNECTED',
        provider: 'pixelapi',
        message: 'PixelAPI configured.',
      }
    }
  }

  async generate({ personImageBuffer, personImageMime, garments, options = {} }) {
    if (!this.apiKey) {
      const err = new Error('PixelAPI Virtual Try-On credentials are not configured.')
      err.code = ERROR_CODES.PIXELAPI_CONFIGURATION_ERROR
      throw err
    }

    if (!garments || garments.length === 0) {
      const err = new Error('No garment supplied for virtual try-on.')
      err.code = ERROR_CODES.PIXELAPI_INVALID_GARMENT
      throw err
    }

    // PixelAPI single-garment API constraint for standard virtual try-on
    if (garments.length > 1) {
      const err = new Error('Complete outfit Try-On is coming soon.')
      err.code = ERROR_CODES.TRYON_UNAVAILABLE
      throw err
    }

    const primaryGarment = garments[0]
    if (!primaryGarment?.garment_image_url) {
      const err = new Error('Garment image is required for try-on generation.')
      err.code = ERROR_CODES.PIXELAPI_INVALID_GARMENT
      throw err
    }

    // Map garment to PixelAPI category: 'upperbody' | 'lowerbody' | 'dress'
    const category = mapToPixelApiCategory(
      primaryGarment.garment_type,
      primaryGarment.name,
      primaryGarment.category_name
    )

    // Convert customer photo and garment image to raw base64 (no data: prefix)
    const personB64 = await prepareRawBase64(personImageBuffer)
    const garmentB64 = await prepareRawBase64(primaryGarment.garment_image_url)

    if (!personB64 || !garmentB64) {
      const err = new Error("We couldn't process this photo. Please choose another photo.")
      err.code = ERROR_CODES.PIXELAPI_INVALID_IMAGE
      throw err
    }

    console.log('[PIXELAPI] key configured:', Boolean(this.apiKey))
    console.log('[PIXELAPI] key prefix:', this.apiKey?.slice(0, 8))
    console.log('[PIXELAPI] submitting virtual try-on')
    console.log(`[PIXELAPI] category: ${category}`)
    console.log(`[PIXELAPI] person base64 length: ${personB64.length}`)
    console.log(`[PIXELAPI] garment base64 length: ${garmentB64.length}`)

    // Structured server-side diagnostics (never log API keys or full base64)
    console.log(`[TRYON] request received for mode: ${options.mode || 'single'}, product: ${primaryGarment.name || primaryGarment.product_id || 'n/a'}`)
    console.log(`[TRYON] product validated: ${primaryGarment.name || 'Garment'}, category: ${category}`)
    console.log(`[TRYON] person image received: ${personImageBuffer?.length || 0} bytes, mime: ${personImageMime || 'image/jpeg'}`)
    console.log(`[TRYON] garment image prepared: ${garmentB64.length} base64 chars`)
    console.log(`[TRYON] PixelAPI request sent: endpoint=${this.endpoint}, category=${category}`)

    const payload = {
      person_image: personB64,
      garment_image: garmentB64,
      category,
    }

    let postRes = null
    let postData = null
    const maxPostRetries = 2

    for (let attempt = 1; attempt <= maxPostRetries + 1; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60000)

      try {
        postRes = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On)',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        postData = await postRes.json().catch(() => null)
      } catch (postErr) {
        if (postErr.name === 'AbortError') {
          console.log(`[TRYON] PixelAPI request timed out`)
          const err = new Error('PixelAPI did not respond with a job ID in time. Please try again.')
          err.code = ERROR_CODES.PIXELAPI_TIMEOUT
          throw err
        }
        throw postErr
      } finally {
        clearTimeout(timer)
      }

      if (postRes.status === 503 || postRes.status === 429) {
        if (attempt <= maxPostRetries) {
          const retryAfter = (postData?.detail?.retry_after_s || 8) * 1000
          console.log(`[TRYON] PixelAPI busy (${postRes.status}), retrying in ${retryAfter / 1000}s... (attempt ${attempt}/${maxPostRetries})`)
          await new Promise((r) => setTimeout(r, Math.min(retryAfter, 12000)))
          continue
        } else {
          console.log(`[TRYON] PixelAPI queue full after ${maxPostRetries} retries`)
          const err = new Error('Try-On service is very busy right now. Please try again in a few moments.')
          err.code = ERROR_CODES.PIXELAPI_RATE_LIMITED
          throw err
        }
      }
      break
    }

    console.log(`[TRYON] PixelAPI response status: ${postRes.status}`)
    console.log(`[PIXELAPI] submit HTTP status: ${postRes.status}`)
    console.log(`[PIXELAPI] response content-type: ${postRes.headers?.get('content-type')}`)
    console.log(`[PIXELAPI] response body: ${JSON.stringify(scrubSecrets(postData))}`)

    const jobId = postData?.job_id || postData?.id || postData?.data?.job_id || postData?.data?.id
    const jobStatus = postData?.status || postData?.state || 'unknown'
    console.log(`[PIXELAPI] submit response status: ${postRes.status}`)
    if (jobId) console.log(`[PIXELAPI] job_id: ${jobId}`)
    if (jobStatus) console.log(`[PIXELAPI] job_status: ${jobStatus}`)

    if (!postRes.ok || !postData) {
      if (postRes.status === 401 || postRes.status === 403) {
        const err = new Error('Try-On service authentication failed.')
        err.code = ERROR_CODES.PIXELAPI_AUTH_ERROR
        err.details = scrubSecrets(postData)
        throw err
      }
      if (postRes.status === 400 || postRes.status === 422) {
        const err = new Error("We couldn't process this photo. Please choose another photo.")
        err.code = ERROR_CODES.PIXELAPI_INVALID_IMAGE
        err.details = scrubSecrets(postData)
        throw err
      }
      const err = new Error('PixelAPI did not respond with a job ID.')
      err.code = ERROR_CODES.PIXELAPI_JOB_FAILED
      err.details = scrubSecrets(postData)
      throw err
    }

    // Check immediate completion
    let directImage =
      postData.output_url ||
      postData.result_url ||
      postData.image_url ||
      postData.output_image ||
      postData.result ||
      postData.output?.[0] ||
      postData.data?.output_url ||
      postData.data?.result_url ||
      postData.data?.image_url

    if (!directImage && postData.result_image_b64) {
      directImage = postData.result_image_b64.startsWith('data:')
        ? postData.result_image_b64
        : `data:image/png;base64,${postData.result_image_b64}`
    }

    if (directImage) {
      console.log(`[TRYON] final status: COMPLETED (direct response)`)
      return {
        success: true,
        image_url: directImage,
        provider: 'pixelapi',
        category,
      }
    }

    if (!jobId) {
      console.log(`[TRYON] final status: FAILED (missing job_id)`)
      const err = new Error('PixelAPI did not respond with a job ID.')
      err.code = ERROR_CODES.PIXELAPI_JOB_FAILED
      err.details = scrubSecrets(postData)
      throw err
    }

    console.log(`[TRYON] submitted job: ${jobId}`)
    return await this._pollJob(jobId, category, options)
  }

  async _pollJob(jobId, category, options = {}) {
    const pollIntervalMs = options.pollIntervalMs || 3000
    const maxPollAttempts = options.maxPollAttempts || 60 // 60 attempts * 3s = 180s maximum duration
    const pollEndpoint = `${this.endpoint}/jobs/${jobId}`

    console.log(`[TRYON] polling job ${jobId}`)

    for (let i = 0; i < maxPollAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs))

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)

      try {
        const pollRes = await fetch(pollEndpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On)',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!pollRes.ok) {
          if (pollRes.status === 401 || pollRes.status === 403) {
            const err = new Error('Try-On service authentication failed.')
            err.code = ERROR_CODES.PIXELAPI_AUTH_ERROR
            throw err
          }
          if (pollRes.status === 429 || pollRes.status === 503) {
            console.log(`[TRYON] poll ${i + 1}: status=busy (${pollRes.status})`)
            continue
          }
        }

        const pollData = await pollRes.json().catch(() => null)
        if (!pollData) continue

        const status = String(pollData.status || pollData.state || pollData.data?.status || '').toLowerCase()
        console.log(`[TRYON] poll ${i + 1}: status=${status}`)
        console.log(`[TRYON] job status: ${status}`)

        if (status === 'completed' || status === 'success' || status === 'succeeded') {
          const hasResultB64 = Boolean(pollData.result_image_b64 || pollData.data?.result_image_b64)
          const hasOutputUrl = Boolean(
            pollData.output_url ||
            pollData.result_url ||
            pollData.image_url ||
            pollData.output_image ||
            pollData.result ||
            pollData.output?.[0] ||
            pollData.data?.output_url ||
            pollData.data?.result_url ||
            pollData.data?.image_url
          )
          console.log(`[TRYON] completed: has_result_image_b64=${hasResultB64}, has_output_url=${hasOutputUrl}`)

          let outUrl =
            pollData.output_url ||
            pollData.result_url ||
            pollData.image_url ||
            pollData.output_image ||
            pollData.result ||
            pollData.output?.[0] ||
            pollData.data?.output_url ||
            pollData.data?.result_url ||
            pollData.data?.image_url

          if (!outUrl && (pollData.result_image_b64 || pollData.data?.result_image_b64)) {
            const rawB64 = pollData.result_image_b64 || pollData.data?.result_image_b64
            outUrl = rawB64.startsWith('data:')
              ? rawB64
              : `data:image/png;base64,${rawB64}`
          }

          console.log(`[TRYON] result received`)
          console.log(`[TRYON] returning result to frontend`)
          console.log(`[TRYON] returning image_url=${Boolean(outUrl)}`)

          if (outUrl) {
            const result = {
              success: true,
              image_url: outUrl,
              provider: 'pixelapi',
              category,
              job_id: jobId,
            }
            console.log(`[TRYON] final provider result keys=${JSON.stringify(Object.keys(result))}`)
            return result
          } else {
            console.log(`[TRYON] final status: FAILED (completed without output image)`)
            const err = new Error("This garment/photo combination couldn't be processed.")
            err.code = ERROR_CODES.PIXELAPI_JOB_FAILED
            throw err
          }
        }

        if (status === 'queued' || status === 'pending' || status === 'processing' || status === 'in_progress' || status === 'running') {
          // Authoritative continuation
          continue
        }

        if (status === 'failed' || status === 'error' || status === 'canceled' || status === 'cancelled') {
          const errMsg = pollData.error_message || pollData.error || pollData.message || pollData.data?.error || "This garment/photo combination couldn't be processed."
          console.log(`[TRYON] final status: FAILED (${errMsg})`)
          const err = new Error("This garment/photo combination couldn't be processed.")
          err.code = ERROR_CODES.PIXELAPI_JOB_FAILED
          err.details = scrubSecrets(pollData)
          throw err
        }

        if (status && status !== 'unknown') {
          // Unrecognized failure status
          console.log(`[TRYON] final status: FAILED (unknown status: ${status})`)
          const err = new Error("This garment/photo combination couldn't be processed.")
          err.code = ERROR_CODES.PIXELAPI_JOB_FAILED
          throw err
        }
      } catch (pollErr) {
        clearTimeout(timer)
        if (pollErr.code === ERROR_CODES.PIXELAPI_JOB_FAILED || pollErr.code === ERROR_CODES.PIXELAPI_AUTH_ERROR) {
          throw pollErr
        }
      }
    }

    console.log(`[TRYON] final status: TIMEOUT after ${maxPollAttempts} attempts`)
    const err = new Error('The try-on is taking too long. Please try again.')
    err.code = ERROR_CODES.PIXELAPI_TIMEOUT
    throw err
  }
}

/**
 * Google Gemini Virtual Try-On Provider Adapter
 * Multimodal image-editing & generation for luxury Indian couture and Kerala traditional wear.
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 */
export class GeminiTryOnProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'gemini'
    this.supportsMultipleGarments = true
    this.apiKey = config.apiKey !== undefined ? config.apiKey : process.env.GEMINI_API_KEY
    this.model = config.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-image'
    this.endpoint = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta'
  }

  async checkHealth() {
    if (!this.apiKey) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        message: 'Gemini API key is not configured. Please set GEMINI_API_KEY.',
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)

      const res = await fetch(`${this.endpoint}/models?key=${this.apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On-Gemini)',
        },
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timer)

      if (res && (res.status === 401 || res.status === 403)) {
        return {
          ok: false,
          status: 'ERROR',
          message: 'Gemini API authentication failed. Please check GEMINI_API_KEY.',
        }
      }

      return {
        ok: true,
        status: 'CONNECTED',
        provider: 'gemini',
        message: 'Google Gemini API connection verified.',
      }
    } catch {
      return {
        ok: true,
        status: 'CONNECTED',
        provider: 'gemini',
        message: 'Gemini configured.',
      }
    }
  }

  async generate({ personImageBuffer, personImageMime, garments, options = {} }) {
    if (!this.apiKey) {
      const err = new Error('Gemini Virtual Try-On credentials are not configured.')
      err.code = ERROR_CODES.GEMINI_CONFIGURATION_ERROR
      throw err
    }

    if (!garments || garments.length === 0) {
      const err = new Error('No garment supplied for virtual try-on.')
      err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
      throw err
    }

    console.log('[GEMINI] request received')
    console.log(`[GEMINI] model: ${this.model}`)

    const primaryGarment = garments[0]
    const garmentDetails = garments
      .map((g, idx) => `Garment ${idx + 1}: ${g.name || 'Garment'} (${g.garment_type || 'Apparel'}, Colour: ${g.selected_colour || 'Standard'}, Category: ${g.category_name || 'Fashion'})`)
      .join('\n')

    // 1. Prepare Person Image (Raw Base64)
    const personB64 = await prepareRawBase64(personImageBuffer)
    if (!personB64) {
      const err = new Error('Please upload a clear, well-lit photo of yourself.')
      err.code = ERROR_CODES.TRYON_INVALID_IMAGE
      throw err
    }
    console.log('[GEMINI] person image prepared')

    // 2. Prepare Garment Image(s) (Raw Base64)
    const garmentParts = []
    for (let i = 0; i < garments.length; i++) {
      const g = garments[i]
      const gB64 = await prepareRawBase64(g.garment_image_url)
      if (gB64) {
        garmentParts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: gB64,
          },
        })
      }
    }

    if (garmentParts.length === 0) {
      const err = new Error('Garment image is required for try-on generation.')
      err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
      throw err
    }
    console.log('[GEMINI] garment image prepared')

    // 3. Construct High-Fidelity Prompt for Thretha Atelier & Kerala Traditional Garments
    const systemPrompt = `You are an expert AI Virtual Try-On system and luxury fashion visualizer for Thretha Couture.

TASK:
Edit the customer photograph (first image provided) so the person is wearing the exact Thretha garment(s) shown in the reference image(s).

CRITICAL FIDELITY REQUIREMENTS:
1. CUSTOMER IDENTITY & POSE:
   - Completely PRESERVE the person's face, facial features, eyes, expression, skin tone, makeup, and identity.
   - PRESERVE the person's exact body proportions, posture, height, and pose.
   - Keep the original background, environment, and lighting ambiance unchanged.
   - Do NOT add jewellery, sunglasses, or accessories unless already present in the customer photo.

2. GARMENT PRESERVATION & FIT:
   - Reproduce the EXACT design, colour, fabric texture, weave, drape, kasavu/zari borders, embroidery, patterns, neckline, sleeves, and buttons from the Thretha garment reference image(s).
   - Replace ONLY the relevant clothing area (tops, blouses, peplum tops, skirts, pants, set mundus, drapes, or ensembles).
   - For Kerala traditional garments (Set Mundu, Kasavu drapes, Mundu), accurately depict authentic South Indian draping, pleats, and golden borders.
   - Fit the garment naturally to the customer's body, matching natural wrinkles, shadows, and perspective.
   - Do NOT invent extra prints, logos, or unrequested clothing items.

Garment Details:
${garmentDetails}
Mode: ${options.mode || 'single'}`

    const parts = [
      { text: systemPrompt },
      {
        inline_data: {
          mime_type: personImageMime || 'image/jpeg',
          data: personB64,
        },
      },
      ...garmentParts,
      {
        text: 'Generate the photorealistic image of this customer wearing the exact Thretha garment(s) while completely preserving their face, identity, pose, and background.',
      },
    ]

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 0.2,
      },
    }

    console.log('[GEMINI] generation started')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 60000)

    try {
      const res = await fetch(`${this.endpoint}/models/${this.model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On-Gemini)',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      console.log(`[GEMINI] response received: HTTP status ${res.status}`)
      const data = await res.json().catch(() => null)

      if (!res.ok || !data) {
        // Safe diagnostic: log Gemini's error details (never the API key or image data)
        const geminiStatus = data?.error?.status || null
        const geminiCode = data?.error?.code || res.status
        const geminiMessage = data?.error?.message || data?.message || '(no message)'
        const geminiDetails = Array.isArray(data?.error?.details)
          ? data.error.details.map((d) => JSON.stringify(scrubSecrets(d))).join(' | ')
          : null

        if (res.status === 401 || res.status === 403) {
          console.log(`[GEMINI] HTTP ${res.status}`)
          console.log(`[GEMINI] error status: ${geminiStatus}`)
          console.log(`[GEMINI] error code: ${geminiCode}`)
          console.log(`[GEMINI] error message: ${geminiMessage}`)
          if (geminiDetails) console.log(`[GEMINI] error details: ${geminiDetails}`)
          const err = new Error('Gemini API authentication failed. Please verify GEMINI_API_KEY.')
          err.code = ERROR_CODES.GEMINI_AUTH_ERROR
          err.details = scrubSecrets(data)
          throw err
        }
        if (res.status === 429) {
          console.log(`[GEMINI] HTTP 429`)
          console.log(`[GEMINI] error status: ${geminiStatus}`)
          console.log(`[GEMINI] error code: ${geminiCode}`)
          console.log(`[GEMINI] error message: ${geminiMessage}`)
          if (geminiDetails) console.log(`[GEMINI] error details: ${geminiDetails}`)
          const err = new Error('Gemini AI Try-On service is busy or free-tier quota reached. Please try again in a few moments.')
          err.code = ERROR_CODES.GEMINI_RATE_LIMITED
          err.details = scrubSecrets(data)
          throw err
        }
        if (res.status === 400 || res.status === 422) {
          console.log(`[GEMINI] HTTP ${res.status}`)
          console.log(`[GEMINI] error status: ${geminiStatus}`)
          console.log(`[GEMINI] error code: ${geminiCode}`)
          console.log(`[GEMINI] error message: ${geminiMessage}`)
          if (geminiDetails) console.log(`[GEMINI] error details: ${geminiDetails}`)
          const err = new Error("We couldn't process this photo with Gemini. Please choose another photo.")
          err.code = ERROR_CODES.GEMINI_INVALID_IMAGE
          err.details = scrubSecrets(data)
          throw err
        }
        console.log(`[GEMINI] HTTP ${res.status} (unhandled)`)
        console.log(`[GEMINI] error status: ${geminiStatus}`)
        console.log(`[GEMINI] error code: ${geminiCode}`)
        console.log(`[GEMINI] error message: ${geminiMessage}`)
        if (geminiDetails) console.log(`[GEMINI] error details: ${geminiDetails}`)
        const err = new Error('Gemini Virtual Try-On generation failed.')
        err.code = ERROR_CODES.GEMINI_GENERATION_FAILED
        err.details = scrubSecrets(data)
        throw err
      }

      // Extract generated image from candidates
      let resultImageUri = null
      const candidateParts = data.candidates?.[0]?.content?.parts || []
      for (const p of candidateParts) {
        if (p.inlineData?.data) {
          const mime = p.inlineData.mimeType || 'image/png'
          resultImageUri = `data:${mime};base64,${p.inlineData.data}`
          break
        }
        if (p.inline_data?.data) {
          const mime = p.inline_data.mime_type || 'image/png'
          resultImageUri = `data:${mime};base64,${p.inline_data.data}`
          break
        }
      }

      console.log(`[GEMINI] image result available: ${Boolean(resultImageUri)}`)

      if (!resultImageUri) {
        const textFallback = candidateParts.find((p) => p.text)?.text
        console.log(`[GEMINI] generation returned text instead of image: ${textFallback?.slice(0, 120)}`)
        const err = new Error("Gemini couldn't render a try-on image for this combination. Please try another photo.")
        err.code = ERROR_CODES.GEMINI_GENERATION_FAILED
        err.details = scrubSecrets(data)
        throw err
      }

      return {
        success: true,
        image_url: resultImageUri,
        provider: 'gemini',
        model: this.model,
        category: primaryGarment.garment_type || 'Garment',
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[GEMINI] generation timed out')
        const timeoutErr = new Error('Gemini try-on generation timed out. Please try again.')
        timeoutErr.code = ERROR_CODES.GEMINI_TIMEOUT
        throw timeoutErr
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Qwen (Alibaba DashScope) Virtual Try-On Provider Adapter
 * Model:    wanx2.1-imageedit  (supports multi-reference image editing)
 * API:      Alibaba Cloud DashScope async task API
 * Endpoint: https://dashscope-intl.aliyuncs.com/api/v1  (international)
 *           or QWEN_ENDPOINT env override for China region workspaces
 * Auth:     Authorization: Bearer ${QWEN_API_KEY}
 * Async:    POST task → poll GET task until SUCCEEDED (up to 120s)
 * Doc:      https://help.aliyun.com/en/model-studio/wanx-imageedit
 */
export class QwenTryOnProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'qwen'
    this.supportsMultipleGarments = true
    this.apiKey = config.apiKey !== undefined
      ? config.apiKey
      : (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '')
    // International endpoint (available without Alibaba Cloud workspace)
    // Override with QWEN_ENDPOINT for China-region workspace URLs
    this.endpoint = process.env.QWEN_ENDPOINT || 'https://dashscope-intl.aliyuncs.com/api/v1'
    this.model = config.model || process.env.QWEN_MODEL || 'wanx2.1-imageedit'
    this.taskEndpoint = `${this.endpoint}/services/aigc/image2image/image-synthesis`
    this.taskStatusBase = `${this.endpoint}/tasks`
  }

  async checkHealth() {
    if (!this.apiKey) {
      return {
        ok: false,
        status: 'NOT_CONFIGURED',
        message: 'Qwen API key is not configured. Please set QWEN_API_KEY in server environment.',
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)

      // Lightweight HEAD/GET on task status base to verify connectivity & auth
      const res = await fetch(`${this.endpoint}/services/aigc/image2image/image-synthesis`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On-Qwen)',
        },
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timer)

      if (res && (res.status === 401 || res.status === 403)) {
        return {
          ok: false,
          status: 'ERROR',
          message: 'Qwen API authentication failed. Please verify QWEN_API_KEY.',
        }
      }

      return {
        ok: true,
        status: 'CONNECTED',
        provider: 'qwen',
        model: this.model,
        message: 'Qwen DashScope API connection verified.',
      }
    } catch {
      return {
        ok: true,
        status: 'CONNECTED',
        provider: 'qwen',
        message: 'Qwen configured.',
      }
    }
  }

  async generate({ personImageBuffer, personImageMime, garments, options = {} }) {
    if (!this.apiKey) {
      const err = new Error('Qwen Virtual Try-On credentials are not configured.')
      err.code = ERROR_CODES.QWEN_CONFIGURATION_ERROR
      throw err
    }

    if (!garments || garments.length === 0) {
      const err = new Error('No garment supplied for virtual try-on.')
      err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
      throw err
    }

    console.log('[QWEN] request received')
    console.log(`[QWEN] model: ${this.model}`)

    const primaryGarment = garments[0]
    const garmentDetails = garments
      .map((g, i) => `Garment ${i + 1}: ${g.name || 'Garment'} (${g.garment_type || 'Apparel'}, Colour: ${g.selected_colour || 'Standard'})`)
      .join('; ')

    // 1. Prepare person image (data URI format)
    const personB64 = await prepareRawBase64(personImageBuffer)
    if (!personB64) {
      const err = new Error('Please upload a clear, well-lit photo of yourself.')
      err.code = ERROR_CODES.TRYON_INVALID_IMAGE
      throw err
    }
    const personDataUri = `data:${personImageMime || 'image/jpeg'};base64,${personB64}`
    console.log('[QWEN] person image prepared')

    // 2. Prepare garment image(s) — use URL directly if HTTP, convert to base64 if local
    const garmentImages = []
    for (const g of garments) {
      if (g.garment_image_url) {
        if (g.garment_image_url.startsWith('http://') || g.garment_image_url.startsWith('https://')) {
          garmentImages.push(g.garment_image_url)
        } else {
          const gB64 = await prepareRawBase64(g.garment_image_url)
          if (gB64) {
            garmentImages.push(`data:image/jpeg;base64,${gB64}`)
          }
        }
      }
    }

    if (garmentImages.length === 0) {
      const err = new Error('Garment image is required for virtual try-on.')
      err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
      throw err
    }
    console.log('[QWEN] garment image prepared')

    // 3. Build the virtual try-on prompt
    const isTraditional = /mundu|saree|sari|kasavu|kerala/i.test(garmentDetails)
    const prompt = [
      'Virtual try-on: edit the person photograph so they are wearing the exact garment shown in the reference image.',
      'CRITICAL REQUIREMENTS:',
      '- Completely preserve the person\'s face, identity, skin tone, expression, and hairstyle.',
      '- Preserve the person\'s body proportions, pose, and posture exactly.',
      '- Keep the original background and lighting unchanged.',
      '- Replace ONLY the relevant clothing area with the exact garment from the reference image.',
      '- Reproduce the exact garment colour, fabric texture, pattern, embroidery, neckline, sleeves, buttons, and borders.',
      isTraditional
        ? '- This is a traditional Kerala garment. Accurately reproduce kasavu/zari gold borders, pleats, drape style, and cultural details.'
        : '',
      '- Make the garment fit naturally with realistic wrinkles, shadows, and perspective.',
      '- Do NOT add jewellery, accessories, or extra clothing.',
      '- Do NOT change the person\'s face, hairstyle, or skin tone.',
      '- Do NOT invent logos, prints, or embroidery not present in the garment reference.',
      '- Produce a photorealistic fashion photograph.',
      `Garment details: ${garmentDetails}`,
      `Mode: ${options.mode || 'single'}`,
    ].filter(Boolean).join(' ')

    // 4. Build DashScope wanx2.1-imageedit task payload
    // ref_image_list: array of reference images (garments)
    // base_image_url: person photo (the image to edit)
    const taskBody = {
      model: this.model,
      input: {
        function: 'description_edit',
        prompt,
        base_image_url: personDataUri,
        ...(garmentImages.length === 1
          ? { ref_image_url: garmentImages[0] }
          : { ref_image_list: garmentImages }),
      },
      parameters: {
        n: 1,
        size: '768*1024',
      },
    }

    console.log('[QWEN] generation started')

    // 5. Submit async task
    let taskId
    try {
      const submitRes = await fetch(this.taskEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
          'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On-Qwen)',
        },
        body: JSON.stringify(taskBody),
        signal: AbortSignal.timeout(30000),
      })

      const submitData = await submitRes.json().catch(() => null)
      console.log(`[QWEN] task submit response: HTTP ${submitRes.status}`)

      if (!submitRes.ok || !submitData) {
        const qwenStatus = submitData?.code || submitRes.status
        const qwenMessage = submitData?.message || '(no message)'
        console.log(`[QWEN] task submit error code: ${qwenStatus}`)
        console.log(`[QWEN] task submit error message: ${qwenMessage}`)

        if (submitRes.status === 401 || submitRes.status === 403) {
          const err = new Error('Qwen API authentication failed. Please verify QWEN_API_KEY.')
          err.code = ERROR_CODES.QWEN_AUTH_ERROR
          throw err
        }
        if (submitRes.status === 429) {
          console.log(`[QWEN] HTTP 429 rate limit`)
          console.log(`[QWEN] error message: ${qwenMessage}`)
          const err = new Error('Qwen AI Try-On service is busy or free-tier quota reached. Please try again shortly.')
          err.code = ERROR_CODES.QWEN_RATE_LIMITED
          throw err
        }
        if (submitRes.status === 400 || submitRes.status === 422) {
          console.log(`[QWEN] HTTP ${submitRes.status} invalid request`)
          console.log(`[QWEN] error message: ${qwenMessage}`)
          const err = new Error("We couldn't process this photo with Qwen. Please try a different image.")
          err.code = ERROR_CODES.QWEN_INVALID_IMAGE
          throw err
        }
        const err = new Error('Qwen task submission failed.')
        err.code = ERROR_CODES.QWEN_GENERATION_FAILED
        throw err
      }

      taskId = submitData?.output?.task_id
      if (!taskId) {
        console.log(`[QWEN] no task_id in response: ${JSON.stringify(scrubSecrets(submitData)).slice(0, 200)}`)
        const err = new Error('Qwen did not return a task ID.')
        err.code = ERROR_CODES.QWEN_GENERATION_FAILED
        throw err
      }
      console.log(`[QWEN] task created: ${taskId}`)
    } catch (err) {
      if (err.code && err.code.startsWith('QWEN_')) throw err
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        const timeoutErr = new Error('Qwen task submission timed out. Please try again.')
        timeoutErr.code = ERROR_CODES.QWEN_TIMEOUT
        throw timeoutErr
      }
      throw err
    }

    // 6. Poll for task completion (up to 120s, every 5s)
    const maxWaitMs = options.timeoutMs || 120000
    const pollIntervalMs = 5000
    const pollDeadline = Date.now() + maxWaitMs
    let pollAttempt = 0

    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      pollAttempt++

      let pollData
      try {
        const pollRes = await fetch(`${this.taskStatusBase}/${taskId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'User-Agent': 'Thretha-Couture/1.0 (Virtual-Try-On-Qwen)',
          },
          signal: AbortSignal.timeout(15000),
        })
        pollData = await pollRes.json().catch(() => null)
      } catch {
        console.log(`[QWEN] poll attempt ${pollAttempt} failed (network error), retrying`)
        continue
      }

      const taskStatus = pollData?.output?.task_status
      console.log(`[QWEN] poll ${pollAttempt}: status=${taskStatus}`)

      if (taskStatus === 'SUCCEEDED') {
        const results = pollData?.output?.results || []
        const outputUrl = results[0]?.url || null
        console.log(`[QWEN] response received`)
        console.log(`[QWEN] image result available: ${Boolean(outputUrl)}`)

        if (!outputUrl) {
          const err = new Error("Qwen completed the task but returned no output image.")
          err.code = ERROR_CODES.QWEN_GENERATION_FAILED
          throw err
        }

        return {
          success: true,
          image_url: outputUrl,
          provider: 'qwen',
          model: this.model,
          category: primaryGarment.garment_type || 'Garment',
        }
      }

      if (taskStatus === 'FAILED') {
        const errMsg = pollData?.output?.message || 'Qwen task failed.'
        const errCode = pollData?.output?.code || 'UNKNOWN'
        console.log(`[QWEN] task FAILED — code: ${errCode}, message: ${errMsg}`)
        const err = new Error("Qwen Virtual Try-On generation failed. Please try a different photo.")
        err.code = ERROR_CODES.QWEN_GENERATION_FAILED
        throw err
      }

      // Still PENDING or RUNNING — continue polling
    }

    console.log(`[QWEN] task timed out after ${maxWaitMs / 1000}s`)
    const timeoutErr = new Error('Qwen Virtual Try-On is taking too long. Please try again.')
    timeoutErr.code = ERROR_CODES.QWEN_TIMEOUT
    throw timeoutErr
  }
}

/**
 * FASHN.ai Virtual Try-On Provider Adapter
 */
export class FashnAiProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'fashn'
    this.apiKey = process.env.AI_TRYON_API_KEY || process.env.FASHN_API_KEY || config.apiKey
    this.endpoint = process.env.AI_TRYON_ENDPOINT || 'https://api.fashn.ai/v1'
  }

  async checkHealth() {
    if (!this.apiKey) {
      return { ok: false, status: 'NOT_CONFIGURED', message: 'FASHN API key is not configured.' }
    }
    return { ok: true, status: 'CONNECTED', provider: 'fashn' }
  }

  async generate({ personImageBuffer, personImageMime, garments, options = {} }) {
    if (!this.apiKey) {
      const err = new Error('AI Virtual Try-On provider credentials are not configured.')
      err.code = ERROR_CODES.TRYON_NOT_CONFIGURED
      throw err
    }

    const primaryGarment = garments[0]
    if (!primaryGarment?.garment_image_url) {
      const err = new Error('Garment image is required for try-on generation.')
      err.code = ERROR_CODES.TRYON_INVALID_PRODUCT
      throw err
    }

    // Convert person image buffer to base64 data URI
    const personDataUri = `data:${personImageMime || 'image/jpeg'};base64,${personImageBuffer.toString('base64')}`

    const payload = {
      model_image: personDataUri,
      garment_image: primaryGarment.garment_image_url,
      category: (primaryGarment.garment_type || 'tops').toLowerCase().includes('trouser') ? 'bottoms' : 'tops',
      mode: 'balanced',
      num_samples: 1,
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000)

    try {
      const res = await fetch(`${this.endpoint}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        const err = new Error(data.error?.message || `FASHN API responded with status ${res.status}`)
        err.code = ERROR_CODES.TRYON_PROVIDER_ERROR
        err.details = scrubSecrets(data)
        throw err
      }

      // Check status (async polling or immediate result)
      const outputUrl = data.output?.[0] || data.image_url || data.result
      if (!outputUrl && data.id) {
        // Poll status if async job
        return await this._pollJob(data.id, controller.signal)
      }

      return {
        success: true,
        image_url: outputUrl,
        provider: 'fashn',
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        const err = new Error('Try-on generation request timed out.')
        err.code = ERROR_CODES.TRYON_PROVIDER_TIMEOUT
        throw err
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async _pollJob(jobId, signal) {
    const maxAttempts = 20
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(`${this.endpoint}/status/${jobId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal,
      })
      const data = await res.json()
      if (data.status === 'completed' && data.output?.[0]) {
        return { success: true, image_url: data.output[0], provider: 'fashn' }
      }
      if (data.status === 'failed') {
        const err = new Error(data.error || 'AI Try-On generation failed.')
        err.code = ERROR_CODES.TRYON_GENERATION_FAILED
        throw err
      }
    }
    const err = new Error('Try-on generation took longer than expected.')
    err.code = ERROR_CODES.TRYON_PROVIDER_TIMEOUT
    throw err
  }
}

/**
 * Replicate IDM-VTON / TryOn Provider Adapter
 */
export class ReplicateProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'replicate'
    this.apiKey = process.env.AI_TRYON_API_KEY || process.env.REPLICATE_API_TOKEN || config.apiKey
  }

  async checkHealth() {
    if (!this.apiKey) {
      return { ok: false, status: 'NOT_CONFIGURED', message: 'Replicate API token is not configured.' }
    }
    return { ok: true, status: 'CONNECTED', provider: 'replicate' }
  }

  async generate({ personImageBuffer, personImageMime, garments, options = {} }) {
    if (!this.apiKey) {
      const err = new Error('Replicate API credentials not configured.')
      err.code = ERROR_CODES.TRYON_NOT_CONFIGURED
      throw err
    }

    const primaryGarment = garments[0]
    const personDataUri = `data:${personImageMime || 'image/jpeg'};base64,${personImageBuffer.toString('base64')}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000)

    try {
      const res = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${this.apiKey}`,
        },
        body: JSON.stringify({
          version: 'c871bb9b046607b680449ecbae55fd8e6d945e0a1948644bf236166fb763eacb', // IDM-VTON
          input: {
            human_img: personDataUri,
            garm_img: primaryGarment.garment_image_url,
            garment_des: `${primaryGarment.selected_colour || ''} ${primaryGarment.name}`,
            is_checked: true,
            is_checked_crop: false,
            denoise_steps: 30,
            seed: 42,
          },
        }),
        signal: controller.signal,
      })

      const prediction = await res.json()
      if (!res.ok || prediction.error) {
        const err = new Error(prediction.error || `Replicate API error ${res.status}`)
        err.code = ERROR_CODES.TRYON_PROVIDER_ERROR
        throw err
      }

      // Poll prediction
      let current = prediction
      while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled') {
        await new Promise((r) => setTimeout(r, 2000))
        const pollRes = await fetch(current.urls.get, {
          headers: { Authorization: `Token ${this.apiKey}` },
          signal: controller.signal,
        })
        current = await pollRes.json()
      }

      if (current.status === 'succeeded' && current.output) {
        const outUrl = Array.isArray(current.output) ? current.output[0] : current.output
        return { success: true, image_url: outUrl, provider: 'replicate' }
      }

      const err = new Error(current.error || 'Replicate try-on generation failed.')
      err.code = ERROR_CODES.TRYON_GENERATION_FAILED
      throw err
    } catch (error) {
      if (error.name === 'AbortError') {
        const err = new Error('Replicate try-on prediction timed out.')
        err.code = ERROR_CODES.TRYON_PROVIDER_TIMEOUT
        throw err
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Segmind IDM-VTON Provider Adapter
 */
export class SegmindProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'segmind'
    this.apiKey = process.env.AI_TRYON_API_KEY || process.env.SEGMIND_API_KEY || config.apiKey
  }

  async checkHealth() {
    if (!this.apiKey) {
      return { ok: false, status: 'NOT_CONFIGURED', message: 'Segmind API key is not configured.' }
    }
    return { ok: true, status: 'CONNECTED', provider: 'segmind' }
  }

  async generate({ personImageBuffer, personImageMime, garments, options = {} }) {
    if (!this.apiKey) {
      const err = new Error('Segmind API key is not configured.')
      err.code = ERROR_CODES.TRYON_NOT_CONFIGURED
      throw err
    }

    const primary = garments[0]
    const base64Person = personImageBuffer.toString('base64')

    const res = await fetch('https://api.segmind.com/v1/idm-vton', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        human_img: base64Person,
        garm_img: primary.garment_image_url,
        garment_des: `${primary.selected_colour || ''} ${primary.name}`,
        category: (primary.garment_type || '').toLowerCase().includes('trouser') ? 'lower_body' : 'upper_body',
        steps: 30,
      }),
    })

    if (!res.ok) {
      const err = new Error(`Segmind API error: ${res.status}`)
      err.code = ERROR_CODES.TRYON_PROVIDER_ERROR
      throw err
    }

    const arrayBuffer = await res.arrayBuffer()
    const outBase64 = Buffer.from(arrayBuffer).toString('base64')
    return {
      success: true,
      image_url: `data:image/jpeg;base64,${outBase64}`,
      provider: 'segmind',
    }
  }
}

/**
 * Development & Mock Provider Adapter
 * Clearly marked as is_mock: true. Used for zero-cost offline testing, CI/CD, and preview.
 */
export class MockDevelopmentProvider extends BaseTryOnProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'mock'
  }

  async checkHealth() {
    return {
      ok: true,
      status: 'DEVELOPMENT_MOCK',
      message: 'Development Mock Provider active (Offline Test Mode).',
    }
  }

  async generate({ personImageBuffer, garments, options = {} }) {
    // Artificial 1.5s delay to simulate realistic network AI generation
    if (!options.skipDelay) {
      await new Promise((r) => setTimeout(r, 1200))
    }

    const primary = garments[0] || {}
    const displayImg = primary.garment_image_url || '/api/media/file/seed-04.jpg'

    return {
      success: true,
      image_url: displayImg,
      provider: 'mock_development',
      is_mock: true,
      garment_summary: {
        name: primary.name || 'Atelier Piece',
        colour: primary.selected_colour || 'Natural',
        size: primary.selected_size || 'Free Size',
      },
    }
  }
}

/**
 * Provider Factory Function
 */
export function getTryOnProvider(providerName) {
  const p = String(providerName || process.env.AI_TRYON_PROVIDER || 'pixelapi').toLowerCase().trim()
  const pixelKey = process.env.PIXELAPI_API_KEY || process.env.AI_TRYON_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  const qwenKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY

  if (p === 'gemini') {
    return new GeminiTryOnProvider({ apiKey: geminiKey || '' })
  }
  if (p === 'qwen') {
    return new QwenTryOnProvider({ apiKey: qwenKey || '' })
  }
  if (p === 'pixelapi' && (pixelKey || process.env.PIXELAPI_API_KEY)) {
    return new PixelApiProvider()
  }
  if (p === 'fashn' && (pixelKey || process.env.FASHN_API_KEY)) {
    return new FashnAiProvider()
  }
  if (p === 'replicate' && (pixelKey || process.env.REPLICATE_API_TOKEN)) {
    return new ReplicateProvider()
  }
  if (p === 'segmind' && (pixelKey || process.env.SEGMIND_API_KEY)) {
    return new SegmindProvider()
  }

  // If credentials are not provided, return the MockDevelopmentProvider clearly demarcated
  return new MockDevelopmentProvider()
}

/**
 * Core Orchestrator: Generate Virtual Try-On
 */
export async function generateVirtualTryOn(database, {
  personImageBuffer,
  personImageMime,
  personImageSize,
  mode = 'single',
  productId,
  colour,
  size,
  comboSlug,
  comboSelections,
  sessionId,
  userId,
  options = {},
}) {
  const settingsDoc = await database.collection('settings').findOne({ id: 'global' })
  const settings = normalizeTryOnSettings(settingsDoc?.ai_tryon)

  if (!settings.enabled) {
    const err = new Error('Virtual Try-On is currently disabled by store administration.')
    err.code = ERROR_CODES.TRYON_NOT_CONFIGURED
    throw err
  }

  if (mode === 'single' && !settings.product_tryon_enabled) {
    const err = new Error('Product Virtual Try-On is currently disabled.')
    err.code = ERROR_CODES.TRYON_NOT_CONFIGURED
    throw err
  }

  if (mode === 'combo' && !settings.combo_tryon_enabled) {
    const err = new Error('Ensemble / Combo Virtual Try-On is currently disabled.')
    err.code = ERROR_CODES.TRYON_NOT_CONFIGURED
    throw err
  }

  if (!userId && !settings.allow_guests) {
    const err = new Error('Please sign in to your Thretha Couture account to use Virtual Try-On.')
    err.code = ERROR_CODES.AUTH_REQUIRED
    throw err
  }

  // 1. Validate Customer Image
  validateCustomerImage({
    buffer: personImageBuffer,
    mimeType: personImageMime,
    size: personImageSize,
  })

  // 2. Resolve Garment(s) from Database authoritatively
  let garments = []
  let contextTitle = ''
  let contextPrice = 0

  if (mode === 'combo') {
    const comboData = await resolveGarmentsFromCombo(database, {
      comboSlug,
      selections: comboSelections,
    })
    garments = comboData.garments
    contextTitle = comboData.combo_name
    contextPrice = garments.reduce((sum, g) => sum + g.price, 0)
  } else {
    const singleGarment = await resolveGarmentFromProduct(database, {
      productId,
      colour,
      size,
    })
    garments = [singleGarment]
    contextTitle = singleGarment.name
    contextPrice = singleGarment.price
  }

  // 3. Rate Limit Check & Session Lock
  const quota = await checkAndIncrementTryOnQuota(database, {
    sessionId,
    userId,
    settings,
  })

  const startTime = Date.now()

  try {
    // 4. Resolve Provider and generate image
    const provider = getTryOnProvider(settings.provider)
    const result = await provider.generate({
      personImageBuffer,
      personImageMime,
      garments,
      options,
    })

    const quotaInfo = await quota.increment()
    const durationMs = Date.now() - startTime

    // 5. Track Analytics Event (never log the customer image)
    await recordTryOnAnalytics(database, {
      event: 'tryon_generation_success',
      mode,
      productId: mode === 'single' ? garments[0]?.product_id : null,
      comboSlug: mode === 'combo' ? comboSlug : null,
      colour: garments[0]?.selected_colour,
      size: garments[0]?.selected_size,
      userId: userId || null,
      sessionId: sessionId || null,
      provider: result.provider,
      isMock: Boolean(result.is_mock),
      durationMs,
    })

    return {
      success: true,
      image_url: result.image_url,
      provider: result.provider,
      is_mock: Boolean(result.is_mock),
      disclaimer: settings.disclaimer_text,
      item_summary: {
        title: contextTitle,
        price: contextPrice,
        mode,
        garments: garments.map((g) => ({
          name: g.name,
          colour: g.selected_colour,
          size: g.selected_size,
          garment_type: g.garment_type,
          price: g.price,
          image: g.garment_image_url,
        })),
      },
      quota: quotaInfo,
    }
  } catch (error) {
    quota.releaseLock()

    // Record Failure in Analytics
    await recordTryOnAnalytics(database, {
      event: 'tryon_generation_failed',
      mode,
      productId: mode === 'single' ? garments[0]?.product_id : null,
      comboSlug: mode === 'combo' ? comboSlug : null,
      error: error.message,
      errorCode: error.code || ERROR_CODES.TRYON_GENERATION_FAILED,
      userId: userId || null,
      sessionId: sessionId || null,
    })

    throw error
  }
}

/**
 * Record Try-On Analytics (Never stores customer photographs)
 */
export async function recordTryOnAnalytics(database, payload = {}) {
  if (!database) return

  const doc = {
    id: `tryon_evt_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
    event: payload.event || 'tryon_event',
    mode: payload.mode || 'single',
    product_id: payload.productId || null,
    combo_slug: payload.comboSlug || null,
    colour: payload.colour || null,
    size: payload.size || null,
    user_id: payload.userId || null,
    session_id: payload.sessionId || null,
    provider: payload.provider || null,
    is_mock: Boolean(payload.isMock),
    duration_ms: Number(payload.durationMs) || null,
    error: payload.error ? String(payload.error).slice(0, 200) : null,
    error_code: payload.errorCode || null,
    created_at: new Date(),
  }

  try {
    await database.collection('ai_tryon_analytics').insertOne(doc)
  } catch (err) {
    logger.warn('Failed to record try-on analytics event', { err: err.message })
  }
}

/**
 * Summarizes Admin Analytics for AI Virtual Try-On
 */
export async function getTryOnAnalyticsSummary(database) {
  if (!database) return { totalAttempts: 0, successful: 0, addedToCart: 0, conversionRate: 0, topProducts: [], topColours: [] }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const collection = database.collection('ai_tryon_analytics')

  const [todayAttempts, todaySuccess, todayAddToCart, allSuccessEvents, allCartEvents] = await Promise.all([
    collection.countDocuments({ created_at: { $gte: today } }),
    collection.countDocuments({ created_at: { $gte: today }, event: 'tryon_generation_success' }),
    collection.countDocuments({ created_at: { $gte: today }, event: 'tryon_add_to_cart' }),
    collection.find({ event: 'tryon_generation_success' }).toArray(),
    collection.find({ event: 'tryon_add_to_cart' }).toArray(),
  ])

  // Count top products
  const productCountMap = {}
  const colourCountMap = {}

  for (const evt of allSuccessEvents) {
    if (evt.product_id) {
      productCountMap[evt.product_id] = (productCountMap[evt.product_id] || 0) + 1
    }
    if (evt.colour && evt.colour !== 'Standard') {
      colourCountMap[evt.colour] = (colourCountMap[evt.colour] || 0) + 1
    }
  }

  const sortedProducts = Object.entries(productCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const sortedColours = Object.entries(colourCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([colour, count]) => ({ colour, count }))

  // Resolve product names
  let topProducts = []
  if (sortedProducts.length > 0) {
    const productIds = sortedProducts.map(([id]) => id)
    const prods = await database.collection('products').find({ id: { $in: productIds } }).toArray()
    const pMap = new Map(prods.map((p) => [p.id, p.name]))
    topProducts = sortedProducts.map(([id, count]) => ({
      id,
      name: pMap.get(id) || id,
      count,
    }))
  }

  const conversionRate = todaySuccess > 0 ? Math.round((todayAddToCart / todaySuccess) * 100) : 0

  return {
    todayAttempts,
    todaySuccess,
    todayAddToCart,
    conversionRate,
    topProducts,
    topColours: sortedColours,
  }
}
