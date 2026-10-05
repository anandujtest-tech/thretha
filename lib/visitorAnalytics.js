'use client'

const VISITOR_KEY = 'thretha_visitor_id'
const SESSION_KEY = 'thretha_visitor_session_id'
const FIRST_TOUCH_KEY = 'thretha_first_touch'

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function safeReferrer(value) {
  try {
    const url = new URL(value)
    if (url.origin === window.location.origin) return ''
    return url.origin.slice(0, 300)
  } catch {
    return ''
  }
}

function sourceFrom(utmSource, referrer) {
  const value = String(utmSource || referrer || '').toLowerCase()
  if (!value) return 'Direct'
  if (value.includes('instagram') || value === 'ig') return 'Instagram'
  if (value.includes('google')) return 'Google'
  if (value.includes('whatsapp') || value.includes('wa.me')) return 'WhatsApp'
  return utmSource ? String(utmSource).slice(0, 80) : 'Other'
}

function getFirstTouch(isNewVisitor) {
  try {
    const existing = localStorage.getItem(FIRST_TOUCH_KEY)
    if (existing) return JSON.parse(existing)
    const params = new URLSearchParams(window.location.search)
    const referrer = safeReferrer(document.referrer)
    const utm = Object.fromEntries(['source', 'medium', 'campaign', 'content', 'term'].map((key) => [key, (params.get(`utm_${key}`) || '').slice(0, 120)]))
    const hasCampaign = Object.values(utm).some(Boolean)
    const firstTouch = {
      source: hasCampaign ? sourceFrom(utm.source, referrer) : (isNewVisitor ? sourceFrom('', referrer) : 'Unknown'),
      referrer,
      landing_page: `${window.location.pathname}`.slice(0, 300),
      utm_source: utm.source,
      medium: utm.medium,
      campaign: utm.campaign,
      content: utm.content,
      term: utm.term,
    }
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch))
    return firstTouch
  } catch {
    return { source: 'Unknown', referrer: '', landing_page: '', medium: '', campaign: '', content: '', term: '' }
  }
}

function getContext() {
  if (typeof window === 'undefined') return null
  try {
    let visitorId = localStorage.getItem(VISITOR_KEY)
    const isNewVisitor = !visitorId
    if (!visitorId) {
      visitorId = makeId()
      localStorage.setItem(VISITOR_KEY, visitorId)
    }

    let sessionId = sessionStorage.getItem(SESSION_KEY)
    if (!sessionId) {
      sessionId = makeId()
      sessionStorage.setItem(SESSION_KEY, sessionId)
    }

    const ua = navigator.userAgent || ''
    const deviceType = /ipad|tablet/i.test(ua) ? 'Tablet' : /mobile|android|iphone|ipod/i.test(ua) ? 'Mobile' : 'Desktop'
    const browser = /edg\//i.test(ua) ? 'Edge' : /firefox\//i.test(ua) ? 'Firefox' : /chrome\//i.test(ua) ? 'Chrome' : /safari\//i.test(ua) ? 'Safari' : 'Other'
    const operatingSystem = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /macintosh|mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other'

    return {
      visitor_id: visitorId,
      session_id: sessionId,
      page: `${window.location.pathname}`.slice(0, 500),
      device_type: deviceType,
      browser,
      operating_system: operatingSystem,
      first_touch: getFirstTouch(isNewVisitor),
    }
  } catch {
    return null
  }
}

function post(path, payload) {
  try {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then((response) => response.ok).catch(() => false)
  } catch { return Promise.resolve(false) }
}

export function trackPageVisit(pathname) {
  const context = getContext()
  if (!context || !pathname) return
  const match = pathname.match(/^\/(product|category)\/([^/]+)/)
  const safeSlug = (value) => { try { return decodeURIComponent(value).slice(0, 200) } catch { return value.slice(0, 200) } }
  const eventName = match?.[1] === 'product' ? 'product_view' : match?.[1] === 'category' ? 'category_view' : pathname === '/checkout' ? 'checkout_started' : 'page_view'
  post('/api/analytics/visit', {
    ...context,
    page: String(pathname).slice(0, 500),
    event_name: eventName,
    product_slug: eventName === 'product_view' ? safeSlug(match[2]) : null,
    category_slug: eventName === 'category_view' ? safeSlug(match[2]) : null,
  })
}

export function trackVisitorEvent(eventName, details = {}) {
  const context = getContext()
  if (!context) return
  post('/api/analytics/event', {
    ...context,
    event_name: eventName,
    product_slug: typeof details.product_slug === 'string' ? details.product_slug.slice(0, 200) : null,
    category_slug: typeof details.category_slug === 'string' ? details.category_slug.slice(0, 200) : null,
    page: context.page,
  })
}

export function sendVisitorHeartbeat(pathname) {
  const context = getContext()
  if (!context) return
  post('/api/analytics/heartbeat', {
    visitor_id: context.visitor_id,
    session_id: context.session_id,
    page: String(pathname || context.page).slice(0, 500),
  })
}

export function requestAndRecordVisitorLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.reject(new Error('Location permission is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition((position) => {
      const context = getContext()
      if (!context) return reject(new Error('Visitor session is unavailable.'))
      post('/api/analytics/event', {
        ...context,
        event_name: 'location_shared',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        location_accuracy: position.coords.accuracy,
        location_permission: 'granted',
      }).then((saved) => saved ? resolve(true) : reject(new Error('Location could not be saved.')))
    }, (error) => reject(error), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
  })
}
