// Payment verification is also called from guest checkout. Keep its access
// check aligned with guest order tracking before contacting Cashfree.
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

export function guestContactMatches(order, contact) {
  const suppliedEmail = String(contact ?? '').trim().toLowerCase()
  const orderEmail = String(order.customer?.email ?? '').trim().toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail) && suppliedEmail === orderEmail) return true
  const suppliedPhone = normalizeIndianMobile(contact)
  return Boolean(suppliedPhone && [order.customer?.phone, order.customer?.whatsapp]
    .some((phone) => normalizeIndianMobile(phone) === suppliedPhone))
}

export function paymentVerificationAccess(order, customer, contact) {
  if (order.userId) return Boolean(customer?.id && order.userId === customer.id)
  return guestContactMatches(order, contact)
}

export function paymentVerificationResult(order) {
  return {
    verified: true,
    payment_status: 'PAID',
    order_number: order.order_number,
    order_id: order.id,
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status || 'CONFIRMED',
      payment_status: 'PAID',
    },
  }
}

export async function verifyCashfreePayment({ database, reference, claimedReference, customer, contact, cashfree, onPaid }) {
  const orders = database.collection('orders')
  const order = await orders.findOne({ $or: [
    { cashfree_order_id: reference },
    { 'payment.cashfree_order_id': reference },
    { id: reference },
    { order_number: reference },
    { order_number: String(reference).toUpperCase() },
  ] })

  // Use the same response for an unknown order and an inaccessible order.
  if (!order || !paymentVerificationAccess(order, customer, contact)) {
    return { status: 403, body: { error: 'Order and customer details could not be verified.' } }
  }
  if (claimedReference && claimedReference !== reference &&
    ![order.id, order.order_number, order.cashfree_order_id, order.payment?.cashfree_order_id].includes(claimedReference)) {
    return { status: 403, body: { error: 'Order and customer details could not be verified.' } }
  }

  if (order.payment_status === 'PAID') return { status: 200, body: paymentVerificationResult(order) }
  if (!cashfree.isConfigured()) return { status: 500, body: { error: 'Cashfree API keys not configured on server' } }

  const cfOrderId = order.cashfree_order_id || order.payment?.cashfree_order_id
  if (!cfOrderId) return { status: 400, body: { error: 'This order has no Cashfree payment session.' } }

  const [cfOrderRes, cfPaymentsRes] = await Promise.all([
    cashfree.fetchOrder(cfOrderId),
    cashfree.fetchPayments(cfOrderId).catch(() => ({ payments: [] })),
  ])
  const cfOrder = cfOrderRes.order
  const successfulPayment = cfPaymentsRes.payments?.find((payment) => payment.payment_status === 'SUCCESS')
  if (cfOrder?.order_status === 'PAID' || successfulPayment) {
    const { order: finalizedOrder } = await cashfree.finalizePaidOrder({
      database,
      orderId: order.id,
      paymentId: successfulPayment?.cf_payment_id || cfOrder?.cf_order_id,
      paymentData: successfulPayment || {},
    })
    const finalDoc = finalizedOrder || order
    onPaid?.(finalDoc)
    return { status: 200, body: paymentVerificationResult(finalDoc) }
  }

  const failedPayment = cfPaymentsRes.payments?.find((payment) =>
    ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(payment.payment_status))
  if (failedPayment || cfOrder?.order_status === 'EXPIRED') {
    const failStatus = failedPayment?.payment_status || cfOrder?.order_status || 'FAILED'
    await orders.updateOne({ id: order.id }, { $set: {
      'payment.status': failStatus,
      'payment.failure_reason': failedPayment?.payment_message || `Payment ${failStatus}`,
      updated_at: new Date(),
    } })
    return { status: 400, body: {
      verified: false,
      payment_status: failStatus,
      error: failedPayment?.payment_message || 'Payment transaction failed or was cancelled.',
    } }
  }

  return { status: 200, body: {
    verified: false,
    payment_status: cfOrder?.order_status || 'PENDING',
    message: 'Payment verification in progress.',
  } }
}
