'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { requestAndRecordVisitorLocation } from '@/lib/visitorAnalytics'

const RESPONSE_KEY = 'thretha_location_prompt_response'

export default function VisitorLocationPrompt({ enabled, autoRequest = false }) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const autoRequestStarted = useRef(false)

  useEffect(() => {
    if (!enabled) return
    try { setVisible(!localStorage.getItem(RESPONSE_KEY)) } catch {}
  }, [enabled])

  useEffect(() => {
    if (!enabled || !autoRequest || autoRequestStarted.current) return undefined
    try {
      if (localStorage.getItem(RESPONSE_KEY)) return undefined
    } catch {}

    let active = true
    const requestLocation = async () => {
      let permissionState = 'prompt'
      try {
        const permission = await navigator.permissions?.query({ name: 'geolocation' })
        if (permission) permissionState = permission.state
      } catch {}

      if (!active) return
      if (permissionState === 'denied') {
        setPermissionDenied(true)
        setMessage('Location permission is blocked in your browser settings.')
        return
      }

      autoRequestStarted.current = true
      setBusy(true)
      try {
        await requestAndRecordVisitorLocation()
        if (!active) return
        try { localStorage.setItem(RESPONSE_KEY, 'granted') } catch {}
        setVisible(false)
      } catch (error) {
        if (!active) return
        if (error?.code === 1) {
          let currentPermissionState = 'prompt'
          try {
            const permission = await navigator.permissions?.query({ name: 'geolocation' })
            if (permission) currentPermissionState = permission.state
          } catch {}
          if (!active) return
          if (currentPermissionState === 'denied') {
            try { localStorage.setItem(RESPONSE_KEY, 'denied') } catch {}
            setPermissionDenied(true)
            setMessage('Location permission was not granted. You can change it in your browser settings.')
          } else {
            setMessage('Tap Share location to allow your browser to request access.')
          }
        } else {
          setMessage('Location could not be shared. You can continue browsing.')
        }
        setBusy(false)
      }
    }

    requestLocation()
    return () => { active = false }
  }, [enabled, autoRequest])

  const dismiss = (value = 'dismissed') => {
    try { localStorage.setItem(RESPONSE_KEY, value) } catch {}
    setVisible(false)
  }

  const shareLocation = async () => {
    setBusy(true)
    setMessage('')
    try {
      await requestAndRecordVisitorLocation()
      dismiss('granted')
    } catch (error) {
      if (error?.code === 1) {
        try { localStorage.setItem(RESPONSE_KEY, 'denied') } catch {}
        setPermissionDenied(true)
        setMessage('Location permission was not granted. You can change it in your browser settings.')
      } else {
        setMessage('Location could not be shared. You can continue browsing.')
      }
      setBusy(false)
    }
  }

  if (!enabled || !visible) return null

  return (
    <aside aria-label="Optional location sharing" className="mx-auto my-6 flex max-w-5xl items-start gap-3 border border-ink/10 bg-cream px-4 py-3 text-xs text-cocoa">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cocoa" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">Share your approximate location?</p>
        <p className="mt-1">Your browser may ask permission to share approximate coordinates for visitor-region insights. No address is collected.</p>
        {message && <p className="mt-1 text-terracotta">{message}</p>}
        <div className="mt-2 flex gap-3">
          {!permissionDenied && <button type="button" disabled={busy} onClick={shareLocation} className="font-semibold underline underline-offset-2 disabled:opacity-50">{busy ? 'Waiting for permission…' : 'Share location'}</button>}
          <button type="button" onClick={() => dismiss()} className="underline underline-offset-2">Not now</button>
        </div>
      </div>
      <button type="button" onClick={() => dismiss()} aria-label="Dismiss location request" className="p-1"><X className="h-4 w-4" /></button>
    </aside>
  )
}
