import { ERROR_CODES, logger, scrubSecrets } from './errors.js'

/**
 * Expected Official Instagram Account Handle for Thretha Couture
 */
export const EXPECTED_INSTAGRAM_USERNAME = 'thretha_couture'
export const DEFAULT_INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/thretha_couture/'

/**
 * Default Instagram Feed & Lookbook Configuration
 */
export const DEFAULT_INSTAGRAM_SETTINGS = {
  enabled: true,
  source: 'manual', // 'manual' | 'meta'
  username: 'thretha_couture',
  posts_to_display: 6,
  auto_refresh: true,
  refresh_interval_minutes: 30,
  open_in_new_tab: true,
  show_captions: false,
  show_username: true,
  enable_videos: true,
  feed_mode: 'latest', // 'latest' | 'editorial'
  last_sync_at: null,
  last_sync_status: 'IDLE', // 'SUCCESS' | 'ERROR' | 'IDLE' | 'NOT_CONFIGURED'
  last_error_message: null,
}

/**
 * Normalizes Instagram settings object with safe defaults and clamped values
 */
export function normalizeInstagramSettings(raw = {}) {
  const s = raw || {}
  const postsCount = Number(s.posts_to_display ?? s.postsToDisplay)
  const refreshMins = Number(s.refresh_interval_minutes ?? s.refreshInterval)

  // Enforce canonical username 'thretha_couture'
  let rawUsername = String(s.username || EXPECTED_INSTAGRAM_USERNAME).replace(/^@+/, '').trim()
  if (!rawUsername || rawUsername.toLowerCase() === 'threthacouture') {
    rawUsername = EXPECTED_INSTAGRAM_USERNAME
  }

  const rawSource = String(s.source || s.content_source || 'manual').toLowerCase().trim()
  const source = rawSource === 'meta' || rawSource === 'live' || rawSource === 'meta_api' ? 'meta' : 'manual'

  return {
    enabled: s.enabled !== false,
    source, // 'manual' | 'meta'
    username: rawUsername,
    posts_to_display: isNaN(postsCount) ? 6 : Math.max(3, Math.min(12, postsCount)),
    auto_refresh: s.auto_refresh !== false,
    refresh_interval_minutes: isNaN(refreshMins) ? 30 : Math.max(5, Math.min(1440, refreshMins)),
    open_in_new_tab: s.open_in_new_tab !== false,
    show_captions: Boolean(s.show_captions),
    show_username: s.show_username !== false,
    enable_videos: s.enable_videos !== false,
    feed_mode: s.feed_mode === 'editorial' ? 'editorial' : 'latest',
    last_sync_at: s.last_sync_at ? new Date(s.last_sync_at).toISOString() : null,
    last_sync_status: s.last_sync_status || 'IDLE',
    last_error_message: s.last_error_message || null,
  }
}

/**
 * Validates that an Instagram permalink is authentic and well-formed.
 * Accepts /p/, /reel/, and /tv/ paths on instagram.com.
 * Normalizes trailing slashes safely. Never guesses or generates artificial permalinks.
 */
export function validateInstagramPermalink(permalink) {
  if (!permalink || typeof permalink !== 'string') return null
  const trimmed = permalink.trim()
  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    if (
      (host === 'www.instagram.com' || host === 'instagram.com') &&
      (url.pathname.startsWith('/p/') || url.pathname.startsWith('/reel/') || url.pathname.startsWith('/tv/'))
    ) {
      let cleanPath = url.pathname
      if (!cleanPath.endsWith('/')) cleanPath += '/'
      return `https://www.instagram.com${cleanPath}`
    }
  } catch {
    // Malformed URL
  }
  return null
}

/**
 * Cleans up and purges legacy fake/seed/demo Instagram records from MongoDB.
 * Reports counts of real vs removed records. NEVER deletes manual or genuine Meta API records.
 */
export async function cleanupLegacyInstagramRecords(database) {
  if (!database) return { removedSeedCount: 0, removedWrongAccountCount: 0, realCount: 0 }

  const collection = database.collection('instagram_posts')
  const allPosts = await collection.find({}).toArray()

  let removedSeedCount = 0
  let removedWrongAccountCount = 0
  let realCount = 0
  const idsToDelete = []

  for (const post of allPosts) {
    // Check if it is a genuine record (manual or meta_api / instagram_api)
    const isManual = post.source === 'manual'
    const isMeta = post.source === 'instagram_api' || post.source === 'meta_api'

    const isSeed =
      (!isManual && !isMeta) ||
      String(post.id || '').startsWith('ig_seed_') ||
      String(post.media_url || '').startsWith('/api/media/file/seed-') ||
      String(post.permalink || '').includes('/threthacouture/')

    const isWrongAccount =
      post.account_username &&
      post.account_username.toLowerCase() !== EXPECTED_INSTAGRAM_USERNAME

    if (isSeed) {
      idsToDelete.push(post._id)
      removedSeedCount++
    } else if (isWrongAccount) {
      idsToDelete.push(post._id)
      removedWrongAccountCount++
    } else {
      realCount++
    }
  }

  if (idsToDelete.length > 0) {
    await collection.deleteMany({ _id: { $in: idsToDelete } })
  }

  return {
    removedSeedCount,
    removedWrongAccountCount,
    realCount,
  }
}

/**
 * Helper to populate linked product objects from product IDs
 */
export async function populateLinkedProducts(database, posts = []) {
  if (!database || !Array.isArray(posts) || posts.length === 0) return posts

  const allProductIds = new Set()
  for (const p of posts) {
    if (Array.isArray(p.linked_product_ids)) {
      p.linked_product_ids.forEach((id) => {
        if (id) allProductIds.add(String(id))
      })
    }
  }

  if (allProductIds.size === 0) {
    posts.forEach((p) => {
      p.linked_products = []
    })
    return posts
  }

  const products = await database.collection('products')
    .find({ id: { $in: Array.from(allProductIds) } })
    .toArray()

  const productMap = new Map()
  for (const prod of products) {
    const img = prod.media?.[0]?.url || prod.images?.[0] || prod.image || ''
    productMap.set(String(prod.id), {
      id: String(prod.id),
      slug: prod.slug || String(prod.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: prod.name || 'Artisanal Piece',
      price: Number(prod.price) || 0,
      discount_price: prod.discount_price ? Number(prod.discount_price) : null,
      image: img,
      in_stock: (prod.stock ?? 1) > 0,
      category_name: prod.category_name || '',
    })
  }

  for (const post of posts) {
    const list = []
    if (Array.isArray(post.linked_product_ids)) {
      for (const id of post.linked_product_ids) {
        const item = productMap.get(String(id))
        if (item) list.push(item)
      }
    }
    post.linked_products = list
  }

  return posts
}

/**
 * Creates a new manual Instagram post record
 */
export async function createManualInstagramPost(database, payload = {}) {
  const permalink = validateInstagramPermalink(payload.permalink)
  if (!permalink) {
    const err = new Error('Please enter a valid Instagram post URL (e.g. https://www.instagram.com/p/... or /reel/...).')
    err.code = ERROR_CODES.VALIDATION_ERROR
    throw err
  }

  const mediaUrl = String(payload.media_url || payload.image_url || '').trim()
  if (!mediaUrl) {
    const err = new Error('Please upload an image for this Instagram post.')
    err.code = ERROR_CODES.VALIDATION_ERROR
    throw err
  }

  const collection = database.collection('instagram_posts')

  // Check for duplicate permalink among manual posts
  const duplicate = await collection.findOne({
    source: 'manual',
    permalink,
  })

  if (duplicate) {
    const err = new Error('This Instagram post has already been added.')
    err.code = ERROR_CODES.VALIDATION_ERROR
    throw err
  }

  // Determine display order
  let order = Number(payload.display_order)
  if (isNaN(order) || order < 1) {
    const highest = await collection
      .find({ source: 'manual' })
      .sort({ display_order: -1 })
      .limit(1)
      .toArray()
    order = (highest[0]?.display_order || 0) + 1
  }

  const cleanCaption = String(payload.caption || '').trim()
  const altText = cleanCaption.length > 0
    ? `Thretha Couture on Instagram: ${cleanCaption.slice(0, 100)}`
    : 'Thretha Couture lookbook piece'

  const linkedIds = Array.isArray(payload.linked_product_ids)
    ? payload.linked_product_ids.map(String).filter(Boolean)
    : []

  const doc = {
    id: `ig_man_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source: 'manual',
    account_username: EXPECTED_INSTAGRAM_USERNAME,
    permalink,
    media_url: mediaUrl,
    thumbnail_url: payload.thumbnail_url || mediaUrl,
    media_type: payload.is_video ? 'VIDEO' : 'IMAGE',
    caption: cleanCaption,
    post_date: payload.post_date ? new Date(payload.post_date).toISOString() : new Date().toISOString(),
    timestamp: payload.post_date ? new Date(payload.post_date).toISOString() : new Date().toISOString(),
    username: EXPECTED_INSTAGRAM_USERNAME,
    alt_text: altText,
    is_video: Boolean(payload.is_video),
    is_hidden: Boolean(payload.is_hidden),
    open_in_new_tab: payload.open_in_new_tab !== false,
    display_order: order,
    linked_product_ids: linkedIds,
    created_at: new Date(),
    updated_at: new Date(),
  }

  await collection.insertOne(doc)
  const populated = await populateLinkedProducts(database, [doc])
  return populated[0]
}

/**
 * Updates an existing manual Instagram post record
 */
export async function updateManualInstagramPost(database, postId, payload = {}) {
  if (!postId) {
    const err = new Error('Post ID is required.')
    err.code = ERROR_CODES.VALIDATION_ERROR
    throw err
  }

  const collection = database.collection('instagram_posts')
  const existing = await collection.findOne({ id: postId, source: 'manual' })

  if (!existing) {
    const err = new Error('Manual Instagram post not found.')
    err.code = ERROR_CODES.NOT_FOUND
    throw err
  }

  const patch = { updated_at: new Date() }

  if (payload.permalink !== undefined) {
    const validUrl = validateInstagramPermalink(payload.permalink)
    if (!validUrl) {
      const err = new Error('Please enter a valid Instagram post URL.')
      err.code = ERROR_CODES.VALIDATION_ERROR
      throw err
    }

    // Check duplicate
    const duplicate = await collection.findOne({
      source: 'manual',
      permalink: validUrl,
      id: { $ne: postId },
    })

    if (duplicate) {
      const err = new Error('This Instagram post URL is already used by another post.')
      err.code = ERROR_CODES.VALIDATION_ERROR
      throw err
    }

    patch.permalink = validUrl
  }

  if (payload.media_url !== undefined || payload.image_url !== undefined) {
    const mediaUrl = String(payload.media_url || payload.image_url || '').trim()
    if (!mediaUrl) {
      const err = new Error('Image URL cannot be empty.')
      err.code = ERROR_CODES.VALIDATION_ERROR
      throw err
    }
    patch.media_url = mediaUrl
    patch.thumbnail_url = payload.thumbnail_url || mediaUrl
  }

  if (payload.caption !== undefined) {
    const cleanCaption = String(payload.caption || '').trim()
    patch.caption = cleanCaption
    patch.altText = cleanCaption.length > 0
      ? `Thretha Couture on Instagram: ${cleanCaption.slice(0, 100)}`
      : 'Thretha Couture lookbook piece'
  }

  if (payload.is_hidden !== undefined) {
    patch.is_hidden = Boolean(payload.is_hidden)
  }

  if (payload.display_order !== undefined) {
    patch.display_order = Number(payload.display_order) || 1
  }

  if (payload.is_video !== undefined) {
    patch.is_video = Boolean(payload.is_video)
    patch.media_type = patch.is_video ? 'VIDEO' : 'IMAGE'
  }

  if (payload.open_in_new_tab !== undefined) {
    patch.open_in_new_tab = Boolean(payload.open_in_new_tab)
  }

  if (payload.post_date !== undefined) {
    patch.post_date = new Date(payload.post_date).toISOString()
    patch.timestamp = patch.post_date
  }

  if (payload.linked_product_ids !== undefined && Array.isArray(payload.linked_product_ids)) {
    patch.linked_product_ids = payload.linked_product_ids.map(String).filter(Boolean)
  }

  await collection.updateOne({ id: postId, source: 'manual' }, { $set: patch })
  const updated = await collection.findOne({ id: postId, source: 'manual' })
  const populated = await populateLinkedProducts(database, [updated])
  return populated[0]
}

/**
 * Deletes a manual Instagram post record
 */
export async function deleteManualInstagramPost(database, postId) {
  if (!postId) {
    const err = new Error('Post ID is required for deletion.')
    err.code = ERROR_CODES.VALIDATION_ERROR
    throw err
  }

  const collection = database.collection('instagram_posts')
  const res = await collection.deleteOne({ id: postId, source: 'manual' })

  if (res.deletedCount === 0) {
    const err = new Error('Manual Instagram post not found or already deleted.')
    err.code = ERROR_CODES.NOT_FOUND
    throw err
  }

  return { ok: true, deleted: true, id: postId }
}

/**
 * Fetches media directly from Meta's Official Instagram Graph API v21.0
 * Uses official endpoints: https://graph.facebook.com/v21.0/{account_id}/media
 */
export async function fetchInstagramMediaFromMeta({
  accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN,
  accountId = process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID,
  limit = 12,
  timeoutMs = 8000,
} = {}) {
  if (!accessToken || !accountId) {
    const err = new Error('Instagram access token or account ID is not configured in server environment.')
    err.code = ERROR_CODES.INSTAGRAM_CONFIGURATION_ERROR
    throw err
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Step 1: Validate connected account identity against expected username 'thretha_couture'
    const accountVerifyUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(accountId)}?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`
    const accountRes = await fetch(accountVerifyUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    const accountData = await accountRes.json()

    if (!accountRes.ok || accountData.error) {
      const fbErr = accountData.error || {}
      const message = fbErr.message || `Meta Graph API error verifying account ${accountId}`
      const err = new Error(message)
      if (fbErr.code === 190 || accountRes.status === 401) {
        err.code = ERROR_CODES.INSTAGRAM_AUTH_ERROR
      } else if (fbErr.code === 4 || fbErr.code === 17 || accountRes.status === 429) {
        err.code = ERROR_CODES.INSTAGRAM_RATE_LIMITED
      } else {
        err.code = ERROR_CODES.INSTAGRAM_API_ERROR
      }
      err.metaError = scrubSecrets(fbErr)
      throw err
    }

    const connectedUsername = (accountData.username || '').toLowerCase().trim()
    if (connectedUsername && connectedUsername !== EXPECTED_INSTAGRAM_USERNAME) {
      const err = new Error(
        `Connected Instagram account @${accountData.username} does not match @${EXPECTED_INSTAGRAM_USERNAME}.`
      )
      err.code = ERROR_CODES.INSTAGRAM_CONFIGURATION_ERROR
      throw err
    }

    // Step 2: Fetch media from Meta Graph API
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'username',
      'children{id,media_type,media_url,thumbnail_url}',
    ].join(',')

    const mediaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(accountId)}/media?fields=${encodeURIComponent(fields)}&limit=${Number(limit) || 12}&access_token=${encodeURIComponent(accessToken)}`

    const mediaRes = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    const mediaData = await mediaRes.json()

    if (!mediaRes.ok || mediaData.error) {
      const fbErr = mediaData.error || {}
      const message = fbErr.message || `Meta Graph API responded with status ${mediaRes.status}`
      const err = new Error(message)

      if (fbErr.code === 190 || mediaRes.status === 401) {
        err.code = ERROR_CODES.INSTAGRAM_AUTH_ERROR
      } else if (fbErr.code === 4 || fbErr.code === 17 || mediaRes.status === 429) {
        err.code = ERROR_CODES.INSTAGRAM_RATE_LIMITED
      } else {
        err.code = ERROR_CODES.INSTAGRAM_API_ERROR
      }
      err.metaError = scrubSecrets(fbErr)
      throw err
    }

    const items = Array.isArray(mediaData.data) ? mediaData.data : []

    // Parse and normalize Meta media items
    return items.map((item, index) => {
      const isVideo = item.media_type === 'VIDEO'
      let displayUrl = item.media_url
      let thumbUrl = item.thumbnail_url || item.media_url

      // For Carousel albums, if media_url is missing at top level, pick from children
      if (item.media_type === 'CAROUSEL_ALBUM' && !displayUrl && item.children?.data?.length) {
        const firstChild = item.children.data[0]
        displayUrl = firstChild.media_url || firstChild.thumbnail_url
        thumbUrl = firstChild.thumbnail_url || firstChild.media_url
      }

      if (isVideo && item.thumbnail_url) {
        displayUrl = item.thumbnail_url
      }

      const cleanCaption = (item.caption || '').trim()
      const altText = cleanCaption.length > 0
        ? `Thretha Couture on Instagram: ${cleanCaption.slice(0, 100)}...`
        : 'Thretha Couture lookbook piece'

      // Exact API permalink only — never construct or invent URLs
      const validPermalink = validateInstagramPermalink(item.permalink)

      return {
        source: 'meta_api',
        account_username: EXPECTED_INSTAGRAM_USERNAME,
        account_id: String(accountId),
        media_id: String(item.id),
        instagram_id: String(item.id),
        media_type: item.media_type || 'IMAGE',
        media_url: displayUrl,
        thumbnail_url: thumbUrl || displayUrl,
        permalink: validPermalink,
        caption: cleanCaption,
        timestamp: item.timestamp || new Date().toISOString(),
        username: item.username || EXPECTED_INSTAGRAM_USERNAME,
        alt_text: altText,
        is_video: isVideo,
        display_order: index + 1,
        is_hidden: false,
      }
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutErr = new Error('Meta Instagram API request timed out after 8 seconds.')
      timeoutErr.code = ERROR_CODES.INSTAGRAM_API_ERROR
      throw timeoutErr
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Synchronizes Instagram Feed with Meta API
 */
export async function syncInstagramFeed(database, { force = false } = {}) {
  // Purge any legacy seed / demo records
  await cleanupLegacyInstagramRecords(database)

  const settingsDoc = await database.collection('settings').findOne({ id: 'global' })
  const settings = normalizeInstagramSettings(settingsDoc?.instagram_feed)

  const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID

  // If no Meta credentials configured in environment, update status cleanly
  if (!token || !accountId) {
    await database.collection('settings').updateOne(
      { id: 'global' },
      {
        $set: {
          'instagram_feed.last_sync_status': 'NOT_CONFIGURED',
          'instagram_feed.last_error_message': 'Live Instagram is not connected yet.',
          updated_at: new Date(),
        },
      },
      { upsert: true }
    )
    return {
      synced: false,
      status: 'NOT_CONFIGURED',
      message: 'Live Instagram is not connected yet.',
    }
  }

  const now = Date.now()
  const lastSyncTime = settings.last_sync_at ? new Date(settings.last_sync_at).getTime() : 0
  const cacheTtlMs = (settings.refresh_interval_minutes || 30) * 60 * 1000

  // If cache is fresh and not forced, return cached state
  if (!force && lastSyncTime && now - lastSyncTime < cacheTtlMs) {
    return {
      synced: false,
      reason: 'CACHE_FRESH',
      last_sync_at: settings.last_sync_at,
    }
  }

  try {
    const liveMedia = await fetchInstagramMediaFromMeta({
      accessToken: token,
      accountId: accountId,
      limit: 12,
    })

    const collection = database.collection('instagram_posts')

    for (let i = 0; i < liveMedia.length; i++) {
      const post = liveMedia[i]
      const existing = await collection.findOne({
        instagram_id: post.instagram_id,
        source: { $in: ['meta_api', 'instagram_api'] },
      })

      if (existing) {
        // Update media and captions, but strictly preserve admin-curated visibility and order
        await collection.updateOne(
          { _id: existing._id },
          {
            $set: {
              source: 'meta_api',
              account_username: EXPECTED_INSTAGRAM_USERNAME,
              account_id: String(accountId),
              media_type: post.media_type,
              media_url: post.media_url,
              thumbnail_url: post.thumbnail_url,
              permalink: post.permalink,
              caption: post.caption,
              timestamp: post.timestamp,
              username: post.username,
              alt_text: post.alt_text,
              is_video: post.is_video,
              updated_at: new Date(),
            },
          }
        )
      } else {
        // Insert newly discovered real post
        await collection.insertOne({
          id: `ig_meta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ...post,
          is_hidden: false,
          display_order: i + 1,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
    }

    await database.collection('settings').updateOne(
      { id: 'global' },
      {
        $set: {
          'instagram_feed.last_sync_at': new Date().toISOString(),
          'instagram_feed.last_sync_status': 'SUCCESS',
          'instagram_feed.last_error_message': null,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    )

    return {
      synced: true,
      mode: 'LIVE_META_API',
      count: liveMedia.length,
    }
  } catch (error) {
    logger.error('Failed to sync Instagram feed from Meta Graph API', {
      error: error.message,
      code: error.code,
    })

    await database.collection('settings').updateOne(
      { id: 'global' },
      {
        $set: {
          'instagram_feed.last_sync_status': 'ERROR',
          'instagram_feed.last_error_message': error.message || 'Meta API sync error',
          updated_at: new Date(),
        },
      },
      { upsert: true }
    )

    return {
      synced: false,
      error: error.message,
      code: error.code,
    }
  }
}

/**
 * Returns public, sanitized Instagram feed for the storefront.
 * Honors active content source: 'manual' (Manual Posts) vs 'meta' (Live Meta API).
 */
export async function getStorefrontInstagramFeed(database) {
  const settingsDoc = await database.collection('settings').findOne({ id: 'global' })
  const settings = normalizeInstagramSettings(settingsDoc?.instagram_feed)

  const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID
  const isConnected = Boolean(token && accountId)

  if (!settings.enabled) {
    return {
      enabled: false,
      source: settings.source,
      connected: isConnected,
      username: EXPECTED_INSTAGRAM_USERNAME,
      profile_url: DEFAULT_INSTAGRAM_PROFILE_URL,
      posts: [],
    }
  }

  // --- SOURCE: MANUAL POSTS ---
  if (settings.source === 'manual') {
    const query = {
      source: 'manual',
      is_hidden: { $ne: true },
    }

    const sort = settings.feed_mode === 'editorial'
      ? { display_order: 1, timestamp: -1 }
      : { timestamp: -1, display_order: 1 }

    const rawPosts = await database.collection('instagram_posts')
      .find(query)
      .sort(sort)
      .limit(settings.posts_to_display || 6)
      .toArray()

    const postsWithProducts = await populateLinkedProducts(database, rawPosts)

    return {
      enabled: true,
      source: 'manual',
      connected: isConnected,
      username: EXPECTED_INSTAGRAM_USERNAME,
      profile_url: DEFAULT_INSTAGRAM_PROFILE_URL,
      posts_to_display: settings.posts_to_display,
      open_in_new_tab: settings.open_in_new_tab,
      show_captions: settings.show_captions,
      show_username: settings.show_username,
      posts: postsWithProducts.map((p) => ({
        id: String(p.id || p._id),
        source: 'manual',
        media_type: p.media_type || 'IMAGE',
        media_url: p.media_url,
        thumbnail_url: p.thumbnail_url || p.media_url,
        permalink: validateInstagramPermalink(p.permalink),
        caption: p.caption || '',
        timestamp: p.timestamp,
        username: EXPECTED_INSTAGRAM_USERNAME,
        alt_text: p.alt_text || 'Thretha Couture on Instagram',
        is_video: Boolean(p.is_video || p.media_type === 'VIDEO'),
        display_order: p.display_order || 0,
        linked_products: p.linked_products || [],
      })),
    }
  }

  // --- SOURCE: LIVE META API ---
  if (settings.auto_refresh && isConnected) {
    const lastSync = settings.last_sync_at ? new Date(settings.last_sync_at).getTime() : 0
    const now = Date.now()
    if (!lastSync || now - lastSync > settings.refresh_interval_minutes * 60 * 1000) {
      syncInstagramFeed(database, { force: false }).catch(() => {})
    }
  }

  const query = {
    is_hidden: { $ne: true },
    source: { $in: ['instagram_api', 'meta_api'] },
    account_username: EXPECTED_INSTAGRAM_USERNAME,
  }

  if (!settings.enable_videos) {
    query.is_video = { $ne: true }
    query.media_type = { $ne: 'VIDEO' }
  }

  const sort = settings.feed_mode === 'editorial'
    ? { display_order: 1, timestamp: -1 }
    : { timestamp: -1 }

  const posts = await database.collection('instagram_posts')
    .find(query)
    .sort(sort)
    .limit(settings.posts_to_display || 6)
    .toArray()

  return {
    enabled: true,
    source: 'meta',
    connected: isConnected,
    username: EXPECTED_INSTAGRAM_USERNAME,
    profile_url: DEFAULT_INSTAGRAM_PROFILE_URL,
    posts_to_display: settings.posts_to_display,
    open_in_new_tab: settings.open_in_new_tab,
    show_captions: settings.show_captions,
    show_username: settings.show_username,
    posts: posts.map((p) => ({
      id: String(p.id || p._id || p.instagram_id),
      source: 'meta_api',
      instagram_id: p.instagram_id || null,
      media_type: p.media_type || 'IMAGE',
      media_url: p.media_url,
      thumbnail_url: p.thumbnail_url || p.media_url,
      permalink: validateInstagramPermalink(p.permalink),
      caption: p.caption || '',
      timestamp: p.timestamp,
      username: EXPECTED_INSTAGRAM_USERNAME,
      alt_text: p.alt_text || 'Thretha Couture on Instagram',
      is_video: Boolean(p.is_video || p.media_type === 'VIDEO'),
      display_order: p.display_order || 0,
      linked_products: [],
    })),
  }
}

/**
 * Returns complete Instagram post lists (both manual and meta) and sync controls for admin panel
 */
export async function getAdminInstagramFeed(database) {
  // Purge any legacy seed posts on admin load
  await cleanupLegacyInstagramRecords(database)

  const settingsDoc = await database.collection('settings').findOne({ id: 'global' })
  const settings = normalizeInstagramSettings(settingsDoc?.instagram_feed)

  const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID

  let connectionStatus = 'NOT_CONFIGURED'
  if (token && accountId) {
    if (settings.last_sync_status === 'ERROR') {
      connectionStatus = 'ERROR'
    } else if (settings.last_sync_status === 'SUCCESS') {
      connectionStatus = 'CONNECTED'
    } else {
      connectionStatus = 'CONNECTED'
    }
  }

  // 1. Fetch Manual Posts
  const rawManualPosts = await database.collection('instagram_posts')
    .find({ source: 'manual' })
    .sort({ display_order: 1, timestamp: -1 })
    .toArray()

  const manualPostsWithProducts = await populateLinkedProducts(database, rawManualPosts)

  const manualPosts = manualPostsWithProducts.map((p) => ({
    id: String(p.id || p._id),
    source: 'manual',
    media_type: p.media_type || 'IMAGE',
    media_url: p.media_url,
    thumbnail_url: p.thumbnail_url || p.media_url,
    permalink: validateInstagramPermalink(p.permalink),
    caption: p.caption || '',
    post_date: p.post_date || p.timestamp,
    timestamp: p.timestamp,
    username: EXPECTED_INSTAGRAM_USERNAME,
    alt_text: p.alt_text || '',
    is_video: Boolean(p.is_video || p.media_type === 'VIDEO'),
    is_hidden: Boolean(p.is_hidden),
    open_in_new_tab: p.open_in_new_tab !== false,
    display_order: Number(p.display_order) || 0,
    linked_product_ids: p.linked_product_ids || [],
    linked_products: p.linked_products || [],
  }))

  // 2. Fetch Meta API Posts
  const metaPostsRaw = await database.collection('instagram_posts')
    .find({
      source: { $in: ['instagram_api', 'meta_api'] },
      account_username: EXPECTED_INSTAGRAM_USERNAME,
    })
    .sort({ display_order: 1, timestamp: -1 })
    .toArray()

  const metaPosts = metaPostsRaw.map((p) => ({
    id: String(p.id || p._id || p.instagram_id),
    source: 'meta_api',
    instagram_id: p.instagram_id || null,
    media_type: p.media_type || 'IMAGE',
    media_url: p.media_url,
    thumbnail_url: p.thumbnail_url || p.media_url,
    permalink: validateInstagramPermalink(p.permalink),
    caption: p.caption || '',
    timestamp: p.timestamp,
    username: EXPECTED_INSTAGRAM_USERNAME,
    alt_text: p.alt_text || '',
    is_video: Boolean(p.is_video || p.media_type === 'VIDEO'),
    is_hidden: Boolean(p.is_hidden),
    display_order: Number(p.display_order) || 0,
    linked_products: [],
  }))

  const maskedAccountId = accountId
    ? `${'•'.repeat(Math.max(0, accountId.length - 4))}${accountId.slice(-4)}`
    : null

  // Active source list
  const activePosts = settings.source === 'manual' ? manualPosts : metaPosts

  return {
    settings,
    active_source: settings.source,
    connection_status: connectionStatus,
    account_id_masked: maskedAccountId,
    expected_username: EXPECTED_INSTAGRAM_USERNAME,
    profile_url: DEFAULT_INSTAGRAM_PROFILE_URL,
    manual_posts: manualPosts,
    meta_posts: metaPosts,
    posts: activePosts,
    total_manual_posts: manualPosts.length,
    active_manual_posts: manualPosts.filter((p) => !p.is_hidden).length,
    total_meta_posts: metaPosts.length,
    active_meta_posts: metaPosts.filter((p) => !p.is_hidden).length,
    total_posts: activePosts.length,
    active_posts: activePosts.filter((p) => !p.is_hidden).length,
    hidden_posts: activePosts.filter((p) => p.is_hidden).length,
  }
}

/**
 * Updates post curation attributes (visibility and display ordering)
 */
export async function updateAdminInstagramPosts(database, updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { ok: true, updated: 0 }
  }

  const collection = database.collection('instagram_posts')
  let updatedCount = 0

  for (const item of updates) {
    if (!item.id && !item.instagram_id) continue

    const filter = item.id
      ? { id: item.id }
      : { instagram_id: item.instagram_id }

    const patch = { updated_at: new Date() }

    if (typeof item.is_hidden === 'boolean') {
      patch.is_hidden = item.is_hidden
    }
    if (typeof item.display_order === 'number') {
      patch.display_order = item.display_order
    }

    const res = await collection.updateOne(filter, { $set: patch })
    if (res.matchedCount > 0) {
      updatedCount++
    }
  }

  return { ok: true, updated: updatedCount }
}
