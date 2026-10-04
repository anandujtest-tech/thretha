'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

// Bump the key so a dismissal from the previous prompt implementation cannot
// keep the repaired install UI hidden for its full cooldown period.
const DISMISS_KEY = 'thretha:pwa-install-dismissed-until-v3'
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000
const PROMPT_DELAY_MS = 1500

function isIosSafari() {
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua)
}

export default function PwaInstallPrompt({ enabled }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  const [android, setAndroid] = useState(false)
  const [delayElapsed, setDelayElapsed] = useState(false)
  const deferredPromptRef = useRef(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      if (process.env.NODE_ENV !== 'production') console.info('[PWA] Service workers are unavailable in this browser')
      return
    }
    let disposed = false
    let inFlight = false
    let attempt = 0
    let retryTimer
    const maxAttempts = 5
    const registerServiceWorker = async () => {
      if (disposed || inFlight || attempt >= maxAttempts) return
      inFlight = true
      attempt += 1
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        if (disposed) return
        if (process.env.NODE_ENV !== 'production') {
          console.info('[PWA] Service worker registered', { attempt, scope: registration.scope, state: registration.active?.state || registration.installing?.state || registration.waiting?.state || 'registered' })
          navigator.serviceWorker.addEventListener('controllerchange', () => console.info('[PWA] Service worker now controls this page'))
          navigator.serviceWorker.ready.then(activeRegistration => {
            console.info('[PWA] Service worker active', { scope: activeRegistration.scope, state: activeRegistration.active?.state || 'active' })
          })
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') console.warn('[PWA] Service worker registration failed; retrying when possible', { attempt, error })
        if (attempt < maxAttempts && !disposed) {
          window.clearTimeout(retryTimer)
          retryTimer = window.setTimeout(registerServiceWorker, Math.min(30000, 2000 * (2 ** (attempt - 1))))
        }
      } finally {
        inFlight = false
      }
    }
    const retryWhenAvailable = () => {
      if (disposed || inFlight || attempt >= maxAttempts) return
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(registerServiceWorker, 250)
    }
    window.addEventListener('online', retryWhenAvailable)
    window.addEventListener('pageshow', retryWhenAvailable)
    document.addEventListener('visibilitychange', retryWhenAvailable)
    registerServiceWorker()
    if (process.env.NODE_ENV !== 'production') {
      fetch('/manifest.webmanifest', { cache: 'no-store' }).then(async response => {
        const manifest = await response.json()
        console.info('[PWA] Manifest loaded', {
          status: response.status,
          contentType: response.headers.get('content-type'),
          name: manifest.name,
          startUrl: manifest.start_url,
          scope: manifest.scope,
          iconCount: manifest.icons?.length || 0,
        })
      }).catch(error => console.info('[PWA] Manifest load failed:', error))
    }
    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      window.removeEventListener('online', retryWhenAvailable)
      window.removeEventListener('pageshow', retryWhenAvailable)
      document.removeEventListener('visibilitychange', retryWhenAvailable)
    }
  }, [])

  // Capture this as soon as the storefront shell mounts. Settings load
  // asynchronously, so waiting for the Admin toggle value here can miss the
  // browser's one-shot beforeinstallprompt event.
  useEffect(() => {
    const onBeforeInstall = event => {
      event.preventDefault()
      deferredPromptRef.current = event
      setDeferredPrompt(event)
      if (process.env.NODE_ENV !== 'production') console.info('[PWA] beforeinstallprompt received')
    }
    const earlyEvent = window.__threthaDeferredInstallPrompt
    if (earlyEvent) {
      deferredPromptRef.current = earlyEvent
      setDeferredPrompt(earlyEvent)
      if (process.env.NODE_ENV !== 'production') console.info('[PWA] Recovered early install event')
    }
    const onInstalled = () => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS)) } catch {}
      window.__threthaDeferredInstallPrompt = null
      deferredPromptRef.current = null
      setShow(false)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    if (process.env.NODE_ENV !== 'production') {
      console.info('[PWA] Prompt component mounted', {
        enabled,
        origin: window.location.origin,
        protocol: window.location.protocol,
        standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        secureContext: window.isSecureContext,
      })
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [enabled])

  useEffect(() => {
    const isIOS = isIosSafari()
    const isAndroid = /Android/i.test(navigator.userAgent || '')
    setIos(isIOS)
    setAndroid(isAndroid)

    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    if (standalone) {
      if (process.env.NODE_ENV !== 'production') console.info('[PWA] Install UI suppressed: app is already standalone')
      return
    }

    let dismissedUntil = 0
    try { dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0) } catch {}
    if (dismissedUntil > Date.now()) {
      if (process.env.NODE_ENV !== 'production') console.info('[PWA] Install UI suppressed: dismissed until', new Date(dismissedUntil).toISOString())
      return
    }

    if (!enabled) {
      setShow(false)
      setDelayElapsed(false)
      if (process.env.NODE_ENV !== 'production') console.info('[PWA] Install UI suppressed: Admin setting is OFF')
      return
    }

    const timer = window.setTimeout(() => setDelayElapsed(true), PROMPT_DELAY_MS)
    if (process.env.NODE_ENV !== 'production') console.info('[PWA] Install setting enabled; prompt delay started', { ios: isIOS, android: isAndroid })
    return () => window.clearTimeout(timer)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !delayElapsed) {
      setShow(false)
      return
    }

    let dismissedUntil = 0
    try { dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0) } catch {}
    if (dismissedUntil > Date.now()) {
      setShow(false)
      return
    }

    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    const eligible = !standalone && Boolean(deferredPrompt || ios || android)
    setShow(eligible)
    if (process.env.NODE_ENV !== 'production') {
      console.info('[PWA] Install UI eligibility', {
        enabled,
        standalone,
        ios,
        android,
        nativePromptAvailable: Boolean(deferredPrompt),
        fallbackEligible: Boolean(ios || android),
        dismissed: dismissedUntil > Date.now(),
        eligible,
      })
    }
  }, [enabled, delayElapsed, deferredPrompt, ios, android])

  useEffect(() => {
    if (show && enabled && process.env.NODE_ENV !== 'production') console.info('[PWA] Install UI rendered')
  }, [show, enabled])

  if (!enabled || !show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS)) } catch {}
    setShow(false)
  }

  const install = async () => {
    const promptEvent = deferredPromptRef.current
    if (!promptEvent) return
    try {
      await promptEvent.prompt()
      const result = await promptEvent.userChoice.catch(() => null)
      if (result?.outcome === 'accepted' || result?.outcome === 'dismissed') dismiss()
    } catch (error) {
      console.error('[PWA] Native install prompt failed:', error)
    } finally {
      deferredPromptRef.current = null
      window.__threthaDeferredInstallPrompt = null
      setDeferredPrompt(null)
    }
  }

  return (
    <aside className="w-full border-b border-ink/10 bg-cream" aria-label="Install Thretha Couture">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 lg:px-8">
        <div className="grid h-9 w-9 shrink-0 place-items-center border border-ink/10 bg-paper text-ink"><Download className="h-4 w-4" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">{ios ? 'Add Thretha to Home Screen' : 'Install Thretha'}</p>
          {ios
            ? <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-4 text-cocoa"><Share className="h-3 w-3 shrink-0" aria-hidden="true" /> Tap Share → Add to Home Screen</p>
            : deferredPrompt
              ? <p className="mt-0.5 text-[11px] leading-4 text-cocoa">Get a faster, app-like shopping experience.</p>
              : android
                ? <p className="mt-0.5 text-[11px] leading-4 text-cocoa">Open your browser menu and choose “Install app” or “Add to Home screen”.</p>
                : <p className="mt-0.5 text-[11px] leading-4 text-cocoa">Get a faster, app-like shopping experience.</p>}
        </div>
        {!ios && deferredPrompt && <button type="button" onClick={install} className="min-h-11 shrink-0 bg-ink px-4 text-[10px] font-semibold uppercase tracking-wider text-cream">Install</button>}
        <button type="button" onClick={dismiss} aria-label="Close install prompt" className="grid h-11 w-11 shrink-0 place-items-center text-cocoa hover:bg-paper"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
    </aside>
  )
}
