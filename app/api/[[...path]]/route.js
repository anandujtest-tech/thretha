import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JWT_SECRET = process.env.JWT_SECRET || 'thretha_dev_secret'
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), '.media')

// ---------- Mongo ----------
let dbPromise

async function connectToMongo() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const c = new MongoClient(process.env.MONGO_URL)
      await c.connect()
      const database = c.db(process.env.DB_NAME)
      await ensureSeed(database)
      return database
    })().catch((err) => {
      dbPromise = undefined // allow retry on next request
      throw err
    })
  }
  return dbPromise
}

// ---------- Helpers ----------
function cors(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

function json(data, status = 200) {
  return cors(NextResponse.json(data, { status }))
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function strip(doc) {
  if (!doc) return doc
  const { _id, password_hash, ...rest } = doc
  return rest
}

function getToken(request) {
  const h = request.headers.get('authorization') || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  return null
}

function requireAuth(request) {
  const token = getToken(request)
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

const IMG = (u, w = 900) => `${u}?auto=format&fit=crop&w=${w}&q=80`

// ---------- Seed ----------
async function ensureSeed(database) {
  const settingsCol = database.collection('settings')
  const existing = await settingsCol.findOne({ id: 'global' })
  if (existing) return

  const now = new Date()

  // Admin user
  const adminHash = await bcrypt.hash('thretha@2026', 10)
  await database.collection('users').insertOne({
    id: uuidv4(),
    name: 'Thretha Admin',
    email: 'admin@threthacouture.com',
    password_hash: adminHash,
    role: 'admin',
    created_at: now,
  })

  // Categories
  const sareesId = uuidv4()
  const cropsId = uuidv4()
  await database.collection('categories').insertMany([
    {
      id: sareesId, name: 'Sarees', slug: 'sarees',
      description: 'Draped for celebrations, slow mornings and everything in between.',
      image: '/api/media/file/seed-01.jpg',
      display_order: 1, active: true, created_at: now,
    },
    {
      id: cropsId, name: 'Crop Tops', slug: 'crop-tops',
      description: 'Modern little things for easy, everyday styling.',
      image: '/api/media/file/seed-07.jpg',
      display_order: 2, active: true, created_at: now,
    },
  ])

  const sareeImgs = ['seed-01', 'seed-02', 'seed-03', 'seed-04', 'seed-05', 'seed-06'].map((s) => `/api/media/file/${s}.jpg`)
  const cropImgs = ['seed-07', 'seed-08', 'seed-09', 'seed-10', 'seed-11', 'seed-12'].map((s) => `/api/media/file/${s}.jpg`)

  const freeSize = [{ size: 'Free Size', available: true, stock: 8 }]
  const tshirtSizes = (stocks) => ['XS', 'S', 'M', 'L', 'XL'].map((s, i) => ({
    size: s, available: stocks[i] > 0, stock: stocks[i],
  }))

  const mkMedia = (urls) => urls.map((u, i) => ({
    id: uuidv4(), type: 'image', url: u, display_order: i, is_primary: i === 0,
  }))

  const products = [
    {
      name: 'Kerala Rose Saree', sku: 'TC-SR-001', category_id: sareesId, category_name: 'Sarees',
      description: 'A lightweight piece designed for easy, effortless styling — draped for celebrations and slow mornings alike.',
      price: 2499, discount_price: null, fabric: 'Cotton Blend', colour: 'Rose', material: 'Cotton',
      pattern: 'Woven', care_instructions: 'Dry clean recommended. Store folded in muslin.',
      stock: 8, sizes: freeSize, media: mkMedia([sareeImgs[0], sareeImgs[3]]),
      featured: true, new_arrival: true, best_seller: false,
    },
    {
      name: 'Marigold Silk Saree', sku: 'TC-SR-002', category_id: sareesId, category_name: 'Sarees',
      description: 'A sunlit ochre drape with a soft sheen, made for the festive season.',
      price: 3899, discount_price: 3299, fabric: 'Art Silk', colour: 'Marigold', material: 'Silk',
      pattern: 'Solid with zari border', care_instructions: 'Dry clean only.',
      stock: 5, sizes: freeSize, media: mkMedia([sareeImgs[1], sareeImgs[4]]),
      featured: true, new_arrival: true, best_seller: true,
    },
    {
      name: 'Midnight Gold Saree', sku: 'TC-SR-003', category_id: sareesId, category_name: 'Sarees',
      description: 'Deep black with delicate gold detailing — an heirloom in the making.',
      price: 4599, discount_price: null, fabric: 'Organza', colour: 'Black & Gold', material: 'Organza',
      pattern: 'Embellished', care_instructions: 'Dry clean only. Avoid direct sunlight.',
      stock: 2, sizes: freeSize, media: mkMedia([sareeImgs[2]]),
      featured: false, new_arrival: true, best_seller: false,
    },
    {
      name: 'Ivory Morning Saree', sku: 'TC-SR-004', category_id: sareesId, category_name: 'Sarees',
      description: 'A soft ivory cotton drape for unhurried, everyday elegance.',
      price: 2199, discount_price: null, fabric: 'Cotton', colour: 'Ivory', material: 'Cotton',
      pattern: 'Minimal', care_instructions: 'Gentle hand wash.',
      stock: 10, sizes: freeSize, media: mkMedia([sareeImgs[3], sareeImgs[0]]),
      featured: true, new_arrival: false, best_seller: true,
    },
    {
      name: 'Amber Festive Saree', sku: 'TC-SR-005', category_id: sareesId, category_name: 'Sarees',
      description: 'Warm amber tones with a graceful fall, styled for celebrations.',
      price: 3299, discount_price: 2899, fabric: 'Georgette', colour: 'Amber', material: 'Georgette',
      pattern: 'Solid', care_instructions: 'Dry clean recommended.',
      stock: 0, sizes: freeSize, media: mkMedia([sareeImgs[4], sareeImgs[1]]),
      featured: false, new_arrival: false, best_seller: false,
    },
    {
      name: 'Onyx Drape Saree', sku: 'TC-SR-006', category_id: sareesId, category_name: 'Sarees',
      description: 'A modern black drape with a subtle dupatta detail.',
      price: 2799, discount_price: null, fabric: 'Chiffon', colour: 'Onyx', material: 'Chiffon',
      pattern: 'Solid', care_instructions: 'Dry clean only.',
      stock: 6, sizes: freeSize, media: mkMedia([sareeImgs[5]]),
      featured: false, new_arrival: true, best_seller: false,
    },
    {
      name: 'Sunlit Crop Top', sku: 'TC-CT-001', category_id: cropsId, category_name: 'Crop Tops',
      description: 'A cheerful everyday crop, cut for comfort and easy layering.',
      price: 1299, discount_price: null, fabric: 'Cotton', colour: 'Yellow', material: 'Cotton',
      pattern: 'Solid', care_instructions: 'Machine wash cold.',
      stock: 12, sizes: tshirtSizes([2, 4, 4, 2, 0]), media: mkMedia([cropImgs[0], cropImgs[4]]),
      featured: true, new_arrival: true, best_seller: true,
    },
    {
      name: 'Cloud White Crop', sku: 'TC-CT-002', category_id: cropsId, category_name: 'Crop Tops',
      description: 'A crisp white staple that pairs with everything.',
      price: 1149, discount_price: 999, fabric: 'Linen Blend', colour: 'White', material: 'Linen',
      pattern: 'Minimal', care_instructions: 'Gentle wash.',
      stock: 9, sizes: tshirtSizes([1, 3, 3, 2, 0]), media: mkMedia([cropImgs[1]]),
      featured: false, new_arrival: true, best_seller: false,
    },
    {
      name: 'Cobalt Everyday Crop', sku: 'TC-CT-003', category_id: cropsId, category_name: 'Crop Tops',
      description: 'A rich cobalt crop with a relaxed, contemporary fit.',
      price: 1399, discount_price: null, fabric: 'Cotton', colour: 'Blue', material: 'Cotton',
      pattern: 'Solid', care_instructions: 'Machine wash cold.',
      stock: 3, sizes: tshirtSizes([0, 1, 1, 1, 0]), media: mkMedia([cropImgs[2], cropImgs[3]]),
      featured: true, new_arrival: false, best_seller: false,
    },
    {
      name: 'Terracotta Knot Crop', sku: 'TC-CT-004', category_id: cropsId, category_name: 'Crop Tops',
      description: 'An earthy terracotta crop with a soft knotted detail.',
      price: 1249, discount_price: null, fabric: 'Cotton', colour: 'Terracotta', material: 'Cotton',
      pattern: 'Solid', care_instructions: 'Machine wash cold.',
      stock: 0, sizes: tshirtSizes([0, 0, 0, 0, 0]), media: mkMedia([cropImgs[3]]),
      featured: false, new_arrival: false, best_seller: false,
    },
  ]

  const productDocs = products.map((p) => ({
    id: uuidv4(),
    slug: slugify(p.name),
    ...p,
    active: true,
    created_at: now,
    updated_at: now,
  }))
  await database.collection('products').insertMany(productDocs)

  // Settings + homepage config
  await settingsCol.insertOne({
    id: 'global',
    brand_name: 'Thretha Couture',
    instagram: 'https://www.instagram.com/thretha_couture',
    whatsapp: '918301824696',
    phone: '918301824696',
    email: 'hello@threthacouture.com',
    address: 'Kerala, India',
    logo_url: '',
    low_stock_threshold: 3,
    shipping: {
      delivery_timeframe: '5–7 working days across India',
      delivery_charges: 'Flat ₹80. Free above ₹2,999.',
      free_shipping_threshold: 2999,
      return_policy: 'Easy 3-day return on unworn pieces with tags.',
      exchange_policy: 'Size exchange available within 5 days.',
    },
    hero: {
      title: 'THRETHA COUTURE',
      kicker: 'little things we love',
      subtitle: 'A wardrobe worth getting dressed for.',
      annotation: 'made for your next occasion',
      cta: 'EXPLORE COLLECTION',
      images: ['seed-01', 'seed-02', 'seed-03', 'seed-04'].map((s) => `/api/media/file/${s}.jpg`),
    },
    saree_edit_image: '/api/media/file/seed-05.jpg',
    brand_story: 'Thretha Couture is a little space for pieces we fall in love with — sarees, silhouettes and everyday favourites chosen with a soft spot for Kerala style.',
    brand_story_image: '/api/media/file/seed-04.jpg',
    instagram_gallery: ['seed-11', 'seed-08', 'seed-09', 'seed-10', 'seed-12', 'seed-06'].map((s) => `/api/media/file/${s}.jpg`),
    created_at: now,
    updated_at: now,
  })
}

// ---------- Media (local persistent storage) ----------
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
}

async function saveUpload(request) {
  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') return { error: 'file is required', status: 400 }
  const buf = Buffer.from(await file.arrayBuffer())
  let ext = path.extname(file.name || '').toLowerCase()
  if (!MIME[ext]) ext = (file.type || '').startsWith('video') ? '.mp4' : '.jpg'
  await fs.mkdir(MEDIA_DIR, { recursive: true })
  const name = `${uuidv4()}${ext}`
  await fs.writeFile(path.join(MEDIA_DIR, name), buf)
  const type = (file.type || MIME[ext] || '').startsWith('video') ? 'video' : 'image'
  return { url: `/api/media/file/${name}`, type }
}

async function serveMedia(name) {
  try {
    const safe = path.basename(name)
    const full = path.join(MEDIA_DIR, safe)
    const data = await fs.readFile(full)
    const ext = path.extname(safe).toLowerCase()
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return json({ error: 'Not found' }, 404)
  }
}

// ---------- Order number ----------
async function nextOrderNumber(database) {
  const year = new Date().getFullYear()
  const count = await database.collection('orders').countDocuments({
    order_number: { $regex: `^TC-${year}-` },
  })
  return `TC-${year}-${String(count + 1).padStart(4, '0')}`
}

function buildWhatsAppMessage(order, settings) {
  const it = order.items[0]
  const c = order.customer
  const lines = [
    'Hi Thretha Couture! 🌸',
    '',
    "I'd like to order:",
    '',
    `Product: ${it.product_name}`,
    `Product Code: ${it.sku}`,
    `Size: ${it.size}`,
    `Quantity: ${it.quantity}`,
    `Price: ₹${it.price}`,
    `Order Total: ₹${order.total}`,
    '',
    `Order Ref: ${order.order_number}`,
    `Customer Name: ${c.name}`,
    `WhatsApp: ${c.whatsapp || c.phone}`,
    '',
    'Delivery Address:',
    [c.house, c.street, c.city, c.district, c.state, c.pincode].filter(Boolean).join(', '),
    '',
    'Please confirm availability and delivery details.',
  ]
  const text = lines.join('\n')
  const num = (settings?.whatsapp || '').replace(/[^0-9]/g, '')
  return { text, url: `https://wa.me/${num}?text=${encodeURIComponent(text)}` }
}

// ---------- Router ----------
async function handleRoute(request, { params }) {
  const { path: parts = [] } = await params
  const route = `/${parts.join('/')}`
  const method = request.method

  try {
    // media serve does not need db seed check speed but fine
    if (parts[0] === 'media' && parts[1] === 'file' && method === 'GET') {
      return serveMedia(parts.slice(2).join('/'))
    }

    const database = await connectToMongo()

    if (route === '/health' && method === 'GET') return json({ ok: true })

    // ===== PUBLIC SETTINGS =====
    if (route === '/settings' && method === 'GET') {
      const s = await database.collection('settings').findOne({ id: 'global' })
      return json(strip(s))
    }

    // ===== CATEGORIES =====
    if (route === '/categories' && method === 'GET') {
      const cats = await database.collection('categories')
        .find({ active: true }).sort({ display_order: 1 }).toArray()
      // attach counts
      const out = []
      for (const c of cats) {
        const count = await database.collection('products').countDocuments({ category_id: c.id, active: true })
        out.push({ ...strip(c), product_count: count })
      }
      return json(out)
    }

    // ===== PRODUCTS (public) =====
    if (route === '/products' && method === 'GET') {
      const url = new URL(request.url)
      const q = url.searchParams
      const filter = { active: true }
      if (q.get('category')) {
        const cat = await database.collection('categories').findOne({ slug: q.get('category') })
        if (cat) filter.category_id = cat.id
        else return json([])
      }
      if (q.get('new') === 'true') filter.new_arrival = true
      if (q.get('featured') === 'true') filter.featured = true
      if (q.get('colour')) filter.colour = { $regex: q.get('colour'), $options: 'i' }
      if (q.get('search')) {
        const rx = { $regex: q.get('search'), $options: 'i' }
        filter.$or = [{ name: rx }, { sku: rx }, { category_name: rx }, { colour: rx }]
      }
      const min = q.get('minPrice'); const max = q.get('maxPrice')
      if (min || max) {
        filter.price = {}
        if (min) filter.price.$gte = Number(min)
        if (max) filter.price.$lte = Number(max)
      }
      let list = await database.collection('products').find(filter).toArray()
      if (q.get('availability') === 'in') list = list.filter((p) => p.stock > 0)
      if (q.get('size')) list = list.filter((p) => (p.sizes || []).some((s) => s.size === q.get('size') && s.available))
      const sort = q.get('sort')
      if (sort === 'price_asc') list.sort((a, b) => (a.discount_price || a.price) - (b.discount_price || b.price))
      else if (sort === 'price_desc') list.sort((a, b) => (b.discount_price || b.price) - (a.discount_price || a.price))
      else if (sort === 'featured') list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
      else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      return json(list.map(strip))
    }

    if (parts[0] === 'products' && parts.length === 2 && method === 'GET') {
      const p = await database.collection('products').findOne({ slug: parts[1], active: true })
      if (!p) return json({ error: 'Product not found' }, 404)
      return json(strip(p))
    }

    // ===== ORDERS (public create) =====
    if (route === '/orders' && method === 'POST') {
      const body = await request.json()
      const { customer, item } = body
      if (!customer?.name || !(customer.whatsapp || customer.phone)) {
        return json({ error: 'Name and WhatsApp/phone are required' }, 400)
      }
      if (!item?.product_id) return json({ error: 'Product is required' }, 400)
      const product = await database.collection('products').findOne({ id: item.product_id })
      if (!product) return json({ error: 'Product not found' }, 404)
      const qty = Math.max(1, Number(item.quantity) || 1)
      const unit = product.discount_price || product.price
      const settings = await database.collection('settings').findOne({ id: 'global' })

      // customer record
      const custId = uuidv4()
      await database.collection('customers').insertOne({
        id: custId, ...customer, created_at: new Date(),
      })

      const orderNumber = await nextOrderNumber(database)
      const order = {
        id: uuidv4(),
        order_number: orderNumber,
        customer_id: custId,
        customer,
        items: [{
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          size: item.size || (product.sizes?.[0]?.size || 'Free Size'),
          colour: product.colour,
          quantity: qty,
          price: unit,
        }],
        total: unit * qty,
        status: 'NEW',
        created_at: new Date(),
        updated_at: new Date(),
      }
      await database.collection('orders').insertOne(order)
      const wa = buildWhatsAppMessage(order, settings)
      return json({ order: strip(order), whatsapp: wa })
    }

    // ===== ADMIN LOGIN =====
    if (route === '/admin/login' && method === 'POST') {
      const { email, password } = await request.json()
      const user = await database.collection('users').findOne({ email: (email || '').toLowerCase() })
      if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
        return json({ error: 'Invalid email or password' }, 401)
      }
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
      return json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
    }

    // ===== ADMIN (protected) =====
    if (parts[0] === 'admin' && route !== '/admin/login') {
      const auth = requireAuth(request)
      if (!auth) return json({ error: 'Unauthorized' }, 401)

      if (route === '/admin/me' && method === 'GET') return json({ user: auth })

      if (route === '/admin/stats' && method === 'GET') {
        const [products, categories, orders, s] = await Promise.all([
          database.collection('products').countDocuments({}),
          database.collection('categories').countDocuments({}),
          database.collection('orders').countDocuments({}),
          database.collection('settings').findOne({ id: 'global' }),
        ])
        const threshold = s?.low_stock_threshold ?? 3
        const lowStock = await database.collection('products')
          .find({ stock: { $lte: threshold } }).toArray()
        const newOrders = await database.collection('orders').countDocuments({ status: 'NEW' })
        const confirmed = await database.collection('orders').countDocuments({ status: 'CONFIRMED' })
        const delivered = await database.collection('orders').countDocuments({ status: 'DELIVERED' })
        const recentOrders = await database.collection('orders')
          .find({}).sort({ created_at: -1 }).limit(6).toArray()
        const recentProducts = await database.collection('products')
          .find({}).sort({ created_at: -1 }).limit(6).toArray()
        return json({
          products, categories, orders,
          new_orders: newOrders, confirmed_orders: confirmed, delivered_orders: delivered,
          low_stock: lowStock.map(strip),
          low_stock_count: lowStock.length,
          recent_orders: recentOrders.map(strip),
          recent_products: recentProducts.map(strip),
        })
      }

      // ---- Admin products ----
      if (route === '/admin/products' && method === 'GET') {
        const list = await database.collection('products').find({}).sort({ created_at: -1 }).toArray()
        return json(list.map(strip))
      }
      if (route === '/admin/products' && method === 'POST') {
        const b = await request.json()
        const cat = b.category_id ? await database.collection('categories').findOne({ id: b.category_id }) : null
        const doc = {
          id: uuidv4(),
          name: b.name || 'Untitled',
          slug: slugify(b.name || `product-${Date.now()}`),
          sku: b.sku || `TC-${Date.now().toString().slice(-6)}`,
          category_id: b.category_id || null,
          category_name: cat?.name || '',
          description: b.description || '',
          price: Number(b.price) || 0,
          discount_price: b.discount_price ? Number(b.discount_price) : null,
          fabric: b.fabric || '', colour: b.colour || '', material: b.material || '',
          pattern: b.pattern || '', care_instructions: b.care_instructions || '',
          stock: Number(b.stock) || 0,
          sizes: Array.isArray(b.sizes) ? b.sizes : [],
          media: Array.isArray(b.media) ? b.media : [],
          featured: !!b.featured, new_arrival: !!b.new_arrival, best_seller: !!b.best_seller,
          active: b.active !== false,
          created_at: new Date(), updated_at: new Date(),
        }
        await database.collection('products').insertOne(doc)
        return json(strip(doc))
      }
      if (parts[0] === 'admin' && parts[1] === 'products' && parts.length === 3) {
        const id = parts[2]
        if (method === 'PUT') {
          const b = await request.json()
          const update = { ...b, updated_at: new Date() }
          delete update.id; delete update._id
          if (b.name) update.slug = slugify(b.name)
          if (b.category_id) {
            const cat = await database.collection('categories').findOne({ id: b.category_id })
            update.category_name = cat?.name || ''
          }
          if (b.price !== undefined) update.price = Number(b.price)
          if (b.discount_price !== undefined) update.discount_price = b.discount_price ? Number(b.discount_price) : null
          if (b.stock !== undefined) update.stock = Number(b.stock)
          await database.collection('products').updateOne({ id }, { $set: update })
          const p = await database.collection('products').findOne({ id })
          return json(strip(p))
        }
        if (method === 'DELETE') {
          await database.collection('products').deleteOne({ id })
          return json({ ok: true })
        }
      }
      if (parts[0] === 'admin' && parts[1] === 'products' && parts[3] === 'duplicate' && method === 'POST') {
        const src = await database.collection('products').findOne({ id: parts[2] })
        if (!src) return json({ error: 'Not found' }, 404)
        const { _id, ...rest } = src
        const copy = {
          ...rest, id: uuidv4(),
          name: `${src.name} (Copy)`, slug: slugify(`${src.name}-copy-${Date.now()}`),
          sku: `${src.sku}-C`, created_at: new Date(), updated_at: new Date(),
        }
        await database.collection('products').insertOne(copy)
        return json(strip(copy))
      }

      // ---- Admin categories ----
      if (route === '/admin/categories' && method === 'GET') {
        const list = await database.collection('categories').find({}).sort({ display_order: 1 }).toArray()
        return json(list.map(strip))
      }
      if (route === '/admin/categories' && method === 'POST') {
        const b = await request.json()
        const count = await database.collection('categories').countDocuments({})
        const doc = {
          id: uuidv4(), name: b.name || 'New Category', slug: slugify(b.name || `category-${Date.now()}`),
          description: b.description || '', image: b.image || '',
          display_order: b.display_order ?? count + 1, active: b.active !== false, created_at: new Date(),
        }
        await database.collection('categories').insertOne(doc)
        return json(strip(doc))
      }
      if (parts[0] === 'admin' && parts[1] === 'categories' && parts.length === 3) {
        const id = parts[2]
        if (method === 'PUT') {
          const b = await request.json()
          const update = { ...b }; delete update.id; delete update._id
          if (b.name) update.slug = slugify(b.name)
          await database.collection('categories').updateOne({ id }, { $set: update })
          const c = await database.collection('categories').findOne({ id })
          return json(strip(c))
        }
        if (method === 'DELETE') {
          await database.collection('categories').deleteOne({ id })
          return json({ ok: true })
        }
      }

      // ---- Admin orders ----
      if (route === '/admin/orders' && method === 'GET') {
        const list = await database.collection('orders').find({}).sort({ created_at: -1 }).toArray()
        return json(list.map(strip))
      }
      if (parts[0] === 'admin' && parts[1] === 'orders' && parts.length === 3 && method === 'PUT') {
        const b = await request.json()
        await database.collection('orders').updateOne(
          { id: parts[2] }, { $set: { status: b.status, updated_at: new Date() } }
        )
        const o = await database.collection('orders').findOne({ id: parts[2] })
        return json(strip(o))
      }

      // ---- Admin settings ----
      if (route === '/admin/settings' && method === 'GET') {
        const s = await database.collection('settings').findOne({ id: 'global' })
        return json(strip(s))
      }
      if (route === '/admin/settings' && method === 'PUT') {
        const b = await request.json()
        const update = { ...b, updated_at: new Date() }
        delete update.id; delete update._id
        await database.collection('settings').updateOne({ id: 'global' }, { $set: update })
        const s = await database.collection('settings').findOne({ id: 'global' })
        return json(strip(s))
      }

      // ---- Media upload (admin) ----
      if (route === '/admin/media' && method === 'POST') {
        const res = await saveUpload(request)
        if (res.error) return json({ error: res.error }, res.status || 400)
        return json(res)
      }
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: 'Internal server error', detail: String(error?.message || error) }, 500)
  }
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 200 }))
}
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
