import crypto from 'node:crypto'
import { recordCouponUsage, revertCouponUsage } from './promotions.js'
import { dispatchOrderNotifications } from './notifications.js'
import { recordComboSaleStats } from './combos.js'

/**
 * Cashfree Payments Helper for Thretha Couture
 * Production-ready integration for Cashfree Payment Gateway (API Version 2023-08-01)
 */

export function isCashfreeConfigured() {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY)
}

export function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID?.trim()
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim()
  let env = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase().trim()

  // Auto-detect production vs sandbox key prefix to prevent mismatch errors
  if (secretKey?.startsWith('cfsk_ma_prod_')) {
    env = 'production'
  } else if (secretKey?.startsWith('cfsk_ma_test_')) {
    env = 'sandbox'
  }

  const apiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01'

  const baseUrl =
    env === 'production' || env === 'prod'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

  return {
    appId,
    secretKey,
    env,
    baseUrl,
    apiVersion,
    isConfigured: Boolean(appId && secretKey),
  }
}

/**
 * Resolves and validates the public HTTPS base URL for Cashfree payment gateways.
 * Cashfree strictly requires order_meta.return_url and order_meta.notify_url to be HTTPS.
 */
export function getCashfreePublicBaseUrl() {
  // 1. Check dedicated Cashfree public URL from environment
  const customPublicUrl = (
    process.env.CASHFREE_PUBLIC_URL ||
    process.env.CASHFREE_PUBLIC_APP_URL ||
    ''
  ).trim().replace(/\/+$/, '')

  if (customPublicUrl) {
    if (!customPublicUrl.startsWith('https://')) {
      throw new Error(
        `CASHFREE_PUBLIC_URL must use HTTPS (received "${customPublicUrl}"). Please configure a valid HTTPS URL (e.g. https://your-tunnel.ngrok-free.app or https://thretha.in).`
      )
    }
    if (
      customPublicUrl.includes('localhost') ||
      customPublicUrl.includes('127.0.0.1') ||
      customPublicUrl.includes('0.0.0.0')
    ) {
      throw new Error(
        `CASHFREE_PUBLIC_URL cannot be localhost/127.0.0.1/0.0.0.0 (received "${customPublicUrl}"). Cashfree requires a public HTTPS tunnel domain or production domain.`
      )
    }
    return customPublicUrl
  }

  // 2. Check NEXT_PUBLIC_APP_URL if it is HTTPS and not localhost/127.0.0.1/0.0.0.0
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (
    appUrl.startsWith('https://') &&
    !appUrl.includes('localhost') &&
    !appUrl.includes('127.0.0.1') &&
    !appUrl.includes('0.0.0.0')
  ) {
    return appUrl
  }

  // 3. In production mode, default to canonical production domain
  const { env } = getCashfreeConfig()
  if (env === 'production' || process.env.NODE_ENV === 'production') {
    return 'https://thretha.in'
  }

  // 4. In local / sandbox environment without valid public HTTPS configured
  throw new Error(
    'Cashfree requires a public HTTPS return URL. Please set CASHFREE_PUBLIC_URL=https://<your-tunnel-domain> in .env.local (e.g. using ngrok or cloudflared) or CASHFREE_PUBLIC_URL=https://thretha.in for production.'
  )
}

/**
 * Authoritatively generates a unique, Cashfree-compliant order ID linked to the internal order number.
 * Cashfree requires order_id to be alphanumeric, hyphens, and underscores (max 50 chars).
 */
export function generateCashfreeOrderId(orderNumber) {
  const cleanOrderNumber = String(orderNumber || 'TC').replace(/[^a-zA-Z0-9]/g, '_')
  const suffix = crypto.randomBytes(3).toString('hex') // 6 hex chars
  return `TC_${cleanOrderNumber}_${suffix}`.slice(0, 48)
}

/**
 * Creates a Cashfree PG order and returns payment_session_id
 */
export async function createCashfreeOrder({
  orderId,
  orderAmount,
  customer,
  customerDetails,
  returnUrl,
  notifyUrl,
  orderNote = 'Thretha Couture Atelier Order',
  orderTags = {},
}) {
  const config = getCashfreeConfig()
  if (!config.isConfigured) {
    throw new Error('Cashfree credentials are not configured on this server (CASHFREE_APP_ID & CASHFREE_SECRET_KEY required).')
  }

  const publicBaseUrl = getCashfreePublicBaseUrl()
  const finalReturnUrl = (returnUrl || `${publicBaseUrl}/api/payments/cashfree/callback?order_id=${encodeURIComponent(orderId)}`).trim()
  const finalNotifyUrl = (notifyUrl || `${publicBaseUrl}/api/payments/cashfree/webhook`).trim()

  if (!finalReturnUrl.startsWith('https://')) {
    throw new Error(`Cashfree order_meta.return_url must be HTTPS. Received: "${finalReturnUrl}". Please configure CASHFREE_PUBLIC_URL with HTTPS in .env.local.`)
  }
  if (!finalNotifyUrl.startsWith('https://')) {
    throw new Error(`Cashfree order_meta.notify_url must be HTTPS. Received: "${finalNotifyUrl}". Please configure CASHFREE_PUBLIC_URL with HTTPS in .env.local.`)
  }

  // Sanitize customer details for Cashfree API
  const cust = customerDetails || customer || {}
  const customerId = String(cust.id || cust.customerId || cust.userId || `cust_${orderId.replace(/[^a-zA-Z0-9_-]/g, '_')}`).slice(0, 50)
  const customerName = String(cust.name || cust.customerName || cust.fullName || 'Guest Customer').slice(0, 100)
  const rawPhone = String(cust.phone || cust.customerPhone || cust.whatsapp || '9999999999').replace(/[^0-9]/g, '')
  const customerPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : '9999999999'
  const customerEmail = (cust.email || cust.customerEmail) && (cust.email || cust.customerEmail).includes('@') ? (cust.email || cust.customerEmail) : 'care@thretha.in'

  const payload = {
    order_id: String(orderId),
    order_amount: Number(Number(orderAmount).toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: customerId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
    },
    order_meta: {
      return_url: finalReturnUrl,
      notify_url: finalNotifyUrl,
      payment_methods: 'cc,dc,upi,nb,app',
    },
    order_note: String(orderNote).slice(0, 200),
    order_tags: orderTags,
  }

  const response = await fetch(`${config.baseUrl}/orders`, {
    method: 'POST',
    headers: {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': config.apiVersion,
      'Content-Type': 'application/json',
      'x-idempotency-key': orderId,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('[Cashfree:CreateOrder] Error response from Cashfree:', data)
    throw new Error(data.message || data.error || `Cashfree order creation failed (${response.status})`)
  }

  return {
    ok: true,
    payment_session_id: data.payment_session_id,
    cf_order_id: data.cf_order_id,
    order_id: data.order_id,
    order_status: data.order_status,
    raw: data,
  }
}

/**
 * Fetches authoritative order status from Cashfree
 */
export async function fetchCashfreeOrder(orderId) {
  const config = getCashfreeConfig()
  if (!config.isConfigured) {
    throw new Error('Cashfree credentials are not configured.')
  }

  const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': config.apiVersion,
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch Cashfree order (${response.status})`)
  }

  return { ok: true, order: data }
}

/**
 * Fetches payments attempts for a Cashfree order
 */
export async function fetchCashfreePayments(orderId) {
  const config = getCashfreeConfig()
  if (!config.isConfigured) {
    throw new Error('Cashfree credentials are not configured.')
  }

  const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
    method: 'GET',
    headers: {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': config.apiVersion,
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json().catch(() => ([]))
  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch Cashfree payments (${response.status})`)
  }

  return { ok: true, payments: Array.isArray(data) ? data : [] }
}

/**
 * Verifies Cashfree Webhook Signature (HMAC-SHA256 Base64)
 */
export function verifyCashfreeWebhookSignature({ rawBody, timestamp, signature }) {
  if (!rawBody || !timestamp || !signature) {
    return false
  }

  const { secretKey, isConfigured } = getCashfreeConfig()
  if (!isConfigured || !secretKey) {
    return false
  }

  try {
    const signaturePayload = `${timestamp}${rawBody}`
    const computedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(signaturePayload)
      .digest('base64')

    const computedBuffer = Buffer.from(computedSignature, 'utf8')
    const providedBuffer = Buffer.from(signature, 'utf8')

    if (computedBuffer.length !== providedBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(computedBuffer, providedBuffer)
  } catch (err) {
    console.error('[Cashfree:Webhook] Signature verification error:', err.message)
    return false
  }
}

/**
 * Atomically transitions an order to PAID/CONFIRMED and decrements product inventory.
 * Guarantees idempotency across verify, webhook, callback, and page refreshes.
 */
export async function finalizePaidOrder({ database, orderId, paymentId, paymentData = {} }) {
  const now = new Date()
  const cleanPaymentId = String(paymentId || paymentData.cf_payment_id || paymentData.payment_id || 'cashfree_paid')

  // Atomic state transition: ONLY update if payment_status is not already 'PAID'
  const updateResult = await database.collection('orders').findOneAndUpdate(
    { id: orderId, payment_status: { $ne: 'PAID' } },
    {
      $set: {
        status: 'CONFIRMED',
        payment_status: 'PAID',
        payment_id: cleanPaymentId,
        'payment.status': 'PAID',
        'payment.cashfree_payment_id': cleanPaymentId,
        'payment.verified_at': now,
        'payment.failure_reason': null,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  )

  const doc = (updateResult && typeof updateResult === 'object' && 'value' in updateResult) ? updateResult.value : updateResult

  // If already marked as PAID by another concurrent process (or previous call), return existing order safely
  if (!doc) {
    const existing = await database.collection('orders').findOne({ id: orderId })
    return { alreadyFinalized: true, order: existing }
  }

  const updatedOrder = doc

  // Decrement inventory exactly once
  await Promise.all((updatedOrder.items || []).map(async it => {
    if (it.is_combo && Array.isArray(it.components) && it.components.length > 0) {
      await Promise.all(it.components.map(async comp => {
        if (comp.product_id) {
          const compQty = Math.max(1, Number(comp.quantity) || 1)
          await database.collection('products').updateOne(
            { id: comp.product_id },
            { $inc: { stock: -(compQty * it.quantity) } }
          )
        }
      }))

      // Record combo sales statistics
      recordComboSaleStats({
        database,
        comboId: it.combo_id,
        comboQuantity: it.quantity,
        revenue: (Number(it.price) || 0) * it.quantity,
        savings: (Number(it.savings) || 0) * it.quantity,
        componentProductIds: it.components.map((c) => c.product_id).filter(Boolean),
      }).catch((e) => console.warn('[Combos:Stats] Error updating combo stats:', e.message))
    } else if (it.product_id) {
      await database.collection('products').updateOne(
        { id: it.product_id },
        { $inc: { stock: -it.quantity } }
      )
    }
  }))

  // Atomically record coupon usage if applied
  if (updatedOrder.promotion?.couponCode) {
    await recordCouponUsage({
      database,
      couponCode: updatedOrder.promotion.couponCode,
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.order_number,
      customer: updatedOrder.customer,
      userId: updatedOrder.userId,
      discountAmount: updatedOrder.discount || updatedOrder.promotion.discountAmount,
    })
  }

  return { alreadyFinalized: false, order: updatedOrder }
}

/**
 * Creates a Cashfree PG Refund for an authoritative paid order.
 */
export async function createCashfreeRefund({
  orderId,
  refundId,
  refundAmount,
  refundNote = 'Customer requested order cancellation',
  refundSpeed = 'STANDARD',
}) {
  const config = getCashfreeConfig()
  if (!config.isConfigured) {
    throw new Error('Cashfree credentials are not configured on this server (CASHFREE_APP_ID & CASHFREE_SECRET_KEY required).')
  }

  const cleanOrderId = String(orderId).trim()
  const cleanRefundId = String(refundId || `ref_${cleanOrderId}_${Date.now()}`).trim()
  const amount = Number(Number(refundAmount).toFixed(2))

  if (!cleanOrderId) {
    throw new Error('Order ID is required to initiate refund.')
  }
  if (!amount || amount <= 0) {
    throw new Error('Refund amount must be greater than zero.')
  }

  const payload = {
    refund_id: cleanRefundId,
    refund_amount: amount,
    refund_note: String(refundNote).slice(0, 100),
    refund_speed: refundSpeed,
  }

  const response = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(cleanOrderId)}/refunds`, {
    method: 'POST',
    headers: {
      'x-client-id': config.appId,
      'x-client-secret': config.secretKey,
      'x-api-version': config.apiVersion,
      'Content-Type': 'application/json',
      'x-idempotency-key': cleanRefundId,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('[Cashfree:CreateRefund] Error response from Cashfree:', data)
    const errorMsg = data.message || data.error || `Cashfree refund creation failed (${response.status})`
    throw new Error(errorMsg)
  }

  return {
    ok: true,
    refund_id: data.refund_id || cleanRefundId,
    cf_refund_id: data.cf_refund_id,
    order_id: data.order_id || cleanOrderId,
    refund_amount: data.refund_amount || amount,
    refund_currency: data.refund_currency || 'INR',
    refund_status: data.refund_status || 'PENDING', // PENDING, SUCCESS, ONHOLD
    refund_note: data.refund_note,
    status_description: data.status_description,
    created_at: data.created_at,
    raw: data,
  }
}

/**
 * Fetches authoritative refund status from Cashfree
 */
export async function fetchCashfreeRefund({ orderId, refundId }) {
  const config = getCashfreeConfig()
  if (!config.isConfigured) {
    throw new Error('Cashfree credentials are not configured.')
  }

  const response = await fetch(
    `${config.baseUrl}/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`,
    {
      method: 'GET',
      headers: {
        'x-client-id': config.appId,
        'x-client-secret': config.secretKey,
        'x-api-version': config.apiVersion,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Failed to fetch Cashfree refund (${response.status})`)
  }

  return { ok: true, refund: data }
}

/**
 * Checks server-side eligibility for customer order cancellation.
 */
export function checkOrderCancellationEligibility(order) {
  if (!order) {
    return { eligible: false, reason: 'ORDER_NOT_FOUND', message: 'Order not found.' }
  }

  const status = String(order.status || '').toUpperCase()
  const paymentStatus = String(order.payment_status || order.payment?.status || '').toUpperCase()
  const refundStatus = String(order.refund?.status || order.payment?.refund_status || order.refund_status || '').toUpperCase()
  const cancellationStatus = String(order.cancellation?.status || '').toUpperCase()

  // Terminal or Post-Fulfillment States
  if (status === 'CANCELLED' || paymentStatus === 'CANCELLED') {
    return { eligible: false, reason: 'ALREADY_CANCELLED', message: 'This order is already cancelled.' }
  }
  if (status === 'CANCELLATION_PENDING' || cancellationStatus === 'PENDING' || ['PENDING', 'INITIATED', 'REFUND_PENDING'].includes(refundStatus)) {
    return { eligible: false, reason: 'CANCELLATION_PENDING', message: 'A cancellation and refund request is already being processed.' }
  }
  if (['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'RETURN_REQUESTED', 'RETURNED'].includes(status)) {
    return { eligible: false, reason: 'ALREADY_SHIPPED', message: 'This order has already been dispatched from our atelier and cannot be cancelled.' }
  }
  if (status === 'DELIVERED') {
    return { eligible: false, reason: 'ALREADY_DELIVERED', message: 'This order has already been delivered.' }
  }
  if (refundStatus === 'COMPLETED' || refundStatus === 'REFUNDED') {
    return { eligible: false, reason: 'ALREADY_REFUNDED', message: 'This order has already been refunded.' }
  }
  if ((order.items || []).some(item => Boolean(item.cancellation?.status || item.cancellation?.refund_id))) {
    return { eligible: false, reason: 'ITEM_CANCELLATION_EXISTS', message: 'One or more items have a separate cancellation/refund. Contact support to review the remaining items.' }
  }

  // Unpaid / Pending Orders -> Eligible for cancellation without refund
  if (paymentStatus === 'PENDING' || paymentStatus === 'PENDING_PAYMENT' || status === 'PENDING' || paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED') {
    return {
      eligible: true,
      requiresRefund: false,
      refundAmount: 0,
      reason: 'UNPAID_ORDER',
      message: 'Unpaid order eligible for immediate cancellation.',
    }
  }

  // Confirmed Paid Cashfree Orders -> Eligible for cancellation with full refund
  if (order.payment_method === 'CASHFREE' && paymentStatus === 'PAID' && refundStatus !== 'COMPLETED' && refundStatus !== 'REFUNDED') {
    return {
      eligible: true,
      requiresRefund: true,
      refundAmount: Number(order.total || order.payment?.amount || 0),
      reason: 'PAID_CASHFREE',
      message: 'Paid order eligible for cancellation and Cashfree refund.',
    }
  }

  // WhatsApp Concierge Confirmed Orders
  if (order.payment_method === 'WHATSAPP_CONCIERGE' || status === 'WHATSAPP CONTACTED' || status === 'CONFIRMED' || status === 'PACKED' || status === 'NEW') {
    return {
      eligible: true,
      requiresRefund: false,
      refundAmount: 0,
      reason: 'WHATSAPP_ORDER',
      message: 'Concierge order eligible for cancellation.',
    }
  }

  return { eligible: false, reason: 'NOT_ELIGIBLE', message: 'This order is not eligible for cancellation.' }
}

/**
 * Atomically restores product inventory and coupon usage upon order cancellation.
 * Guaranteed idempotent via atomic { inventory_restored: { $ne: true } } update filter.
 */
export async function restoreOrderInventoryAndPromotions({ database, orderId }) {
  const now = new Date()
  const updateResult = await database.collection('orders').findOneAndUpdate(
    { id: orderId, inventory_restored: { $ne: true } },
    {
      $set: {
        inventory_restored: true,
        inventory_restored_at: now,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  )

  const doc = (updateResult && typeof updateResult === 'object' && 'value' in updateResult) ? updateResult.value : updateResult
  if (!doc) {
    return { alreadyRestored: true }
  }

  const order = doc

  // Restore inventory stock for each line item (including combo component pieces)
  for (const it of order.items || []) {
    if (it.is_combo && Array.isArray(it.components) && it.components.length > 0) {
      for (const comp of it.components) {
        if (comp.product_id && it.quantity > 0) {
          const compQty = Math.max(1, Number(comp.quantity) || 1)
          await database.collection('products').updateOne(
            { id: comp.product_id },
            { $inc: { stock: compQty * it.quantity } }
          )
        }
      }
    } else if (it.product_id && it.quantity > 0) {
      await database.collection('products').updateOne(
        { id: it.product_id },
        { $inc: { stock: it.quantity } }
      )
    }
  }

  // Revert coupon usage if applied
  if (order.promotion?.couponCode || order.promotion?.code) {
    const couponCode = order.promotion.couponCode || order.promotion.code
    await revertCouponUsage({ database, orderId: order.id, couponCode })
  }

  return { alreadyRestored: false, order }
}

/**
 * End-to-End Server-Authoritative Customer & Admin Order Cancellation & Refund Engine.
 * Protects against IDOR, race conditions, double-clicks, and duplicate webhooks.
 */
export async function cancelAndRefundOrder({
  database,
  orderId,
  customerUserId = null,
  cancellationReason = 'Customer requested cancellation',
  isAdmin = false,
  appUrl,
}) {
  const order = await database.collection('orders').findOne({
    $or: [{ id: orderId }, { order_number: orderId }],
  })

  if (!order) {
    return { success: false, status: 404, error: 'Order not found' }
  }

  // 1. Strict IDOR Ownership Check (for customer requests)
  if (!isAdmin) {
    if (!customerUserId) {
      return { success: false, status: 401, error: 'Authentication required to cancel order' }
    }
    const isOwner = order.userId === customerUserId || order.customer_id === customerUserId
    if (!isOwner) {
      return { success: false, status: 403, error: 'You do not have permission to cancel this order' }
    }
  }

  // 2. Server-Side Eligibility Validation
  const eligibility = checkOrderCancellationEligibility(order)
  if (!eligibility.eligible) {
    return { success: false, status: 422, error: eligibility.message, reason: eligibility.reason }
  }

  const now = new Date()

  // 3. CASE A: Unpaid Order or WhatsApp Concierge Order
  if (!eligibility.requiresRefund) {
    const updateRes = await database.collection('orders').findOneAndUpdate(
      { id: order.id, status: { $nin: ['CANCELLED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLATION_PENDING'] } },
      {
        $set: {
          status: 'CANCELLED',
          payment_status: order.payment_status === 'PAID' ? 'PAID' : 'CANCELLED',
          cancelled_at: now,
          cancellation_reason: cancellationReason,
          cancelled_by: isAdmin ? 'ADMIN' : 'CUSTOMER',
          'payment.status': order.payment_status === 'PAID' ? 'PAID' : 'CANCELLED',
        'payment.refund_status': 'NONE',
        'cancellation.status': 'CANCELLED',
          updated_at: now,
        },
      },
      { returnDocument: 'after' }
    )

    const updatedDoc = (updateRes && typeof updateRes === 'object' && 'value' in updateRes) ? updateRes.value : updateRes
    if (!updatedDoc) {
      return { success: false, status: 409, error: 'Order is already cancelled' }
    }

    // Restore stock if WhatsApp order decremented inventory
    if (order.payment_method === 'WHATSAPP_CONCIERGE') {
      await restoreOrderInventoryAndPromotions({ database, orderId: order.id })
    }

    // Dispatch cancellation notifications
    dispatchOrderNotifications({
      database,
      orderId: order.id,
      event: 'ORDER_CANCELLED',
      appUrl,
    }).catch((e) => console.error('[Notifications:Cancel] Error:', e.message))

    return {
      success: true,
      status: 200,
      order_number: order.order_number,
      order_status: 'CANCELLED',
      payment_status: order.payment_status === 'PAID' ? 'PAID' : 'CANCELLED',
      refund_status: 'NONE',
      refund_amount: 0,
      requires_refund: false,
      message: 'Order cancelled successfully.',
    }
  }

  // 4. CASE B: Paid Cashfree Order -> Full Refund
  const authoritativeRefundAmount = Number(order.total || order.payment?.amount || 0)
  if (authoritativeRefundAmount <= 0) {
    return { success: false, status: 422, error: 'Invalid paid order amount for refund' }
  }

  // Reuse the same idempotency key after a transport/API failure. Cashfree may
  // have accepted a request even if our connection timed out before the reply.
  const createRefundId = () => `ref_${order.order_number || order.id}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const refundId = order.refund?.failure_confirmed ? createRefundId() : (order.refund?.id || createRefundId())
  const cashfreeOrderId = order.cashfree_order_id || order.payment?.cashfree_order_id || order.id

  // Atomic state transition: Mark CANCELLED + REFUND_PENDING
  const updateRes = await database.collection('orders').findOneAndUpdate(
    {
      id: order.id,
      status: { $nin: ['CANCELLED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLATION_PENDING'] },
      'payment.refund_status': { $nin: ['PENDING', 'INITIATED', 'COMPLETED'] },
      'refund.status': { $nin: ['PENDING', 'INITIATED', 'COMPLETED'] },
    },
    {
      $set: {
        status: 'CANCELLATION_PENDING',
        'cancellation.status': 'PENDING',
        'cancellation.requested_at': now,
        'cancellation.reason': cancellationReason,
        'cancellation.requested_by': isAdmin ? 'ADMIN' : 'CUSTOMER',
        'cancellation.previous_status': order.status || 'CONFIRMED',
        refund_status: 'REFUND_PENDING',
        'payment.refund_status': 'PENDING',
        'payment.refund_amount': authoritativeRefundAmount,
        'payment.refund_id': refundId,
        'payment.refund_requested_at': now,
        'refund.id': refundId,
        'refund.status': 'PENDING',
        'refund.failure_confirmed': false,
        'refund.amount': authoritativeRefundAmount,
        'refund.currency': 'INR',
        'refund.note': cancellationReason,
        'refund.requested_at': now,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  )

  const updatedDoc = (updateRes && typeof updateRes === 'object' && 'value' in updateRes) ? updateRes.value : updateRes
  if (!updatedDoc) {
    return { success: false, status: 409, error: 'Order is already cancelled or refund is already in progress' }
  }

  // Dispatch Cashfree Refund API call
  try {
    const cfRefundRes = await createCashfreeRefund({
      orderId: cashfreeOrderId,
      refundId,
      refundAmount: authoritativeRefundAmount,
      refundNote: `Cancellation for ${order.order_number}: ${cancellationReason}`,
    })

    const isInstantSuccess = cfRefundRes.refund_status === 'SUCCESS'

    await database.collection('orders').updateOne(
      { id: order.id },
      {
        $set: {
          'payment.cashfree_refund_id': cfRefundRes.cf_refund_id,
          'payment.refund_status': isInstantSuccess ? 'COMPLETED' : 'PENDING',
          'refund.cf_refund_id': cfRefundRes.cf_refund_id,
          'refund.status': isInstantSuccess ? 'COMPLETED' : 'PENDING',
          'refund.completed_at': isInstantSuccess ? new Date() : null,
          'refund.raw_response': cfRefundRes.raw,
          updated_at: new Date(),
        },
        $unset: { 'refund.failure_confirmed': '' },
      }
    )

    if (isInstantSuccess) {
      await finalizeCompletedRefund({ database, orderId: order.id, refundData: cfRefundRes, appUrl })
    }

    return {
      success: true,
      status: 200,
      order_number: order.order_number,
      order_status: isInstantSuccess ? 'CANCELLED' : 'CANCELLATION_PENDING',
      payment_status: 'PAID',
      refund_status: isInstantSuccess ? 'COMPLETED' : 'PENDING',
      refund_amount: authoritativeRefundAmount,
      cf_refund_id: cfRefundRes.cf_refund_id,
      refund_id: refundId,
      requires_refund: true,
      message: isInstantSuccess
        ? 'Order cancelled and refund completed successfully.'
        : 'Your cancellation request is being processed. The order will be cancelled after Cashfree confirms the refund.',
    }
  } catch (err) {
    console.error(`[Cashfree:Refund] Failed to create refund for ${order.order_number}:`, err.message)

    await database.collection('orders').updateOne(
      { id: order.id, 'refund.id': refundId },
      {
        $set: {
          status: order.status,
          'cancellation.status': 'REJECTED',
          'payment.refund_status': 'FAILED',
          'payment.refund_failure_reason': err.message,
          'refund.status': 'FAILED',
          'refund.failure_reason': err.message,
          'refund.failure_confirmed': false,
          'refund.failed_at': new Date(),
          updated_at: new Date(),
        },
        $unset: { cancelled_at: '', cancellation_reason: '', cancelled_by: '' },
      }
    )

    // Notify sales of refund attention requirement
    dispatchOrderNotifications({
      database,
      orderId: order.id,
      event: 'REFUND_FAILED',
      appUrl,
    }).catch((e) => console.error('[Notifications:RefundFailed] Error:', e.message))

    return {
      success: false,
      status: 502,
      order_number: order.order_number,
      order_status: order.status,
      payment_status: 'PAID',
      refund_status: 'FAILED',
      refund_amount: authoritativeRefundAmount,
      refund_error: err.message,
      requires_refund: true,
      message: 'Cashfree could not confirm the refund request. The order remains active; please try again or contact support.',
    }
  }
}

/**
 * Idempotently finalizes a completed Cashfree refund (e.g. from Webhook or Sync check).
 */
export async function finalizeCompletedRefund({ database, orderId, refundData = {}, appUrl }) {
  const now = new Date()
  const cfRefundId = refundData.cf_refund_id || refundData.refund_id

  const identityFilter = refundData.refund_id
    ? { id: orderId, 'refund.id': refundData.refund_id }
    : { $or: [{ id: orderId }, { order_number: orderId }, { cashfree_order_id: orderId }, { 'payment.cashfree_order_id': orderId }] }
  const updateResult = await database.collection('orders').findOneAndUpdate(
    { ...identityFilter, 'refund.status': { $ne: 'COMPLETED' } },
    {
      $set: {
        status: 'CANCELLED',
        'cancellation.status': 'CANCELLED',
        'payment.refund_status': 'COMPLETED',
        'payment.cashfree_refund_id': cfRefundId,
        'payment.refund_completed_at': now,
        'refund.status': 'COMPLETED',
        'refund.cf_refund_id': cfRefundId,
        'refund.completed_at': now,
        'refund.failure_reason': null,
        updated_at: now,
      },
      $unset: { 'refund.failure_confirmed': '' },
    },
    { returnDocument: 'after' }
  )

  const doc = (updateResult && typeof updateResult === 'object' && 'value' in updateResult) ? updateResult.value : updateResult
  if (!doc) {
    return { alreadyFinalized: true }
  }

  // Ensure inventory is restored
  await restoreOrderInventoryAndPromotions({ database, orderId: doc.id })

  // Trigger REFUND_COMPLETED notifications
  dispatchOrderNotifications({
    database,
    orderId: doc.id,
    event: 'REFUND_COMPLETED',
    appUrl,
  }).catch((e) => console.error('[Notifications:RefundSuccess] Error:', e.message))

  return { alreadyFinalized: false, order: doc }
}

async function restoreOrderItemInventory({ database, orderId, itemIndex }) {
  const path = `items.${itemIndex}.cancellation.inventory_restored`
  const result = await database.collection('orders').findOneAndUpdate(
    { id: orderId, [path]: { $ne: true } },
    { $set: { [path]: true, [`items.${itemIndex}.cancellation.inventory_restored_at`]: new Date(), updated_at: new Date() } },
    { returnDocument: 'after' }
  )
  const order = (result && typeof result === 'object' && 'value' in result) ? result.value : result
  if (!order) return { alreadyRestored: true }
  const item = order.items?.[itemIndex]
  if (!item) return { alreadyRestored: true }
  const multiplier = Math.max(1, Number(item.quantity) || 1)
  if (item.is_combo && Array.isArray(item.components)) {
    await Promise.all(item.components.map(component => component.product_id
      ? database.collection('products').updateOne({ id: component.product_id }, { $inc: { stock: Math.max(1, Number(component.quantity) || 1) * multiplier } })
      : Promise.resolve()))
  } else if (item.product_id) {
    await database.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: multiplier } })
  }
  return { alreadyRestored: false }
}

/** Complete one Admin-selected line item after Cashfree reports refund success. */
export async function finalizeCompletedItemRefund({ database, orderId, refundId, refundData = {} }) {
  const order = await database.collection('orders').findOne({ id: orderId })
  if (!order) return { alreadyFinalized: true }
  const itemIndex = (order.items || []).findIndex(item => item.cancellation?.refund_id === refundId)
  if (itemIndex < 0) return { alreadyFinalized: true }
  const statusPath = `items.${itemIndex}.cancellation.status`
  const result = await database.collection('orders').findOneAndUpdate(
    { id: order.id, [statusPath]: { $ne: 'CANCELLED' } },
    {
      $set: {
        [statusPath]: 'CANCELLED',
        [`items.${itemIndex}.cancellation.refund_status`]: 'COMPLETED',
        [`items.${itemIndex}.cancellation.cf_refund_id`]: refundData.cf_refund_id || null,
        [`items.${itemIndex}.cancellation.completed_at`]: new Date(),
        [`items.${itemIndex}.cancellation.failure_reason`]: null,
        updated_at: new Date(),
      },
      $inc: { 'refund.partial_amount_total': Number(refundData.refund_amount || order.items[itemIndex].cancellation.amount || 0) },
    },
    { returnDocument: 'after' }
  )
  const updated = (result && typeof result === 'object' && 'value' in result) ? result.value : result
  if (!updated) return { alreadyFinalized: true }
  await restoreOrderItemInventory({ database, orderId: order.id, itemIndex })
  let fresh = await database.collection('orders').findOne({ id: order.id })
  if ((fresh.items || []).every(item => item.cancellation?.status === 'CANCELLED')) {
    const partialAmount = Number(fresh.refund?.partial_amount_total || 0)
    await database.collection('orders').updateOne(
      { id: order.id, status: { $nin: ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'] } },
      { $set: { status: 'CANCELLED', 'cancellation.status': 'CANCELLED', 'payment.refund_status': 'PARTIAL', 'refund.status': 'PARTIAL', 'refund.amount': partialAmount, updated_at: new Date() } }
    )
    fresh = await database.collection('orders').findOne({ id: order.id })
  }
  return { alreadyFinalized: false, order: fresh, item_index: itemIndex }
}

/** Cancel/refund one Admin-selected order line without changing sibling lines. */
export async function cancelOrderItemAndRefund({ database, orderId, itemIndex, reason = 'Admin cancelled this item' }) {
  const order = await database.collection('orders').findOne({ $or: [{ id: orderId }, { order_number: orderId }] })
  if (!order) return { success: false, status: 404, error: 'Order not found' }
  const lifecycleStatus = String(order.status || '').toUpperCase()
  if (['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED', 'CANCELLATION_PENDING'].includes(lifecycleStatus)) {
    return { success: false, status: 422, error: 'This item cannot be cancelled after shipping or while the order is already cancelling.' }
  }
  const orderRefundStatus = String(order.refund?.status || order.payment?.refund_status || '').toUpperCase()
  if (['PENDING', 'INITIATED', 'COMPLETED'].includes(orderRefundStatus)) {
    return { success: false, status: 409, error: 'A whole-order refund is already in progress or complete.' }
  }
  const item = order.items?.[itemIndex]
  if (!item) return { success: false, status: 404, error: 'Order item not found' }
  if (order.payment_method === 'CASHFREE' && String(order.payment_status || order.payment?.status).toUpperCase() !== 'PAID') {
    return { success: false, status: 409, error: 'This online payment is still pending. Wait for Cashfree to confirm or cancel the whole unpaid order.' }
  }
  if (['PENDING', 'CANCELLED'].includes(String(item.cancellation?.status || '').toUpperCase())) {
    return { success: false, status: 409, error: 'This item is already being cancelled or has been cancelled.' }
  }

  const lineGross = Math.max(0, Number(item.price || item.unit_price || 0) * Math.max(1, Number(item.quantity) || 1))
  const subtotal = Math.max(0, Number(order.subtotal) || (order.items || []).reduce((sum, line) => sum + Number(line.price || 0) * Math.max(1, Number(line.quantity) || 1), 0))
  const discountShare = subtotal ? Math.min(lineGross, Number(order.discount || 0) * lineGross / subtotal) : 0
  const refundAmount = Math.max(0, Number((lineGross - discountShare).toFixed(2)))
  const paidCashfree = order.payment_method === 'CASHFREE' && String(order.payment_status || order.payment?.status).toUpperCase() === 'PAID'
  const indexPrefix = `items.${itemIndex}.cancellation`
  const updateFilter = {
    id: order.id,
    status: { $nin: ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'CANCELLED', 'CANCELLATION_PENDING'] },
    [`${indexPrefix}.status`]: { $nin: ['PENDING', 'CANCELLED'] },
  }

  if (!paidCashfree) {
    const result = await database.collection('orders').findOneAndUpdate(updateFilter, {
      $set: {
        [`${indexPrefix}.status`]: 'CANCELLED',
        [`${indexPrefix}.refund_status`]: 'NONE',
        [`${indexPrefix}.amount`]: refundAmount,
        [`${indexPrefix}.reason`]: String(reason).slice(0, 300),
        [`${indexPrefix}.cancelled_at`]: new Date(),
        updated_at: new Date(),
      },
      $inc: { subtotal: -lineGross, discount: -discountShare, total: -refundAmount },
    }, { returnDocument: 'after' })
    const updated = (result && typeof result === 'object' && 'value' in result) ? result.value : result
    if (!updated) return { success: false, status: 409, error: 'This order item changed while the cancellation was processing.' }
    if (order.payment_method === 'WHATSAPP_CONCIERGE') await restoreOrderItemInventory({ database, orderId: order.id, itemIndex })
    const fresh = await database.collection('orders').findOne({ id: order.id })
    if ((fresh.items || []).every(line => line.cancellation?.status === 'CANCELLED')) {
      await database.collection('orders').updateOne({ id: order.id }, { $set: { status: 'CANCELLED', payment_status: 'CANCELLED', 'cancellation.status': 'CANCELLED', updated_at: new Date() } })
    }
    return { success: true, order: await database.collection('orders').findOne({ id: order.id }), item_index: itemIndex, refund_status: 'NONE', refund_amount: 0 }
  }

  if (refundAmount <= 0) return { success: false, status: 422, error: 'This item has no refundable amount.' }
  const createItemRefundId = () => `ref_item_${order.order_number || order.id}_${itemIndex}_${crypto.randomBytes(5).toString('hex')}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const refundId = item.cancellation?.failure_confirmed ? createItemRefundId() : (item.cancellation?.refund_id || createItemRefundId())
  const requestResult = await database.collection('orders').findOneAndUpdate(updateFilter, {
    $set: {
      [`${indexPrefix}.status`]: 'PENDING',
      [`${indexPrefix}.refund_status`]: 'PENDING',
      [`${indexPrefix}.refund_id`]: refundId,
      [`${indexPrefix}.failure_confirmed`]: false,
      [`${indexPrefix}.amount`]: refundAmount,
      [`${indexPrefix}.reason`]: String(reason).slice(0, 300),
      [`${indexPrefix}.requested_at`]: new Date(),
      updated_at: new Date(),
    },
  }, { returnDocument: 'after' })
  const pending = (requestResult && typeof requestResult === 'object' && 'value' in requestResult) ? requestResult.value : requestResult
  if (!pending) return { success: false, status: 409, error: 'This order item changed while the cancellation was processing.' }
  try {
    const cashfreeOrderId = order.cashfree_order_id || order.payment?.cashfree_order_id || order.id
    const response = await createCashfreeRefund({ orderId: cashfreeOrderId, refundId, refundAmount, refundNote: `Item cancellation for ${order.order_number}: ${reason}` })
    await database.collection('orders').updateOne({ id: order.id, [`${indexPrefix}.refund_id`]: refundId }, {
      $set: {
        [`${indexPrefix}.cf_refund_id`]: response.cf_refund_id || null,
        [`${indexPrefix}.refund_status`]: response.refund_status === 'SUCCESS' ? 'COMPLETED' : 'PENDING',
      },
      $unset: { [`${indexPrefix}.failure_confirmed`]: '' },
    })
    if (response.refund_status === 'SUCCESS') await finalizeCompletedItemRefund({ database, orderId: order.id, refundId, refundData: response })
    return { success: true, order: await database.collection('orders').findOne({ id: order.id }), item_index: itemIndex, refund_status: response.refund_status === 'SUCCESS' ? 'COMPLETED' : 'PENDING', refund_amount: refundAmount, refund_id: refundId }
  } catch (error) {
    await database.collection('orders').updateOne({ id: order.id, [`${indexPrefix}.refund_id`]: refundId }, {
      $set: { [`${indexPrefix}.status`]: 'FAILED', [`${indexPrefix}.refund_status`]: 'FAILED', [`${indexPrefix}.failure_confirmed`]: false, [`${indexPrefix}.failure_reason`]: String(error.message || 'Cashfree refund failed').slice(0, 300) },
    })
    return { success: false, status: 502, error: 'Cashfree could not confirm this item refund. The item remains active.', refund_status: 'FAILED' }
  }
}
