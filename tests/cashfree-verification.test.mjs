import test from 'node:test'
import assert from 'node:assert/strict'
import { getCustomerFromRequest, signCustomerToken } from '../lib/auth.js'
import {
  guestContactMatches,
  paymentVerificationAccess,
  verifyCashfreePayment,
} from '../lib/cashfreeVerification.js'

const owner = { id: 'customer-a' }
const otherCustomer = { id: 'customer-b' }

function order(overrides = {}) {
  return {
    _id: 'private-mongo-id', id: 'order-id', order_number: 'TC-123',
    cashfree_order_id: 'cashfree-order-id', userId: owner.id,
    payment_status: 'PENDING', status: 'NEW', total: 1499,
    customer: { email: 'buyer@example.com', phone: '9876543210', name: 'Buyer', address: 'Private address' },
    payment: { raw_response: { secret: 'private-provider-data' }, cashfree_session_id: 'private-session' },
    webhook_payload: { secret: 'private-webhook-data' },
    ...overrides,
  }
}

function setup(document, providerStatus = 'PAID') {
  const calls = { fetchOrder: 0, fetchPayments: 0, finalize: 0, updates: 0, paid: 0 }
  const orders = {
    async findOne(query) {
      return query.$or.some((part) => Object.entries(part).some(([key, value]) =>
        key.split('.').reduce((found, component) => found?.[component], document) === value)) ? document : null
    },
    async updateOne() { calls.updates++; return { matchedCount: 1 } },
  }
  return {
    calls,
    args: {
      database: { collection: (name) => { assert.equal(name, 'orders'); return orders } },
      reference: document.cashfree_order_id,
      customer: owner,
      contact: '',
      cashfree: {
        isConfigured: () => true,
        fetchOrder: async () => { calls.fetchOrder++; return { order: { order_status: providerStatus, cf_order_id: 'provider-order' } } },
        fetchPayments: async () => { calls.fetchPayments++; return { payments: [] } },
        finalizePaidOrder: async ({ orderId }) => {
          calls.finalize++
          assert.equal(orderId, document.id)
          return { order: { ...document, payment_status: 'PAID', status: 'CONFIRMED' } }
        },
      },
      onPaid: () => { calls.paid++ },
    },
  }
}

test('the authenticated owner can verify a paid Cashfree order', async () => {
  const { args, calls } = setup(order())
  const result = await verifyCashfreePayment(args)
  assert.equal(result.status, 200)
  assert.equal(result.body.verified, true)
  assert.equal(result.body.payment_status, 'PAID')
  assert.equal(calls.finalize, 1)
  assert.equal(calls.paid, 1)
})

test('another customer cannot verify the order or trigger provider calls', async () => {
  const { args, calls } = setup(order())
  const result = await verifyCashfreePayment({ ...args, customer: otherCustomer })
  assert.equal(result.status, 403)
  assert.equal(calls.fetchOrder, 0)
  assert.equal(calls.finalize, 0)
})

test('missing or invalid customer identity cannot verify an owned order', async () => {
  for (const customer of [null, undefined, { id: 'expired-or-invalid' }]) {
    const { args, calls } = setup(order())
    const result = await verifyCashfreePayment({ ...args, customer, contact: 'buyer@example.com' })
    assert.equal(result.status, 403)
    assert.equal(calls.fetchOrder, 0)
  }
})

test('invalid and expired Bearer sessions do not produce an authenticated customer', async () => {
  const originalNow = Date.now
  let expiredToken
  try {
    Date.now = () => originalNow() - 31 * 24 * 60 * 60 * 1000
    expiredToken = signCustomerToken({ id: owner.id, email: 'buyer@example.com' })
  } finally {
    Date.now = originalNow
  }
  const database = { collection: () => { throw new Error('Invalid sessions must not reach MongoDB') } }
  for (const token of ['invalid-token', expiredToken]) {
    const request = new Request('https://example.test/api/payments/cashfree/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(await getCustomerFromRequest(request, database), null)
  }
})

test('an order identifier alone cannot access an already paid order', async () => {
  const { args } = setup(order({ payment_status: 'PAID' }))
  const result = await verifyCashfreePayment({ ...args, customer: null })
  assert.equal(result.status, 403)
  assert.equal(result.body.order, undefined)
})

test('guest orders require matching contact before any provider call', async () => {
  const guestOrder = order({ userId: null })
  for (const contact of ['', 'someone-else@example.com', '9876543211']) {
    const { args, calls } = setup(guestOrder)
    const result = await verifyCashfreePayment({ ...args, customer: null, contact })
    assert.equal(result.status, 403)
    assert.equal(calls.fetchOrder, 0)
  }
})

test('guest can use the existing email or normalized Indian phone contact check', async () => {
  const guestOrder = order({ userId: null })
  assert.equal(guestContactMatches(guestOrder, 'BUYER@example.com'), true)
  assert.equal(guestContactMatches(guestOrder, '+91 98765 43210'), true)
  for (const contact of ['buyer@example.com', '+91 98765 43210']) {
    const { args } = setup(guestOrder)
    const result = await verifyCashfreePayment({ ...args, customer: null, contact })
    assert.equal(result.status, 200)
    assert.equal(result.body.verified, true)
  }
})

test('guest contact does not override authenticated ownership', () => {
  assert.equal(paymentVerificationAccess(order(), otherCustomer, 'buyer@example.com'), false)
})

test('a mismatched secondary identifier is rejected', async () => {
  const { args, calls } = setup(order())
  const result = await verifyCashfreePayment({ ...args, claimedReference: 'unrelated-order' })
  assert.equal(result.status, 403)
  assert.equal(calls.fetchOrder, 0)
})

test('a confirmed response is a minimal allowlist, not a raw order', async () => {
  const { args } = setup(order())
  const result = await verifyCashfreePayment(args)
  assert.deepEqual(Object.keys(result.body).sort(), ['order', 'order_id', 'order_number', 'payment_status', 'verified'])
  assert.deepEqual(Object.keys(result.body.order).sort(), ['id', 'order_number', 'payment_status', 'status'])
  const serialized = JSON.stringify(result.body)
  for (const sensitive of ['private-mongo-id', 'private-provider-data', 'private-webhook-data', 'private-session', 'buyer@example.com', 'Private address']) {
    assert.equal(serialized.includes(sensitive), false)
  }
})

test('trusted previously paid state is safe but still requires ownership', async () => {
  const { args, calls } = setup(order({ payment_status: 'PAID' }))
  const result = await verifyCashfreePayment(args)
  assert.equal(result.body.verified, true)
  assert.equal(calls.fetchOrder, 0)
  assert.equal(calls.finalize, 0)
})

test('a client-supplied success claim cannot mark an unpaid order paid', async () => {
  const { args, calls } = setup(order(), 'ACTIVE')
  const result = await verifyCashfreePayment({ ...args, claimedPaymentStatus: 'PAID' })
  assert.equal(result.body.verified, false)
  assert.equal(calls.finalize, 0)
  assert.equal(calls.paid, 0)
})

test('pending Cashfree status remains pending', async () => {
  const { args, calls } = setup(order(), 'ACTIVE')
  const result = await verifyCashfreePayment(args)
  assert.equal(result.status, 200)
  assert.equal(result.body.verified, false)
  assert.equal(result.body.payment_status, 'ACTIVE')
  assert.equal(calls.finalize, 0)
})

test('failed and expired Cashfree statuses never become paid', async () => {
  for (const providerStatus of ['EXPIRED', 'FAILED']) {
    const { args, calls } = setup(order(), providerStatus)
    if (providerStatus === 'FAILED') args.cashfree.fetchPayments = async () => ({ payments: [{ payment_status: 'FAILED' }] })
    const result = await verifyCashfreePayment(args)
    assert.equal(result.body.verified, false)
    assert.equal(calls.finalize, 0)
    if (providerStatus === 'EXPIRED' || providerStatus === 'FAILED') assert.equal(result.status, 400)
  }
})

test('only a trusted Cashfree success can trigger finalization and notification', async () => {
  const { args, calls } = setup(order(), 'ACTIVE')
  args.cashfree.fetchPayments = async () => ({ payments: [{ payment_status: 'SUCCESS', cf_payment_id: 'provider-payment' }] })
  const result = await verifyCashfreePayment(args)
  assert.equal(result.body.verified, true)
  assert.equal(calls.finalize, 1)
  assert.equal(calls.paid, 1)
})
