import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  mobileGoogleConfig, startMobileGoogleAuth, consumeMobileGoogleState,
  exchangeMobileGoogleCode, findOrCreateMobileGoogleCustomer,
  createMobileGoogleHandoff, consumeMobileGoogleHandoff,
} from '../lib/googleMobileAuth.js'
import { createMobileSession, revokeMobileSession, getActiveMobileSession } from '../lib/mobileSessions.js'

const config = {
  clientId: 'google-client-id', clientSecret: 'server-only-secret',
  callbackUri: 'https://www.thretha.in/api/auth/google/mobile/callback',
  appRedirectUri: 'in.thretha.app://oauth/google',
}
const verifier = crypto.randomBytes(32).toString('base64url')
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')

function database() {
  const docs = new Map()
  const collection = (name) => {
    if (!docs.has(name)) docs.set(name, [])
    const rows = docs.get(name)
    const match = (row, filter) => Object.entries(filter).every(([key, value]) =>
      value && typeof value === 'object' && '$gt' in value ? row[key] > value.$gt : row[key] === value)
    return {
      async createIndex() {},
      async insertOne(row) { rows.push(row); return { insertedId: row.id } },
      async findOne(filter) { return rows.find((row) => match(row, filter)) || null },
      async findOneAndDelete(filter) {
        const i = rows.findIndex((row) => match(row, filter))
        return i < 0 ? null : rows.splice(i, 1)[0]
      },
      async updateOne(filter, update, options = {}) {
        let row = rows.find((entry) => match(entry, filter))
        if (!row && options.upsert) { row = {}; rows.push(row) }
        if (!row) return { matchedCount: 0 }
        Object.assign(row, update.$setOnInsert || {}, update.$set || {})
        return { matchedCount: 1 }
      },
      async updateMany() { return { matchedCount: 0 } },
    }
  }
  return { docs, db: { collection } }
}

const begin = (db, redirect = config.appRedirectUri, proof = challenge) =>
  startMobileGoogleAuth(db, config, redirect, proof)

test('configuration requires exact HTTPS backend callback and configured native redirect', () => {
  assert.deepEqual(mobileGoogleConfig({
    GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret,
    GOOGLE_MOBILE_CALLBACK_URL: config.callbackUri,
    GOOGLE_MOBILE_APP_REDIRECT_URI: config.appRedirectUri,
    NODE_ENV: 'production',
  }), config)
  assert.throws(() => mobileGoogleConfig({ ...process.env,
    GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret,
    GOOGLE_MOBILE_CALLBACK_URL: 'http://example.test/api/auth/google/mobile/callback',
    GOOGLE_MOBILE_APP_REDIRECT_URI: config.appRedirectUri, NODE_ENV: 'production',
  }), /mobile_google_not_configured/)
})

test('authorization URL uses random stored mobile state and S256 without client secret or verifier', async () => {
  const { db, docs } = database()
  const first = await begin(db)
  const second = await begin(db)
  const url = new URL(first.authorization_url)
  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('redirect_uri'), config.callbackUri)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/)
  assert.match(first.state, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first.state, second.state)
  assert.equal(docs.get('customer_mobile_google_states')[0].client, 'mobile')
  assert.equal(docs.get('customer_mobile_google_states')[0].stateHash === first.state, false)
  assert.equal(first.authorization_url.includes(config.clientSecret), false)
  assert.equal(first.authorization_url.includes(docs.get('customer_mobile_google_states')[0].codeVerifier), false)
})

test('arbitrary redirect and invalid handoff PKCE challenge are rejected', async () => {
  const { db } = database()
  await assert.rejects(begin(db, 'https://attacker.test/callback'), /unsupported_redirect_uri/)
  await assert.rejects(begin(db, config.appRedirectUri, 'plain'), /invalid_pkce_challenge/)
})

test('valid state is single use; missing, invalid, expired, and wrong redirect states fail', async () => {
  const { db, docs } = database()
  const started = await begin(db)
  await assert.rejects(consumeMobileGoogleState(db, config, null), /invalid_state/)
  await assert.rejects(consumeMobileGoogleState(db, config, 'a'.repeat(43)), /invalid_state/)
  await assert.rejects(consumeMobileGoogleState(db, { ...config, appRedirectUri: 'in.other.app://oauth/google' }, started.state), /invalid_state/)
  assert.equal((await consumeMobileGoogleState(db, config, started.state)).client, 'mobile')
  await assert.rejects(consumeMobileGoogleState(db, config, started.state), /invalid_state/)
  const expired = await begin(db)
  docs.get('customer_mobile_google_states')[0].expiresAt = new Date(0)
  await assert.rejects(consumeMobileGoogleState(db, config, expired.state), /invalid_state/)
})

test('Google code exchange uses server secret and stored PKCE verifier; invalid code fails safely', async () => {
  const { db } = database()
  const started = await begin(db)
  const state = await consumeMobileGoogleState(db, config, started.state)
  await assert.rejects(exchangeMobileGoogleCode(config, '', state, async () => { throw Error('unexpected') }), /missing_code/)
  let tokenBody
  const fetchImpl = async (url, options) => {
    if (url.includes('/token')) {
      tokenBody = new URLSearchParams(options.body)
      return { ok: true, json: async () => ({ access_token: 'internal-google-token' }) }
    }
    assert.equal(options.headers.Authorization, 'Bearer internal-google-token')
    return { ok: true, json: async () => ({ id: 'google-id', email: 'buyer@example.test', verified_email: true }) }
  }
  const profile = await exchangeMobileGoogleCode(config, 'valid-code', state, fetchImpl)
  assert.equal(profile.id, 'google-id')
  assert.equal(tokenBody.get('redirect_uri'), config.callbackUri)
  assert.equal(tokenBody.get('client_secret'), config.clientSecret)
  assert.equal(tokenBody.get('code_verifier'), state.codeVerifier)
  await assert.rejects(exchangeMobileGoogleCode(config, 'invalid-code', state,
    async () => ({ ok: false })), /google_exchange_failed/)
  await assert.rejects(exchangeMobileGoogleCode(config, 'code', state,
    async (url) => url.includes('/token')
      ? { ok: true, json: async () => ({ access_token: 'internal' }) }
      : { ok: true, json: async () => ({ id: 'google-id', email: 'buyer@example.test', verified_email: false }) }),
  /invalid_google_identity/)
})

test('verified Google identity links to existing email and avoids duplicate customers', async () => {
  const { db, docs } = database()
  const users = db.collection('users')
  await users.insertOne({ id: 'existing', email: 'buyer@example.test', status: 'ACTIVE' })
  const profile = { id: 'google-id', email: 'buyer@example.test', verified_email: true, name: 'Buyer' }
  const first = await findOrCreateMobileGoogleCustomer(db, profile)
  const second = await findOrCreateMobileGoogleCustomer(db, profile)
  assert.equal(first.id, 'existing')
  assert.equal(second.id, 'existing')
  assert.equal(docs.get('users').length, 1)
  assert.equal(docs.get('accounts')[0].userId, 'existing')
})

test('handoff requires app-held verifier, expires, is single use and issues ordinary revocable mobile session', async () => {
  const { db, docs } = database()
  const started = await begin(db)
  const state = await consumeMobileGoogleState(db, config, started.state)
  const redirect = new URL(await createMobileGoogleHandoff(db, state, 'existing'))
  assert.equal(redirect.origin, 'null') // custom-scheme redirect
  assert.equal(redirect.protocol, 'in.thretha.app:')
  const code = redirect.searchParams.get('code')
  assert.match(code, /^[A-Za-z0-9_-]{43}$/)
  await assert.rejects(consumeMobileGoogleHandoff(db, config, code, 'x'.repeat(43)), /invalid_handoff/)
  assert.equal(await consumeMobileGoogleHandoff(db, config, code, verifier), 'existing')
  await assert.rejects(consumeMobileGoogleHandoff(db, config, code, verifier), /invalid_handoff/)
  const session = await createMobileSession(db, 'existing')
  assert.equal((await getActiveMobileSession(db, session.accessToken)).customerId, 'existing')
  assert.equal(await revokeMobileSession(db, session.accessToken), true)
  assert.equal(await getActiveMobileSession(db, session.accessToken), null)
  const other = await begin(db)
  const otherState = await consumeMobileGoogleState(db, config, other.state)
  const otherCode = new URL(await createMobileGoogleHandoff(db, otherState, 'existing')).searchParams.get('code')
  docs.get('customer_mobile_google_handoffs')[0].expiresAt = new Date(0)
  await assert.rejects(consumeMobileGoogleHandoff(db, config, otherCode, verifier), /invalid_handoff/)
})
