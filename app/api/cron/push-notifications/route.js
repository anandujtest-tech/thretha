import { MongoClient } from 'mongodb'
import { ensurePushIndexes, processPushQueue } from '@/lib/pushScheduler'

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
  return database
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processPushQueue(await getDatabase())
    return Response.json(result)
  } catch (error) {
    console.error('[Push Cron] Queue processing failed:', error?.message || 'unknown error')
    return Response.json({ error: 'Push queue processing failed' }, { status: 500 })
  }
}
