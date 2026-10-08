import { v4 as uuidv4 } from 'uuid'
import { sendEmail } from './email.js'
import { createNewsletterUnsubscribeToken, isValidNewsletterEmail, normalizeNewsletterEmail } from './newsletter.js'
import { activeNewsletterAudienceFilter, canSendNewsletterTo, newsletterPlainText, renderNewsletterEmail } from './newsletterCampaigns.js'

export const NEWSLETTER_BATCH_SIZE = 10
const CLAIM_MS = 120_000

export async function ensureNewsletterCampaignIndexes(database) {
  await database.collection('newsletter_campaigns').createIndex({ id: 1 }, { unique: true })
  await database.collection('newsletter_campaigns').createIndex({ status: 1, claim_expires_at: 1, created_at: 1 })
  await database.collection('newsletter_deliveries').createIndex({ campaign_id: 1, email_normalized: 1 }, { unique: true })
  await database.collection('newsletter_deliveries').createIndex({ campaign_id: 1, status: 1, last_retry_generation: 1, email_normalized: 1 })
  await database.collection('newsletter_subscribers').createIndex({ status: 1, email_normalized: 1, consented_at: 1 })
}

export async function countNewsletterAudience(database, cutoff = null, selectedIds = null) {
  const [result] = await database.collection('newsletter_subscribers').aggregate([
    { $match: { ...activeNewsletterAudienceFilter(cutoff), ...(selectedIds ? { id: { $in: selectedIds } } : {}) } },
    { $group: { _id: '$email_normalized' } },
    { $count: 'total' },
  ]).toArray()
  return result?.total || 0
}

export async function refreshNewsletterCounts(database, campaignId) {
  const deliveries = database.collection('newsletter_deliveries')
  const [sent, failed, unknown, skipped] = await Promise.all(['SENT', 'FAILED', 'UNKNOWN', 'SKIPPED'].map((status) =>
    deliveries.countDocuments({ campaign_id: campaignId, status })))
  await database.collection('newsletter_campaigns').updateOne({ id: campaignId }, {
    $set: { sent_count: sent, failed_count: failed, unknown_count: unknown, skipped_count: skipped, updated_at: new Date() },
  })
  return { sent, failed, unknown, skipped }
}

function safeFailure(error) {
  const status = Number(error?.status) || null
  // A rejected 4xx response is definite. Timeouts, network errors and 5xx
  // responses may have been accepted; they must never be retried automatically.
  const definite = [400, 401, 403, 404, 413, 422, 429].includes(status)
  return { status: definite ? 'FAILED' : 'UNKNOWN', reason: definite ? `Provider rejected delivery (${status})` : 'Delivery outcome uncertain; no automatic retry' }
}

async function deliverOne(database, campaign, subscriber, { appUrl, secret, send = sendEmail, retry = false }) {
  const deliveries = database.collection('newsletter_deliveries')
  const subscribers = database.collection('newsletter_subscribers')
  const email = normalizeNewsletterEmail(subscriber.email_normalized)
  if (!isValidNewsletterEmail(email)) return 'SKIPPED'
  const key = { campaign_id: campaign.id, email_normalized: email }
  let delivery = await deliveries.findOne(key)
  if (!delivery && !retry) {
    try {
      delivery = { id: uuidv4(), ...key, subscriber_id: subscriber.id, status: 'PENDING', created_at: new Date() }
      await deliveries.insertOne(delivery)
    } catch (error) {
      if (error?.code !== 11000) throw error
      delivery = await deliveries.findOne(key)
    }
  }
  if (!delivery || (retry ? delivery.status !== 'FAILED' || delivery.last_retry_generation === campaign.retry_generation : delivery.status !== 'PENDING')) return 'DUPLICATE'

  // Subscriber state is checked immediately before claiming this delivery.
  const current = await subscribers.findOne({ id: subscriber.id, email_normalized: email })
  const unsubscribedDuplicate = await subscribers.findOne({ email_normalized: email, status: 'unsubscribed' })
  if (!canSendNewsletterTo(current, campaign) || unsubscribedDuplicate) {
    await deliveries.updateOne({ id: delivery.id, status: retry ? 'FAILED' : 'PENDING' }, { $set: { status: 'SKIPPED', completed_at: new Date(), failure_reason: 'Subscriber is no longer active or consented' } })
    return 'SKIPPED'
  }

  const generation = retry ? campaign.retry_generation : 0
  const claim = await deliveries.updateOne({ id: delivery.id, status: retry ? 'FAILED' : 'PENDING', ...(retry ? { last_retry_generation: { $ne: generation } } : {}) }, {
    $set: { status: 'SENDING', started_at: new Date(), last_retry_generation: generation },
  })
  if (!claim.modifiedCount) return 'DUPLICATE'

  const unsubscribeToken = createNewsletterUnsubscribeToken(current.id, secret)
  const unsubscribeUrl = `${appUrl.replace(/\/$/, '')}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  try {
    const result = await send({
      to: email,
      subject: campaign.subject,
      html: renderNewsletterEmail(campaign, { baseUrl: appUrl, unsubscribeUrl }),
      text: newsletterPlainText(campaign, unsubscribeUrl),
      idempotencyKey: `newsletter/${campaign.id}/${current.id}/${generation}`,
      timeoutMs: 7500,
    })
    await deliveries.updateOne({ id: delivery.id, status: 'SENDING' }, { $set: { status: 'SENT', provider_id: result?.id || null, completed_at: new Date() }, $unset: { failure_reason: '' } })
    return 'SENT'
  } catch (error) {
    const failure = safeFailure(error)
    await deliveries.updateOne({ id: delivery.id, status: 'SENDING' }, { $set: { status: failure.status, failure_reason: failure.reason, completed_at: new Date() } })
    return failure.status
  }
}

async function claimNewsletterCampaign(database, now) {
  const campaigns = database.collection('newsletter_campaigns')
  const candidate = await campaigns.findOne({ $or: [{ status: 'QUEUED' }, { status: 'SENDING', claim_expires_at: { $lte: now } }] }, { sort: { created_at: 1 } })
  if (!candidate) return null
  const token = uuidv4()
  const claimed = await campaigns.findOneAndUpdate({ id: candidate.id, status: candidate.status, ...(candidate.status === 'SENDING' ? { claim_expires_at: { $lte: now } } : {}) }, {
    $set: { status: 'SENDING', claim_token: token, claim_expires_at: new Date(now.getTime() + CLAIM_MS), started_at: candidate.started_at || now, updated_at: now },
  }, { returnDocument: 'after', includeResultMetadata: true })
  return claimed?.value || null
}

export async function processNewsletterQueue(database, { appUrl, secret, send = sendEmail, now = new Date() } = {}) {
  if (!appUrl || !secret || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { status: 'not_configured', processed: 0 }
  await ensureNewsletterCampaignIndexes(database)
  const campaign = await claimNewsletterCampaign(database, now)
  if (!campaign) return { status: 'idle', processed: 0 }
  const campaigns = database.collection('newsletter_campaigns')
  const deliveries = database.collection('newsletter_deliveries')
  await deliveries.updateMany({ campaign_id: campaign.id, status: 'SENDING', started_at: { $lte: new Date(now.getTime() - CLAIM_MS) } }, {
    $set: { status: 'UNKNOWN', failure_reason: 'Worker interrupted; delivery outcome uncertain', completed_at: now },
  })

  let audience
  if (campaign.retry_only) {
    audience = await deliveries.find({ campaign_id: campaign.id, status: 'FAILED', last_retry_generation: { $ne: campaign.retry_generation } })
      .sort({ email_normalized: 1 }).limit(NEWSLETTER_BATCH_SIZE).toArray()
  } else {
    audience = await database.collection('newsletter_subscribers').find({
      $and: [activeNewsletterAudienceFilter(campaign.queued_at), { email_normalized: { $gt: campaign.cursor_email || '' } }, ...(campaign.audience === 'selected' ? [{ id: { $in: campaign.recipient_ids || [] } }] : [])],
    }, { projection: { _id: 0, id: 1, email_normalized: 1, status: 1, consented_at: 1 } })
      .sort({ email_normalized: 1 }).limit(NEWSLETTER_BATCH_SIZE).toArray()
  }

  let processed = 0
  for (let index = 0; index < audience.length; index += 2) {
    const current = await campaigns.findOne({ id: campaign.id }, { projection: { status: 1, claim_token: 1 } })
    if (current?.status !== 'SENDING' || current.claim_token !== campaign.claim_token) break
    const pair = audience.slice(index, index + 2)
    await Promise.all(pair.map(async (entry) => {
      const subscriber = campaign.retry_only
        ? await database.collection('newsletter_subscribers').findOne({ id: entry.subscriber_id, email_normalized: entry.email_normalized }, { projection: { _id: 0, id: 1, email_normalized: 1, status: 1, consented_at: 1 } })
        : entry
      if (subscriber) await deliverOne(database, campaign, subscriber, { appUrl, secret, send, retry: campaign.retry_only })
      else if (campaign.retry_only) await deliveries.updateOne({ id: entry.id, status: 'FAILED' }, { $set: { status: 'SKIPPED', completed_at: new Date(), failure_reason: 'Subscriber no longer exists' } })
    }))
    processed += pair.length
    if (!campaign.retry_only) {
      await campaigns.updateOne({ id: campaign.id, status: 'SENDING', claim_token: campaign.claim_token }, { $set: { cursor_email: pair.at(-1).email_normalized, updated_at: new Date() } })
    }
  }

  const counts = await refreshNewsletterCounts(database, campaign.id)
  const stillClaimed = await campaigns.findOne({ id: campaign.id, status: 'SENDING', claim_token: campaign.claim_token })
  if (!stillClaimed) return { status: 'cancelled', processed, ...counts }
  if (audience.length === 0 || (audience.length < NEWSLETTER_BATCH_SIZE && processed === audience.length)) {
    const finalStatus = counts.failed || counts.unknown ? counts.sent ? 'PARTIAL' : 'FAILED' : 'COMPLETED'
    await campaigns.updateOne({ id: campaign.id, status: 'SENDING', claim_token: campaign.claim_token }, {
      $set: { status: finalStatus, completed_at: new Date(), skipped_count: Math.max(counts.skipped, (campaign.recipient_count || 0) - counts.sent - counts.failed - counts.unknown), updated_at: new Date() },
      $unset: { claim_token: '', claim_expires_at: '' },
    })
    return { status: finalStatus, processed, ...counts }
  }
  await campaigns.updateOne({ id: campaign.id, status: 'SENDING', claim_token: campaign.claim_token }, {
    $set: { status: 'QUEUED', updated_at: new Date() }, $unset: { claim_token: '', claim_expires_at: '' },
  })
  return { status: 'QUEUED', processed, ...counts }
}
