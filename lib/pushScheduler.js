import {
  deliverWebPush,
  getWebPushPayload,
  getNextPushOccurrence,
  getPushSubscriberCooldownMinutes,
  isWebPushConfigured,
} from './pushNotifications.js'

const BATCH_SIZE = 25

export async function ensurePushIndexes(database) {
  await Promise.all([
    database.collection('push_subscriptions').createIndex({ endpoint: 1 }, { unique: true, name: 'push_endpoint_unique' }),
    database.collection('push_subscriptions').createIndex({ active: 1, _id: 1 }, { name: 'push_active_cursor' }),
    database.collection('notification_campaigns').createIndex({ status: 1, next_run_at: 1 }, { name: 'push_campaign_due' }),
    database.collection('notification_deliveries').createIndex({ run_key: 1, subscription_id: 1 }, { unique: true, name: 'push_delivery_once_per_run' }),
    database.collection('notification_deliveries').createIndex({ created_at: 1, status: 1 }, { name: 'push_delivery_daily_stats' }),
    database.collection('notification_deliveries').createIndex({ campaign_id: 1, status: 1 }, { name: 'push_delivery_campaign_stats' }),
  ])
}

export async function suppressDuePushCampaigns(database, now) {
  const campaigns = database.collection('notification_campaigns')
  const due = await campaigns.find({
    status: { $in: ['scheduled', 'active', 'sending'] },
    next_run_at: { $lte: now },
  }).sort({ next_run_at: 1 }).limit(50).toArray()
  for (const campaign of due) {
    if (campaign.schedule?.type === 'repeat') {
      const nextRun = getNextPushOccurrence(campaign.schedule, now)
      if (nextRun) {
      await campaigns.updateOne({ _id: campaign._id, status: campaign.status, next_run_at: campaign.next_run_at }, {
          $set: { status: 'active', next_run_at: nextRun, updated_at: now, last_suppressed_at: now },
          $unset: { current_run_key: '', run_cursor: '', claim_expires_at: '' },
        })
      } else {
        await campaigns.updateOne({ _id: campaign._id, status: campaign.status }, { $set: { status: 'sent', completed_at: now, updated_at: now } })
      }
    } else {
      await campaigns.updateOne({ _id: campaign._id, status: campaign.status }, {
        $set: { status: 'cancelled', cancel_reason: 'global_notifications_disabled', updated_at: now },
        $unset: { next_run_at: '' },
      })
    }
  }
}

async function deliverOne(database, campaign, subscription, now, cooldownMs) {
  const deliveries = database.collection('notification_deliveries')
  const delivery = {
    run_key: campaign.current_run_key,
    campaign_id: String(campaign._id),
    subscription_id: subscription._id,
    status: 'sending',
    created_at: now,
  }
  try {
    await deliveries.insertOne(delivery)
  } catch (error) {
    if (error?.code === 11000) {
      const reclaimed = await deliveries.updateOne(
        { run_key: delivery.run_key, subscription_id: delivery.subscription_id, status: 'sending', created_at: { $lte: new Date(now.getTime() - 45_000) } },
        { $set: { created_at: now }, $inc: { attempts: 1 } },
      )
      if (!reclaimed.matchedCount) return { status: 'duplicate' }
    } else throw error
  }

  if (cooldownMs > 0 && subscription.last_success_at && now.getTime() - new Date(subscription.last_success_at).getTime() < cooldownMs) {
    await deliveries.updateOne({ run_key: delivery.run_key, subscription_id: delivery.subscription_id }, { $set: { status: 'skipped_frequency', completed_at: now } })
    return { status: 'skipped_frequency' }
  }

  try {
    const endpointSubscription = { endpoint: subscription.endpoint, keys: subscription.keys }
    for (let attempt = 0; ; attempt += 1) {
      try {
        await deliverWebPush(endpointSubscription, getWebPushPayload(campaign))
        break
      } catch (error) {
        const statusCode = Number(error?.statusCode) || 0
        const permanent = statusCode === 404 || statusCode === 410
        if (permanent || attempt >= 1) throw error
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
    await Promise.all([
      deliveries.updateOne({ run_key: delivery.run_key, subscription_id: delivery.subscription_id }, { $set: { status: 'sent', completed_at: new Date() } }),
      database.collection('push_subscriptions').updateOne({ _id: subscription._id }, { $set: { last_success_at: new Date(), last_failure: null, updated_at: new Date() }, $inc: { success_count: 1 } }),
    ])
    return { status: 'sent' }
  } catch (error) {
    const statusCode = Number(error?.statusCode) || null
    const permanent = statusCode === 404 || statusCode === 410
    const failedAt = new Date()
    await Promise.all([
      deliveries.updateOne({ run_key: delivery.run_key, subscription_id: delivery.subscription_id }, { $set: { status: 'failed', status_code: statusCode, completed_at: failedAt } }),
      database.collection('push_subscriptions').updateOne({ _id: subscription._id }, {
        $set: { ...(permanent ? { active: false } : {}), last_failure: { at: failedAt, status_code: statusCode }, updated_at: failedAt },
        $inc: { failure_count: 1 },
      }),
    ])
    return { status: 'failed' }
  }
}

async function finishCampaign(database, campaign, now) {
  const campaigns = database.collection('notification_campaigns')
  if (campaign.schedule?.type === 'repeat') {
    const nextRun = getNextPushOccurrence(campaign.schedule, now)
    if (nextRun) {
      await campaigns.updateOne({ _id: campaign._id, status: 'sending', current_run_key: campaign.current_run_key }, {
        $set: { status: 'active', next_run_at: nextRun, last_run_at: now, updated_at: now },
        $inc: { run_count: 1 },
        $unset: { current_run_key: '', run_cursor: '', claim_expires_at: '' },
      })
      return 'active'
    }
  }
  const [deliveryTotals] = await database.collection('notification_deliveries').aggregate([
    { $match: { campaign_id: String(campaign._id) } },
    { $group: {
      _id: null,
      targeted: { $sum: 1 },
      sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
    } },
  ]).toArray()
  const finalStatus = deliveryTotals?.targeted && deliveryTotals.sent === 0 && deliveryTotals.failed > 0 ? 'failed' : 'sent'
  await campaigns.updateOne({ _id: campaign._id, status: 'sending', current_run_key: campaign.current_run_key }, {
    $set: { status: finalStatus, sent_at: now, last_run_at: now, updated_at: now },
    $inc: { run_count: 1 },
    $unset: { next_run_at: '', current_run_key: '', run_cursor: '', claim_expires_at: '' },
  })
  return finalStatus
}

async function refreshCampaignCounts(database, campaignId) {
  const [counts] = await database.collection('notification_deliveries').aggregate([
    { $match: { campaign_id: String(campaignId) } },
    { $group: {
      _id: null,
      targeted: { $sum: 1 },
      successful: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
    } },
  ]).toArray()
  await database.collection('notification_campaigns').updateOne({ _id: campaignId }, {
    $set: { targeted_count: counts?.targeted || 0, success_count: counts?.successful || 0, failed_count: counts?.failed || 0 },
  })
}

async function getCampaignProcessingResult(campaigns, campaignId) {
  if (!campaignId) return null
  const campaign = await campaigns.findOne({ id: campaignId }, {
    projection: { status: 1, targeted_count: 1, success_count: 1, failed_count: 1 },
  })
  if (!campaign) return null
  const remaining = ['scheduled', 'active', 'sending'].includes(campaign.status)
  return {
    status: campaign.status === 'sending' || remaining ? 'sending' : campaign.status,
    campaignFound: true,
    subscribersFound: 0,
    processed: 0,
    targeted: campaign.targeted_count || 0,
    sent: campaign.success_count || 0,
    failed: campaign.failed_count || 0,
    skipped: 0,
    remaining,
  }
}

export async function processPushQueue(database, now = new Date(), { campaignId = null } = {}) {
  const setting = await database.collection('settings').findOne({ id: 'global' }, { projection: { browser_notifications: 1, notifications: 1 } })
  const cooldownMinutes = getPushSubscriberCooldownMinutes(setting?.notifications?.push_subscriber_cooldown_minutes)
  const cooldownMs = cooldownMinutes * 60 * 1000
  if (setting?.browser_notifications?.enabled !== true) {
    await suppressDuePushCampaigns(database, now)
    return { status: 'disabled', campaignFound: false, subscribersFound: 0, processed: 0, targeted: 0, sent: 0, failed: 0 }
  }
  if (!isWebPushConfigured()) return { status: 'not_configured', campaignFound: false, subscribersFound: 0, processed: 0, targeted: 0, sent: 0, failed: 0 }

  const campaigns = database.collection('notification_campaigns')
  // "Send now" is intrinsically due. Prefer it even if an older or malformed
  // record is missing next_run_at or contains a future value.
  const campaignFilter = campaignId ? { id: campaignId } : {}
  const immediateCandidate = await campaigns.findOne({
    ...campaignFilter,
    'schedule.type': 'now',
    $or: [
      { status: { $in: ['scheduled', 'active'] } },
      { status: 'sending', claim_expires_at: { $lte: now } },
    ],
  }, { sort: { created_at: 1 } })
  const candidate = immediateCandidate || await campaigns.findOne({
    ...campaignFilter,
    next_run_at: { $lte: now },
    $or: [
      { status: { $in: ['scheduled', 'active'] } },
      { status: 'sending', claim_expires_at: { $lte: now } },
    ],
  }, { sort: { next_run_at: 1 } })
  if (!candidate) {
    const existingResult = await getCampaignProcessingResult(campaigns, campaignId)
    return existingResult || { status: 'idle', campaignFound: false, subscribersFound: 0, processed: 0, targeted: 0, sent: 0, failed: 0, skipped: 0, remaining: false }
  }

  const scheduledRunAt = candidate.next_run_at ? new Date(candidate.next_run_at) : null
  const runAt = candidate.schedule?.type === 'now'
    && candidate.status !== 'sending'
    && (!scheduledRunAt || Number.isNaN(scheduledRunAt.getTime()) || scheduledRunAt > now)
    ? now
    : scheduledRunAt || now
  const runKey = candidate.current_run_key || `${candidate._id}:${runAt.toISOString()}`
  const filter = candidate.status === 'sending'
    ? {
      _id: candidate._id,
      status: 'sending',
      claim_expires_at: { $lte: now },
      ...(candidate.schedule?.type === 'now'
        ? { 'schedule.type': 'now', next_run_at: candidate.next_run_at ?? { $in: [null] } }
        : { next_run_at: candidate.next_run_at }),
    }
    : {
      _id: candidate._id,
      status: candidate.status,
      ...(candidate.schedule?.type === 'now'
        ? { 'schedule.type': 'now', next_run_at: candidate.next_run_at ?? { $in: [null] } }
        : { next_run_at: candidate.next_run_at }),
    }
  const claimed = await campaigns.findOneAndUpdate(filter, {
    $set: {
      status: 'sending',
      next_run_at: runAt,
      current_run_key: runKey,
      run_cursor: candidate.current_run_key === runKey ? candidate.run_cursor || null : null,
      claim_expires_at: new Date(now.getTime() + 50_000),
      updated_at: now,
      ...(candidate.started_at ? {} : { started_at: now }),
    },
  }, { returnDocument: 'after' })
  if (!claimed) {
    const existingResult = await getCampaignProcessingResult(campaigns, campaignId)
    return existingResult || { status: 'claimed_elsewhere', campaignFound: true, subscribersFound: 0, processed: 0, targeted: 0, sent: 0, failed: 0, skipped: 0, remaining: true }
  }

  const subscriptionQuery = { active: true }
  if (claimed.run_cursor) subscriptionQuery._id = { $gt: claimed.run_cursor }
  const subscriptions = await database.collection('push_subscriptions').find(subscriptionQuery)
    .sort({ _id: 1 }).limit(BATCH_SIZE).toArray()
  if (!subscriptions.length) {
    const status = await finishCampaign(database, claimed, now)
    return { status, campaignFound: true, subscribersFound: 0, processed: 0, targeted: 0, sent: 0, failed: 0, skipped: 0, remaining: status === 'active' }
  }

  let successful = 0
  let failed = 0
  let skipped = 0
  let targeted = 0
  for (let offset = 0; offset < subscriptions.length; offset += 10) {
    const sendGate = await database.collection('settings').findOne({ id: 'global' }, { projection: { browser_notifications: 1 } })
    if (sendGate?.browser_notifications?.enabled !== true) {
      await suppressDuePushCampaigns(database, new Date())
      await refreshCampaignCounts(database, claimed._id)
      return { status: 'disabled', campaignFound: true, subscribersFound: subscriptions.length, processed: targeted, targeted, sent: successful, failed, skipped, remaining: true }
    }
    const group = subscriptions.slice(offset, offset + 10)
    const outcomes = await Promise.all(group.map((subscription) => deliverOne(database, claimed, subscription, now, cooldownMs)))
    for (const outcome of outcomes) {
      if (outcome.status === 'duplicate') continue
      targeted += 1
      if (outcome.status === 'sent') successful += 1
      if (outcome.status === 'failed') failed += 1
      if (outcome.status === 'skipped_frequency') skipped += 1
    }
  }

  await campaigns.updateOne({ _id: claimed._id, status: 'sending', current_run_key: runKey }, {
    $set: { run_cursor: subscriptions[subscriptions.length - 1]._id, claim_expires_at: new Date(now.getTime() + 50_000), updated_at: new Date() },
    $inc: { targeted_count: targeted, success_count: successful, failed_count: failed },
  })
  await refreshCampaignCounts(database, claimed._id)

  if (subscriptions.length < BATCH_SIZE) {
    const status = await finishCampaign(database, claimed, new Date())
    return { status, campaignFound: true, subscribersFound: subscriptions.length, processed: targeted, targeted, sent: successful, failed, skipped, remaining: status === 'active' }
  }
  return { status: 'sending', campaignFound: true, subscribersFound: subscriptions.length, processed: targeted, targeted, sent: successful, failed, skipped, remaining: true }
}
