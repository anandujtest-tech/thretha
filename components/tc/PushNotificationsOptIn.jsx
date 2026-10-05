'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bell, Check, X } from 'lucide-react'

const DISMISSAL_KEY = 'thretha:push-opt-in-dismissed:v2'
const SERVICE_WORKER_READY_TIMEOUT_MS = 15_000

function decodeVapidKey(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function serviceWorkerUnavailableError() {
  const error = new Error("Notifications aren't ready yet. Please try again.")
  error.code = 'PUSH_SW_NOT_READY'
  return error
}

async function getReadyPushRegistration() {
  const workerContainer = navigator.serviceWorker
  const expectedScope = new URL('/', window.location.origin).href
  let timeoutId
  try {
    const existing = await workerContainer.getRegistration(window.location.href)
    if (!existing || existing.scope !== expectedScope) {
      await workerContainer.register('/sw.js', { scope: '/' })
    }

    // `ready` resolves with the active registration for this page. Registration
    // may just have started, so bound the wait to keep the UI retryable if the
    // browser cannot activate the worker.
    const registration = await Promise.race([
      workerContainer.ready,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(serviceWorkerUnavailableError()), SERVICE_WORKER_READY_TIMEOUT_MS)
      }),
    ])
    if (registration.scope !== expectedScope || registration.active?.state !== 'activated') {
      throw serviceWorkerUnavailableError()
    }
    return registration
  } catch {
    throw serviceWorkerUnavailableError()
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

export default function PushNotificationsOptIn({ notificationTargetRef, docked = false, onAvailabilityChange }) {
  const [supported, setSupported] = useState(null)
  const [config, setConfig] = useState(null)
  const [permission, setPermission] = useState('default')
  const [subscription, setSubscription] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [dismissalReady, setDismissalReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [dockOffset, setDockOffset] = useState({ x: 0, y: 0 })
  const bellRef = useRef(null)
  const panelRef = useRef(null)
  const shellRef = useRef(null)
  const enableRef = useRef(null)
  const closeRef = useRef(null)
  const floatingOriginRef = useRef(null)
  const dockOffsetRef = useRef({ x: 0, y: 0 })

  const syncSubscription = async (current) => {
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: current.toJSON() }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      throw new Error(result.error || 'Notifications could not be enabled right now.')
    }
  }

  const ensureSubscription = async (serverConfig) => {
    if (!serverConfig?.enabled || Notification.permission !== 'granted') return null
    const registration = await getReadyPushRegistration()
    let current
    try {
      current = await registration.pushManager.getSubscription()
      if (!current) {
        current = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(serverConfig.vapidPublicKey),
        })
      }
    } catch (error) {
      if (error?.name === 'InvalidStateError' || error?.name === 'AbortError') throw serviceWorkerUnavailableError()
      throw error
    }
    await syncSubscription(current)
    setSubscription(current)
    return current
  }

  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISSAL_KEY) === '1') } catch { /* storage can be unavailable */ }
    setDismissalReady(true)
  }, [])

  const bellEligible = dismissalReady && supported === true && Boolean(subscription || (config?.configured && config?.enabled))

  useEffect(() => {
    onAvailabilityChange?.(bellEligible)
    return () => onAvailabilityChange?.(false)
  }, [bellEligible, onAvailabilityChange])

  useLayoutEffect(() => {
    const button = bellRef.current
    if (!button) return undefined

    const setOffset = (next) => {
      dockOffsetRef.current = next
      setDockOffset(next)
    }
    const currentCenter = () => {
      const rect = button.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    if (!floatingOriginRef.current) floatingOriginRef.current = currentCenter()

    let frame = 0
    const moveToCurrentState = (resized = false) => {
      if (!docked) {
        if (resized) floatingOriginRef.current = currentCenter()
        setOffset({ x: 0, y: 0 })
        return
      }
      if (resized) {
        const center = currentCenter()
        floatingOriginRef.current = {
          x: center.x - dockOffsetRef.current.x,
          y: center.y - dockOffsetRef.current.y,
        }
      }
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const target = notificationTargetRef?.current
        const origin = floatingOriginRef.current
        if (!target || !origin) return
        const rect = target.getBoundingClientRect()
        const marginLeft = Number.parseFloat(window.getComputedStyle(target).marginLeft) || 0
        const targetCenter = { x: rect.left - marginLeft - rect.width / 2, y: rect.top + rect.height / 2 }
        setOffset({ x: targetCenter.x - origin.x, y: targetCenter.y - origin.y })
      })
    }

    moveToCurrentState()
    window.addEventListener('resize', moveToCurrentState)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', moveToCurrentState)
    }
  }, [docked, bellEligible, notificationTargetRef])

  useEffect(() => {
    setOpen(false)
  }, [docked])

  useEffect(() => {
    let active = true
    const browserSupportsPush = typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window
    setSupported(browserSupportsPush)
    if (!browserSupportsPush) return () => { active = false }

    setPermission(Notification.permission)
    const load = async () => {
      try {
        const response = await fetch('/api/push/config', { cache: 'no-store' })
        if (!response.ok) throw new Error('Notification settings could not be loaded.')
        const serverConfig = await response.json()
        if (!active) return
        setConfig(serverConfig)

        // Reuse and persist an existing browser subscription. Never label the
        // device enabled until the server confirms that persistence succeeded.
        let registration
        try {
          registration = await getReadyPushRegistration()
        } catch (error) {
          if (active) setMessage(error.message)
          return
        }
        if (!active) return

        let current
        try {
          current = await registration.pushManager.getSubscription()
        } catch (error) {
          if (active) setMessage(error?.name === 'InvalidStateError' ? "Notifications aren't ready yet. Please try again." : 'The existing notification subscription could not be checked.')
          return
        }
        if (current && serverConfig.enabled) {
          try {
            await syncSubscription(current)
            if (active) setSubscription(current)
          } catch (error) {
            if (active) setMessage(error.message || 'The existing subscription could not be saved. Please try again.')
          }
        }
      } catch (error) {
        if (active) {
          setConfig({ unavailable: true })
          setMessage(error.message || 'Notification settings could not be loaded.')
        }
      }
    }
    load()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const closeOnOutsideClick = (event) => {
      if (!shellRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    const frame = window.requestAnimationFrame(() => {
      ;(subscription || permission === 'denied' ? closeRef.current : enableRef.current)?.focus()
    })
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.cancelAnimationFrame(frame)
      if (panelRef.current?.contains(document.activeElement)) bellRef.current?.focus()
    }
  }, [open, permission, subscription])

  const enable = async () => {
    if (busy || supported !== true || permission === 'denied') return
    setBusy(true)
    setMessage('Enabling notifications…')
    try {
      const serverConfig = config || await fetch('/api/push/config', { cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error('Notification settings could not be loaded.')
        return response.json()
      })
      setConfig(serverConfig)
      if (!serverConfig.configured) throw new Error('Browser notifications are not configured yet.')
      if (!serverConfig.enabled) throw new Error('Browser notifications are currently paused by Thretha.')

      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') {
          setMessage(result === 'denied' ? 'Notifications are blocked. Enable them from your browser or site settings.' : 'Allow notifications to subscribe.')
          return
        }
      }

      await ensureSubscription(serverConfig)
      setMessage('Thretha notifications are enabled on this device.')
    } catch (error) {
      setMessage(error.code === 'PUSH_SW_NOT_READY'
        ? "Notifications aren't ready yet. Please try again."
        : error.message || 'Unable to enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (busy) return
    setBusy(true)
    setMessage('Turning off notifications…')
    try {
      const registration = await getReadyPushRegistration()
      const current = await registration.pushManager.getSubscription()
      const target = current || subscription
      if (!target) {
        setSubscription(null)
        setMessage('Notifications are already off for this device.')
        return
      }

      await syncUnsubscribe(target)
      if (current) {
        let removed = false
        try {
          removed = await current.unsubscribe()
        } catch {
          await syncSubscription(current).catch(() => {})
          throw new Error('Notifications could not be turned off. Please try again.')
        }
        const remaining = await registration.pushManager.getSubscription()
        if (!removed && remaining) {
          await syncSubscription(remaining).catch(() => {})
          throw new Error('Notifications could not be turned off. Please try again.')
        }
      }

      setSubscription(null)
      setMessage('Notifications are off for this device. You can enable them again anytime.')
    } catch (error) {
      setMessage(error.code === 'PUSH_SW_NOT_READY'
        ? "Notifications aren't ready yet. Please try again."
        : error.message || 'Notifications could not be turned off. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const syncUnsubscribe = async (current) => {
    const response = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: current.toJSON() }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      throw new Error(result.error || 'Notifications could not be turned off. Please try again.')
    }
  }

  const close = () => {
    setOpen(false)
    setDismissed(true)
    try { window.localStorage.setItem(DISMISSAL_KEY, '1') } catch { /* dismissal still applies for this render */ }
  }

  if (!bellEligible) return null

  const indicatorVisible = !dismissed && !subscription && permission === 'default'

  return (
    <div
      ref={shellRef}
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-[55] transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:bottom-6 md:right-6"
      style={{ transform: `translate3d(${dockOffset.x}px, ${dockOffset.y}px, 0)` }}
    >
      {open && (
        <section
          ref={panelRef}
          id="push-opt-in-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="push-opt-in-title"
          className="absolute bottom-[calc(100%+0.75rem)] right-0 w-[min(20rem,calc(100vw-1.5rem))] border border-gold/35 bg-paper p-4 text-ink shadow-[0_16px_48px_rgba(24,15,18,0.2)] sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center border border-gold/40 bg-cream text-mango-dark">
              {subscription ? <Check className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p id="push-opt-in-title" className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
                {subscription ? 'Notifications enabled' : 'Thretha notifications'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-cocoa">
                {subscription
                  ? 'Notifications are enabled for this device.'
                  : permission === 'denied'
                    ? 'Notifications are blocked. Enable them from your browser or site settings.'
                    : 'Get updates on new arrivals, offers and orders.'}
              </p>
              {message && <p role="status" className="mt-2 text-[11px] leading-relaxed text-cocoa-light">{message}</p>}
              {!subscription && permission !== 'denied' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    ref={enableRef}
                    type="button"
                    onClick={enable}
                    disabled={busy || !config?.configured || !config?.enabled}
                    className="inline-flex min-h-10 items-center justify-center border border-ink bg-ink px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-paper transition hover:bg-plum disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Enabling…' : 'Enable Notifications'}
                  </button>
                  <button type="button" onClick={close} className="min-h-10 px-2 text-[11px] text-cocoa underline underline-offset-4 hover:text-ink">Not now</button>
                </div>
              )}
              {subscription && (
                <>
                  <p className="mt-2 text-[11px] text-cocoa-light">You can manage notification permission in your browser settings.</p>
                  <button type="button" onClick={disable} disabled={busy} className="mt-3 min-h-10 px-2 text-[11px] text-cocoa underline underline-offset-4 hover:text-ink disabled:opacity-50">
                    {busy ? 'Updating…' : 'Turn off notifications'}
                  </button>
                </>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Close notification details"
              className="-mr-2 -mt-2 grid h-10 w-10 shrink-0 place-items-center text-cocoa transition hover:bg-cream hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={subscription ? 'Notifications enabled for this device' : permission === 'denied' ? 'Notifications are blocked. View instructions' : 'Enable Thretha notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="push-opt-in-panel"
        className={`relative grid h-11 w-11 place-items-center rounded-full text-ink transition-all duration-[400ms] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-[0.98] ${docked ? 'border border-transparent bg-transparent shadow-none hover:bg-sand/30' : 'border border-ink/15 bg-paper shadow-[0_5px_18px_rgba(24,15,18,0.16)] hover:border-gold/60 hover:bg-cream'}`}
      >
        <Bell className="h-[19px] w-[19px] stroke-[1.6]" aria-hidden="true" />
        {indicatorVisible && <span aria-hidden="true" className="absolute right-[9px] top-[8px] h-2 w-2 rounded-full border border-paper bg-mango-dark" />}
      </button>
    </div>
  )
}
