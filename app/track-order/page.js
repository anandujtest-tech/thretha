'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import StoreLayout from '@/components/tc/StoreLayout'
import { api, inr } from '@/lib/tc'
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  Sparkles,
  ShieldCheck,
  CreditCard,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { deliveryServiceLabel } from '@/lib/deliveryServices'
import CourierTrackingActions from '@/components/tc/CourierTrackingActions'

const STATUS_STAGES = [
  { key: 'NEW', label: 'Order Placed', desc: 'Received at Thretha Atelier' },
  { key: 'CONFIRMED', label: 'Confirmed', desc: 'Payment & fitting approved' },
  { key: 'PACKED', label: 'Packed & QC', desc: 'Inspected with fragrance wrap' },
  { key: 'SHIPPED', label: 'In Transit', desc: 'Dispatched via express logistics' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: 'Arriving at your doorstep' },
  { key: 'DELIVERED', label: 'Delivered', desc: 'Enjoy your handcrafted silhouette' },
]

function getStageIndex(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'DELIVERED') return 5
  if (s === 'OUT_FOR_DELIVERY') return 4
  if (s === 'SHIPPED') return 3
  if (s === 'PACKED') return 2
  if (s === 'CONFIRMED' || s === 'PAYMENT_CONFIRMED') return 1
  return 0
}

function TrackOrderInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialRef = searchParams.get('ref') || ''

  const [orderNumber, setOrderNumber] = useState(initialRef)
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const requestSequence = useRef(0)

  const fetchTracking = async (refNum, contactVal) => {
    if (!refNum.trim() || !contactVal.trim()) return
    const requestId = ++requestSequence.current
    setLoading(true)
    setError('')
    setOrder(null)
    try {
      const data = await api('/orders/track', { method: 'POST', body: { order_number: refNum.trim(), contact: contactVal.trim() } })
      if (requestId === requestSequence.current) setOrder(data)
    } catch (err) {
      if (requestId === requestSequence.current) setError(err.message || 'We could not verify those details.')
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }

  useEffect(() => { if (initialRef) setOrderNumber(initialRef) }, [initialRef])

  const handleSubmit = (e) => {
    e.preventDefault()
    fetchTracking(orderNumber, contact)
  }

  const currentStageIdx = order ? getStageIndex(order.status) : 0

  return (
    <div className="container py-12 sm:py-16 max-w-3xl">
      {/* Header */}
      <div className="text-center space-y-3 mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-mango-dark font-bold">
          Thretha Logistics & Atelier Tracking
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-ink font-normal">
          Track Your Package
        </h1>
        <p className="text-xs sm:text-sm text-cocoa max-w-md mx-auto leading-relaxed">
          Enter your Thretha order reference (e.g. <span className="font-mono font-semibold">TC-2026-0001</span>) to follow your parcel from our Kochi atelier to your door.
        </p>
      </div>

      {/* Search Card */}
      <div className="bg-cream border border-ink/10 p-6 sm:p-8 rounded-sm shadow-sm space-y-4">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div>
            <Label className="text-[11px] uppercase tracking-wider font-semibold text-ink">
              Order Reference *
            </Label>
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="e.g. TC-2026-0001"
              required
              className="mt-1 rounded-none border-ink/20 bg-paper text-xs uppercase tracking-wider focus-visible:border-mango"
            />
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider font-semibold text-ink">
              Phone or Email *
            </Label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 9876543210 or email"
              required
              className="mt-1 rounded-none border-ink/20 bg-paper text-xs focus-visible:border-mango"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !orderNumber.trim() || !contact.trim()}
            className="rounded-none bg-ink text-cream text-xs uppercase tracking-widest px-6 py-5 shadow-sm hover:bg-cocoa-dark font-semibold shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                Searching…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                Track
              </span>
            )}
          </Button>
        </form>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-coral-light border border-coral/30 text-xs text-coral-dark rounded-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Tracking Results */}
      {order && (
        <div className="mt-10 space-y-8 animate-fade-in">
          {/* Status Header Card */}
          <div className="bg-cream border border-ink/10 p-6 sm:p-8 rounded-sm shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-4">
              <div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-bold">
                  Order Status
                </span>
                <h2 className="font-display text-2xl sm:text-3xl text-ink font-normal mt-0.5">
                  {order.status === 'DELIVERED'
                    ? 'Delivered to You'
                    : order.status === 'SHIPPED'
                    ? 'In Transit to ' + (order.shipping_info?.destination_city || 'Destination')
                    : 'Atelier Processing'}
                </h2>
                <p className="text-xs text-cocoa-light font-mono mt-1">
                  Ref: <strong>{order.order_number}</strong>
                </p>
              </div>

              <div className="sm:text-right">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mango-light px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-mango-dark">
                  <Sparkles className="h-3 w-3" />
                  {order.status}
                </span>
                <p className="text-[11px] text-cocoa-light mt-1">
                  Est. Delivery: <strong>{order.shipping_info?.estimated_delivery || '5–7 Business Days'}</strong>
                </p>
              </div>
            </div>

            {/* Visual Multi-Stage Progress Timeline */}
            <div className="py-4">
              <div className="relative">
                {/* Connecting Line */}
                <div className="absolute top-4 left-4 right-4 h-0.5 bg-sand/60 -z-0 hidden sm:block">
                  <div
                    className="h-full bg-mango transition-all duration-700"
                    style={{
                      width: `${(currentStageIdx / (STATUS_STAGES.length - 1)) * 100}%`,
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
                  {STATUS_STAGES.map((stage, idx) => {
                    const isDone = idx <= currentStageIdx
                    const isCurrent = idx === currentStageIdx

                    return (
                      <div key={stage.key} className="flex flex-col sm:items-center sm:text-center z-10">
                        <div
                          className={cn(
                            'h-8 w-8 rounded-full grid place-items-center text-xs font-bold transition-all shadow-xs',
                            isCurrent
                              ? 'bg-mango text-white ring-4 ring-mango-light scale-110'
                              : isDone
                              ? 'bg-emerald-600 text-white'
                              : 'bg-sand text-cocoa-light'
                          )}
                        >
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                        </div>
                        <p className={cn('mt-2 text-xs font-bold uppercase tracking-wider', isDone ? 'text-ink' : 'text-cocoa-light')}>
                          {stage.label}
                        </p>
                        <p className="text-[10px] text-cocoa-light hidden sm:block mt-0.5">
                          {stage.desc}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Courier & Tracking Details */}
            <div className="grid gap-4 sm:grid-cols-2 bg-paper p-5 border border-ink/10 rounded-sm text-xs">
              <div className="space-y-1">
                <p className="text-cocoa-light uppercase tracking-wider text-[10px] font-bold">Courier Partner</p>
                <p className="font-semibold text-ink">{deliveryServiceLabel(order.shipping_info?.courier)}</p>
                <p className="text-cocoa">Destination: {order.shipping_info?.destination_city || 'India'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-cocoa-light uppercase tracking-wider text-[10px] font-bold">Tracking Number / AWB</p>
                <p className="font-mono font-bold text-ink">
                  {order.shipping_info?.tracking_number ? (
                    <span className="text-mango-dark">{order.shipping_info.tracking_number}</span>
                  ) : (
                    <span className="text-cocoa-light italic">Assigned upon dispatch</span>
                  )}
                </p>

                <CourierTrackingActions courier={order.shipping_info?.courier} trackingNumber={order.shipping_info?.tracking_number} />
              </div>
            </div>

            {/* Items Summary in Tracking View */}
            <div className="border-t border-ink/10 pt-4">
              <p className="text-xs uppercase tracking-wider font-bold text-ink mb-3">
                Items in this Shipment ({order.items?.length || 0})
              </p>
              <div className="space-y-2">
                {(order.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs py-1 border-b border-ink/5">
                    <span className="font-medium text-ink">
                      {it.product_name} (Size: {it.size || 'Free Size'}) × {it.quantity}
                    </span>
                    <span className="font-bold text-ink">{inr(it.price * it.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TrackOrderPage() {
  return (
    <StoreLayout>
      <Suspense fallback={
        <div className="container py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        </div>
      }>
        <TrackOrderInner />
      </Suspense>
    </StoreLayout>
  )
}
