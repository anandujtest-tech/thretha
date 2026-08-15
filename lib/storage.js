// Server-only media storage abstraction.
// Uses Cloudinary when CLOUDINARY_* env vars are set; otherwise falls back to
// local disk (MEDIA_DIR). This keeps development/preview working with no keys,
// while production (Render free tier) uses Cloudinary so no persistent disk is needed.
import { v2 as cloudinary } from 'cloudinary'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), '.media')

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
}

export function cloudinaryEnabled() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  )
}

let configured = false
function ensureConfig() {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    })
    configured = true
  }
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, res) => (err ? reject(err) : resolve(res)))
    stream.end(buffer)
  })
}

// Accepts a Web File (from request.formData()) and returns { url, type, public_id? }
export async function saveUpload(file, folder = 'catalog') {
  const isVideo = (file.type || '').startsWith('video')
  const type = isVideo ? 'video' : 'image'
  const buffer = Buffer.from(await file.arrayBuffer())

  if (cloudinaryEnabled()) {
    ensureConfig()
    const safeFolder = String(folder).replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 60) || 'catalog'
    const result = await uploadBuffer(buffer, {
      folder: `thretha/${safeFolder}`,
      resource_type: isVideo ? 'video' : 'image',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    })
    return { url: result.secure_url, type, public_id: result.public_id }
  }

  // Local disk fallback
  let ext = path.extname(file.name || '').toLowerCase()
  if (!MIME[ext]) ext = isVideo ? '.mp4' : '.jpg'
  await fs.mkdir(MEDIA_DIR, { recursive: true })
  const name = `${uuidv4()}${ext}`
  await fs.writeFile(path.join(MEDIA_DIR, name), buffer)
  return { url: `/api/media/file/${name}`, type }
}

// Serves locally-stored media (fallback mode). Cloudinary URLs are served by Cloudinary directly.
export async function serveMedia(name) {
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
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
