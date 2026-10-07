export async function ensureProductReviewIndexes(database) {
  const collection = database.collection('product_reviews')
  await Promise.all([
    collection.createIndex({ product_slug: 1, status: 1, created_at: -1 }),
    collection.createIndex({ user_id: 1, order_id: 1, product_id: 1 }, { unique: true }),
    collection.createIndex({ order_id: 1 }),
    collection.createIndex({ status: 1, created_at: -1 }),
  ])
}

export function normalizeReviewText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
}

export function isCloudinaryImageUrl(value, userId) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/') &&
      (!userId || url.pathname.includes(`/thretha/reviews/${String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}/`))
  } catch {
    return false
  }
}

export function summarizeReviews(reviews) {
  const count = reviews.length
  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0)
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Number(review.rating) === rating).length,
  }))
  return { count, average: count ? Math.round((total / count) * 10) / 10 : 0, distribution }
}
