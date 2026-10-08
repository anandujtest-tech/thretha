function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function findCustomerOrder(database, reference, customer, { claimGuest = false } = {}) {
  const orders = database.collection('orders')
  const order = await orders.findOne({ $or: [
    { id: reference },
    { order_number: reference },
    { order_number: { $regex: new RegExp(`^${escapeRegex(reference)}$`, 'i') } },
  ] })
  if (!order) return { status: 404, order: null }

  const unclaimed = !order.userId && order.customer?.email &&
    order.customer.email.toLowerCase() === (customer.email || '').toLowerCase()
  if (claimGuest && unclaimed) {
    const result = await orders.updateOne(
      { id: order.id, $or: [{ userId: null }, { userId: { $exists: false } }, { userId: '' }] },
      { $set: { userId: customer.id, updated_at: new Date() } },
    )
    if (result.matchedCount) order.userId = customer.id
  }

  return order.userId === customer.id ? { status: 200, order } : { status: 403, order: null }
}

export async function findCustomerAddress(database, id, customerId) {
  return database.collection('addresses').findOne({ id, userId: customerId })
}
