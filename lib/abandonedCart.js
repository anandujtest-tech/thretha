import crypto from 'crypto'
import { sendEmail } from './email.js'
import { getProductAvailableStock, getProductVariant, isProductVariantAvailable } from './productInventory.js'
import { createSignedActionToken, verifySignedActionToken } from './signedActionToken.js'
import { backInStockUnsubscribeToken, verifyBackInStockUnsubscribeToken } from './backInStock.js'

export { backInStockUnsubscribeToken, verifyBackInStockUnsubscribeToken }

export async function ensureAbandonedCartIndexes(database) {
  const collection = database.collection('abandoned_cart_reminders')
  await Promise.all([
    collection.createIndex({ cart_key: 1 }, { unique: true }),
    collection.createIndex({ status: 1, remind_after: 1 }),
    collection.createIndex({ email_normalized: 1, created_at: -1 }),
  ])
}

export function createCartKey(email, items) {
  const canonical = items.map((item) => `${item.id}:${item.size || ''}:${item.quantity}`).sort().join('|')
  return crypto.createHash('sha256').update(`${email}|${canonical}`).digest('hex')
}

export function createCartRecoveryToken(id, secret, createdAt = new Date()) {
  return createSignedActionToken({ id, purpose: 'abandoned-cart-recovery', secret, ttlSeconds: 60 * 60 * 24 * 30, now: new Date(createdAt).getTime() })
}

export function verifyCartRecoveryToken(token, secret, now = Date.now()) {
  return verifySignedActionToken(token, { purpose: 'abandoned-cart-recovery', secret, now })
}

export async function processAbandonedCartReminders(database, { appUrl, secret, sendEmailFn = sendEmail, nowFn = () => new Date() }) {
  const collection = database.collection('abandoned_cart_reminders')
  const now = nowFn()
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000)
  const idempotencyWindowStart = new Date(now.getTime() - 23 * 60 * 60 * 1000)
  await Promise.all([
    collection.updateMany(
      { status: 'sending', claimed_at: { $lte: staleBefore, $gte: idempotencyWindowStart } },
      { $set: { status: 'pending', retry_after: now, lease_recovered_at: now }, $unset: { claimed_at: '', claim_token: '' } },
    ),
    collection.updateMany(
      { status: 'sending', claimed_at: { $lt: idempotencyWindowStart } },
      { $set: { status: 'delivery_unknown', closed_reason: 'stale_send_outside_idempotency_window', closed_at: now }, $unset: { claimed_at: '', claim_token: '' } },
    ),
  ])
  const pending = await collection.find({ status: 'pending', remind_after: { $lte: now }, $or: [{ retry_after: { $exists: false } }, { retry_after: { $lte: now } }] }).sort({ remind_after: 1 }).limit(10).toArray()
  let sent = 0
  let skippedPurchased = 0
  let unavailable = 0
  let failed = 0
  for (const reminder of pending) {
    const products = await database.collection('products').find(
      { id: { $in: reminder.items.map((item) => item.id) } },
      { projection: { id: 1, slug: 1, name: 1, active: 1, stock: 1, price: 1, discount_price: 1, media: 1, image: 1, sizes: 1 } },
    ).toArray()
    const productById = new Map(products.map((product) => [String(product.id), product]))
    const items = reminder.items.flatMap((item) => {
      const product = productById.get(String(item.id))
      if (!product || product.active === false) return []
      if (item.size && Array.isArray(product.sizes) && product.sizes.length && !getProductVariant(product, item.size)) return []
      if (!isProductVariantAvailable(product, item.size || '')) return []
      const stock = getProductAvailableStock(product, item.size || '')
      return [{
        ...item,
        id: product.id,
        name: product.name || item.name,
        path: `/product/${encodeURIComponent(product.slug)}`,
        stock,
      }]
    })
    if (!items.length) {
      const result = await collection.updateOne(
        { id: reminder.id, status: 'pending', remind_after: { $lte: now } },
        { $set: { status: 'unavailable', items: [], closed_reason: 'no_purchasable_items', closed_at: now } },
      )
      if (result.modifiedCount) unavailable += 1
      continue
    }

    const escapedEmail = reminder.email_normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const itemIds = [...new Set(items.map((item) => item.id))]
    const purchase = await database.collection('orders').findOne({
      created_at: { $gte: reminder.created_at },
      'customer.email': { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
      'items.product_id': { $in: itemIds },
      $or: [
        { payment_status: 'PAID', status: { $ne: 'CANCELLED' } },
        { status: 'DELIVERED' },
      ],
    }, { projection: { _id: 1 } })
    if (purchase) {
      const result = await collection.updateOne({ id: reminder.id, status: 'pending' }, { $set: { status: 'converted', converted_at: now } })
      if (result.modifiedCount) skippedPurchased += 1
      continue
    }

    const claimToken = crypto.randomUUID()
    const deliveryKey = reminder.delivery_key || crypto.randomUUID()
    const claim = await collection.updateOne(
      { id: reminder.id, status: 'pending', remind_after: { $lte: now }, $or: [{ retry_after: { $exists: false } }, { retry_after: { $lte: now } }] },
      { $set: { status: 'sending', claimed_at: now, claim_token: claimToken, delivery_key: deliveryKey, items, validated_at: now } },
    )
    if (!claim.modifiedCount) continue

    const baseUrl = appUrl.replace(/\/$/, '')
    const unsubscribe = `${baseUrl}/api/abandoned-cart/unsubscribe?token=${encodeURIComponent(backInStockUnsubscribeToken(reminder.id, secret))}`
    const recoveryToken = reminder.recovery_token || createCartRecoveryToken(reminder.id, secret, reminder.created_at)
    const recovery = `${baseUrl}/cart/recover?token=${encodeURIComponent(recoveryToken)}`
    const productLines = items.map((item) => `${item.name}${item.size ? ` (${item.size})` : ''} × ${item.quantity}`).join('\n')
    const links = items.map((item) => `<li><a href="${baseUrl}${item.path}">${escapeHtml(item.name)}</a>${item.size ? ` · ${escapeHtml(item.size)}` : ''} × ${item.quantity}</li>`).join('')
    try {
      await sendEmailFn({
        to: reminder.email,
        subject: 'A few lovely pieces are still in your bag',
        text: `Your Thretha bag is waiting:\n${productLines}\n\nRestore your bag on any device: ${recovery}\n\nUnsubscribe: ${unsubscribe}`,
        html: `<p>Your Thretha bag is waiting when you are ready.</p><ul>${links}</ul><p><a href="${recovery}">Restore your bag on any device</a></p><p><a href="${unsubscribe}">Unsubscribe from cart reminders</a></p>`,
        idempotencyKey: `abandoned-cart/${deliveryKey}`,
      })
      await collection.updateOne(
        { id: reminder.id, status: 'sending', claim_token: claimToken },
        { $set: { status: 'sent', sent_at: nowFn(), recovery_token: recoveryToken }, $unset: { claimed_at: '', claim_token: '', retry_after: '' } },
      )
      sent += 1
    } catch (error) {
      if (error?.status === 409 && error?.code === 'invalid_idempotent_request') {
        await collection.updateOne(
          { id: reminder.id, status: 'sending', claim_token: claimToken },
          { $set: { status: 'delivery_unknown', closed_reason: 'provider_idempotency_payload_conflict', closed_at: nowFn() }, $unset: { claimed_at: '', claim_token: '' } },
        )
        unavailable += 1
        continue
      }
      const attempts = Number(reminder.attempts || 0) + 1
      const update = {
        $set: { status: attempts >= 5 ? 'failed' : 'pending', attempts, last_error: String(error?.message || 'Delivery failed').slice(0, 180) },
        $unset: { claimed_at: '', claim_token: '' },
      }
      if (attempts >= 5) update.$unset.retry_after = ''
      else update.$set.retry_after = new Date(nowFn().getTime() + 10 * 60 * 1000)
      await collection.updateOne({ id: reminder.id, status: 'sending', claim_token: claimToken }, update)
      failed += 1
    }
  }
  return { checked: pending.length, sent, skippedPurchased, unavailable, failed }
}

export async function getCartRecoveryItems(database, reminderId) {
  const reminder = await database.collection('abandoned_cart_reminders').findOne({ id: reminderId, status: 'sent' }, { projection: { items: 1 } })
  if (!reminder) return null
  const products = await database.collection('products').find(
    { id: { $in: (reminder.items || []).map((item) => item.id) } },
    { projection: { id: 1, slug: 1, name: 1, active: 1, stock: 1, price: 1, discount_price: 1, colour: 1, media: 1, image: 1, sizes: 1 } },
  ).toArray()
  const productById = new Map(products.map((product) => [String(product.id), product]))
  return (reminder.items || []).flatMap((item) => {
    const product = productById.get(String(item.id))
    if (!product || product.active === false) return []
    if (item.size && Array.isArray(product.sizes) && product.sizes.length && !getProductVariant(product, item.size)) return []
    const stock = getProductAvailableStock(product, item.size || '')
    if (!isProductVariantAvailable(product, item.size || '') || stock <= 0) return []
    const media = Array.isArray(product.media) ? product.media : []
    const image = media.find((entry) => entry.is_primary)?.url || media.find((entry) => entry.type !== 'video')?.url || product.image || ''
    return [{
      product_id: String(product.id), product_name: product.name, slug: product.slug,
      price: Number(product.discount_price || product.price) || 0, original_price: Number(product.price) || 0,
      image, size: item.size || 'Free Size', colour: product.colour || '', stock,
      quantity: Math.min(Math.max(1, Number(item.quantity) || 1), stock),
    }]
  })
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
