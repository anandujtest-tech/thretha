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

function getDeviceInfo() {
  const ua = navigator.userAgent || ''

  let deviceType = 'Desktop'

  if (/tablet|ipad/i.test(ua)) {
    deviceType = 'Tablet'
  } else if (/mobile|android|iphone|ipod/i.test(ua)) {
    deviceType = 'Mobile'
  }

  let browser = 'Unknown'

  if (/edg\//i.test(ua)) {
    browser = 'Edge'
  } else if (/opr\//i.test(ua)) {
    browser = 'Opera'
  } else if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) {
    browser = 'Chrome'
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox'
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari'
  }

  let os = 'Unknown'

  if (/windows nt/i.test(ua)) {
    os = 'Windows'
  } else if (/android/i.test(ua)) {
    os = 'Android'
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS'
  } else if (/mac os x/i.test(ua)) {
    os = 'macOS'
  } else if (/linux/i.test(ua)) {
    os = 'Linux'
  }

  return {
    device_type: deviceType,
    browser,
    operating_system: os,
  }
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
    let cancelled = false
    let heartbeatTimer = null

    const trackVisit = async () => {
      try {
        const visitorId = getVisitorId()
        const deviceInfo = getDeviceInfo()

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

        if (cancelled) return

        const sendVisit = async () => {
          try {
            await fetch('/api/analytics/visit', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                visitor_id: visitorId,
                page: window.location.pathname,

                ...deviceInfo,

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

        // Initial visit
        await sendVisit()

        // Heartbeat every 60 seconds
        heartbeatTimer = window.setInterval(() => {
          sendVisit()
        }, 60 * 1000)
      } catch {
        // Analytics must never break the website.
      }
    }

    trackVisit()

    return () => {
      cancelled = true

      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer)
      }
    }
  }, [])

  return null
}