import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_OCCASIONS, hasMoreOccasions, isOccasionCoverUrl, normalizeOccasions, parseOccasionsInput } from '../lib/occasions.js'
import { occasionsWithAssignments, persistOccasions, planOccasionProductUpdates, unknownOccasionProductIds } from '../lib/occasionManagement.js'
import { getVisibleHomeSectionIds } from '../lib/homeLayout.js'

const cover = 'https://res.cloudinary.com/thretha/image/upload/v123/occasions/college.jpg'
const productA = { id: 'product-a', occasion_slugs: ['wedding'], name: 'A' }
const productB = { id: 'product-b', occasion_slugs: ['festive'], name: 'B' }

test('the six existing occasions remain available and in their original order', () => {
  assert.deepEqual(normalizeOccasions().map((item) => item.slug), DEFAULT_OCCASIONS.map((item) => item.slug))
  assert.equal(normalizeOccasions().every((item) => item.active), true)
})

test('create and edit preserve the stable occasion ID and a Cloudinary cover', () => {
  const created = { id: 'college-wear', slug: 'college-wear', name: 'College Wear', image: cover, active: true, deleted: false, product_ids: ['product-a'] }
  const first = parseOccasionsInput([...normalizeOccasions(), created])
  assert.equal(first.error, undefined)
  assert.deepEqual(first.occasions.at(-1), created)
  const edited = { ...created, name: 'Campus Edit', image: cover.replace('college.jpg', 'campus.jpg') }
  const second = parseOccasionsInput([...first.occasions.slice(0, -1), edited])
  assert.equal(second.occasions.at(-1).slug, 'college-wear')
  assert.equal(second.occasions.at(-1).image, edited.image)
})

test('invalid image, status, product IDs and duplicate IDs cannot be saved', () => {
  const good = { slug: 'college', name: 'College', image: cover, active: true, deleted: false, product_ids: ['product-a'] }
  assert.equal(isOccasionCoverUrl(cover), true)
  assert.equal(isOccasionCoverUrl('http://res.cloudinary.com/thretha/image/upload/x.jpg'), false)
  assert.equal(parseOccasionsInput([{ ...good, image: '/api/media/file/old' }]).error !== undefined, true)
  assert.equal(parseOccasionsInput([{ ...good, active: 'true' }]).error !== undefined, true)
  assert.equal(parseOccasionsInput([{ ...good, product_ids: ['bad id'] }]).error !== undefined, true)
  assert.equal(parseOccasionsInput([good, good]).error !== undefined, true)
})

test('inactive and soft-deleted occasions stay stored but disappear from the storefront', () => {
  const original = normalizeOccasions()
  const inactive = original.map((item) => item.slug === 'wedding' ? { ...item, active: false } : item)
  assert.equal(normalizeOccasions(inactive).filter((item) => item.active).some((item) => item.slug === 'wedding'), false)
  const deleted = inactive.map((item) => item.slug === 'wedding' ? { ...item, deleted: true } : item)
  assert.equal(normalizeOccasions(deleted).length, original.length)
  assert.equal(normalizeOccasions(deleted).find((item) => item.slug === 'wedding').deleted, true)
  assert.equal(normalizeOccasions(deleted).find((item) => item.slug === 'wedding').active, false)
})

test('product assignments update only occasion tags and do not delete products', () => {
  const previous = normalizeOccasions()
  const next = previous.map((item) => item.slug === 'wedding'
    ? { ...item, product_ids: ['product-b'] }
    : { ...item, product_ids: item.slug === 'festive' ? ['product-b'] : [] })
  const changes = planOccasionProductUpdates(previous, next, [productA, productB])
  assert.deepEqual(changes, [
    { id: 'product-a', occasion_slugs: [] },
    { id: 'product-b', occasion_slugs: ['wedding', 'festive'] },
  ])
  assert.deepEqual(unknownOccasionProductIds(next, [productA, productB]), [])
  assert.deepEqual(unknownOccasionProductIds([{ ...next[0], product_ids: ['missing-product'] }], [productA]), ['missing-product'])
  assert.deepEqual(occasionsWithAssignments(previous, [productA, productB]).find((item) => item.slug === 'wedding').product_ids, ['product-a'])
  assert.deepEqual(planOccasionProductUpdates(previous, next, [{ ...productB, occasion_slugs: ['wedding', 'wedding'] }]), [
    { id: 'product-b', occasion_slugs: ['wedding', 'festive'] },
  ])
})

test('individual occasion order survives normalization and empty active list hides the section', () => {
  const reversed = normalizeOccasions().reverse()
  assert.deepEqual(parseOccasionsInput(reversed).occasions.map((item) => item.slug), reversed.map((item) => item.slug))
  const allInactive = reversed.map((item) => ({ ...item, active: false }))
  assert.equal(normalizeOccasions(allInactive).filter((item) => item.active).length, 0)
  assert.equal(getVisibleHomeSectionIds(undefined, { shop_by_occasion: false }).includes('shop_by_occasion'), false)
  assert.equal(getVisibleHomeSectionIds(undefined, { shop_by_occasion: true }).includes('shop_by_occasion'), true)
})

test('saving creation, edits, ordering and soft deletion preserves settings and products', async () => {
  const state = {
    settings: { id: 'global', shop_by_occasion: { enabled: true }, shipping: { delivery_charge: 99 }, homepage_content: { section_order: ['hero', 'shop_by_occasion'] } },
    products: [structuredClone(productA), structuredClone(productB)],
  }
  const database = { collection(name) {
    if (name === 'settings') return {
      findOne: async () => structuredClone(state.settings),
      updateOne: async (_filter, update) => {
        state.settings.shop_by_occasion.occasions = structuredClone(update.$set['shop_by_occasion.occasions'])
      },
    }
    if (name === 'products') return {
      find: () => ({ toArray: async () => structuredClone(state.products) }),
      bulkWrite: async (operations) => {
        for (const { updateOne } of operations) {
          const product = state.products.find((item) => item.id === updateOne.filter.id)
          product.occasion_slugs = updateOne.update.$set.occasion_slugs
        }
      },
    }
    throw new Error('Unexpected collection')
  } }
  const college = { slug: 'college', name: 'College Wear', image: cover, active: true, deleted: false, product_ids: ['product-b'] }
  const created = parseOccasionsInput([college, ...occasionsWithAssignments(undefined, state.products)]).occasions
  await persistOccasions(database, created, {})
  assert.equal(state.settings.shop_by_occasion.occasions[0].slug, 'college')
  assert.equal(state.settings.shop_by_occasion.occasions[0].image, cover)
  assert.deepEqual(state.products.find((item) => item.id === 'product-b').occasion_slugs, ['college', 'festive'])

  const edited = created.map((item) => item.slug === 'college'
    ? { ...item, name: 'Campus Edit', image: cover.replace('college.jpg', 'campus.jpg'), active: false }
    : item).reverse()
  await persistOccasions(database, edited, {})
  assert.equal(state.settings.shop_by_occasion.occasions.at(-1).name, 'Campus Edit')
  assert.equal(state.settings.shop_by_occasion.occasions.at(-1).active, false)
  assert.equal(state.settings.shop_by_occasion.occasions.at(-1).image, cover.replace('college.jpg', 'campus.jpg'))

  const deleted = edited.map((item) => item.slug === 'college' ? { ...item, deleted: true, active: false } : item)
  await persistOccasions(database, deleted, {})
  assert.equal(state.settings.shop_by_occasion.occasions.at(-1).deleted, true)
  assert.equal(state.products.length, 2)
  assert.equal(state.products.find((item) => item.id === 'product-b').occasion_slugs.includes('college'), true)
  assert.deepEqual(state.settings.shipping, { delivery_charge: 99 })
  assert.deepEqual(state.settings.homepage_content.section_order, ['hero', 'shop_by_occasion'])
})

test('the scroll hint appears only with remaining overflow and clears at the end', () => {
  assert.equal(hasMoreOccasions(0, 600, 300), true)
  assert.equal(hasMoreOccasions(100, 600, 300), true)
  assert.equal(hasMoreOccasions(300, 600, 300), false)
  assert.equal(hasMoreOccasions(0, 300, 300), false)
  assert.equal(hasMoreOccasions(0, 301, 300), false)
})
