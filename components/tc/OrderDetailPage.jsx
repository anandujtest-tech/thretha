'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Package,
  ArrowLeft,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  XCircle,
  RotateCcw,
  RefreshCw,
  Info,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import { api, inr } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { deliveryServiceLabel } from '@/lib/deliveryServices'
import CourierTrackingActions from './CourierTrackingActions'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

const CANCEL_REASONS = [
  'Found an alternative silhouette / design',
  'Need to change size or tailoring specifications',
  'Incorrect delivery address or contact number',
  'Delivery timeline exceeds occasion date',
  'Ordered by mistake / duplicate order',
  'Changed my mind',
  'Other reason',
]

export default function OrderDetailPage({ orderId: propOrderId }) {
  const router = useRouter()
  const params = useParams()
  const orderId = propOrderId || params?.id

  const { isAuthenticated, loading: authLoading } = useAuth()
  const [order, setOrder] = useState(null)
  const [cancellationEligibility, setCancellationEligibility] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Cancel Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [selectedReason, setSelectedReason] = useState(CANCEL_REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('')

  const fetchOrder = () => {
    if (!orderId || !isAuthenticated) return
    setLoading(true)
    setError('')

    Promise.all([
      api(`/account/orders/${orderId}`),
      api('/settings').catch(() => null),
    ])
      .then(([res, cfg]) => {
        if (res?.order) {
          setOrder(res.order)
          if (res.cancellation_eligibility) {
            setCancellationEligibility(res.cancellation_eligibility)
          }
          setSettings(cfg)
        } else {
          setError('Order not found or you do not have permission to view it.')
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load order details.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect_to=/account/orders/${orderId}`)
    }
  }, [authLoading, isAuthenticated, orderId, router])

  useEffect(() => {
    fetchOrder()
  }, [orderId, isAuthenticated])

  const handleCancelOrder = async () => {
    if (isCancelling || !order) return

    const reason = selectedReason === 'Other reason'
      ? (customReason.trim() || 'Customer requested cancellation')
      : selectedReason

    setIsCancelling(true)
    setCancelError('')

    try {
      const res = await api(`/account/orders/${order.order_number || order.id}/cancel`, {
        method: 'POST',
        body: { reason },
      })

      if (res?.ok) {
        setCancelSuccessMsg(res.message || 'Order cancelled successfully.')
        setCancelModalOpen(false)
        fetchOrder()
      } else {
        setCancelError(res?.error || 'Unable to cancel order. Please contact concierge.')
      }
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel order.')
    } finally {
      setIsCancelling(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="container py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <p className="mt-4 text-xs font-sans uppercase tracking-widest text-cocoa">
          Retrieving order details…
        </p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container py-20 text-center max-w-md mx-auto space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose/10 text-coral">
          <Package className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl text-ink font-normal">Order Inaccessible</h1>
        <p className="text-xs text-cocoa font-sans leading-relaxed">
          {error || 'The requested order could not be located in your account.'}
        </p>
        <div className="pt-2">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 bg-ink text-cream px-6 py-3 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Account</span>
          </Link>
        </div>
      </div>
    )
  }

  const waNumber = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')
  const waInquiryUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    `Hello Thretha Team! I have a question regarding my order *#${order.order_number}*.`
  )}`

  const isCancelled = order.status === 'CANCELLED' || order.payment_status === 'CANCELLED'
  const isCancellationPending = order.status === 'CANCELLATION_PENDING'
  const isPaid = order.payment_status === 'PAID' || order.payment?.status === 'PAID'
  const itemRefundedAmount = (order.items || []).reduce((sum, item) => sum + (item.cancellation?.refund_status === 'COMPLETED' ? Number(item.cancellation.amount || 0) : 0), 0)
  const refundStatus = (order.refund?.status || order.payment?.refund_status || order.refund_status || (itemRefundedAmount ? 'PARTIAL' : '')).toUpperCase()
  const refundAmount = order.refund?.amount || order.payment?.refund_amount || order.refund?.partial_amount_total || itemRefundedAmount || order.total
  const cfRefundId = order.refund?.cf_refund_id || order.payment?.cashfree_refund_id

  const isEligibleForCancel = cancellationEligibility?.eligible ?? (
    !isCancelled &&
    !['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLATION_PENDING'].includes(String(order.status || '').toUpperCase()) &&
    !['PENDING', 'INITIATED', 'COMPLETED'].includes(refundStatus)
  )

  return (
    <div className="w-full bg-paper py-10 sm:py-16">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        {/* Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-xs font-sans font-semibold uppercase tracking-wider text-cocoa hover:text-ink transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Account Dashboard</span>
          </Link>

          {cancelSuccessMsg && (
            <div className="text-xs font-sans text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1">
              ✓ {cancelSuccessMsg}
            </div>
          )}
        </div>

        {/* Order Header Card */}
        <div className="bg-cream border border-ink/10 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-lg sm:text-xl font-bold text-ink">
                Order #{order.order_number}
              </span>
              <span className={cn(
                'px-2.5 py-0.5 text-[9px] font-sans font-bold uppercase tracking-wider',
                isCancelled ? 'bg-coral-light text-coral-dark' : 'bg-gold text-ink'
              )}>
                {order.status || 'CONFIRMED'}
              </span>
              {isPaid && (
                <span className="px-2.5 py-0.5 text-[9px] font-sans font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                  PAID
                </span>
              )}
            </div>
            <p className="text-xs text-cocoa font-sans">
              Placed on {new Date(order.created_at).toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {isEligibleForCancel && (
              <button
                type="button"
                onClick={() => {
                  setCancelError('')
                  setCancelModalOpen(true)
                }}
                className="inline-flex items-center justify-center gap-1.5 border border-coral/60 text-coral-dark hover:bg-coral-light/50 px-4 py-3 text-xs font-sans uppercase tracking-[0.16em] font-semibold transition shadow-2xs"
              >
                <XCircle className="h-4 w-4" />
                <span>Cancel Order</span>
              </button>
            )}

            {/* WhatsApp Inquire */}
            <a
              href={waInquiryUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white px-5 py-3 text-xs font-sans uppercase tracking-[0.16em] font-semibold hover:bg-[#1eb457] transition shadow-xs self-start sm:self-auto"
            >
              <WAIcon className="h-4 w-4" />
              <span>Order Support</span>
            </a>
          </div>
        </div>

        {['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(String(order.status || '').toUpperCase()) && !isCancelled && (
          <p className="border border-ink/10 bg-cream px-4 py-3 text-xs text-cocoa" role="status">Cancellation is unavailable after your order has been shipped.</p>
        )}

        {isCancellationPending && (
          <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="status">
            <strong>Cancellation and refund: PROCESSING ({inr(refundAmount)})</strong><br />We’ll update this order after Cashfree confirms the refund; the order remains active until then.
          </div>
        )}

        {!isCancelled && !isCancellationPending && refundStatus === 'FAILED' && (
          <div className="border border-coral/40 bg-coral-light/30 px-4 py-3 text-xs text-coral-dark" role="status">
            The refund request failed, so this order remains active. You can retry cancellation or contact Order Support.
          </div>
        )}

        {/* Cancellation & Refund Status Card (When Cancelled) */}
        {isCancelled && (
          <div className="bg-paper border border-ink/15 p-6 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-coral" />
              <h3 className="font-display text-xl text-ink font-normal">Order Cancelled</h3>
            </div>

            <div className="text-xs font-sans space-y-2 text-cocoa leading-relaxed">
              <p>
                <strong>Cancellation Reason:</strong> {order.cancellation_reason || 'Customer request'}
              </p>
              {order.cancelled_at && (
                <p className="text-cocoa-light">
                  Cancelled on: {new Date(order.cancelled_at).toLocaleString('en-IN')}
                </p>
              )}
            </div>

            {/* Refund Details */}
            {isPaid && (
              <div className="mt-4 pt-4 border-t border-ink/10">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <span className="text-xs font-sans font-bold uppercase tracking-wider text-ink">
                    Refund Status:
                  </span>
                  {refundStatus === 'PARTIAL' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-sans font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">PARTIAL REFUND ({inr(refundAmount)})</span>
                  ) : refundStatus === 'COMPLETED' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-sans font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      COMPLETED ({inr(refundAmount)})
                    </span>
                  ) : refundStatus === 'FAILED' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-sans font-bold uppercase tracking-wider bg-coral-light text-coral-dark border border-coral">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      REFUND FAILED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-sans font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                      <Clock className="h-3.5 w-3.5 animate-spin" />
                      PROCESSING REFUND ({inr(refundAmount)})
                    </span>
                  )}
                </div>

                <div className="p-4 bg-cream border border-ink/8 text-xs font-sans space-y-1 text-cocoa">
                  <div className="flex justify-between">
                    <span>Refund Amount:</span>
                    <strong className="text-ink font-display text-base">{inr(refundAmount)}</strong>
                  </div>
                  {cfRefundId && (
                    <div className="flex justify-between text-[11px]">
                      <span>Cashfree Reference:</span>
                      <span className="font-mono font-medium text-ink">{cfRefundId}</span>
                    </div>
                  )}
                  <p className="pt-2 text-[11px] text-cocoa-light">
                    {refundStatus === 'PARTIAL'
                      ? 'The cancelled items were refunded. Shipping and any remaining balance were not included in those item refunds.'
                      : refundStatus === 'COMPLETED'
                      ? 'The refund has been successfully credited back to your original source payment method.'
                      : refundStatus === 'FAILED'
                      ? 'Automated refund encountered an issue. Our concierge is reviewing your transaction to issue manual credit.'
                      : 'Your refund has been initiated with Cashfree and will reflect in your original account / card statement within 5–7 business days.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2-Column Details Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

          {/* Left: Items Breakdown */}
          <div className="bg-cream border border-ink/10 p-6 sm:p-8 shadow-sm space-y-6">
            <h2 className="font-display text-2xl text-ink font-normal border-b border-ink/10 pb-3">
              Order Items ({order.items?.length || 0})
            </h2>

            <div className="divide-y divide-ink/8">
              {order.items?.map((item, idx) => (
                <div key={idx} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.combo_name || item.product_name}
                          className="h-16 w-12 sm:h-20 sm:w-16 object-cover bg-sand/30 border border-ink/10 shrink-0"
                        />
                      ) : (
                        <div className="h-16 w-12 bg-sand/30 grid place-items-center text-xs text-cocoa-light shrink-0">
                          Piece
                        </div>
                      )}
                      <div className="space-y-1 text-xs font-sans">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-ink sm:text-sm">{item.combo_name || item.product_name}</p>
                          {item.is_combo && (
                            <span className="bg-mango-dark/10 text-mango-dark border border-mango/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                              Curated Ensemble
                            </span>
                          )}
                          {item.cancellation?.status && <span className={cn('border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', item.cancellation.status === 'CANCELLED' ? 'border-coral/30 bg-coral-light/30 text-coral-dark' : item.cancellation.status === 'PENDING' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-ink/10 bg-paper text-cocoa')}>{item.cancellation.status === 'PENDING' ? 'CANCELLATION PENDING' : item.cancellation.status}</span>}
                        </div>
                        {item.customer_title && item.is_combo && (
                          <p className="text-[11px] text-cocoa">{item.customer_title}</p>
                        )}
                        {!item.is_combo && (
                          <p className="text-cocoa-light text-[11px]">
                            Size: <strong className="text-ink">{item.size || 'Free Size'}</strong>
                            {item.colour && ` · Colour: ${item.colour}`}
                          </p>
                        )}
                        <p className="text-cocoa-light text-[11px]">
                          Quantity: <strong className="text-ink">{item.quantity}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-display text-base sm:text-lg font-medium text-ink">
                        {inr(item.price * item.quantity)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-[10px] text-cocoa-light font-sans">{inr(item.price)} each</p>
                      )}
                      {item.cancellation?.refund_status && item.cancellation.refund_status !== 'NONE' && <p className="mt-1 text-[10px] font-semibold text-cocoa">Refund {item.cancellation.refund_status}{item.cancellation.amount ? ` · ${inr(item.cancellation.amount)}` : ''}</p>}
                      {item.savings > 0 && (
                        <p className="text-[10px] text-rose-700 font-semibold">Saved {inr(item.savings * item.quantity)}</p>
                      )}
                    </div>
                  </div>

                  {/* Combo Components */}
                  {item.is_combo && Array.isArray(item.components) && item.components.length > 0 && (
                    <div className="mt-3 pl-3 sm:pl-5 border-l-2 border-mango/30 bg-paper/60 p-2.5 text-xs font-sans space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Ensemble Components:</p>
                      {item.components.map((comp, cIdx) => (
                        <div key={cIdx} className="flex items-center justify-between text-[11px] text-ink">
                          <span>• {comp.product_name} (Size: <strong>{comp.size || 'Free Size'}</strong>)</span>
                          <span className="text-cocoa text-[10px]">Qty: {comp.quantity * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tracking / Courier Information */}
            {!isCancelled && (
              <div className="p-4 bg-paper border border-ink/8 text-xs font-sans space-y-2 mt-6">
                <div className="flex items-center gap-2 font-bold text-ink uppercase tracking-wider text-[11px]">
                  <Truck className="h-4 w-4 text-terracotta" />
                  <span>Shipping & Fulfillment</span>
                </div>
                <p className="text-cocoa">
                  Courier: <strong>{deliveryServiceLabel(order.courier)}</strong>
                </p>
                {order.tracking_number ? (
                  <>
                    <p className="text-cocoa">Tracking ID: <strong className="font-mono text-ink">{order.tracking_number}</strong></p>
                    <CourierTrackingActions courier={order.courier} trackingNumber={order.tracking_number} />
                  </>
                ) : (
                  <p className="text-cocoa-light text-[11px]">
                    Handcrafted dispatch typically takes 24–48 hours from our Kochi cutting tables.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Summary & Delivery Address */}
          <div className="space-y-6">

            {/* Pricing Summary Card */}
            <div className="bg-cream border border-ink/10 p-6 shadow-sm space-y-4">
              <h3 className="font-display text-xl text-ink font-normal border-b border-ink/10 pb-3">
                Payment Summary
              </h3>

              <div className="space-y-2.5 text-xs font-sans">
                <div className="flex justify-between text-cocoa">
                  <span>Subtotal</span>
                  <span className="font-medium text-ink">{inr(order.subtotal)}</span>
                </div>

                {order.discount > 0 && (
                  <div className="flex justify-between text-plum font-medium">
                    <span>Atelier Discount</span>
                    <span>-{inr(order.discount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-cocoa">
                  <span>Express Shipping</span>
                  <span className="font-medium text-ink">
                    {order.shipping === 0 ? 'FREE' : inr(order.shipping)}
                  </span>
                </div>

                <div className="pt-3 border-t border-ink/10 flex justify-between items-baseline font-bold">
                  <span className="text-xs uppercase tracking-wider text-ink">Total Paid / Due</span>
                  <span className="font-display text-2xl text-ink font-normal">{inr(order.total)}</span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-cocoa-light font-sans flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-gold shrink-0" />
                <span>Method: {order.payment_method === 'CASHFREE' || order.payment_method === 'RAZORPAY' ? 'Cashfree Payments' : 'WhatsApp Concierge'}</span>
              </div>
            </div>

            {/* Shipping Address Card */}
            <div className="bg-cream border border-ink/10 p-6 shadow-sm space-y-3">
              <h3 className="font-display text-xl text-ink font-normal border-b border-ink/10 pb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold" />
                <span>Delivery Address</span>
              </h3>

              {order.customer && (
                <div className="text-xs font-sans text-cocoa space-y-1 leading-relaxed">
                  <p className="font-bold text-ink text-sm">{order.customer.name}</p>
                  <p>{order.customer.house || order.customer.addressLine1}</p>
                  {order.customer.street && <p>{order.customer.street}</p>}
                  <p>{order.customer.city}, {order.customer.state || 'Kerala'} — {order.customer.pincode || order.customer.postalCode}</p>
                  <p className="pt-2 text-ink font-medium">Phone: {order.customer.phone || order.customer.whatsapp}</p>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ════ CANCEL ORDER CONFIRMATION MODAL ════ */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-paper border border-ink/20 p-6 sm:p-8 shadow-2xl space-y-6">
            <div>
              <span className="text-[10px] uppercase tracking-[0.25em] text-coral font-bold">
                Order Cancellation
              </span>
              <h3 className="mt-1 font-display text-2xl sm:text-3xl text-ink">
                Cancel this order?
              </h3>
              <p className="text-xs text-cocoa font-sans mt-1">
                Please confirm if you wish to cancel order <strong className="font-mono text-ink">#{order.order_number}</strong>.
              </p>
            </div>

            {/* Financial Summary */}
            <div className="bg-cream p-4 border border-ink/10 space-y-2 text-xs font-sans">
              <div className="flex justify-between text-cocoa">
                <span>Order Total:</span>
                <span className="font-semibold text-ink">{inr(order.total)}</span>
              </div>
              <div className="flex justify-between text-cocoa">
                <span>Amount Paid:</span>
                <span className="font-semibold text-ink">{isPaid ? inr(order.total) : '₹0 (Unpaid)'}</span>
              </div>
              <div className="pt-2 border-t border-ink/10 flex justify-between items-baseline">
                <span className="font-bold text-ink">Refund to Original Payment:</span>
                <span className="font-display text-xl text-emerald-800 font-bold">
                  {isPaid ? inr(order.total) : '₹0'}
                </span>
              </div>
              {isPaid && (
                <p className="text-[10.5px] text-cocoa-light pt-1">
                  Cancellation completes after Cashfree confirms the refund. Your bank may take 5–7 business days to reflect it.
                </p>
              )}
            </div>

            {/* Reason Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-sans font-bold uppercase tracking-wider text-ink">
                Reason for cancellation
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="w-full bg-cream border border-ink/20 p-2.5 text-xs font-sans text-ink focus:outline-none focus:border-ink"
              >
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {selectedReason === 'Other reason' && (
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Please specify reason (optional)..."
                  rows={2}
                  className="w-full mt-2 bg-cream border border-ink/20 p-2.5 text-xs font-sans text-ink focus:outline-none focus:border-ink"
                />
              )}
            </div>

            {cancelError && (
              <div className="p-3 bg-coral-light border border-coral text-coral-dark text-xs font-sans">
                {cancelError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => setCancelModalOpen(false)}
                className="px-5 py-3 border border-ink/20 text-xs font-sans uppercase tracking-wider font-semibold text-cocoa hover:text-ink transition"
              >
                Keep Order
              </button>

              <button
                type="button"
                disabled={isCancelling}
                onClick={handleCancelOrder}
                className="px-6 py-3 bg-coral-dark text-cream text-xs font-sans uppercase tracking-[0.2em] font-bold hover:bg-rose transition shadow-sm disabled:opacity-50"
              >
                {isCancelling ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                    {isPaid ? 'PROCESSING REFUND...' : 'CANCELLING ORDER...'}
                  </span>
                ) : (
                  <span>{isPaid ? 'Cancel & Refund' : 'Cancel Order'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
