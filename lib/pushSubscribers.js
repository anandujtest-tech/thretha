export function pushDeviceFromUserAgent(value) {
  const agent = String(value || '').slice(0, 600)
  const platform = /Android/i.test(agent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(agent) ? 'iOS'
    : /Windows/i.test(agent) ? 'Windows'
    : /Macintosh|Mac OS X/i.test(agent) ? 'macOS'
    : /Linux/i.test(agent) ? 'Linux' : null
  const browser = /Edg\//i.test(agent) ? 'Edge'
    : /OPR\//i.test(agent) ? 'Opera'
    : /SamsungBrowser\//i.test(agent) ? 'Samsung Internet'
    : /Firefox\//i.test(agent) ? 'Firefox'
    : /CriOS\/|Chrome\//i.test(agent) ? 'Chrome'
    : /Safari\//i.test(agent) ? 'Safari' : null
  const device_type = /iPad|Tablet/i.test(agent) ? 'tablet'
    : /Mobile|iPhone|iPod|Android/i.test(agent) ? 'mobile'
    : platform ? 'desktop' : null
  return { browser, platform, device_type }
}

export function pushSubscriberPipeline({ page, limit, search = '', status = 'all', identity = 'all' }) {
  const base = status === 'active' ? { active: true } : status === 'removed' ? { active: { $ne: true } } : {}
  const pipeline = [
    { $match: base },
    { $lookup: {
      from: 'users', localField: 'customer_id', foreignField: 'id',
      pipeline: [{ $project: { _id: 0, id: 1, name: 1, email: 1, phone: 1 } }],
      as: 'matched_customer',
    } },
    { $set: { customer: { $first: '$matched_customer' } } },
  ]
  if (identity === 'identified') pipeline.push({ $match: { 'customer.id': { $exists: true } } })
  if (identity === 'anonymous') pipeline.push({ $match: { 'customer.id': { $exists: false } } })
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    pipeline.push({ $match: { $or: [
      { 'customer.name': { $regex: escaped, $options: 'i' } },
      { 'customer.email': { $regex: escaped, $options: 'i' } },
      { 'customer.phone': { $regex: escaped, $options: 'i' } },
    ] } })
  }
  pipeline.push({ $facet: {
    items: [
      { $sort: { created_at: -1, _id: -1 } },
      { $skip: (page - 1) * limit }, { $limit: limit },
      { $project: {
        _id: 1, customer: 1, browser: 1, platform: 1, device_type: 1,
        active: 1, created_at: 1, last_active_at: 1,
      } },
    ],
    count: [{ $count: 'total' }],
  } })
  return pipeline
}

export function adminPushSubscriber(row) {
  const customer = row.customer?.id ? {
    name: String(row.customer.name || '').slice(0, 160),
    email: String(row.customer.email || '').slice(0, 254),
    phone: String(row.customer.phone || '').slice(0, 40),
  } : null
  return {
    id: String(row._id), customer, identityStatus: customer ? 'identified' : 'anonymous',
    browser: row.browser || null, platform: row.platform || null, deviceType: row.device_type || null,
    subscribedAt: row.created_at || null, lastActiveAt: row.last_active_at || null,
    status: row.active === true ? 'active' : 'removed',
  }
}
