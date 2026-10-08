import crypto from 'node:crypto'
import { randomUUID } from 'node:crypto'

const STATE_COLLECTION = 'customer_mobile_google_states'
const HANDOFF_COLLECTION = 'customer_mobile_google_handoffs'
const STATE_LIFETIME_MS = 10 * 60 * 1000
const HANDOFF_LIFETIME_MS = 2 * 60 * 1000
const OPAQUE_CODE = /^[A-Za-z0-9_-]{43}$/

const digest = (value) => crypto.createHash('sha256').update(value).digest('base64url')
const randomCode = () => crypto.randomBytes(32).toString('base64url')

export class MobileGoogleAuthError extends Error {
  constructor(code, status = 400) {
    super(code)
    this.code = code
    this.status = status
  }
}

function validAppRedirect(value) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash || url.search) return false
    if (url.protocol === 'https:') return Boolean(url.hostname)
    // Reverse-DNS custom scheme; exact configured value is still required.
    return /^[a-z][a-z0-9+.-]*\.[a-z0-9.-]+:$/.test(url.protocol)
  } catch { return false }
}

export function mobileGoogleConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  const callbackUri = env.GOOGLE_MOBILE_CALLBACK_URL
  const appRedirectUri = env.GOOGLE_MOBILE_APP_REDIRECT_URI
  let callback
  try { callback = new URL(callbackUri) } catch { /* invalid configuration */ }
  if (!clientId || !clientSecret || !callback ||
    (callback.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && callback.hostname === 'localhost')) ||
    callback.pathname !== '/api/auth/google/mobile/callback' || callback.search || callback.hash ||
    !validAppRedirect(appRedirectUri)) {
    throw new MobileGoogleAuthError('mobile_google_not_configured', 503)
  }
  return { clientId, clientSecret, callbackUri: callback.toString(), appRedirectUri }
}

export async function startMobileGoogleAuth(database, config, requestedRedirect, handoffChallenge) {
  if (requestedRedirect && requestedRedirect !== config.appRedirectUri) {
    throw new MobileGoogleAuthError('unsupported_redirect_uri')
  }
  if (!OPAQUE_CODE.test(handoffChallenge || '')) {
    throw new MobileGoogleAuthError('invalid_pkce_challenge')
  }
  const states = database.collection(STATE_COLLECTION)
  await states.createIndex({ stateHash: 1 }, { unique: true })
  await states.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  const state = randomCode()
  const verifier = randomCode()
  const now = new Date()
  await states.insertOne({
    stateHash: digest(state), client: 'mobile', platform: 'native',
    codeVerifier: verifier, googleChallenge: digest(verifier),
    handoffChallenge, callbackUri: config.callbackUri,
    appRedirectUri: config.appRedirectUri, createdAt: now,
    expiresAt: new Date(now.getTime() + STATE_LIFETIME_MS),
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  for (const [key, value] of Object.entries({
    client_id: config.clientId, redirect_uri: config.callbackUri,
    response_type: 'code', scope: 'openid email profile', state,
    code_challenge: digest(verifier), code_challenge_method: 'S256',
    prompt: 'select_account',
  })) url.searchParams.set(key, value)
  return { authorization_url: url.toString(), state, redirect_uri: config.callbackUri }
}

export async function consumeMobileGoogleState(database, config, state) {
  if (!OPAQUE_CODE.test(state || '')) throw new MobileGoogleAuthError('invalid_state')
  const result = await database.collection(STATE_COLLECTION).findOneAndDelete({
    stateHash: digest(state), client: 'mobile', platform: 'native',
    callbackUri: config.callbackUri, appRedirectUri: config.appRedirectUri,
    expiresAt: { $gt: new Date() },
  })
  const record = result?.value ?? result
  if (!record?.codeVerifier || digest(record.codeVerifier) !== record.googleChallenge) {
    throw new MobileGoogleAuthError('invalid_state')
  }
  return record
}

export async function exchangeMobileGoogleCode(config, code, stateRecord, fetchImpl = fetch) {
  if (!code || typeof code !== 'string') throw new MobileGoogleAuthError('missing_code')
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.clientId,
      client_secret: config.clientSecret, redirect_uri: stateRecord.callbackUri,
      grant_type: 'authorization_code', code_verifier: stateRecord.codeVerifier }),
  })
  if (!response.ok) throw new MobileGoogleAuthError('google_exchange_failed', 401)
  const token = await response.json()
  if (!token.access_token) throw new MobileGoogleAuthError('google_exchange_failed', 401)
  const profileResponse = await fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!profileResponse.ok) throw new MobileGoogleAuthError('invalid_google_identity', 401)
  const profile = await profileResponse.json()
  if (!profile.id || !profile.email || profile.verified_email !== true) {
    throw new MobileGoogleAuthError('invalid_google_identity', 401)
  }
  return profile
}

export async function findOrCreateMobileGoogleCustomer(database, profile) {
  if (!profile?.id || !profile?.email || profile.verified_email !== true) {
    throw new MobileGoogleAuthError('invalid_google_identity', 401)
  }
  const email = String(profile.email).trim().toLowerCase()
  const now = new Date()
  const accounts = database.collection('accounts')
  const users = database.collection('users')
  const linked = await accounts.findOne({ provider: 'google', providerAccountId: profile.id })
  let user = linked?.userId ? await users.findOne({ id: linked.userId }) : null
  if (linked && !user) throw new MobileGoogleAuthError('invalid_google_identity', 401)
  if (!user) user = await users.findOne({ email })
  if (user?.status && user.status !== 'ACTIVE') throw new MobileGoogleAuthError('account_unavailable', 403)
  if (!user) {
    user = { id: randomUUID(), email, name: profile.name || email.split('@')[0],
      image: profile.picture || null, phone: '', role: 'customer', status: 'ACTIVE',
      emailVerified: now, created_at: now, updated_at: now, last_login_at: now }
    await users.insertOne(user)
  } else {
    const update = { emailVerified: user.emailVerified || now, last_login_at: now, updated_at: now }
    if (!user.name && profile.name) update.name = profile.name
    if (!user.image && profile.picture) update.image = profile.picture
    await users.updateOne({ id: user.id }, { $set: update })
  }
  await accounts.updateOne({ provider: 'google', providerAccountId: profile.id }, {
    $set: { userId: user.id, provider: 'google', providerAccountId: profile.id, updated_at: now },
    $setOnInsert: { created_at: now },
  }, { upsert: true })
  // Match the website callback's historical guest-order claim for this verified email.
  await database.collection('orders').updateMany({
    $or: [{ userId: null }, { userId: { $exists: false } }, { userId: '' }],
    'customer.email': { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }, { $set: { userId: user.id, updated_at: now } })
  return user
}

export async function createMobileGoogleHandoff(database, stateRecord, customerId) {
  const handoffs = database.collection(HANDOFF_COLLECTION)
  await handoffs.createIndex({ codeHash: 1 }, { unique: true })
  await handoffs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  const code = randomCode()
  const now = new Date()
  await handoffs.insertOne({ codeHash: digest(code), customerId,
    handoffChallenge: stateRecord.handoffChallenge,
    appRedirectUri: stateRecord.appRedirectUri, client: 'mobile',
    createdAt: now, expiresAt: new Date(now.getTime() + HANDOFF_LIFETIME_MS) })
  const redirect = new URL(stateRecord.appRedirectUri)
  redirect.searchParams.set('code', code)
  return redirect.toString()
}

export async function consumeMobileGoogleHandoff(database, config, code, verifier) {
  if (!OPAQUE_CODE.test(code || '') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier || '')) {
    throw new MobileGoogleAuthError('invalid_handoff')
  }
  const result = await database.collection(HANDOFF_COLLECTION).findOneAndDelete({
    codeHash: digest(code), handoffChallenge: digest(verifier),
    appRedirectUri: config.appRedirectUri, client: 'mobile',
    expiresAt: { $gt: new Date() },
  })
  const record = result?.value ?? result
  if (!record?.customerId) throw new MobileGoogleAuthError('invalid_handoff')
  return record.customerId
}
