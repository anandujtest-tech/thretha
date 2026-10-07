import { MongoClient } from 'mongodb'
import { ensurePushIndexes, processPushQueue } from '@/lib/pushScheduler'
import { getAppBaseUrl } from '@/lib/auth'
import { ensureBackInStockIndexes, processBackInStockSubscriptions } from '@/lib/backInStock'
import { ensureAbandonedCartIndexes, processAbandonedCartReminders } from '@/lib/abandonedCart'
import { processNewsletterQueue } from '@/lib/newsletterScheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const state = globalThis.__threthaPushCronMongo || (globalThis.__threthaPushCronMongo = { client: null, promise: null })

async function getDatabase() {
  if (!process.env.MONGO_URL) throw new Error('Database is not configured.')
  if (!state.promise) {
    state.client = new MongoClient(process.env.MONGO_URL)
    state.promise = state.client.connect().then(() => state.client.db(process.env.DB_NAME || 'thretha_couture'))
      .catch((error) => { state.promise = null; throw error })
  }
    const database = await state.promise
    await ensurePushIndexes(database)
    await ensureBackInStockIndexes(database)
    await ensureAbandonedCartIndexes(database)
    return database
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const database = await getDatabase()
    const [push, backInStock, abandonedCart, newsletter] = await Promise.all([
      processPushQueue(database),
      processBackInStockSubscriptions(database, {
        appUrl: getAppBaseUrl(request),
        secret: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret',
      }),
      processAbandonedCartReminders(database, {
        appUrl: getAppBaseUrl(request),
        secret: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret',
      }),
      processNewsletterQueue(database, {
        appUrl: getAppBaseUrl(request),
        secret: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'thretha_dev_secret',
      }).catch(() => {
        console.error('[Newsletter Cron] Batch processing failed; it can resume on the next invocation.')
        return { status: 'error', processed: 0 }
      }),
    ])
    return Response.json({ ...push, backInStock, abandonedCart, newsletter })
  } catch (error) {
    console.error('[Push Cron] Queue processing failed:', error?.message || 'unknown error')
    return Response.json({ error: 'Push queue processing failed' }, { status: 500 })
  }
}
