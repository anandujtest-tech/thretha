#!/usr/bin/env node
/**
 * THRETHA COUTURE — migrate media to Cloudinary + database to MongoDB Atlas.
 *
 * What it does:
 *   1. Uploads every image in MEDIA_DIR (local /.media) to Cloudinary.
 *   2. Rewrites all image URLs in the SOURCE MongoDB (products.media[].url,
 *      categories.image, settings.hero.images[], saree_edit_image,
 *      brand_story_image, instagram_gallery[], logo_url) to Cloudinary URLs.
 *   3. If TARGET_MONGO_URL is set, copies ALL collections from the source DB
 *      into the target (Atlas) DB — i.e. the full data migration.
 *
 * Env required:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *   MONGO_URL (source), DB_NAME (source)
 *   TARGET_MONGO_URL (optional — Atlas), TARGET_DB_NAME (optional, default = DB_NAME)
 *   MEDIA_DIR (optional, default ./.media)
 *
 * Usage:
 *   node scripts/migrate-media.mjs           # rewrite URLs in source DB only
 *   TARGET_MONGO_URL=... node scripts/migrate-media.mjs   # + copy to Atlas
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// --- tiny .env loader ---
function loadEnv() {
  const p = path.join(ROOT, '.env')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv()

const {
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
  MONGO_URL, DB_NAME, TARGET_MONGO_URL,
} = process.env
const TARGET_DB_NAME = process.env.TARGET_DB_NAME || DB_NAME
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(ROOT, '.media')

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('Missing Cloudinary env vars. Set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET.')
  process.exit(1)
}
if (!MONGO_URL || !DB_NAME) {
  console.error('Missing MONGO_URL / DB_NAME (source database).')
  process.exit(1)
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
})

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov'])
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])

function rewrite(value, map) {
  if (typeof value === 'string') return map.get(value) || value
  if (Array.isArray(value)) return value.map((v) => rewrite(v, map))
  return value
}

async function main() {
  // 1) Upload local media to Cloudinary -> build old->new URL map
  const map = new Map()
  let files = []
  try { files = await fsp.readdir(MEDIA_DIR) } catch { files = [] }
  console.log(`Found ${files.length} file(s) in ${MEDIA_DIR}`)

  for (const name of files) {
    const ext = path.extname(name).toLowerCase()
    if (!IMG_EXT.has(ext) && !VIDEO_EXT.has(ext)) continue
    const full = path.join(MEDIA_DIR, name)
    const isVideo = VIDEO_EXT.has(ext)
    const publicId = name.replace(ext, '') // deterministic -> reruns overwrite, no duplicates
    const result = await cloudinary.uploader.upload(full, {
      folder: 'thretha/migrated',
      resource_type: isVideo ? 'video' : 'image',
      public_id: publicId,
      overwrite: true,
    })
    // The app stores local URLs as /api/media/file/<name>
    map.set(`/api/media/file/${name}`, result.secure_url)
    console.log(`  ${name} -> ${result.secure_url}`)
  }

  // 2) Rewrite URLs in the SOURCE database
  const src = new MongoClient(MONGO_URL)
  await src.connect()
  const sdb = src.db(DB_NAME)
  console.log(`\nRewriting URLs in source DB "${DB_NAME}"...`)

  // products.media[].url
  for (const p of await sdb.collection('products').find({}).toArray()) {
    const media = (p.media || []).map((m) => ({ ...m, url: map.get(m.url) || m.url }))
    await sdb.collection('products').updateOne({ id: p.id }, { $set: { media } })
  }
  // categories.image
  for (const c of await sdb.collection('categories').find({}).toArray()) {
    if (map.has(c.image)) await sdb.collection('categories').updateOne({ id: c.id }, { $set: { image: map.get(c.image) } })
  }
  // settings.*
  const s = await sdb.collection('settings').findOne({ id: 'global' })
  if (s) {
    const set = {
      logo_url: rewrite(s.logo_url, map),
      saree_edit_image: rewrite(s.saree_edit_image, map),
      brand_story_image: rewrite(s.brand_story_image, map),
      instagram_gallery: rewrite(s.instagram_gallery, map),
      hero: { ...s.hero, images: rewrite(s.hero?.images, map) },
    }
    await sdb.collection('settings').updateOne({ id: 'global' }, { $set: set })
  }
  console.log('✓ Source DB URLs rewritten.')

  // 3) Optional: copy all collections to TARGET (Atlas)
  if (TARGET_MONGO_URL) {
    console.log(`\nCopying data to target Atlas DB "${TARGET_DB_NAME}"...`)
    const dst = new MongoClient(TARGET_MONGO_URL)
    await dst.connect()
    const ddb = dst.db(TARGET_DB_NAME)
    const collections = await sdb.listCollections().toArray()
    for (const { name } of collections) {
      if (name.startsWith('system.')) continue
      const docs = await sdb.collection(name).find({}).toArray()
      await ddb.collection(name).deleteMany({})
      if (docs.length) await ddb.collection(name).insertMany(docs)
      console.log(`  ${name}: ${docs.length} docs`)
    }
    // Ensure indexes on target
    await ddb.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {})
    await ddb.collection('products').createIndex({ slug: 1 }, { unique: true }).catch(() => {})
    await ddb.collection('categories').createIndex({ slug: 1 }, { unique: true }).catch(() => {})
    await ddb.collection('orders').createIndex({ order_number: 1 }, { unique: true }).catch(() => {})
    await ddb.collection('settings').createIndex({ id: 1 }, { unique: true }).catch(() => {})
    await dst.close()
    console.log('✓ Data copied to Atlas + indexes created.')
  } else {
    console.log('\n(No TARGET_MONGO_URL set — skipped Atlas copy. Set it to migrate data to Atlas.)')
  }

  await src.close()
  console.log('\n✅ Migration complete.')
}

main().catch((e) => { console.error('Migration failed:', e); process.exit(1) })
