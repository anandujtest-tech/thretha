import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CUSTOMER_COOKIE_NAME,
  getCustomerFromRequest,
  hashOtp,
  mobileAuthenticationResponse,
  signCustomerToken,
  verifyAndConsumeEmailOtp,
} from '../lib/auth.js'
import {
  createMobileSession,
  getActiveMobileSession,
  getMobileBearerToken,
  revokeMobileSession,
} from '../lib/mobileSessions.js'

const user = {
  id: 'customer-a', email: 'buyer@example.com', name: 'Buyer', role: 'customer', status: 'ACTIVE',
  phone: '9876543210', password_hash: 'private-password-hash', otp_hash: 'private-otp-hash',
  admin_notes: 'private-admin-notes',
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const value = document[key]
    return expected && typeof expected === 'object' && '$gt' in expected
      ? value > expected.$gt
      : value === expected
  })
}

function memoryDatabase(customers = [user]) {
  const records = []
  const indexes = []
  const sessions = {
    async createIndex(keys, options) { indexes.push({ keys, options }) },
    async insertOne(document) { records.push(document); return { insertedId: document.id } },
    async findOne(filter) { return records.find((item) => matches(item, filter)) || null },
    async updateOne(filter, update) {
      const item = records.find((candidate) => matches(candidate, filter))
      if (!item) return { matchedCount: 0 }
      Object.assign(item, update.$set)
      return { matchedCount: 1 }
    },
  }
  const users = { async findOne(filter) { return customers.find((item) => item.id === filter.id) || null } }
  return {
    records, indexes,
    database: { collection(name) {
      if (name === 'customer_mobile_sessions') return sessions
      if (name === 'users') return users
      throw new Error(`Unexpected collection ${name}`)
    } },
  }
}

function bearerRequest(token, cookie = '') {
  return new Request('https://example.test/api/account/me', {
    headers: { Authorization: `Bearer ${token}`, ...(cookie ? { Cookie: cookie } : {}) },
  })
}

test('mobile tokens are random, opaque, hashed at rest and expire in 14 days', async () => {
  const { database, records, indexes } = memoryDatabase()
  const first = await createMobileSession(database, user.id)
  const second = await createMobileSession(database, user.id)
  assert.match(first.accessToken, /^tcm_[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first.accessToken, second.accessToken)
  assert.equal(first.accessToken.includes(user.id), false)
  assert.equal(first.accessToken.includes(user.email), false)
  assert.equal(first.expiresAt.getTime() - records[0].createdAt.getTime(), 14 * 24 * 60 * 60 * 1000)
  assert.equal(records[0].tokenHash.length, 64)
  assert.equal(JSON.stringify(records).includes(first.accessToken), false)
  assert.equal(indexes.some((entry) => entry.keys.tokenHash === 1 && entry.options?.unique), true)
  assert.equal(indexes.some((entry) => entry.keys.expiresAt === 1 && entry.options?.expireAfterSeconds === 0), true)
})

test('a valid mobile Bearer token authenticates the correct safe customer', async () => {
  const { database, records } = memoryDatabase()
  const session = await createMobileSession(database, user.id)
  const request = bearerRequest(session.accessToken)
  assert.equal(getMobileBearerToken(request), session.accessToken)
  const customer = await getCustomerFromRequest(request, database)
  assert.equal(customer.id, user.id)
  assert.equal(customer.password_hash, undefined)
  assert.equal(customer.admin_notes, undefined)
  assert.ok(records[0].lastUsedAt instanceof Date)
})

test('missing, malformed, modified and invalid Bearer tokens do not authenticate', async () => {
  const { database } = memoryDatabase()
  const { accessToken } = await createMobileSession(database, user.id)
  const altered = `${accessToken.slice(0, -1)}${accessToken.endsWith('A') ? 'B' : 'A'}`
  for (const request of [
    new Request('https://example.test/api/account/me'),
    bearerRequest('malformed'),
    bearerRequest(altered),
    bearerRequest('tcm_short'),
    new Request('https://example.test/api/account/me', { headers: { Authorization: `Basic ${accessToken}` } }),
  ]) {
    assert.equal(await getCustomerFromRequest(request, database), null)
  }
})

test('expired sessions are rejected before TTL deletion and revoked sessions are rejected', async () => {
  const { database, records } = memoryDatabase()
  const first = await createMobileSession(database, user.id)
  records[0].expiresAt = new Date(Date.now() - 1000)
  assert.equal(await getCustomerFromRequest(bearerRequest(first.accessToken), database), null)

  const second = await createMobileSession(database, user.id)
  assert.equal(await revokeMobileSession(database, second.accessToken), true)
  assert.equal(await getCustomerFromRequest(bearerRequest(second.accessToken), database), null)
  assert.equal(await revokeMobileSession(database, second.accessToken), false)
})

test('mobile logout revokes only its own session, leaving another device and website cookie valid', async () => {
  const { database, records } = memoryDatabase()
  const phoneA = await createMobileSession(database, user.id)
  const phoneB = await createMobileSession(database, user.id)
  const websiteToken = signCustomerToken(user)
  const websiteRequest = new Request('https://example.test/api/account/me', {
    headers: { Cookie: `${CUSTOMER_COOKIE_NAME}=${websiteToken}` },
  })

  assert.equal(await revokeMobileSession(database, phoneA.accessToken), true)
  assert.equal(records[0].revokedAt instanceof Date, true)
  assert.equal(records[1].revokedAt, null)
  assert.equal(await getCustomerFromRequest(bearerRequest(phoneA.accessToken), database), null)
  assert.equal((await getCustomerFromRequest(bearerRequest(phoneB.accessToken), database)).id, user.id)
  assert.equal((await getCustomerFromRequest(websiteRequest, database)).id, user.id)
  assert.equal((await getActiveMobileSession(database, phoneB.accessToken)).customerId, user.id)
})

test('explicit malformed Bearer credentials cannot fall back to a valid website cookie', async () => {
  const { database } = memoryDatabase()
  const request = bearerRequest('tcm_short', `${CUSTOMER_COOKIE_NAME}=${signCustomerToken(user)}`)
  assert.equal(await getCustomerFromRequest(request, database), null)
})

test('existing website JWT Bearer callers and cookie authentication continue to work', async () => {
  const { database } = memoryDatabase()
  const websiteToken = signCustomerToken(user)
  assert.equal((await getCustomerFromRequest(bearerRequest(websiteToken), database)).id, user.id)
  const cookieRequest = new Request('https://example.test/api/auth/session', {
    headers: { Cookie: `${CUSTOMER_COOKIE_NAME}=${websiteToken}` },
  })
  assert.equal((await getCustomerFromRequest(cookieRequest, database)).id, user.id)
  const cookieWithUnrelatedHeader = bearerRequest('unrelated', `${CUSTOMER_COOKIE_NAME}=${websiteToken}`)
  assert.equal((await getCustomerFromRequest(cookieWithUnrelatedHeader, database)).id, user.id)
})

test('inactive customer records cannot use an otherwise valid mobile session', async () => {
  const { database } = memoryDatabase([{ ...user, status: 'SUSPENDED' }])
  const session = await createMobileSession(database, user.id)
  assert.equal(await getCustomerFromRequest(bearerRequest(session.accessToken), database), null)
})

test('mobile authentication response exposes only token, expiry and safe customer fields', async () => {
  const { database, records } = memoryDatabase()
  const session = await createMobileSession(database, user.id)
  const response = mobileAuthenticationResponse(session, user)
  assert.deepEqual(Object.keys(response).sort(), ['access_token', 'authenticated', 'customer', 'expires_at', 'token_type'])
  assert.equal(response.authenticated, true)
  assert.equal(response.token_type, 'Bearer')
  assert.equal(response.customer.id, user.id)
  assert.equal(response.expires_at, session.expiresAt.toISOString())
  const privateData = JSON.stringify({ ...response, access_token: '' })
  for (const value of ['private-password-hash', 'private-otp-hash', 'private-admin-notes', records[0].tokenHash]) {
    assert.equal(privateData.includes(value), false)
  }
})

function otpDatabase({ code = '123456', expired = false, attempts = 0 } = {}) {
  const state = { record: null }
  const tokens = {
    async findOne() { return state.record },
    async deleteOne() { state.record = null; return { deletedCount: 1 } },
    async updateOne() { state.record.attempts++; return { matchedCount: 1 } },
    async findOneAndDelete() { const consumed = state.record; state.record = null; return consumed },
  }
  return {
    state,
    database: { collection(name) { assert.equal(name, 'verification_tokens'); return tokens } },
    async ready() {
      state.record = { _id: 'otp-record', identifier: user.email, token_hash: await hashOtp(code), attempts,
        expires_at: new Date(Date.now() + (expired ? -1000 : 10 * 60 * 1000)) }
    },
  }
}

const allow = async () => ({ allowed: true })

test('valid OTP succeeds once and a reused code is rejected', async () => {
  const fixture = otpDatabase()
  await fixture.ready()
  assert.deepEqual(await verifyAndConsumeEmailOtp(fixture.database, user.email, '123456', '127.0.0.1', allow), { ok: true })
  const again = await verifyAndConsumeEmailOtp(fixture.database, user.email, '123456', '127.0.0.1', allow)
  assert.equal(again.status, 400)
  assert.equal(fixture.state.record, null)
})

test('invalid OTP increments attempts; expired or exhausted OTP is rejected', async () => {
  const invalid = otpDatabase()
  await invalid.ready()
  const wrong = await verifyAndConsumeEmailOtp(invalid.database, user.email, '654321', '127.0.0.1', allow)
  assert.equal(wrong.status, 400)
  assert.equal(invalid.state.record.attempts, 1)
  const expired = otpDatabase({ expired: true })
  await expired.ready()
  assert.equal((await verifyAndConsumeEmailOtp(expired.database, user.email, '123456', '127.0.0.1', allow)).status, 400)
  assert.equal(expired.state.record, null)
  const exhausted = otpDatabase({ attempts: 5 })
  await exhausted.ready()
  assert.equal((await verifyAndConsumeEmailOtp(exhausted.database, user.email, '123456', '127.0.0.1', allow)).status, 400)
})

test('OTP verification retains IP and email rate limits', async () => {
  const fixture = otpDatabase()
  await fixture.ready()
  const keys = []
  const result = await verifyAndConsumeEmailOtp(fixture.database, user.email, '123456', '127.0.0.1',
    async (_database, key, maximum, minutes) => {
      keys.push({ key, maximum, minutes })
      return { allowed: key.startsWith('otp_verify_ip_') }
    })
  assert.equal(result.status, 429)
  assert.equal(fixture.state.record !== null, true)
  assert.deepEqual(keys, [
    { key: 'otp_verify_ip_127.0.0.1', maximum: 20, minutes: 10 },
    { key: `otp_verify_email_${user.email}`, maximum: 10, minutes: 10 },
  ])
})
