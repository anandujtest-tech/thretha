import crypto from 'crypto'
import { sendEmail } from './email.js'
import { getProductAvailableStock, getProductVariant, isProductVariantAvailable } from './productInventory.js'
import { createSignedActionToken, verifySignedActionToken } from './signedActionToken.js'

export async function ensureBackInStockIndexes(database) {
  const collection = database.collection('back_in_stock_subscriptions')
  await Promise.all([
    collection.createIndex({ product_id: 1, variant_key: 1, email_normalized: 1 }, { unique: true }),
    collection.createIndex({ status: 1, retry_after: 1 }),
    collection.createIndex({ product_id: 1, created_at: -1 }),
  ])
}

export function isVariantAvailable(product, size = '') {
  return isProductVariantAvailable(product, size)
}

export function backInStockUnsubscribeToken(id, secret) {
  const signature = crypto.createHmac('sha256', secret).update(String(id)).digest('base64url')
  return `${id}.${signature}`
}

export function verifyBackInStockUnsubscribeToken(token, secret) {
  const [id, signature] = String(token || '').split('.')
  if (!id || !signature || !secret) return null
  const expected = backInStockUnsubscribeToken(id, secret).split('.')[1]
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  return id
}

export function createBackInStockUnsubscribeToken(id, secret, now = Date.now()) {
  return createSignedActionToken({ id, purpose: 'back-in-stock-unsubscribe', secret, ttlSeconds: 60 * 60 * 24 * 365, now })
}

export function verifySignedBackInStockUnsubscribeToken(token, secret, now = Date.now()) {
  return verifySignedActionToken(token, { purpose: 'back-in-stock-unsubscribe', secret, now })
}

export async function saveBackInStockSubscription(database, { product, email, size = '', consent, now = new Date() }) {
  if (consent !== true) return { ok: false, status: 400, error: 'Please consent to receive a back-in-stock email.' }
  const subscriptions = database.collection('back_in_stock_subscriptions')
  const normalizedSize = String(size || '').trim()
  const variantKey = normalizedSize.toLowerCase() || 'all'
  const existing = await subscriptions.findOne({ product_id: product.id, variant_key: variantKey, email_normalized: email })
  const deliveryKey = crypto.randomUUID()
  if (existing) {
    await subscriptions.updateOne(
      { id: existing.id },
      { $set: { status: 'waiting', size: normalizedSize || null, attempts: 0, delivery_key: deliveryKey, consented_at: now, updated_at: now }, $unset: { retry_after: '', last_error: '', closed_reason: '', closed_at: '', notified_at: '', unsubscribed_at: '' } },
    )
    return { ok: true, id: existing.id, reactivated: true }
  }
  const subscription = {
    id: crypto.randomUUID(), product_id: product.id, product_slug: product.slug, variant_key: variantKey,
    size: normalizedSize || null, email_normalized: email, email, status: 'waiting', attempts: 0,
    delivery_key: deliveryKey, consented_at: now, created_at: now, updated_at: now,
  }
  try {
    await subscriptions.insertOne(subscription)
    return { ok: true, id: subscription.id, reactivated: false }
  } catch (error) {
    if (error?.code !== 11000) throw error
    const result = await subscriptions.updateOne(
      { product_id: product.id, variant_key: variantKey, email_normalized: email },
      { $set: { status: 'waiting', size: normalizedSize || null, attempts: 0, delivery_key: crypto.randomUUID(), consented_at: now, updated_at: now }, $unset: { retry_after: '', last_error: '', closed_reason: '', closed_at: '', notified_at: '', unsubscribed_at: '' } },
    )
    if (!result.matchedCount) throw error
    const duplicate = await subscriptions.findOne({ product_id: product.id, variant_key: variantKey, email_normalized: email }, { projection: { id: 1 } })
    return { ok: true, id: duplicate?.id, reactivated: true }
  }
}

export async function unsubscribeBackInStockSubscription(database, id, now = new Date()) {
  const subscriptions = database.collection('back_in_stock_subscriptions')
  const result = await subscriptions.updateOne(
    { id, status: { $ne: 'unsubscribed' } },
    { $set: { status: 'unsubscribed', unsubscribed_at: now, updated_at: now } },
  )
  if (result.matchedCount) return { found: true, unsubscribed: true }
  const existing = await subscriptions.findOne({ id }, { projection: { _id: 1 } })
  return existing ? { found: true, unsubscribed: true } : { found: false, unsubscribed: false }
}

export async function processBackInStockSubscriptions(database, { appUrl, secret, sendEmailFn = sendEmail, nowFn = () => new Date() }) {
  const collection = database.collection('back_in_stock_subscriptions')
  const now = nowFn()
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000)
  const idempotencyWindowStart = new Date(now.getTime() - 23 * 60 * 60 * 1000)
  await Promise.all([
    collection.updateMany(
      { status: 'sending', claimed_at: { $lte: staleBefore, $gte: idempotencyWindowStart } },
      { $set: { status: 'waiting', retry_after: now, lease_recovered_at: now }, $unset: { claimed_at: '', claim_token: '' } },
    ),
    collection.updateMany(
      { status: 'sending', claimed_at: { $lt: idempotencyWindowStart } },
      { $set: { status: 'delivery_unknown', closed_reason: 'stale_send_outside_idempotency_window', closed_at: now }, $unset: { claimed_at: '', claim_token: '' } },
    ),
  ])
  const waiting = await collection.find({
    status: 'waiting',
    $or: [{ retry_after: { $exists: false } }, { retry_after: { $lte: now } }],
  }).sort({ created_at: 1 }).limit(10).toArray()
  let notified = 0
  let failed = 0
  let closed = 0
  for (const sub of waiting) {
    const product = await database.collection('products').findOne({ id: sub.product_id }, { projection: { id: 1, name: 1, slug: 1, active: 1, stock: 1, sizes: 1 } })
    if (!product || product.active === false) {
      const result = await collection.updateOne({ id: sub.id, status: 'waiting' }, { $set: { status: 'unavailable', closed_reason: product ? 'product_inactive' : 'product_deleted', closed_at: now } })
      if (result.modifiedCount) closed += 1
      continue
    }
    if (sub.size && !getProductVariant(product, sub.size)) {
      const result = await collection.updateOne({ id: sub.id, status: 'waiting' }, { $set: { status: 'unavailable', closed_reason: 'variant_removed', closed_at: now } })
      if (result.modifiedCount) closed += 1
      continue
    }
    if (!isVariantAvailable(product, sub.size)) continue

    const claimToken = crypto.randomUUID()
    const deliveryKey = sub.delivery_key || crypto.randomUUID()
    const claim = await collection.updateOne(
      { id: sub.id, status: 'waiting', retry_after: sub.retry_after ?? { $exists: false } },
      { $set: { status: 'sending', claimed_at: now, claim_token: claimToken, delivery_key: deliveryKey } },
    )
    if (!claim.modifiedCount) continue

    const unsubscribe = `${appUrl.replace(/\/$/, '')}/back-in-stock/unsubscribe?token=${encodeURIComponent(createBackInStockUnsubscribeToken(sub.id, secret))}`
    const title = product.name || 'your saved piece'
    const variantStock = getProductAvailableStock(product, sub.size)
    try {
      await sendEmailFn({
        to: sub.email,
        subject: `${title} is back in stock`,
        text: `${title}${sub.size ? ` in size ${sub.size}` : ''} is available again. Shop it here: ${appUrl}/product/${encodeURIComponent(product.slug)}\n\nUnsubscribe from this alert: ${unsubscribe}`,
        html: `<p>${escapeHtml(title)}${sub.size ? ` in size ${escapeHtml(sub.size)}` : ''} is available again.</p><p><a href="${appUrl.replace(/\/$/, '')}/product/${encodeURIComponent(product.slug)}">Shop now</a></p><p><a href="${unsubscribe}">Unsubscribe from this alert</a></p>`,
        idempotencyKey: `back-in-stock/${deliveryKey}`,
      })
      await collection.updateOne(
        { id: sub.id, status: 'sending', claim_token: claimToken },
        { $set: { status: 'notified', notified_at: nowFn(), notified_stock: variantStock }, $unset: { claimed_at: '', claim_token: '', retry_after: '' } },
      )
      notified += 1
    } catch (error) {
      if (error?.status === 409 && error?.code === 'invalid_idempotent_request') {
        await collection.updateOne(
          { id: sub.id, status: 'sending', claim_token: claimToken },
          { $set: { status: 'delivery_unknown', closed_reason: 'provider_idempotency_payload_conflict', closed_at: nowFn() }, $unset: { claimed_at: '', claim_token: '' } },
        )
        closed += 1
        continue
      }
      const attempts = Number(sub.attempts || 0) + 1
      const update = {
        $set: { status: attempts >= 5 ? 'failed' : 'waiting', attempts, last_error: String(error?.message || 'Email delivery failed').slice(0, 200) },
        $unset: { claimed_at: '', claim_token: '' },
      }
      if (attempts >= 5) update.$unset.retry_after = ''
      else update.$set.retry_after = new Date(nowFn().getTime() + 10 * 60 * 1000)
      await collection.updateOne({ id: sub.id, status: 'sending', claim_token: claimToken }, update)
      failed += 1
    }
  }
  return { checked: waiting.length, notified, failed, closed }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
