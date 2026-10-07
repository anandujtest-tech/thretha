import crypto from 'crypto'

export function createSignedActionToken({ id, purpose, secret, ttlSeconds = 60 * 60 * 24 * 30, now = Date.now() }) {
  if (!id || !purpose || !secret) throw new Error('Signed action token configuration is incomplete.')
  const payload = Buffer.from(JSON.stringify({ id: String(id), purpose: String(purpose), exp: Math.floor(now / 1000) + ttlSeconds })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifySignedActionToken(token, { purpose, secret, now = Date.now() }) {
  const [payload, signature, ...extra] = String(token || '').split('.')
  if (!payload || !signature || extra.length || !purpose || !secret) return null
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (decoded?.purpose !== purpose || typeof decoded.id !== 'string' || !decoded.id || !Number.isFinite(decoded.exp) || decoded.exp <= Math.floor(now / 1000)) return null
    return decoded.id
  } catch {
    return null
  }
}
