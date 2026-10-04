'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/tc'
import { DELIVERY_SERVICES } from '@/lib/deliveryServices'

const isListed = value => DELIVERY_SERVICES.some(service => service.value === value)

export default function ShippingDetailsEditor({ order, token, onSaved }) {
  const existingService = order.courier || ''
  const [choice, setChoice] = useState(isListed(existingService) ? existingService : existingService ? 'Other' : '')
  const [customService, setCustomService] = useState(existingService && !isListed(existingService) ? existingService : '')
  const [trackingId, setTrackingId] = useState(order.tracking_number || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const service = order.courier || ''
    setChoice(isListed(service) ? service : service ? 'Other' : '')
    setCustomService(service && !isListed(service) ? service : '')
    setTrackingId(order.tracking_number || '')
  }, [order.courier, order.tracking_number])

  const service = choice === 'Other' ? customService.trim() : choice
  const save = async event => {
    event.preventDefault()
    setMessage('')
    if (!service || service.length > 80) {
      setMessage('Choose a delivery service or enter its name.')
      return
    }
    if (trackingId.trim().length > 80) {
      setMessage('Tracking ID must be 80 characters or fewer.')
      return
    }
    if (existingService !== service && order.tracking_number && trackingId.trim() === order.tracking_number) {
      setMessage('For a new delivery service, enter its new tracking ID or clear the old ID explicitly.')
      return
    }
    setSaving(true)
    try {
      const updated = await api(`/admin/orders/${order.id}`, {
        method: 'PUT',
        token,
        body: { courier: service, tracking_number: trackingId.trim() },
      })
      onSaved(updated)
      setMessage('Shipping details saved.')
    } catch (error) {
      setMessage(error.message || 'Could not save shipping details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="min-w-0 space-y-3 border-t border-ink/10 pt-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Shipping</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`shipping-service-${order.id}`} className="mb-1 block text-[11px] font-semibold text-cocoa">Delivery service</label>
          <select id={`shipping-service-${order.id}`} value={choice} onChange={event => { setChoice(event.target.value); setMessage('') }} className="min-h-11 w-full max-w-full border border-ink/20 bg-paper px-3 text-sm text-ink">
            <option value="">Select delivery service</option>
            {DELIVERY_SERVICES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            <option value="Other">Other service</option>
          </select>
          {choice === 'Other' && <input aria-label="Other delivery service name" value={customService} onChange={event => setCustomService(event.target.value)} maxLength={80} placeholder="Delivery service name" className="mt-2 min-h-11 w-full border border-ink/20 bg-paper px-3 text-sm text-ink" />}
        </div>
        <div className="min-w-0">
          <label htmlFor={`shipping-tracking-${order.id}`} className="mb-1 block text-[11px] font-semibold text-cocoa">Tracking ID</label>
          <input id={`shipping-tracking-${order.id}`} value={trackingId} onChange={event => { setTrackingId(event.target.value); setMessage('') }} maxLength={80} autoComplete="off" placeholder="Add after dispatch" className="min-h-11 w-full border border-ink/20 bg-paper px-3 text-sm text-ink" />
          {trackingId && <button type="button" onClick={() => { setTrackingId(''); setMessage('Tracking ID will be cleared when you save.') }} className="mt-1 min-h-11 text-[11px] font-semibold text-cocoa underline">Clear tracking ID</button>}
        </div>
      </div>
      <p className="text-[11px] text-cocoa">Tracking status: {trackingId.trim() ? 'Available' : 'Not added'}{existingService !== service && order.tracking_number ? ' · Changing service requires a new ID or clearing the old one.' : ''}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="min-h-11 bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-cream disabled:opacity-50">{saving ? 'Saving…' : 'Save shipping details'}</button>
        <p role="status" className="min-w-0 text-[11px] text-cocoa">{message}</p>
      </div>
    </form>
  )
}
