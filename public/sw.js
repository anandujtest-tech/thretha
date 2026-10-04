const CACHE_NAME = 'thretha-static-v1'
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

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa-icons/')) {
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
