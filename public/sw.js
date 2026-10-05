const CACHE_NAME = 'thretha-static-v2'
const SAFE_STATIC = [
  '/offline',
  '/manifest.webmanifest',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
  '/pwa-icons/icon-512-maskable.png',
].map(path => new URL(path, self.location.origin).href)

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SAFE_STATIC)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch {
    payload = { title: 'Thretha Couture', body: event.data?.text() || 'A new update is waiting for you.' }
  }
  const path = typeof payload.data?.url === 'string' && payload.data.url.startsWith('/') && !payload.data.url.startsWith('//') && !payload.data.url.includes('\\')
    ? payload.data.url
    : '/'
  event.waitUntil(self.registration.showNotification(String(payload.title || 'Thretha Couture').slice(0, 100), {
    body: String(payload.body || '').slice(0, 300),
    icon: payload.icon || '/pwa-icons/icon-192.png',
    badge: payload.badge || '/pwa-icons/icon-192.png',
    image: payload.image || undefined,
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [],
    data: { url: path },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const path = typeof event.notification.data?.url === 'string' && event.notification.data.url.startsWith('/') && !event.notification.data.url.startsWith('//') && !event.notification.data.url.includes('\\')
    ? event.notification.data.url
    : '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const sameOrigin = clients.find(client => new URL(client.url).origin === self.location.origin)
    if (sameOrigin) {
      if (sameOrigin.url !== target && 'navigate' in sameOrigin) await sameOrigin.navigate(target)
      return sameOrigin.focus()
    }
    return self.clients.openWindow(target)
  }))
})

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const configResponse = await fetch('/api/push/config', { cache: 'no-store' })
    if (!configResponse.ok) return
    const config = await configResponse.json()
    // Only persist a replacement the browser has already created. Do not
    // silently create a new subscription after a customer disabled it.
    const subscription = event.newSubscription
    if (!config.enabled || !subscription) return
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache API or user/payment data. Transactional page navigations may
  // fall back only to the generic offline page, never to saved order HTML.
  if (url.pathname.startsWith('/api/')) return
  if (/^\/(checkout|account|admin|order|track-order|login)(\/|$)/.test(url.pathname)) {
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(async () => (await caches.match(new URL('/offline', self.location.origin).href)) || new Response('Reconnect to view private or payment information.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, status: 503 })))
    }
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    // Next reuses stable static paths for some route chunks. Check the active
    // deployment first so a cached Admin bundle cannot survive an app update.
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        return (await caches.match(request)) || Response.error()
      }
    })())
    return
  }

  if (url.pathname.startsWith('/pwa-icons/')) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) cache.put(request, response.clone())
      return response
    }))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(new URL('/offline', self.location.origin).href)) || new Response('You are offline. Reconnect to continue shopping.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, status: 503 })))
  }
})
