import { createSignedActionToken, verifySignedActionToken } from './signedActionToken.js'

export function normalizeNewsletterEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function isValidNewsletterEmail(value) {
  const email = normalizeNewsletterEmail(value)
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function ensureNewsletterIndexes(database) {
  await database.collection('newsletter_subscribers').createIndex({ email_normalized: 1 }, { unique: true })
  await database.collection('newsletter_subscribers').createIndex({ status: 1, created_at: -1 }, { name: 'newsletter_status_created' })
}

export function createNewsletterUnsubscribeToken(id, secret, now = Date.now()) {
  return createSignedActionToken({ id, purpose: 'newsletter-unsubscribe', secret, ttlSeconds: 60 * 60 * 24 * 365, now })
}

export function verifyNewsletterUnsubscribeToken(token, secret, now = Date.now()) {
  return verifySignedActionToken(token, { purpose: 'newsletter-unsubscribe', secret, now })
}
