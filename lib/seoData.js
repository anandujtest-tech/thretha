import { MongoClient } from 'mongodb'
import { cache } from 'react'
import { isComboActive, populateComboSlots } from './combos.js'
import { getStorefrontInstagramFeed } from './instagram.js'

let connection

async function database() {
  if (!process.env.MONGO_URL) throw new Error('MONGO_URL is required for catalog SEO data')
  if (!connection) {
    connection = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 10000 })
      .connect()
      .catch(error => { connection = null; throw error })
  }
  const client = await connection
  return client.db(process.env.DB_NAME || 'thretha_couture')
}

const plain = value => JSON.parse(JSON.stringify(value))

export const getCategory = cache(async slug => {
  const db = await database()
  const category = await db.collection('categories').findOne({ slug, active: true })
  return category ? plain(category) : null
})

export const getCategoryById = cache(async id => {
  if (!id) return null
  const db = await database()
  const category = await db.collection('categories').findOne({ id, active: true })
  return category ? plain(category) : null
})

export const getCategories = cache(async () => {
  const db = await database()
  return plain(await db.collection('categories').find({ active: true }).sort({ display_order: 1 }).toArray())
})

export const getProduct = cache(async identifier => {
  const db = await database()
  const escaped = String(identifier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const product = await db.collection('products').findOne({
    active: { $ne: false },
    $or: [{ slug: identifier }, { slug: { $regex: new RegExp(`^${escaped}$`, 'i') } }, { id: identifier }],
  })
  return product ? plain(product) : null
})

export const getProducts = cache(async filter => {
  const db = await database()
  return plain(await db.collection('products').find({ active: true, ...filter }).sort({ created_at: -1 }).toArray())
})

export const getSettings = cache(async () => {
  const db = await database()
  const settings = await db.collection('settings').findOne({ id: 'global' })
  return settings ? plain(settings) : null
})

export const getHomepageInstagramFeed = cache(async () => {
  const db = await database()
  return plain(await getStorefrontInstagramFeed(db))
})

export const getCombo = cache(async identifier => {
  const db = await database()
  const settings = await db.collection('settings').findOne({ id: 'global' })
  if (settings?.combos_enabled === false) return null
  const combo = await db.collection('combos').findOne({ $or: [{ slug: identifier }, { id: identifier }] })
  if (!isComboActive(combo)) return null
  return plain(await populateComboSlots({ database: db, combo }))
})

export const getCombos = cache(async () => {
  const db = await database()
  const settings = await db.collection('settings').findOne({ id: 'global' })
  if (settings?.combos_enabled === false) return []
  const combos = await db.collection('combos').find({ active: { $ne: false } }).sort({ display_order: 1, created_at: -1 }).toArray()
  return plain(combos.filter(isComboActive))
})
