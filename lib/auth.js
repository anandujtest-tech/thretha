import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getActiveMobileSession, getMobileBearerToken } from './mobileSessions.js'
import { getSigningSecret } from './signingSecret.js'

export const CUSTOMER_COOKIE_NAME = 'tc_customer_session'

/**
 * Sign customer session JWT
 */
export function signCustomerToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: (user.email || '').toLowerCase().trim(),
      role: user.role || 'customer',
      name: user.name || '',
      iat: Math.floor(Date.now() / 1000),
    },
    getSigningSecret('customer'),
    {
      expiresIn: '30d',
      algorithm: 'HS256',
      issuer: 'threthacouture.com',
      audience: 'threthacouture-customer',
    }
  )
}

/**
 * Verify customer session JWT
 */
export function verifyCustomerToken(token) {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, getSigningSecret('customer'), {
      algorithms: ['HS256'],
      issuer: 'threthacouture.com',
      audience: 'threthacouture-customer',
    })
    return decoded
  } catch {
    // Fallback verification for tokens signed without explicit audience (backward-compatibility)
    try {
      return jwt.verify(token, getSigningSecret('customer'), { algorithms: ['HS256'] })
    } catch {
      return null
    }
  }
}

/**
 * Extract customer token from request (Cookie or Authorization header)
 */
export function extractCustomerToken(request) {
  // 1. Try HTTP-only cookie
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((pair) => pair.length === 2)
      .map(([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)])
  )

  if (cookies[CUSTOMER_COOKIE_NAME]) {
    return cookies[CUSTOMER_COOKIE_NAME]
  }

  // 2. Try Authorization Bearer header (fallback for mobile/API clients)
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return null
}

/**
 * Retrieve client IP address from request headers safely
 */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || '127.0.0.1'
}

/**
 * Retrieve authenticated customer object from request with status check
 */
export async function getCustomerFromRequest(request, database) {
  const authorization = request.headers.get('authorization') || ''
  let customerId
  if (authorization) {
    const mobileToken = getMobileBearerToken(request)
    if (mobileToken) {
      const session = await getActiveMobileSession(database, mobileToken)
      customerId = session?.customerId
    } else if (authorization.startsWith('Bearer tcm_')) {
      // Never let a malformed mobile credential fall back to a website cookie.
      return null
    } else {
      // Preserve the website's cookie-first behavior and legacy JWT Bearer use.
      customerId = verifyCustomerToken(extractCustomerToken(request))?.userId
    }
  } else {
    customerId = verifyCustomerToken(extractCustomerToken(request))?.userId
  }
  if (!customerId) return null

  const user = await database.collection('users').findOne({ id: customerId })
  if (!user) return null

  // Ensure account is not suspended or deleted
  if (user.status && user.status !== 'ACTIVE') {
    return null
  }

  return publicCustomer(user)
}

export function publicCustomer(user) {
  return {
    id: user.id,
    email: (user.email || '').toLowerCase().trim(),
    name: user.name || '',
    phone: user.phone || '',
    role: user.role || 'customer',
    image: user.image || null,
    emailVerified: user.emailVerified || null,
    createdAt: user.created_at || user.createdAt,
    status: user.status || 'ACTIVE',
  }
}

export function mobileAuthenticationResponse(session, user) {
  return {
    authenticated: true,
    token_type: 'Bearer',
    access_token: session.accessToken,
    expires_at: session.expiresAt.toISOString(),
    customer: publicCustomer(user),
  }
}

/**
 * Generate a cryptographically secure 6-digit OTP
 */
export function generateOtp() {
  return crypto.randomInt(100000, 999999).toString()
}

/**
 * Hash an OTP for secure storage
 */
export async function hashOtp(otp) {
  return bcrypt.hash(otp, 10)
}

/**
 * Verify an OTP against stored hash
 */
export async function verifyOtpHash(otp, hash) {
  if (!otp || !hash) return false
  return bcrypt.compare(otp, hash)
}

export async function verifyAndConsumeEmailOtp(database, email, otp, clientIp, rateLimiter = checkRateLimit) {
  if (!email || !otp || otp.length !== 6) {
    return { status: 400, error: 'Please enter the 6-digit verification code sent to your email.' }
  }

  // Retain the website's IP, email, expiry, attempt and single-use checks for
  // both website and mobile OTP verification.
  const ipCheck = await rateLimiter(database, `otp_verify_ip_${clientIp}`, 20, 10)
  const emailCheck = await rateLimiter(database, `otp_verify_email_${email}`, 10, 10)
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { status: 429, error: 'Too many incorrect attempts. Please request a new verification code.' }
  }

  const tokens = database.collection('verification_tokens')
  const tokenRecord = await tokens.findOne({ identifier: email })
  if (!tokenRecord || new Date() > new Date(tokenRecord.expires_at)) {
    if (tokenRecord) await tokens.deleteOne({ _id: tokenRecord._id })
    return { status: 400, error: 'Verification code has expired or is invalid. Please request a new code.' }
  }
  if (tokenRecord.attempts >= 5) {
    await tokens.deleteOne({ _id: tokenRecord._id })
    return { status: 400, error: 'Too many incorrect attempts. Please request a new verification code.' }
  }

  if (!await verifyOtpHash(otp, tokenRecord.token_hash)) {
    await tokens.updateOne({ _id: tokenRecord._id }, { $inc: { attempts: 1 } })
    const remainingAttempts = 5 - (tokenRecord.attempts + 1)
    return { status: 400, error: `Incorrect verification code. ${Math.max(0, remainingAttempts)} attempt(s) remaining.` }
  }

  // Consuming the record atomically prevents concurrent requests from issuing
  // two sessions for one code.
  const consumed = await tokens.findOneAndDelete({ _id: tokenRecord._id })
  if (!consumed || (!consumed.value && !consumed._id)) {
    return { status: 400, error: 'Verification code has already been consumed. Please request a new code.' }
  }
  return { ok: true }
}

/**
 * Generate PKCE code verifier and code challenge
 */
export function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/**
 * Generate secure OAuth state token including PKCE verifier
 */
export function generateOAuthState(redirectTo = '/account', codeVerifier = '') {
  const nonce = crypto.randomBytes(16).toString('hex')
  const payload = {
    nonce,
    redirectTo,
    codeVerifier,
    exp: Math.floor(Date.now() / 1000) + 10 * 60, // 10 minutes
  }
  return jwt.sign(payload, getSigningSecret('customer'), { algorithm: 'HS256' })
}

/**
 * Verify OAuth state token
 */
export function verifyOAuthState(state) {
  if (!state) return null
  try {
    return jwt.verify(state, getSigningSecret('customer'), { algorithms: ['HS256'] })
  } catch {
    return null
  }
}

/**
 * Safe internal redirect path validator (prevents open redirects & protocol-relative attacks)
 */
export function sanitizeInternalRedirect(target) {
  if (!target || typeof target !== 'string') return '/account'
  const trimmed = target.trim()
  // Must start with '/' but not '//' or '/\' to prevent protocol-relative and backslash domain bypasses
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed
  }
  return '/account'
}

/**
 * Derives the canonical browser-facing application base URL.
 * Priority:
 *  1. Explicit production URL / configuration (e.g. https://thretha.in)
 *  2. Request forwarded HTTPS host / protocol headers (ngrok tunnels & reverse proxies)
 *  3. Dedicated public tunnel configuration (CASHFREE_PUBLIC_URL / PUBLIC_APP_URL)
 *  4. Localhost development fallback (http://localhost:3000)
 */
export function getAppBaseUrl(request) {
  // Helper to read header safely from Headers instance, object, or Map
  const getHeader = (name) => {
    if (!request || !request.headers) return ''
    if (typeof request.headers.get === 'function') {
      return request.headers.get(name) || ''
    }
    return request.headers[name] || request.headers[name.toLowerCase()] || ''
  }

  // 1. Explicit production URL (e.g. Vercel, production deployment at https://thretha.in)
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_APP_URL &&
    !process.env.NEXT_PUBLIC_APP_URL.includes('localhost') &&
    !process.env.NEXT_PUBLIC_APP_URL.includes('0.0.0.0') &&
    !process.env.NEXT_PUBLIC_APP_URL.includes('127.0.0.1')
  ) {
    const fHost = (getHeader('x-forwarded-host') || getHeader('host') || '').split(',')[0].trim()
    if (
      fHost &&
      !fHost.includes('localhost') &&
      !fHost.includes('0.0.0.0') &&
      !fHost.includes('127.0.0.1')
    ) {
      const fProto = (getHeader('x-forwarded-proto') || 'https').split(',')[0].toLowerCase().trim()
      return `${fProto}://${fHost}`
    }
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')
  }

  // 2. Inspect request headers (handles ngrok tunnels, reverse proxies, and direct browser requests)
  if (request) {
    const forwardedHost = (
      getHeader('x-forwarded-host') ||
      getHeader('host') ||
      ''
    ).split(',')[0].trim()

    const rawProto = (
      getHeader('x-forwarded-proto') ||
      (typeof request.url === 'string' && request.url.startsWith('https') ? 'https' : 'http')
    ).split(',')[0].toLowerCase().trim()

    if (forwardedHost) {
      const isLocalhostHost =
        forwardedHost.includes('localhost') ||
        forwardedHost.includes('127.0.0.1') ||
        forwardedHost.includes('0.0.0.0')

      if (!isLocalhostHost) {
        // Public tunnel (e.g. tasting-stargazer-suffrage.ngrok-free.dev) or custom domain
        const proto = rawProto === 'http' && !forwardedHost.includes('.dev') && !forwardedHost.includes('ngrok') ? 'http' : 'https'
        return `${proto}://${forwardedHost}`
      }

      // Genuine direct localhost access
      const hostClean = forwardedHost
        .replace(/^0\.0\.0\.0(?::\d+)?$/, (match) => match.replace('0.0.0.0', 'localhost'))
        .replace(/^127\.0\.0\.1(?::\d+)?$/, (match) => match.replace('127.0.0.1', 'localhost'))

      return `${rawProto}://${hostClean}`
    }

    if (request.url && typeof request.url === 'string') {
      try {
        const u = new URL(request.url)
        if (
          u.hostname !== 'localhost' &&
          u.hostname !== '0.0.0.0' &&
          u.hostname !== '127.0.0.1'
        ) {
          return u.origin
        }
        if (u.hostname === '0.0.0.0' || u.hostname === '127.0.0.1') {
          u.hostname = 'localhost'
          return u.origin
        }
      } catch {
        // ignore parse error
      }
    }
  }

  // 3. Fallback to CASHFREE_PUBLIC_URL / PUBLIC_APP_URL if configured for tunnel environment
  const publicTunnelUrl = (
    process.env.CASHFREE_PUBLIC_URL ||
    process.env.CASHFREE_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    ''
  ).trim().replace(/\/+$/, '')

  if (
    publicTunnelUrl.startsWith('https://') &&
    !publicTunnelUrl.includes('localhost') &&
    !publicTunnelUrl.includes('0.0.0.0') &&
    !publicTunnelUrl.includes('127.0.0.1')
  ) {
    return publicTunnelUrl
  }

  // 4. Fallback to NEXT_PUBLIC_APP_URL
  const nextPublicAppUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (nextPublicAppUrl) {
    return nextPublicAppUrl
      .replace(/^http:\/\/0\.0\.0\.0(?::\d+)?$/, (m) => m.replace('0.0.0.0', 'localhost'))
      .replace(/^http:\/\/127\.0\.0\.1(?::\d+)?$/, (m) => m.replace('127.0.0.1', 'localhost'))
  }

  // 5. Default local development origin
  return 'http://localhost:3000'
}

/**
 * Rate Limiting helper with atomic MongoDB operations
 * Concurrency & distributed safe across multi-instance / serverless deployments
 */
export async function checkRateLimit(database, key, maxAttempts = 5, windowMinutes = 10) {
  const now = new Date()
  const windowMs = windowMinutes * 60 * 1000
  const rateLimitCol = database.collection('rate_limits')

  const existing = await rateLimitCol.findOne({ key })

  if (!existing || now.getTime() - new Date(existing.firstAttempt).getTime() > windowMs) {
    // Reset or start new window atomically
    await rateLimitCol.updateOne(
      { key },
      {
        $set: {
          count: 1,
          firstAttempt: now,
          lastAttempt: now,
          expiresAt: new Date(now.getTime() + windowMs),
        },
      },
      { upsert: true }
    )
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (existing.count >= maxAttempts) {
    const elapsed = now.getTime() - new Date(existing.firstAttempt).getTime()
    const resetInMinutes = Math.max(1, Math.ceil((windowMs - elapsed) / 60000))
    return { allowed: false, remaining: 0, resetInMinutes }
  }

  // Atomically increment counter
  const result = await rateLimitCol.findOneAndUpdate(
    { key, count: { $lt: maxAttempts } },
    {
      $inc: { count: 1 },
      $set: { lastAttempt: now },
    },
    { returnDocument: 'after', includeResultMetadata: true }
  )

  if (!result || !result.value) {
    // Over limit hit simultaneously
    const elapsed = now.getTime() - new Date(existing.firstAttempt).getTime()
    return { allowed: false, remaining: 0, resetInMinutes: Math.max(1, Math.ceil((windowMs - elapsed) / 60000)) }
  }

  return { allowed: true, remaining: Math.max(0, maxAttempts - result.value.count) }
}

/**
 * Database index initialization
 */
export async function ensureAuthIndexes(database) {
  try {
    // 1. Users email unique index
    await database.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true })

    // 2. Accounts provider + providerAccountId compound unique index
    await database.collection('accounts').createIndex({ provider: 1, providerAccountId: 1 }, { unique: true })
    await database.collection('accounts').createIndex({ userId: 1 })

    // 3. Verification tokens index with TTL
    await database.collection('verification_tokens').createIndex({ identifier: 1 })
    await database.collection('verification_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })

    // 4. Addresses userId index
    await database.collection('addresses').createIndex({ userId: 1 })

    // 5. Wishlists userId + slug unique compound index
    try {
      const existingWishIndexes = await database.collection('wishlists').indexes()
      if (existingWishIndexes.some((i) => i.name === 'userId_1_productId_1')) {
        await database.collection('wishlists').dropIndex('userId_1_productId_1')
      }
    } catch {
      // index might not exist
    }
    await database.collection('wishlists').createIndex({ userId: 1, slug: 1 }, { unique: true, sparse: true })
    await database.collection('wishlists').createIndex({ userId: 1 })

    // 6. Orders userId index & unique order_number & payment identifiers
    await database.collection('orders').createIndex({ userId: 1 }, { sparse: true })
    await database.collection('orders').createIndex({ order_number: 1 }, { unique: true, sparse: true })
    await database.collection('orders').createIndex({ cashfree_order_id: 1 }, { sparse: true })
    await database.collection('orders').createIndex({ 'payment.cashfree_order_id': 1 }, { sparse: true })

    // 7. Rate limits TTL index
    await database.collection('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await database.collection('rate_limits').createIndex({ key: 1 }, { unique: true })
  } catch (err) {
    // Indexes may already exist
    console.warn('[DB] Index creation notice:', err.message)
  }
}
