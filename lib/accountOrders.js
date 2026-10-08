import { publicOrderListItem } from './publicResponses.js'

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || !/^[1-9]\d*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? Math.min(parsed, maximum) : fallback
}

export function parseAccountOrderPagination(url) {
  const query = new URL(url).searchParams
  if (!query.has('page') && !query.has('limit') && query.get('format') !== 'paginated') return null
  return { page: positiveInteger(query.get('page'), 1), limit: positiveInteger(query.get('limit'), 20, 50) }
}

export async function listCustomerOrders(collection, customerId, pagination) {
  const filter = { userId: customerId }
  const cursor = () => collection.find(filter)
    .sort({ created_at: -1, _id: -1 })
  if (!pagination) {
    return { orders: (await cursor().toArray()).map(publicOrderListItem) }
  }
  const skip = (pagination.page - 1) * pagination.limit
  const [total, orders] = await Promise.all([
    collection.countDocuments(filter),
    cursor().skip(Number.isSafeInteger(skip) ? skip : Number.MAX_SAFE_INTEGER)
      .limit(pagination.limit).toArray(),
  ])
  const totalPages = Math.ceil(total / pagination.limit)
  return {
    orders: orders.map(publicOrderListItem),
    pagination: {
      ...pagination, total, totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    },
  }
}
