import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePublicProducts, paginatedProductPipeline } from '../lib/publicCatalog.js'
import { filterProductsByPriceAndAvailability, parsePriceRange } from '../lib/catalogFilters.js'
import { getProductEffectivePrice } from '../lib/productInventory.js'

const products = Array.from({ length: 45 }, (_, index) => ({
  _id: index + 1, id: `p${index + 1}`, slug: `piece-${index + 1}`,
  name: index % 2 ? `Silk piece ${index + 1}` : `Cotton piece ${index + 1}`,
  category_id: index % 2 ? 'silk' : 'cotton', category_name: index % 2 ? 'Silk' : 'Cotton',
  price: 1000 + index * 10, discount_price: index % 3 ? null : 500 + index * 10,
  stock: index % 4 ? 2 : 0, sizes: index % 5 ? [{ size: 'M', available: true, stock: index % 4 ? 2 : 0 }] : [],
  active: index === 44 ? false : true, featured: index % 3 === 0,
  new_arrival: index % 3 === 1, created_at: new Date(2026, 0, Math.floor(index / 2) + 1),
  colour: index % 2 ? 'Gold' : 'Blue', occasion_slugs: index % 2 ? ['wedding'] : ['casual'],
  media: [{ url: 'https://res.cloudinary.com/example/image.jpg' }],
  password_hash: 'never-public', supplier_cost: 100, internal_note: 'private',
}))

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((item) => matches(row, item))
    if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(row[key])
    if (value && typeof value === 'object' && '$regex' in value) return new RegExp(value.$regex, value.$options || '').test(row[key] || '')
    if (Array.isArray(row[key])) return row[key].includes(value)
    return row[key] === value
  })
}

function mockDatabase() {
  const calls = { aggregate: [], find: [], count: [] }
  const sorted = (rows, sort) => [...rows].sort((a, b) => {
    for (const [key, direction] of Object.entries(sort)) {
      const delta = key === '_effectivePrice'
        ? getProductEffectivePrice(a) - getProductEffectivePrice(b)
        : a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0
      if (delta) return delta * direction
    }
    return 0
  })
  const publicRows = (rows) => rows.map(({ _id, password_hash, supplier_cost, internal_note, ...row }) => row)
  const db = { collection(name) {
    if (name === 'categories') return { findOne: async ({ slug }) => ({
      slug, id: slug === 'silk' ? 'silk' : slug === 'cotton' ? 'cotton' : 'unknown',
    }) }
    if (name === 'settings') return { findOne: async () => ({ shop_by_occasion: { enabled: true } }) }
    if (name !== 'products') throw new Error('unexpected collection')
    return {
      async countDocuments(filter) { calls.count.push(filter); return products.filter((row) => matches(row, filter)).length },
      find(filter, options) {
        calls.find.push(filter)
        let order, offset = 0, max = Number.MAX_SAFE_INTEGER
        const cursor = {
          sort(value) { order = value; return cursor },
          skip(value) { offset = value; return cursor },
          limit(value) { max = value; return cursor },
          async toArray() {
            const rows = products.filter((row) => matches(row, filter))
            return options?.projection ? publicRows(sorted(rows, order).slice(offset, offset + max)) : rows
          },
        }
        return cursor
      },
      aggregate(pipeline) {
        calls.aggregate.push(pipeline)
        return { toArray: async () => {
          // In-memory fixture models Mongo's final result. Assertions below also
          // inspect the actual $match/$sort/$skip/$limit/$project pipeline.
          const base = pipeline[0].$match
          const url = calls.currentUrl
          const q = new URL(url).searchParams
          const priceRange = parsePriceRange(q.get('minPrice'), q.get('maxPrice'))
          const filtered = filterProductsByPriceAndAvailability(
            products.filter((row) => matches(row, base)),
            { priceRange, availability: q.get('availability'), size: q.get('size') || '' },
          )
          const sort = q.get('sort')
          filtered.sort((a, b) => {
            if (sort === 'price_asc' || sort === 'price_desc') {
              const delta = getProductEffectivePrice(a) - getProductEffectivePrice(b)
              return (sort === 'price_asc' ? delta : -delta) || a._id - b._id
            }
            if (sort === 'featured') return Number(b.featured) - Number(a.featured) || a._id - b._id
            return b.created_at - a.created_at || b._id - a._id
          })
          if (pipeline.at(-1).$count) return [{ total: filtered.length }]
          const skip = pipeline.find((stage) => '$skip' in stage).$skip
          const limit = pipeline.find((stage) => '$limit' in stage).$limit
          return publicRows(filtered.slice(skip, skip + limit))
        } }
      },
    }
  } }
  return { db, calls }
}

async function request(path, fixture) {
  fixture.calls.currentUrl = `https://example.test/api${path}`
  return handlePublicProducts(new Request(fixture.calls.currentUrl), fixture.db)
}

test('real products handler keeps website array and paginates explicit mobile requests in Mongo', async () => {
  const fixture = mockDatabase()
  const legacy = await request('/products', fixture)
  assert.equal(Array.isArray(legacy.body), true)
  assert.equal(legacy.body.length, 44)
  const first = await request('/products?page=1&limit=20', fixture)
  const second = await request('/products?page=2&limit=20', fixture)
  assert.deepEqual(first.body.pagination, { page: 1, limit: 20, total: 44,
    totalPages: 3, hasNextPage: true, hasPreviousPage: false })
  assert.deepEqual(second.body.pagination, { page: 2, limit: 20, total: 44,
    totalPages: 3, hasNextPage: true, hasPreviousPage: true })
  assert.equal(first.body.products.length, 20)
  assert.equal(second.body.products.length, 20)
  assert.equal(new Set([...first.body.products, ...second.body.products].map((row) => row.id)).size, 40)
  assert.equal(fixture.calls.aggregate.length, 0)
  assert.equal(fixture.calls.count.length, 2)
  assert.equal(fixture.calls.find.length, 3)
  assert.equal(first.body.products[0].supplier_cost, undefined)
  assert.equal(first.body.products[0].password_hash, undefined)
  assert.equal(first.body.products[0].internal_note, undefined)
  const pipeline = paginatedProductPipeline({ active: true }, new URLSearchParams(''),
    { page: 1, limit: 20 }, parsePriceRange(null, null))
  assert.equal(pipeline.products.at(-1).$project.supplier_cost, undefined)
})

test('default, custom, capped, invalid and beyond-final pagination metadata', async () => {
  const f = mockDatabase()
  assert.equal((await request('/products?format=paginated', f)).body.pagination.limit, 20)
  assert.equal((await request('/products?page=2&limit=7', f)).body.pagination.limit, 7)
  assert.equal((await request('/products?page=0&limit=0', f)).body.pagination.page, 1)
  assert.equal((await request('/products?page=abc&limit=abc', f)).body.pagination.limit, 20)
  assert.equal((await request('/products?page=1&limit=1000', f)).body.pagination.limit, 50)
  const last = await request('/products?page=3&limit=20', f)
  assert.equal(last.body.products.length, 4)
  assert.equal(last.body.pagination.hasNextPage, false)
  const beyond = await request('/products?page=7&limit=20', f)
  assert.equal(beyond.body.products.length, 0)
  assert.equal(beyond.body.pagination.total, 44)
  assert.equal(beyond.body.pagination.hasPreviousPage, true)
})

test('search, category, active, price, size and availability filter before pagination', async () => {
  const f = mockDatabase()
  const search = await request('/products?search=Silk&page=1&limit=5', f)
  assert.equal(search.body.pagination.total, 22)
  assert.equal(search.body.products.every((p) => p.name.includes('Silk')), true)
  const category = await request('/products?category=cotton&page=1&limit=5', f)
  assert.equal(category.body.pagination.total, 22)
  const inventory = await request('/products?availability=in&size=M&minPrice=600&maxPrice=1300&page=1&limit=5', f)
  assert.equal(inventory.body.products.every((p) => p.stock > 0 && getProductEffectivePrice(p) >= 600 && getProductEffectivePrice(p) <= 1300), true)
  const pipeline = f.calls.aggregate.at(-1)
  assert.equal(pipeline.some((stage) => '$addFields' in stage), true)
  assert.equal(pipeline.some((stage) => stage.$match?._available === true), true)
  assert.equal(pipeline.some((stage) => stage.$match?._effectivePrice?.$gte === 600), true)
  assert.equal(pipeline.at(-1).$project._id, 0)
  assert.equal((await request('/products?category=missing&page=1', f)).body.pagination.total, 0)
})

test('all supported sort modes have a deterministic _id tie-breaker', async () => {
  const f = mockDatabase()
  for (const sort of ['newest', 'price_asc', 'price_desc', 'featured']) {
    const result = await request(`/products?page=1&limit=20&sort=${sort}`, f)
    assert.equal(result.body.products.length, 20)
    const pipeline = paginatedProductPipeline({ active: true }, new URLSearchParams(`sort=${sort}`),
      { page: 1, limit: 20 }, parsePriceRange(null, null))
    const keys = Object.keys(pipeline.products.find((stage) => stage.$sort).$sort)
    assert.equal(keys.at(-1), '_id')
  }
  const price = await request('/products?page=1&limit=20&sort=price_asc', f)
  assert.equal(getProductEffectivePrice(price.body.products[0]) <= getProductEffectivePrice(price.body.products[1]), true)
})

test('slugs, occasion, colour, new-arrival and featured filters remain available in paginated mode', async () => {
  const f = mockDatabase()
  const slugs = await request('/products?slugs=piece-1,piece-3&page=1', f)
  assert.equal(slugs.body.pagination.total, 2)
  const colour = await request('/products?colour=Gold&page=1', f)
  assert.equal(colour.body.pagination.total, 22)
  const fresh = await request('/products?new=true&page=1', f)
  assert.equal(fresh.body.products.every((p) => p.new_arrival), true)
  const featured = await request('/products?featured=true&page=1', f)
  assert.equal(featured.body.products.every((p) => p.featured), true)
  const occasion = await request('/products?occasion=wedding&page=1', f)
  assert.equal(occasion.body.pagination.total, 22)
})

test('invalid price range retains existing 400 error and legacy visibility rules', async () => {
  const f = mockDatabase()
  const invalid = await request('/products?page=1&minPrice=20&maxPrice=10', f)
  assert.equal(invalid.status, 400)
  const legacy = await request('/products?availability=in', f)
  assert.equal(Array.isArray(legacy.body), true)
  assert.equal(legacy.body.every((p) => p.active && p.stock > 0), true)
  const pipeline = paginatedProductPipeline({ active: true }, new URLSearchParams('sort=price_asc'),
    { page: 1, limit: 20 }, parsePriceRange(null, null))
  assert.equal(pipeline.products.some((stage) => '$limit' in stage), true)
})
