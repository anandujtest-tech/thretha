import crypto from 'node:crypto'

const MOBILE_TOKEN_PREFIX = 'tcm_'
const MOBILE_TOKEN_PATTERN = /^tcm_[A-Za-z0-9_-]{43}$/
const MOBILE_SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000
const LAST_USED_UPDATE_INTERVAL_MS = 15 * 60 * 1000
const COLLECTION = 'customer_mobile_sessions'

export function getMobileBearerToken(request) {
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7)
  return MOBILE_TOKEN_PATTERN.test(token) ? token : null
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function ensureMobileSessionIndexes(database) {
  const sessions = database.collection(COLLECTION)
  await sessions.createIndex({ tokenHash: 1 }, { unique: true })
  await sessions.createIndex({ customerId: 1, createdAt: -1 })
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}

export async function createMobileSession(database, customerId) {
  if (!customerId) throw new Error('A customer is required for a mobile session.')
  await ensureMobileSessionIndexes(database)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + MOBILE_SESSION_LIFETIME_MS)
  const accessToken = `${MOBILE_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
  await database.collection(COLLECTION).insertOne({
    id: crypto.randomUUID(),
    customerId,
    tokenHash: hashToken(accessToken),
    client: 'mobile',
    createdAt: now,
    expiresAt,
    revokedAt: null,
    lastUsedAt: null,
  })
  return { accessToken, expiresAt }
}

export async function getActiveMobileSession(database, token) {
  if (!MOBILE_TOKEN_PATTERN.test(token || '')) return null
  const now = new Date()
  const sessions = database.collection(COLLECTION)
  const session = await sessions.findOne({
    tokenHash: hashToken(token),
    client: 'mobile',
    revokedAt: null,
    expiresAt: { $gt: now },
  })
  if (!session) return null
  if (!session.lastUsedAt || now.getTime() - new Date(session.lastUsedAt).getTime() >= LAST_USED_UPDATE_INTERVAL_MS) {
    const activityUpdate = await sessions.updateOne(
      { id: session.id, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { lastUsedAt: now } },
    )
    if (!activityUpdate.matchedCount) return null
  }
  return session
}

export async function revokeMobileSession(database, token) {
  if (!MOBILE_TOKEN_PATTERN.test(token || '')) return false
  const now = new Date()
  const result = await database.collection(COLLECTION).updateOne(
    { tokenHash: hashToken(token), client: 'mobile', revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
  )
  return result.matchedCount === 1
}
