'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import StoreLayout from '@/components/tc/StoreLayout'
import CourierTrackingActions from '@/components/tc/CourierTrackingActions'
import { deliveryServiceLabel } from '@/lib/deliveryServices'
import { useAuth } from '@/components/tc/AuthContext'
import { useCart } from '@/components/tc/CartContext'
import { api, inr } from '@/lib/tc'
import { CheckCircle2, Package, MapPin, Truck, ArrowRight, Clock, Sparkles, CreditCard, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

export default function OrderConfirmationPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id
  const { user, isAuthenticated } = useAuth()
  const { clearCart } = useCart()

  const [order, setOrder] = useState(null)
  const [settings, setSettings] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api(`/orders/${id}`).catch(() => null),
      api('/settings').catch(() => null),
    ]).then(([o, s]) => {
      if (o) {
        setOrder(o)
        if (o.payment_status === 'PAID' || o.status === 'CONFIRMED' || o.payment_method === 'WHATSAPP_CONCIERGE') {
          clearCart()
        }
      } else {
        setErr(true)
      }
      if (s) setSettings(s)
      setLoading(false)
    })
  }, [id, clearCart])

  if (loading) {
    return (
      <StoreLayout>
        <div className="container py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
          <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
            Retrieving your order receipt…
          </p>
        </div>
      </StoreLayout>
    )
  }

  if (err || !order) {
    return (
      <StoreLayout>
        <div className="container py-24 text-center max-w-md mx-auto space-y-4">
          <p className="font-display text-3xl text-ink">Order Not Found</p>
          <p className="text-xs text-cocoa">
            We couldn’t find an order matching reference &ldquo;{id}&rdquo;.
          </p>
          <Button
            type="button"
            onClick={() => router.push('/shop')}
            className="rounded-none bg-ink text-cream text-xs uppercase tracking-widest px-6"
          >
            Return to Boutique
          </Button>
        </div>
      </StoreLayout>
    )
  }

  const items = order.items || []
  const c = order.customer || {}
  const waNum = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')
  const isPaidOnline = order.payment_status === 'PAID'
  const isWhatsAppConcierge = order.payment_method === 'WHATSAPP_CONCIERGE'

  const openWhatsAppHelp = () => {
    const text = `Hi Thretha Couture! I have a question regarding my order *${order.order_number}*.`
    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const isCancelled = order.status === 'CANCELLED' || order.payment_status === 'CANCELLED'
  const refundStatus = (order.refund?.status || order.payment?.refund_status || order.refund_status || '').toUpperCase()
  const refundAmount = order.refund?.amount || order.payment?.refund_amount || order.total

  return (
    <StoreLayout>
      <div className="container py-12 sm:py-16 max-w-3xl">
        {/* Success / Status Header */}
        <div className="bg-cream border border-ink/10 p-8 sm:p-10 rounded-sm shadow-sm text-center space-y-4">
          <div className={cn(
            'mx-auto grid h-16 w-16 place-items-center rounded-full',
            isCancelled ? 'bg-coral-light text-coral-dark' : 'bg-emerald-100 text-emerald-700'
          )}>
            {isCancelled ? <XCircle className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
          </div>

          <p className="text-[11px] uppercase tracking-[0.3em] text-mango-dark font-bold">
            {isCancelled ? 'Order Cancelled' : 'Order Confirmed & Received'}
          </p>

          <h1 className="font-display text-4xl sm:text-5xl text-ink font-normal">
            {isCancelled ? `Order #${order.order_number} Cancelled` : `Thank you, ${c.name || 'valued customer'}!`}
          </h1>

          <p className="text-xs sm:text-sm text-cocoa max-w-lg mx-auto leading-relaxed">
            {isCancelled
              ? `Your order ${order.order_number} has been cancelled (${order.cancellation_reason || 'Customer request'}).`
              : `Your atelier order ${order.order_number} has been logged into our boutique system. We are preparing your handpicked silhouettes.`}
          </p>

          {/* Payment & Refund Status Pill */}
          <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
            {isCancelled && isPaidOnline && (
              refundStatus === 'COMPLETED' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Refund: COMPLETED ({inr(refundAmount)})
                </span>
              ) : refundStatus === 'FAILED' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-coral-light border border-coral text-coral-dark text-xs font-bold uppercase tracking-wider rounded-xs">
                  Refund: FAILED (Contact Concierge)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold uppercase tracking-wider rounded-xs">
                  <Clock className="h-3.5 w-3.5" />
                  Refund: PROCESSING ({inr(refundAmount)})
                </span>
              )
            )}

            {!isCancelled && (
              isPaidOnline ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Payment: PAID (Cashfree {order.payment?.cashfree_payment_id || order.payment_id ? `· Ref ${order.payment?.cashfree_payment_id || order.payment_id}` : ''})
                </span>
              ) : isWhatsAppConcierge ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold uppercase tracking-wider rounded-xs">
                  <WAIcon className="h-3.5 w-3.5" />
                  Payment: Concierge Pending (WhatsApp)
                </span>
              ) : order.payment_status === 'FAILED' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-coral-light border border-coral text-coral-dark text-xs font-bold uppercase tracking-wider rounded-xs">
                  Payment: Failed ({order.payment?.failure_reason || 'Transaction could not be verified'})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-paper border border-ink/20 text-ink text-xs font-bold uppercase tracking-wider rounded-xs">
                  Payment: {order.payment_status || 'PENDING'}
                </span>
              )
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            {isAuthenticated ? (
              <Button
                type="button"
                onClick={() => router.push(`/account/orders/${order.order_number || order.id}`)}
                className="rounded-none bg-ink text-cream text-xs uppercase tracking-[0.2em] px-6 py-5 shadow-sm hover:bg-cocoa-dark font-semibold"
              >
                <span>View In My Account</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => router.push(`/track-order?ref=${order.order_number}`)}
                className="rounded-none bg-ink text-cream text-xs uppercase tracking-[0.2em] px-6 py-5 shadow-sm hover:bg-cocoa-dark font-semibold"
              >
                <span>Track Live Status</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={openWhatsAppHelp}
              className="rounded-none border-ink/30 bg-paper text-ink text-xs uppercase tracking-[0.2em] px-6 py-5 font-semibold hover:border-ink"
            >
              <WAIcon className="mr-2 h-4 w-4 text-[#25D366]" />
              Atelier Support
            </Button>
          </div>
        </div>

        {/* Order Details Grid */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {/* Delivery Details */}
          <div className="bg-cream border border-ink/10 p-6 rounded-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
              <MapPin className="h-4 w-4 text-mango-dark" />
              <span>Delivery Destination</span>
            </div>
            <div className="text-xs text-cocoa leading-relaxed">
              <p className="font-semibold text-ink">{c.name}</p>
              <p>{[c.house, c.street].filter(Boolean).join(', ')}</p>
              <p>{[c.city, c.district, c.state].filter(Boolean).join(', ')} - {c.pincode}</p>
              <p className="mt-2 text-cocoa-light">Contact: {c.whatsapp || c.phone}</p>
              {c.email && <p className="text-cocoa-light">Email: {c.email}</p>}
            </div>
          </div>

          {/* Shipping Summary */}
          <div className="bg-cream border border-ink/10 p-6 rounded-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
              <Truck className="h-4 w-4 text-teal" />
              <span>Shipping & Logistics</span>
            </div>
            <div className="text-xs text-cocoa leading-relaxed space-y-1">
              <p>Carrier: <strong className="text-ink">{deliveryServiceLabel(order.courier)}</strong></p>
              {order.tracking_number && <><p>Tracking ID: <strong className="font-mono text-ink">{order.tracking_number}</strong></p><CourierTrackingActions courier={order.courier} trackingNumber={order.tracking_number} /></>}
              <p>Status: <span className="inline-block rounded-xs bg-mango-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-mango-dark">{order.status || 'CONFIRMED'}</span></p>
              <p className="text-cocoa-light pt-1">
                Estimated Delivery: 5–7 Business Days across India.
              </p>
            </div>
          </div>
        </div>

        {/* Items Summary */}
        <div className="mt-8 bg-cream border border-ink/10 p-6 sm:p-8 rounded-sm space-y-6">
          <h2 className="font-display text-2xl text-ink font-normal border-b border-ink/10 pb-4">
            Items in Order ({items.length})
          </h2>

          <div className="space-y-4">
            {items.map((it, idx) => (
              <div key={idx} className="border-b border-ink/5 pb-4 text-xs space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-ink text-sm">{it.combo_name || it.product_name}</p>
                      {it.is_combo && (
                        <span className="bg-mango-dark/10 text-mango-dark border border-mango/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                          Curated Ensemble
                        </span>
                      )}
                    </div>
                    {it.customer_title && it.is_combo && (
                      <p className="text-[11px] text-cocoa">{it.customer_title}</p>
                    )}
                    {!it.is_combo && (
                      <p className="text-cocoa-light mt-0.5">
                        Size: {it.size || 'Free Size'} · Quantity: {it.quantity} {it.colour ? `· ${it.colour}` : ''}
                      </p>
                    )}
                    {it.is_combo && (
                      <p className="text-cocoa-light mt-0.5">Quantity: {it.quantity} set(s)</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold text-ink">
                      {inr(it.price * it.quantity)}
                    </p>
                    {it.savings > 0 && (
                      <p className="text-[10px] text-rose-700 font-semibold">Saved {inr(it.savings * it.quantity)}</p>
                    )}
                  </div>
                </div>

                {it.is_combo && Array.isArray(it.components) && it.components.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-mango/30 bg-paper/60 p-2 text-xs space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Ensemble Components:</p>
                    {it.components.map((comp, cIdx) => (
                      <div key={cIdx} className="flex items-center justify-between text-[11px] text-ink">
                        <span>• {comp.product_name} (Size: <strong>{comp.size || 'Free Size'}</strong>)</span>
                        <span className="text-cocoa text-[10px]">Qty: {comp.quantity * it.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2 text-xs border-t border-ink/10 pt-4">
            <div className="flex justify-between text-cocoa">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{inr(order.subtotal || order.total)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-plum font-semibold">
                <span>Promotional Discount</span>
                <span>-{inr(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-cocoa">
              <span>Shipping</span>
              <span className="font-semibold text-ink">
                {order.shipping === 0 ? <span className="text-emerald-700 font-bold">FREE</span> : inr(order.shipping || 0)}
              </span>
            </div>
            <div className="flex justify-between border-t border-ink/10 pt-3 text-base">
              <span className="font-display text-ink font-semibold">Total Paid / Payable</span>
              <span className="font-display text-2xl font-bold text-ink">{inr(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Guest Post-Checkout Account Creation CTA */}
        {!isAuthenticated && (
          <div className="mt-8 bg-paper border border-gold/30 p-6 sm:p-8 rounded-sm text-center space-y-3 shadow-xs">
            <div className="inline-flex items-center gap-1.5 text-gold-dark font-bold text-xs uppercase tracking-wider">
              <Sparkles className="h-4 w-4" />
              <span>Save your order & make future shopping easier</span>
            </div>
            <p className="text-xs text-cocoa max-w-md mx-auto leading-relaxed">
              Create your Thretha Couture account with {c.email ? <strong>{c.email}</strong> : 'your email'} to easily track all your boutique deliveries and save addresses for 1-click checkout.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button
                type="button"
                onClick={() => router.push(`/login?email=${encodeURIComponent(c.email || '')}&redirect_to=/account/orders/${order.order_number || order.id}`)}
                className="rounded-none bg-ink text-cream text-xs uppercase tracking-[0.2em] px-8 py-5 hover:bg-cocoa-dark font-semibold shadow-sm"
              >
                Create Your Thretha Account →
              </Button>
            </div>
          </div>
        )}

        {/* Bottom Back Button */}
        <div className="mt-8 text-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/shop')}
            className="text-xs uppercase tracking-widest font-semibold text-ink hover:text-mango-dark"
          >
            ← Continue Shopping at Thretha
          </Button>
        </div>
      </div>
    </StoreLayout>
  )
}
