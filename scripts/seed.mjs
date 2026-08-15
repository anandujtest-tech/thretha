#!/usr/bin/env node
/**
 * THRETHA COUTURE — standalone database seeder.
 *
 * Usage:
 *   node scripts/seed.mjs           # seed only if empty (idempotent)
 *   node scripts/seed.mjs --force   # wipe seed collections and re-seed
 *
 * Reads MONGO_URL, DB_NAME, MEDIA_DIR, ADMIN_EMAIL, ADMIN_PASSWORD, DEFAULT_WHATSAPP
 * from the environment (a local .env file is loaded automatically if present).
 */
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// --- tiny .env loader (no dependency) ---
function loadEnv() {
  const p = path.join(ROOT, '.env')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
}
loadEnv()

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017'
const DB_NAME = process.env.DB_NAME || 'thretha_couture'
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(ROOT, '.media')
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@threthacouture.com').toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'thretha@2026'
const DEFAULT_WHATSAPP = (process.env.DEFAULT_WHATSAPP || '918301824696').replace(/[^0-9]/g, '')
const FORCE = process.argv.includes('--force')

function slugify(str) {
  return String(str || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80)
}

// Copy bundled seed images into the runtime media directory so they are served.
function copySeedImages() {
  const src = path.join(ROOT, 'seed-media')
  if (!fs.existsSync(src)) return
  fs.mkdirSync(MEDIA_DIR, { recursive: true })
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(MEDIA_DIR, f))
  }
  console.log('✓ Seed images copied to', MEDIA_DIR)
}

const M = (n) => `/api/media/file/seed-${n}.jpg`

async function main() {
  copySeedImages()
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db(DB_NAME)
  console.log('✓ Connected to', DB_NAME)

  const settingsCol = db.collection('settings')
  const existing = await settingsCol.findOne({ id: 'global' })
  if (existing && !FORCE) {
    console.log('Database already seeded. Use --force to reset. Skipping.')
    await client.close(); return
  }
  if (FORCE) {
    for (const c of ['settings', 'products', 'categories', 'users']) await db.collection(c).deleteMany({})
    console.log('✓ Cleared existing seed collections (--force)')
  }

  // Indexes
  await db.collection('users').createIndex({ email: 1 }, { unique: true })
  await db.collection('products').createIndex({ slug: 1 }, { unique: true })
  await db.collection('products').createIndex({ category_id: 1 })
  await db.collection('categories').createIndex({ slug: 1 }, { unique: true })
  await db.collection('orders').createIndex({ order_number: 1 }, { unique: true })
  await db.collection('settings').createIndex({ id: 1 }, { unique: true })

  const now = new Date()

  await db.collection('users').insertOne({
    id: uuidv4(), name: 'Thretha Admin', email: ADMIN_EMAIL,
    password_hash: await bcrypt.hash(ADMIN_PASSWORD, 10), role: 'admin', created_at: now,
  })
  console.log('✓ Admin user:', ADMIN_EMAIL)

  const sareesId = uuidv4()
  const cropsId = uuidv4()
  await db.collection('categories').insertMany([
    { id: sareesId, name: 'Sarees', slug: 'sarees', description: 'Draped for celebrations, slow mornings and everything in between.', image: M('01'), display_order: 1, active: true, created_at: now },
    { id: cropsId, name: 'Crop Tops', slug: 'crop-tops', description: 'Modern little things for easy, everyday styling.', image: M('07'), display_order: 2, active: true, created_at: now },
  ])

  const sareeImgs = ['01', '02', '03', '04', '05', '06'].map((s) => M(s))
  const cropImgs = ['07', '08', '09', '10', '11', '12'].map((s) => M(s))
  const freeSize = [{ size: 'Free Size', available: true, stock: 8 }]
  const tsize = (stocks) => ['XS', 'S', 'M', 'L', 'XL'].map((s, i) => ({ size: s, available: stocks[i] > 0, stock: stocks[i] }))
  const mkMedia = (urls) => urls.map((u, i) => ({ id: uuidv4(), type: 'image', url: u, display_order: i, is_primary: i === 0 }))

  const products = [
    { name: 'Kerala Rose Saree', sku: 'TC-SR-001', category_id: sareesId, category_name: 'Sarees', description: 'A lightweight piece designed for easy, effortless styling — draped for celebrations and slow mornings alike.', price: 2499, discount_price: null, fabric: 'Cotton Blend', colour: 'Rose', material: 'Cotton', pattern: 'Woven', care_instructions: 'Dry clean recommended. Store folded in muslin.', stock: 8, sizes: freeSize, media: mkMedia([sareeImgs[0], sareeImgs[3]]), featured: true, new_arrival: true, best_seller: false },
    { name: 'Marigold Silk Saree', sku: 'TC-SR-002', category_id: sareesId, category_name: 'Sarees', description: 'A sunlit ochre drape with a soft sheen, made for the festive season.', price: 3899, discount_price: 3299, fabric: 'Art Silk', colour: 'Marigold', material: 'Silk', pattern: 'Solid with zari border', care_instructions: 'Dry clean only.', stock: 5, sizes: freeSize, media: mkMedia([sareeImgs[1], sareeImgs[4]]), featured: true, new_arrival: true, best_seller: true },
    { name: 'Midnight Gold Saree', sku: 'TC-SR-003', category_id: sareesId, category_name: 'Sarees', description: 'Deep black with delicate gold detailing — an heirloom in the making.', price: 4599, discount_price: null, fabric: 'Organza', colour: 'Black & Gold', material: 'Organza', pattern: 'Embellished', care_instructions: 'Dry clean only. Avoid direct sunlight.', stock: 2, sizes: freeSize, media: mkMedia([sareeImgs[2]]), featured: false, new_arrival: true, best_seller: false },
    { name: 'Ivory Morning Saree', sku: 'TC-SR-004', category_id: sareesId, category_name: 'Sarees', description: 'A soft ivory cotton drape for unhurried, everyday elegance.', price: 2199, discount_price: null, fabric: 'Cotton', colour: 'Ivory', material: 'Cotton', pattern: 'Minimal', care_instructions: 'Gentle hand wash.', stock: 10, sizes: freeSize, media: mkMedia([sareeImgs[3], sareeImgs[0]]), featured: true, new_arrival: false, best_seller: true },
    { name: 'Amber Festive Saree', sku: 'TC-SR-005', category_id: sareesId, category_name: 'Sarees', description: 'Warm amber tones with a graceful fall, styled for celebrations.', price: 3299, discount_price: 2899, fabric: 'Georgette', colour: 'Amber', material: 'Georgette', pattern: 'Solid', care_instructions: 'Dry clean recommended.', stock: 0, sizes: freeSize, media: mkMedia([sareeImgs[4], sareeImgs[1]]), featured: false, new_arrival: false, best_seller: false },
    { name: 'Onyx Drape Saree', sku: 'TC-SR-006', category_id: sareesId, category_name: 'Sarees', description: 'A modern black drape with a subtle dupatta detail.', price: 2799, discount_price: null, fabric: 'Chiffon', colour: 'Onyx', material: 'Chiffon', pattern: 'Solid', care_instructions: 'Dry clean only.', stock: 6, sizes: freeSize, media: mkMedia([sareeImgs[5]]), featured: false, new_arrival: true, best_seller: false },
    { name: 'Sunlit Crop Top', sku: 'TC-CT-001', category_id: cropsId, category_name: 'Crop Tops', description: 'A cheerful everyday crop, cut for comfort and easy layering.', price: 1299, discount_price: null, fabric: 'Cotton', colour: 'Yellow', material: 'Cotton', pattern: 'Solid', care_instructions: 'Machine wash cold.', stock: 12, sizes: tsize([2, 4, 4, 2, 0]), media: mkMedia([cropImgs[0], cropImgs[4]]), featured: true, new_arrival: true, best_seller: true },
    { name: 'Cloud White Crop', sku: 'TC-CT-002', category_id: cropsId, category_name: 'Crop Tops', description: 'A crisp white staple that pairs with everything.', price: 1149, discount_price: 999, fabric: 'Linen Blend', colour: 'White', material: 'Linen', pattern: 'Minimal', care_instructions: 'Gentle wash.', stock: 9, sizes: tsize([1, 3, 3, 2, 0]), media: mkMedia([cropImgs[1]]), featured: false, new_arrival: true, best_seller: false },
    { name: 'Cobalt Everyday Crop', sku: 'TC-CT-003', category_id: cropsId, category_name: 'Crop Tops', description: 'A rich cobalt crop with a relaxed, contemporary fit.', price: 1399, discount_price: null, fabric: 'Cotton', colour: 'Blue', material: 'Cotton', pattern: 'Solid', care_instructions: 'Machine wash cold.', stock: 3, sizes: tsize([0, 1, 1, 1, 0]), media: mkMedia([cropImgs[2], cropImgs[3]]), featured: true, new_arrival: false, best_seller: false },
    { name: 'Terracotta Knot Crop', sku: 'TC-CT-004', category_id: cropsId, category_name: 'Crop Tops', description: 'An earthy terracotta crop with a soft knotted detail.', price: 1249, discount_price: null, fabric: 'Cotton', colour: 'Terracotta', material: 'Cotton', pattern: 'Solid', care_instructions: 'Machine wash cold.', stock: 0, sizes: tsize([0, 0, 0, 0, 0]), media: mkMedia([cropImgs[3]]), featured: false, new_arrival: false, best_seller: false },
  ]
  await db.collection('products').insertMany(products.map((p) => ({ id: uuidv4(), slug: slugify(p.name), ...p, active: true, created_at: now, updated_at: now })))
  console.log('✓', products.length, 'products inserted')

  await settingsCol.insertOne({
    id: 'global', brand_name: 'Thretha Couture',
    instagram: 'https://www.instagram.com/thretha_couture', whatsapp: DEFAULT_WHATSAPP,
    phone: DEFAULT_WHATSAPP, email: 'hello@threthacouture.com', address: 'Kerala, India',
    logo_url: '', low_stock_threshold: 3,
    shipping: { delivery_timeframe: '5\u20137 working days across India', delivery_charges: 'Flat \u20b980. Free above \u20b92,999.', free_shipping_threshold: 2999, return_policy: 'Easy 3-day return on unworn pieces with tags.', exchange_policy: 'Size exchange available within 5 days.' },
    hero: { title: 'THRETHA COUTURE', kicker: 'little things we love', subtitle: 'A wardrobe worth getting dressed for.', annotation: 'made for your next occasion', cta: 'EXPLORE COLLECTION', images: ['01', '02', '03', '04'].map((s) => M(s)) },
    saree_edit_image: M('05'),
    brand_story: 'Thretha Couture is a little space for pieces we fall in love with \u2014 sarees, silhouettes and everyday favourites chosen with a soft spot for Kerala style.',
    brand_story_image: M('04'),
    instagram_gallery: ['11', '08', '09', '10', '12', '06'].map((s) => M(s)),
    created_at: now, updated_at: now,
  })
  console.log('✓ Settings created (WhatsApp:', DEFAULT_WHATSAPP + ')')

  await client.close()
  console.log('\n✅ Seed complete. Admin login:', ADMIN_EMAIL, '/', ADMIN_PASSWORD)
}

main().catch((e) => { console.error('Seed failed:', e); process.exit(1) })
