'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { sendVisitorHeartbeat, trackPageVisit } from '@/lib/visitorAnalytics'

export default function VisitorTracker() {
  const pathname = usePathname()
  const lastTracked = useRef(null)

  useEffect(() => {
    if (!pathname || lastTracked.current === pathname) return
    lastTracked.current = pathname

    const trackVisit = () => trackPageVisit(pathname)
    let idleId
    let timer
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(trackVisit, { timeout: 2000 })
    } else {
      timer = window.setTimeout(trackVisit, 1000)
    }
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') sendVisitorHeartbeat(pathname)
    }, 60_000)

    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId)
      window.clearTimeout(timer)
      window.clearInterval(heartbeat)
    }
  }, [pathname])

  return null
}
