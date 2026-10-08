import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import jwt from 'jsonwebtoken'
import vm from 'node:vm'
import { MAX_CAMPAIGN_IMAGE_BYTES, validateCampaignImage } from '../lib/adminCampaignImage.js'
import { validateNewsletterDraft, renderNewsletterEmail } from '../lib/newsletterCampaigns.js'
import { cleanCampaignInput, getWebPushPayload } from '../lib/pushNotifications.js'

const cloudinaryUrl = 'https://res.cloudinary.com/example/image/upload/thretha/newsletters/look.png'
const baseUrl = 'https://www.thretha.in'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0])
const imageFile = (bytes, type, name = 'picture') => new File([bytes], name, { type })

test('image validation checks size, MIME and file signature before signing', async () => {
  await validateCampaignImage(imageFile(png, 'image/png'))
  await assert.rejects(validateCampaignImage(imageFile(png, 'application/x-msdownload')), /isn't supported/)
  await assert.rejects(validateCampaignImage(imageFile(Uint8Array.from([77, 90, 0, 0]), 'image/png')), /isn't supported/)
  await assert.rejects(validateCampaignImage(imageFile(new Uint8Array(MAX_CAMPAIGN_IMAGE_BYTES + 1), 'image/png')), /too large/)
  await assert.rejects(validateCampaignImage(imageFile(new Uint8Array(), 'image/png')), /empty/)
})

test('newsletter upload URL uses the existing image block, draft and email preview', () => {
  const input = { subject: 'New edit', preview_text: '', audience: 'active', blocks: [{ type: 'image', url: cloudinaryUrl, alt: 'Look' }] }
  const validated = validateNewsletterDraft(input, baseUrl)
  assert.equal(validated.value.blocks[0].url, cloudinaryUrl)
  assert.match(renderNewsletterEmail(validated.value, { baseUrl, unsubscribeUrl: `${baseUrl}/unsubscribe` }), /thretha\/newsletters\/look\.png/)
  assert.equal(validateNewsletterDraft({ ...input, blocks: [{ ...input.blocks[0], url: 'https://example.com/look.png' }] }, baseUrl).value.blocks[0].url, 'https://example.com/look.png')
})

test('notification upload URL reaches the existing Web Push image payload', () => {
  const content = cleanCampaignInput({ title: 'Hello', message: 'A new look', image: cloudinaryUrl, destination: '/' })
  assert.equal(getWebPushPayload(content).image, cloudinaryUrl)
  assert.equal(cleanCampaignInput({ title: 'Hello', message: 'A new look', image: 'https://example.com/look.png' }).image, 'https://example.com/look.png')
})

test('shared signature endpoint is Admin-only and never returns the Cloudinary secret', async () => {
  const source = fs.readFileSync(new URL('../app/api/[[...path]]/route.js', import.meta.url), 'utf8')
  const authHelpers = source.slice(source.indexOf('function getToken('), source.indexOf('const VISITOR_EVENT_NAMES'))
  const branch = source.slice(source.indexOf("      if (route === '/admin/media/signature'"), source.indexOf("      if (route === '/admin/me'"))
  const secret = 'test-cloudinary-secret'
  const context = vm.createContext({ jwt, getSigningSecret: () => 'test-jwt-secret', process: { env: { CLOUDINARY_CLOUD_NAME: 'example', CLOUDINARY_API_KEY: 'public-test-key', CLOUDINARY_API_SECRET: secret } }, cloudinaryEnabled: () => true, cloudinary: { utils: { api_sign_request: () => 'test-signature' } }, Date, json: (data, status = 200) => ({ status, data }) })
  vm.runInContext(`${authHelpers}\nasync function handle(request) { const route = '/admin/media/signature'; const method = 'POST'; const parts = ['admin', 'media', 'signature']; const auth = requireAuth(request); if (!auth) return json({ error: 'Unauthorized' }, 401); ${branch} }; this.handle = handle`, context)
  const request = (role) => ({ headers: { get: () => role ? `Bearer ${jwt.sign({ role }, 'test-jwt-secret')}` : '' }, json: async () => ({ folder: 'newsletters', resourceType: 'image' }) })
  assert.equal((await context.handle(request())).status, 401)
  assert.equal((await context.handle(request('customer'))).status, 401)
  const response = await context.handle(request('admin'))
  assert.equal(response.status, 200)
  assert.equal(response.data.folder, 'thretha/newsletters')
  assert.equal(response.data.resource_type, 'image')
  assert.ok(!JSON.stringify(response.data).includes(secret))
})
