import webpush from 'web-push'

export const PUSH_TYPES = [
  'New Collection', 'New Arrival', 'Sale', 'Promotion', 'Back in Stock',
  'Price Drop', 'Announcement', 'Engagement', 'Order Update',
]
export const DEFAULT_PUSH_SUBSCRIBER_COOLDOWN_MINUTES = 6 * 60
export const MAX_PUSH_SUBSCRIBER_COOLDOWN_MINUTES = 7 * 24 * 60

export function isValidPushSubscriberCooldownMinutes(value) {
  return Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_PUSH_SUBSCRIBER_COOLDOWN_MINUTES
}

export function getPushSubscriberCooldownMinutes(value) {
  return isValidPushSubscriberCooldownMinutes(value)
    ? value
    : DEFAULT_PUSH_SUBSCRIBER_COOLDOWN_MINUTES
}

let configuredFingerprint = ''
let lastConfigurationDiagnostic = ''

function getVapidConfig() {
  return {
    publicKey: (process.env.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: (process.env.VAPID_PRIVATE_KEY || '').trim(),
    subject: (process.env.VAPID_SUBJECT || '').trim(),
  }
}

export function getVapidPublicKey() {
  return getVapidConfig().publicKey
}

export function isWebPushConfigured() {
  try {
    configureWebPush()
    lastConfigurationDiagnostic = ''
    return true
  } catch (error) {
    const diagnostic = error.message || 'invalid VAPID configuration'
    if (diagnostic !== lastConfigurationDiagnostic) {
      // Keep diagnostics useful without logging any environment values.
      console.error(`[web-push] VAPID configuration unavailable: ${diagnostic}`)
      lastConfigurationDiagnostic = diagnostic
    }
    return false
  }
}

function configureWebPush() {
  const { publicKey, privateKey, subject } = getVapidConfig()
  if (!publicKey || !privateKey || !subject) throw new Error('required environment variable missing')
  const fingerprint = `${publicKey}:${privateKey}:${subject}`
  if (configuredFingerprint !== fingerprint) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey)
    } catch (error) {
      const message = String(error?.message || '')
      const category = message.startsWith('Vapid subject') || message.startsWith('The subject')
        ? 'invalid VAPID_SUBJECT; use a mailto: address or HTTPS URL'
        : message.toLowerCase().includes('public key')
          ? 'invalid VAPID_PUBLIC_KEY format'
          : message.toLowerCase().includes('private key')
            ? 'invalid VAPID_PRIVATE_KEY format'
            : 'invalid VAPID configuration'
      throw new Error(category)
    }
    configuredFingerprint = fingerprint
  }
}

export async function deliverWebPush(subscription, payload) {
  configureWebPush()
  return webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60, timeout: 5000 })
}

export function normalizePushSubscription(value) {
  const endpoint = typeof value?.endpoint === 'string' ? value.endpoint.trim() : ''
  let parsed
  try { parsed = new URL(endpoint) } catch { throw new Error('A valid push endpoint is required.') }
  const host = parsed.hostname.toLowerCase()
  const knownPushService = host === 'fcm.googleapis.com'
    || host === 'updates.push.services.mozilla.com'
    || host.endsWith('.push.services.mozilla.com')
    || host === 'web.push.apple.com'
    || host.endsWith('.push.apple.com')
    || host.endsWith('.notify.windows.com')
  if (parsed.protocol !== 'https:' || endpoint.length > 2048 || parsed.username || parsed.password || parsed.port || !knownPushService) {
    throw new Error('The push endpoint is invalid or uses an unsupported push service.')
  }
  const p256dh = typeof value?.keys?.p256dh === 'string' ? value.keys.p256dh : ''
  const auth = typeof value?.keys?.auth === 'string' ? value.keys.auth : ''
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,100}$/.test(auth)) {
    throw new Error('The push subscription keys are invalid.')
  }
  return { endpoint, keys: { p256dh, auth } }
}

export function normalizeInternalUrl(value) {
  const path = typeof value === 'string' ? value.trim() : '/'
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
    throw new Error('Destination must be an internal Thretha path.')
  }
  const parsed = new URL(path, 'https://thretha.invalid')
  if (parsed.origin !== 'https://thretha.invalid') throw new Error('Destination must be an internal Thretha path.')
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function localTimeToUtc(dateText, timeText, timeZone) {
  const [year, month, day] = dateText.split('-').map(Number)
  const [hour, minute] = timeText.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let guess = target
  for (let i = 0; i < 4; i += 1) {
    const local = dateParts(new Date(guess), timeZone)
    const represented = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute))
    guess += target - represented
  }
  const result = new Date(guess)
  const local = dateParts(result, timeZone)
  if (`${local.year}-${local.month}-${local.day}` !== dateText || `${local.hour}:${local.minute}` !== timeText) return null
  return result
}

function validDateText(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function addLocalDays(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function weekdayForDate(dateText) {
  return new Date(`${dateText}T00:00:00.000Z`).getUTCDay()
}

export function normalizePushSchedule(sendMode, value, now = new Date()) {
  if (!['now', 'once', 'repeat'].includes(sendMode)) throw new Error('Choose a valid send option.')
  if (sendMode === 'now') return { type: 'now', timezone: 'Asia/Kolkata' }

  const timezone = typeof value?.timezone === 'string' ? value.timezone.trim() : 'Asia/Kolkata'
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(now) } catch { throw new Error('Choose a valid timezone.') }
  const time = typeof value?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) ? value.time : ''
  if (!time) throw new Error('Choose a valid local time.')

  if (sendMode === 'once') {
    if (!validDateText(value?.date)) throw new Error('Choose a valid date.')
    const scheduledAt = localTimeToUtc(value.date, time, timezone)
    if (!scheduledAt || scheduledAt <= now) throw new Error('The scheduled time must be in the future and exist in the selected timezone.')
    return { type: 'once', timezone, date: value.date, time, scheduled_at: scheduledAt }
  }

  const frequency = value?.frequency
  if (!['daily', 'weekly', 'monthly', 'custom_days'].includes(frequency)) throw new Error('Choose a valid repeat frequency.')
  if (!validDateText(value?.start_date)) throw new Error('Choose a valid start date.')
  if (value.end_date && (!validDateText(value.end_date) || value.end_date < value.start_date)) throw new Error('Choose a valid end date after the start date.')
  const daysOfWeek = Array.isArray(value?.days_of_week)
    ? [...new Set(value.days_of_week.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : []
  if ((frequency === 'weekly' || frequency === 'custom_days') && !daysOfWeek.length) throw new Error('Select at least one weekday.')
  const dayOfMonth = Number(value?.day_of_month) || Number(value.start_date.slice(-2))
  if (frequency === 'monthly' && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) throw new Error('Choose a valid day of the month.')
  const schedule = {
    type: 'repeat', timezone, time, frequency,
    start_date: value.start_date,
    end_date: value.end_date || null,
    days_of_week: daysOfWeek,
    day_of_month: dayOfMonth,
  }
  const nextRun = getNextPushOccurrence(schedule, now)
  if (!nextRun) throw new Error('No valid run exists in this schedule.')
  return schedule
}

export function getNextPushOccurrence(schedule, after = new Date()) {
  if (schedule?.type === 'now') return new Date(after)
  if (schedule?.type === 'once') return schedule.scheduled_at ? new Date(schedule.scheduled_at) : null
  if (schedule?.type !== 'repeat' || !validDateText(schedule.start_date)) return null
  let localToday
  try {
    const today = dateParts(after, schedule.timezone)
    localToday = `${today.year}-${today.month}-${today.day}`
  } catch { return null }
  let dateText = localToday > schedule.start_date ? localToday : schedule.start_date
  for (let i = 0; i <= 370; i += 1) {
    if (schedule.end_date && dateText > schedule.end_date) return null
    let selected = true
    if (schedule.frequency === 'weekly' || schedule.frequency === 'custom_days') selected = schedule.days_of_week?.includes(weekdayForDate(dateText))
    if (schedule.frequency === 'monthly') selected = Number(dateText.slice(-2)) === Number(schedule.day_of_month)
    if (selected) {
      const occurrence = localTimeToUtc(dateText, schedule.time, schedule.timezone)
      if (occurrence && occurrence > after) return occurrence
    }
    dateText = addLocalDays(dateText, 1)
  }
  return null
}

export function cleanCampaignInput(value) {
  const title = String(value?.title || '').trim().slice(0, 100)
  const message = String(value?.message || '').trim().slice(0, 500)
  if (!title || !message) throw new Error('Title and message are required.')
  const type = PUSH_TYPES.includes(value?.type) ? value.type : 'Announcement'
  const destination = normalizeInternalUrl(value?.destination || '/')
  const actionText = String(value?.action_text || '').trim().slice(0, 32)
  const image = String(value?.image || '').trim().slice(0, 1000)
  if (image) {
    if (image.startsWith('/')) normalizeInternalUrl(image)
    else {
      let parsed
      try { parsed = new URL(image) } catch { throw new Error('Notification image must be an HTTPS URL or internal path.') }
      if (parsed.protocol !== 'https:') throw new Error('Notification image must use HTTPS.')
    }
  }
  return { title, message, type, destination, action_text: actionText, image: image || null }
}

export function getWebPushPayload(campaign) {
  return {
    title: campaign.title,
    body: campaign.message,
    icon: '/pwa-icons/icon-192.png',
    badge: '/pwa-icons/icon-192.png',
    image: campaign.image || undefined,
    data: { url: campaign.destination || '/' },
    actions: campaign.action_text ? [{ action: 'open', title: campaign.action_text }] : [],
  }
}
