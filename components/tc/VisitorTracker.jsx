'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export default function VisitorTracker() {
  const pathname = usePathname()
  const lastTracked = useRef(null)

  useEffect(() => {
    if (!pathname || lastTracked.current === pathname) return
    lastTracked.current = pathname

    const timer = setTimeout(() => {
      try {
        const key = 'thretha_visitor_id'
        let visitorId = localStorage.getItem(key)
        if (!visitorId) {
          visitorId = crypto.randomUUID()
          localStorage.setItem(key, visitorId)
        }

        const ua = navigator.userAgent || ''
        let deviceType = 'Desktop'
        if (/tablet|ipad/i.test(ua)) deviceType = 'Tablet'
        else if (/mobile|android|iphone|ipod/i.test(ua)) deviceType = 'Mobile'

        fetch('/api/analytics/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitor_id: visitorId,
            page: pathname,
            device_type: deviceType,
            browser: 'Browser',
            operating_system: 'OS',
          }),
          keepalive: true,
        }).catch(() => {})
      } catch {}
    }, 500)

    return () => clearTimeout(timer)
  }, [pathname])

  return null
}