'use client'

import { useEffect } from 'react'

function getVisitorId() {
  const key = 'thretha_visitor_id'

  let id = localStorage.getItem(key)

  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }

  return id
}

export default function VisitorTracker() {
  useEffect(() => {
    const trackVisit = async () => {
      try {
        const visitorId = getVisitorId()

        await fetch('/api/analytics/visit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            visitor_id: visitorId,
            page: window.location.pathname,
          }),
          keepalive: true,
        })
      } catch {
        // Analytics must never break the website
      }
    }

    trackVisit()
  }, [])

  return null
}