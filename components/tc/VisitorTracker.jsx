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

async function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      () => {
        // Visitor denied location or location unavailable.
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    )
  })
}

export default function VisitorTracker() {
  useEffect(() => {
    const trackVisit = async () => {
      try {
        const visitorId = getVisitorId()

        // Check the admin setting first.
        let askForLocation = false

        try {
          const settingsResponse = await fetch('/api/settings', {
            cache: 'no-store',
          })

          if (settingsResponse.ok) {
            const settings = await settingsResponse.json()
            askForLocation = settings?.ask_visitor_location === true
          }
        } catch {
          // If settings cannot be loaded, do not request location.
        }

        let location = null

        if (askForLocation) {
          location = await getLocation()
        }

        await fetch('/api/analytics/visit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            visitor_id: visitorId,
            page: window.location.pathname,

            ...(location
              ? {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  location_accuracy: location.accuracy,
                  location_permission: 'granted',
                }
              : {
                  location_permission: askForLocation
                    ? 'denied_or_unavailable'
                    : 'not_requested',
                }),
          }),
          keepalive: true,
        })
      } catch {
        // Analytics must never break the website.
      }
    }

    trackVisit()
  }, [])

  return null
}