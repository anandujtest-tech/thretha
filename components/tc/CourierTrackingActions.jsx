'use client'

import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { deliveryServiceConfig, deliveryTrackingUrl } from '@/lib/deliveryServices'

export default function CourierTrackingActions({ courier, trackingNumber }) {
  const [copyMessage, setCopyMessage] = useState('')
  const trackingId = trackingNumber == null ? '' : String(trackingNumber).trim()
  if (!trackingId) return null
  const configuredService = deliveryServiceConfig(courier)
  const service = configuredService
  const trackingUrl = service ? deliveryTrackingUrl(service.value) : null

  const copyTrackingId = async () => {
    try {
      await navigator.clipboard.writeText(trackingId)
      setCopyMessage('Tracking ID copied.')
    } catch {
      setCopyMessage('Select the tracking ID above to copy it.')
    }
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <button type="button" onClick={copyTrackingId} className="inline-flex min-h-11 items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink hover:underline">
        <Copy size={14} aria-hidden="true" /> Copy tracking ID
      </button>
      {trackingUrl && service && (
        <>
          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-2 bg-ink px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cream hover:bg-cocoa-dark">
            Track on {service.displayName} <ExternalLink size={14} aria-hidden="true" />
          </a>
          <p className="text-[11px] leading-relaxed text-cocoa">Enter your tracking ID on the official {service.displayName} tracking page.</p>
        </>
      )}
      {!trackingUrl && courier && <p className="text-[11px] leading-relaxed text-cocoa">Track this shipment with {courier} using the tracking ID above.</p>}
      <p role="status" className="text-[11px] text-cocoa">{copyMessage}</p>
    </div>
  )
}
