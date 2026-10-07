import { MongoClient } from 'mongodb'
import jwt from 'jsonwebtoken'
import { revalidatePath } from 'next/cache'
import { DEFAULT_OCCASIONS, parseOccasionsInput } from '@/lib/occasions'
import { occasionsWithAssignments, persistOccasions } from '@/lib/occasionManagement'

export const dynamic = 'force-dynamic'

let connection

async function getDatabase() {
  if (!process.env.MONGO_URL) throw new Error('MongoDB is not configured')
  if (!connection) {
    connection = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 10000 })
      .connect().catch((error) => { connection = null; throw error })
  }
  return (await connection).db(process.env.DB_NAME || 'thretha_couture')
}

function isAdmin(request) {
  const header = request.headers.get('authorization') || ''
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET
  if (!secret || !header.startsWith('Bearer ')) return false
  try {
    return jwt.verify(header.slice(7), secret)?.role === 'admin'
  } catch {
    return false
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request) {
  if (!isAdmin(request)) return json({ error: 'Unauthorized' }, 401)
  try {
    const database = await getDatabase()
    const [settings, products] = await Promise.all([
      database.collection('settings').findOne({ id: 'global' }, { projection: { shop_by_occasion: 1 } }),
      database.collection('products').find({}, { projection: { _id: 0, id: 1, name: 1, sku: 1, active: 1, occasion_slugs: 1 } }).sort({ name: 1 }).toArray(),
    ])
    return json({
      occasions: occasionsWithAssignments(settings?.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS, products),
      products: products.map(({ id, name, sku, active }) => ({ id, name, sku, active: active !== false })),
    })
  } catch {
    return json({ error: 'Could not load occasions.' }, 500)
  }
}

export async function PUT(request) {
  if (!isAdmin(request)) return json({ error: 'Unauthorized' }, 401)
  const body = await request.json().catch(() => null)
  const parsed = parseOccasionsInput(body?.occasions)
  if (parsed.error) return json({ error: parsed.error }, 400)
  try {
    const database = await getDatabase()
    const client = await connection
    const session = client.startSession()
    try {
      await session.withTransaction(() => persistOccasions(database, parsed.occasions, session))
    } finally {
      await session.endSession()
    }
    revalidatePath('/', 'page')
    return json({ occasions: parsed.occasions })
  } catch (error) {
    if (error.message === 'OCCASION_REMOVED') return json({ error: 'Use Delete to hide an existing occasion without removing its products.' }, 400)
    if (error.message === 'UNKNOWN_PRODUCT') return json({ error: 'An assigned product no longer exists. Reload and try again.' }, 400)
    return json({ error: 'Could not save occasions. Please try again.' }, 500)
  }
}
