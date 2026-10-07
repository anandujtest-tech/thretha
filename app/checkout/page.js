'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StoreLayout from '@/components/tc/StoreLayout'
import { useCart } from '@/components/tc/CartContext'
import { useAuth } from '@/components/tc/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { inr, api } from '@/lib/tc'
import { cn } from '@/lib/utils'
import {
  ShieldCheck,
  CreditCard,
  Smartphone,
  Landmark,
  Clock,
  Lock,
  Sparkles,
  Check,
  ArrowRight,
  ArrowLeft,
  User,
  AlertCircle,
  CheckCircle2,
  Tag,
  X,
} from 'lucide-react'
import { INDIAN_STATES, validateAddress } from '@/lib/addressValidation'
import ErrorBoundary from '@/components/tc/ErrorBoundary'
import { trackVisitorEvent } from '@/lib/visitorAnalytics'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  type = 'text',
  inputMode,
  maxLength,
  disabled = false,
  error,
  touched,
  helper,
  className,
}) {
  const hasError = Boolean(touched && error)
  const inputId = id || `checkout-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-wider text-ink/75 flex items-center justify-between">
        <span>{label} {required && <span className="text-coral">*</span>}</span>
      </Label>
      <Input
        id={inputId}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        className={cn(
          'mt-1 min-w-0 rounded-none bg-cream text-xs focus-visible:ring-mango/20 transition',
          disabled && 'bg-sand/30 text-cocoa cursor-not-allowed border-ink/15',
          hasError
            ? 'border-coral focus-visible:border-coral bg-coral-light/10'
            : 'border-ink/20 focus-visible:border-mango'
        )}
      />
      {helper && !hasError && (
        <p className="text-[10px] text-cocoa-light font-sans mt-1">
          {helper}
        </p>
      )}
      {hasError && (
        <p id={`${inputId}-error`} className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}

function CheckoutInner() {
  const router = useRouter()
  const { user, isAuthenticated, getGoogleAuthUrl } = useAuth()
  const {
    isLoaded,
    cart,
    cartCount,
    cartSubtotal,
    cartTotal,
    discountAmount,
    shippingCharge,
    isFreeShipping,
    coupon,
    setCoupon,
    clearCart,
    revalidateCart,
  } = useCart()
  const checkoutEventsSent = useRef(new Set())

  useEffect(() => {
    if (!isLoaded || !cart?.length) return
    const slugs = new Set(cart.map((item) => item.slug).filter(Boolean))
    for (const product_slug of slugs) {
      if (checkoutEventsSent.current.has(product_slug)) continue
      checkoutEventsSent.current.add(product_slug)
      trackVisitorEvent('checkout_started', { product_slug })
    }
  }, [isLoaded, cart])

  const [googleLoading, setGoogleLoading] = useState(false)
  const handleGoogleSignIn = async (e) => {
    if (e) e.preventDefault()
    setGoogleLoading(true)
    try {
      const res = await getGoogleAuthUrl('/checkout')
      if (res?.configured && res?.url) {
        window.location.href = res.url
      } else {
        window.location.href = `/api/auth/google/url?redirect_to=${encodeURIComponent('/checkout')}`
      }
    } catch {
      window.location.href = `/api/auth/google/url?redirect_to=${encodeURIComponent('/checkout')}`
    }
  }

  const [couponInput, setCouponInput] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')

  const applyPromoCode = async (e) => {
    if (e) e.preventDefault()
    setCouponError('')
    const clean = (couponInput || '').trim().toUpperCase()
    if (!clean) return

    setCouponLoading(true)
    try {
      const res = await api('/promotions/apply-coupon', {
        method: 'POST',
        body: {
          code: clean,
          items: cart,
          customer: form,
        },
      })
      if (res?.valid && res?.coupon) {
        setCoupon(res.coupon)
        setCouponInput('')
        setCouponError('')
      } else {
        setCouponError(res?.error || 'Coupon code is invalid.')
      }
    } catch (err) {
      setCouponError(err.message || 'Coupon code is invalid.')
    } finally {
      setCouponLoading(false)
    }
  }

  const removePromoCode = () => {
    setCoupon(null)
    setCouponError('')
    setCouponInput('')
  }

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    house: '',
    street: '',
    city: '',
    district: '',
    state: 'Kerala',
    pincode: '',
  })

  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState(null)

  // Prefill authenticated customer details & default address
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || user.name || '',
        email: user.email || f.email || '',
        phone: f.phone || user.phone || '',
        whatsapp: f.whatsapp || user.phone || '',
      }))

      // Fetch saved addresses
      api('/account/addresses')
        .then((res) => {
          const list = res?.addresses || []
          setSavedAddresses(list)
          const defaultAddr = list.find((a) => a.isDefault) || list[0]
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id)
            setForm((f) => ({
              ...f,
              name: defaultAddr.fullName || f.name,
              phone: defaultAddr.phone || f.phone,
              whatsapp: defaultAddr.phone || f.whatsapp,
              house: defaultAddr.addressLine1 || f.house,
              street: defaultAddr.addressLine2 || f.street,
              city: defaultAddr.city || f.city,
              district: defaultAddr.district || f.district,
              state: defaultAddr.state || f.state,
              pincode: defaultAddr.postalCode || f.pincode,
            }))
          }
        })
        .catch(() => {})
    }
  }, [user])

  const [paymentMethod, setPaymentMethod] = useState('CASHFREE')
  const [checkoutMethods, setCheckoutMethods] = useState({ pay_online_enabled: true, whatsapp_order_enabled: true })
  const [checkoutMethodsLoaded, setCheckoutMethodsLoaded] = useState(false)

  const applyCheckoutMethods = useCallback((methods = {}) => {
    const next = {
      pay_online_enabled: methods.pay_online_enabled !== false,
      whatsapp_order_enabled: methods.whatsapp_order_enabled !== false,
    }
    setCheckoutMethods(next)
    setCheckoutMethodsLoaded(true)
    setPaymentMethod((current) => {
      if ((current === 'CASHFREE' && next.pay_online_enabled) || (current === 'WHATSAPP' && next.whatsapp_order_enabled)) return current
      if (next.pay_online_enabled) return 'CASHFREE'
      if (next.whatsapp_order_enabled) return 'WHATSAPP'
      return ''
    })
  }, [])

  const handleCheckoutMethodUnavailable = (requestError) => {
    if (requestError?.code !== 'CHECKOUT_METHOD_DISABLED' || !requestError.data?.checkout) return
    applyCheckoutMethods(requestError.data.checkout)
  }

  useEffect(() => {
    let active = true
    api('/settings')
      .then((settings) => { if (active) applyCheckoutMethods(settings?.checkout) })
      .catch(() => { if (active) setCheckoutMethodsLoaded(true) })
    return () => { active = false }
  }, [applyCheckoutMethods])
  const [submitting, setSubmitting] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('')
  const [completedOrder, setCompletedOrder] = useState(null)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [pendingPaymentMessage, setPendingPaymentMessage] = useState('')
  const [error, setError] = useState('')

  const setField = (key) => (e) => {
    const val = e.target.value
    setForm((f) => {
      const next = { ...f, [key]: val }
      if (key === 'phone' || key === 'whatsapp') {
        next.phone = val
        next.whatsapp = val
      }
      if (key === 'name' || key === 'fullName') {
        next.name = val
        next.fullName = val
      }
      if (key === 'house' || key === 'addressLine1') {
        next.house = val
        next.addressLine1 = val
      }
      return next
    })

    const updated = { ...form, [key]: val }
    if (key === 'phone' || key === 'whatsapp') {
      updated.phone = val
      updated.whatsapp = val
    }
    if (key === 'name' || key === 'fullName') {
      updated.name = val
      updated.fullName = val
    }
    if (key === 'house' || key === 'addressLine1') {
      updated.house = val
      updated.addressLine1 = val
    }

    const res = validateAddress(updated, { requireDistrict: false })

    setErrors((errs) => {
      const next = { ...errs }
      if (key === 'phone' || key === 'whatsapp') {
        if (!res.errors.phone && !res.errors.whatsapp) {
          delete next.phone
          delete next.whatsapp
        } else if (touched.phone || touched.whatsapp) {
          next.phone = res.errors.phone || res.errors.whatsapp
          next.whatsapp = res.errors.whatsapp || res.errors.phone
        }
      } else if (key === 'name' || key === 'fullName') {
        if (!res.errors.name && !res.errors.fullName) {
          delete next.name
          delete next.fullName
        } else if (touched.name || touched.fullName) {
          next.name = res.errors.name
          next.fullName = res.errors.fullName
        }
      } else if (key === 'house' || key === 'addressLine1') {
        if (!res.errors.house && !res.errors.addressLine1) {
          delete next.house
          delete next.addressLine1
        } else if (touched.house || touched.addressLine1) {
          next.house = res.errors.house
          next.addressLine1 = res.errors.addressLine1
        }
      } else {
        if (!res.errors[key]) {
          delete next[key]
        } else if (touched[key]) {
          next[key] = res.errors[key]
        }
      }
      return next
    })
  }

  const handleBlur = (field) => {
    setTouched((t) => {
      const next = { ...t, [field]: true }
      if (field === 'phone' || field === 'whatsapp') {
        next.phone = true
        next.whatsapp = true
      }
      if (field === 'house' || field === 'addressLine1') {
        next.house = true
        next.addressLine1 = true
      }
      if (field === 'name' || field === 'fullName') {
        next.name = true
        next.fullName = true
      }
      return next
    })

    const res = validateAddress(form, { requireDistrict: false })
    if (field === 'phone' || field === 'whatsapp') {
      const err = res.errors.phone || res.errors.whatsapp
      setErrors((prev) => {
        const next = { ...prev }
        if (err) {
          next.phone = err
          next.whatsapp = err
        } else {
          delete next.phone
          delete next.whatsapp
        }
        return next
      })
    } else if (field === 'name' || field === 'fullName') {
      const err = res.errors.name || res.errors.fullName
      setErrors((prev) => {
        const next = { ...prev }
        if (err) {
          next.name = err
          next.fullName = err
        } else {
          delete next.name
          delete next.fullName
        }
        return next
      })
    } else if (field === 'house' || field === 'addressLine1') {
      const err = res.errors.house || res.errors.addressLine1
      setErrors((prev) => {
        const next = { ...prev }
        if (err) {
          next.house = err
          next.addressLine1 = err
        } else {
          delete next.house
          delete next.addressLine1
        }
        return next
      })
    } else {
      setErrors((prev) => {
        const next = { ...prev }
        if (res.errors[field]) {
          next[field] = res.errors[field]
        } else {
          delete next[field]
        }
        return next
      })
    }
  }

  const handleSelectSavedAddress = (addr) => {
    setSelectedAddressId(addr.id)
    setForm((f) => ({
      ...f,
      name: addr.fullName || f.name,
      phone: addr.phone || f.phone,
      whatsapp: addr.phone || f.whatsapp,
      house: addr.addressLine1 || f.house,
      street: addr.addressLine2 || f.street,
      city: addr.city || f.city,
      district: addr.district || f.district,
      state: addr.state || f.state,
      pincode: addr.postalCode || f.pincode,
    }))
    setErrors({})
    setError('')
  }

  const loadCashfreeScript = () => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.Cashfree) {
        return resolve(true)
      }
      const existingScript = document.getElementById('cashfree-sdk')
      if (existingScript) {
        existingScript.onload = () => resolve(true)
        existingScript.onerror = () => resolve(false)
        return
      }
      const script = document.createElement('script')
      script.id = 'cashfree-sdk'
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'
      script.async = true
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault()
    setError('')

    // 1. Verify cart is not empty
    if (!cart || cart.length === 0) {
      setError('Your shopping bag is empty. Please add pieces from our collection before proceeding to checkout.')
      return
    }

    if (!checkoutMethodsLoaded) {
      setError('Please wait while we check the available checkout methods.')
      return
    }
    if ((paymentMethod === 'CASHFREE' && !checkoutMethods.pay_online_enabled)
      || (paymentMethod === 'WHATSAPP' && !checkoutMethods.whatsapp_order_enabled)
      || !paymentMethod) {
      setError('That checkout method is no longer available. Please choose an enabled method.')
      return
    }

    // Comprehensive client validation
    const validation = validateAddress(form, { requireDistrict: false })
    if (!validation.isValid) {
      setErrors(validation.errors)
      setTouched({
        name: true,
        phone: true,
        whatsapp: true,
        email: true,
        house: true,
        street: true,
        city: true,
        district: true,
        state: true,
        pincode: true,
      })
      const firstErr = Object.values(validation.errors)[0]
      setError(firstErr || 'Please check the highlighted delivery details.')
      const firstKey = Object.keys(validation.errors)[0]
      const el = document.getElementById(`checkout-${firstKey}`)
      if (el) el.focus()
      return
    }

    setSubmitting(true)
    setError('')

    const reval = await revalidateCart()
    if (!reval?.valid) {
      setError('Your shopping bag has been updated because piece availability or pricing changed. Please review your bag.')
      setSubmitting(false)
      return
    }

    // ==========================================
    // FLOW 1: PAY ONLINE (CASHFREE GATEWAY)
    // ==========================================
    if (paymentMethod === 'CASHFREE' || paymentMethod === 'RAZORPAY') {
      try {
        const scriptLoaded = await loadCashfreeScript()
        if (!scriptLoaded || typeof window.Cashfree === 'undefined') {
          throw new Error('Unable to start secure payment. Please check your internet connection or use WhatsApp Concierge.')
        }

        // 1. Create order on backend (authoritative stock, prices, address validation)
        const res = await api('/orders', {
          method: 'POST',
          body: {
            customer: validation.sanitized,
            items: cart.map((it) => {
              if (it.is_combo) {
                return {
                  is_combo: true,
                  combo_id: it.combo_id,
                  product_id: it.combo_id,
                  product_name: it.product_name || it.combo_name,
                  quantity: it.quantity,
                  components: it.components || [],
                }
              }
              return {
                product_id: it.product_id,
                product_name: it.product_name,
                size: it.size || 'Free Size',
                quantity: it.quantity,
              }
            }),
            coupon_code: coupon?.code,
            payment_method: 'CASHFREE',
          },
        })

        if (!res?.ok || !res?.cashfree?.payment_session_id) {
          throw new Error(res?.error || 'Online payment is temporarily unavailable. Please try again later.')
        }

        const placedOrder = res.order
        const cfData = res.cashfree
        const cfEnv = cfData?.mode || process.env.NEXT_PUBLIC_CASHFREE_ENV || 'production'

        // 2. Initialize Cashfree JS SDK
        const cashfree = window.Cashfree({
          mode: cfEnv,
        })

        // 3. Launch Cashfree Checkout Modal
        cashfree.checkout({
          paymentSessionId: cfData.payment_session_id,
          redirectTarget: '_modal',
        }).then(async (result) => {
          if (result?.error) {
            // User closed the modal or cancelled
            setPaymentProcessing(false)
            setSubmitting(false)
            setError(result.error.message || 'Payment window closed. Your items remain saved in your bag so you can complete your order anytime.')
            return
          }

          if (result?.paymentDetails || result?.redirect) {
            setSubmitting(true)
            setPaymentProcessing(true)
            setProcessingMessage('Payment received! Verifying transaction with Cashfree…')

            try {
              let verified = false
              let attempts = 0
              let lastStatus = 'PENDING'
              let finalOrder = placedOrder

              while (!verified && attempts < 6) {
                attempts++
                const verifyRes = await api('/payments/cashfree/verify', {
                  method: 'POST',
                  body: {
                    order_id: placedOrder.id,
                    cashfree_order_id: cfData.order_id,
                  },
                })

                if (verifyRes?.verified && verifyRes?.payment_status === 'PAID') {
                  verified = true
                  finalOrder = verifyRes.order || placedOrder
                  setProcessingMessage('Order confirmed! Opening your confirmation receipt…')
                  setCompletedOrder(finalOrder)
                  clearCart()
                  const orderDest = `/order/${finalOrder.order_number || finalOrder.id}`
                  router.replace(orderDest)
                  return
                }

                lastStatus = verifyRes?.payment_status || 'PENDING'
                if (verifyRes?.payment_status === 'FAILED' || verifyRes?.payment_status === 'USER_DROPPED' || verifyRes?.payment_status === 'CANCELLED') {
                  throw new Error(verifyRes?.error || 'Your payment could not be completed. Please try again.')
                }

                if (attempts < 6) {
                  await new Promise((r) => setTimeout(r, 600))
                }
              }

              // Keep the bag and never present an unverified payment as success.
              if (lastStatus === 'PENDING') {
                setPendingVerification({ order: finalOrder, cashfreeOrderId: cfData.order_id })
                setPendingPaymentMessage('Cashfree is still confirming your payment. Your bag is saved and no success receipt will be shown until confirmation.')
                setPaymentProcessing(false)
                setSubmitting(false)
                return
              }
            } catch (err) {
              if (lastStatus === 'PENDING') {
                setPendingVerification({ order: placedOrder, cashfreeOrderId: cfData.order_id })
                setPendingPaymentMessage('We have not yet received final confirmation from Cashfree. Your bag is saved; check payment status before trying again.')
                setPaymentProcessing(false)
                setSubmitting(false)
              } else {
                setPaymentProcessing(false)
                setSubmitting(false)
                setError(err.message || 'Your payment could not be completed. Please try again.')
              }
            }
          }
        }).catch((err) => {
          setPaymentProcessing(false)
          setSubmitting(false)
          setError(err?.message || 'Your payment could not be completed. Please try again.')
        })
      } catch (err) {
        handleCheckoutMethodUnavailable(err)
        setPaymentProcessing(false)
        setSubmitting(false)
        setError(err.message || 'Online payment is temporarily unavailable. Please try again later.')
      }
      return
    }

    // ==========================================
    // FLOW 2: WHATSAPP CONCIERGE ORDER
    // ==========================================
    try {
      const res = await api('/orders', {
        method: 'POST',
        body: {
          customer: validation.sanitized,
          items: cart.map((it) => {
            if (it.is_combo) {
              return {
                is_combo: true,
                combo_id: it.combo_id,
                product_id: it.combo_id,
                product_name: it.product_name || it.combo_name,
                quantity: it.quantity,
                components: it.components || [],
              }
            }
            return {
              product_id: it.product_id,
              product_name: it.product_name,
              size: it.size || 'Free Size',
              quantity: it.quantity,
            }
          }),
          coupon_code: coupon?.code,
          payment_method: 'WHATSAPP_CONCIERGE',
        },
      })

      if (!res?.ok || !res?.order) {
        throw new Error(res?.error || 'Failed to create concierge order.')
      }

      const placedOrder = res.order
      setCompletedOrder(placedOrder)

      // Open WhatsApp with rich message
      if (res?.whatsapp?.url) {
        window.open(res.whatsapp.url, '_blank')
      }

      clearCart()
      router.replace(`/order/${placedOrder.order_number || placedOrder.id}`)
    } catch (err) {
      handleCheckoutMethodUnavailable(err)
      setError(err.message || 'Failed to process WhatsApp order. Please try again.')
      setSubmitting(false)
    }
  }

  const checkPendingPayment = async () => {
    if (!pendingVerification || checkingPayment) return
    setCheckingPayment(true)
    setPendingPaymentMessage('Checking the payment directly with Cashfree…')
    try {
      const result = await api('/payments/cashfree/verify', {
        method: 'POST',
        body: { order_id: pendingVerification.order.id, cashfree_order_id: pendingVerification.cashfreeOrderId },
      })
      if (result?.verified && result.payment_status === 'PAID') {
        const paidOrder = result.order || pendingVerification.order
        setCompletedOrder(paidOrder)
        setPendingVerification(null)
        clearCart()
        router.replace(`/order/${paidOrder.order_number || paidOrder.id}`)
        return
      }
      if (['FAILED', 'USER_DROPPED', 'CANCELLED', 'EXPIRED'].includes(String(result?.payment_status || '').toUpperCase())) {
        setPendingPaymentMessage('Cashfree reports that this payment was not completed. Your bag is saved; return to checkout to try again.')
      } else {
        setPendingPaymentMessage('Cashfree has not confirmed the payment yet. Your order and bag are saved; check again shortly.')
      }
    } catch {
      setPendingPaymentMessage('We could not reach Cashfree just now. Your payment is not marked successful; please check again shortly.')
    } finally {
      setCheckingPayment(false)
    }
  }

  // 1. Payment Processing Full-Page Screen (Prevents empty bag flash during Cashfree redirect/verification)
  if (pendingVerification) {
    const paymentFailed = /not completed/.test(pendingPaymentMessage)
    return (
      <div className="container py-24 text-center max-w-lg mx-auto space-y-5">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 border border-amber-200 text-amber-800"><Clock className="h-8 w-8" /></div>
        <div><p className="text-[11px] uppercase tracking-[0.3em] text-amber-800 font-bold">Payment Verification Pending</p><h1 className="mt-1 font-display text-3xl sm:text-4xl text-ink">We’re checking your payment</h1><p className="mt-2 text-xs sm:text-sm text-cocoa leading-relaxed">{pendingPaymentMessage}</p></div>
        <p className="text-[11px] text-cocoa">Please do not submit another payment while this one is being checked.</p>
        <Button type="button" disabled={checkingPayment} onClick={checkPendingPayment} className="rounded-none bg-ink px-6 py-5 text-xs uppercase tracking-wider text-cream disabled:opacity-50">{checkingPayment ? 'Checking…' : 'Check payment status'}</Button>
        {paymentFailed && <Button type="button" variant="outline" onClick={() => setPendingVerification(null)} className="ml-2 rounded-none px-6 py-5 text-xs uppercase tracking-wider">Return to checkout</Button>}
      </div>
    )
  }

  if (paymentProcessing || (completedOrder && (!cart || cart.length === 0))) {
    return (
      <div className="container py-24 text-center max-w-lg mx-auto space-y-5">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 animate-pulse">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-mango-dark font-bold">
            {completedOrder ? 'Order Confirmed' : 'Verifying Payment'}
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl text-ink font-normal">
            Confirming Your Order…
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-cocoa leading-relaxed">
            {processingMessage || 'Please do not close or refresh this window while we secure your atelier pieces and prepare your order receipt.'}
          </p>
        </div>
        <div className="pt-2 flex justify-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="container py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading secure checkout…
        </p>
      </div>
    )
  }

  if (!cart || cart.length === 0) {
    return (
      <div className="container py-24 text-center">
        <h1 className="font-display text-4xl text-ink">Your bag is currently empty</h1>
        <p className="mt-2 text-sm text-cocoa">
          Add handcrafted atelier pieces to your shopping bag before proceeding to checkout.
        </p>
        <Button
          type="button"
          onClick={() => router.push('/shop')}
          className="mt-6 rounded-none bg-ink px-8 py-6 text-xs uppercase tracking-[0.2em] text-cream hover:bg-cocoa-dark shadow-md"
        >
          Explore Collections
        </Button>
      </div>
    )
  }

  return (
    <div className="container min-w-0 px-4 py-8 pb-4 sm:px-7 sm:py-16 sm:pb-0 lg:px-10">
      <div className="mb-8 flex flex-col gap-4 border-b border-ink/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-bold">
            Secure Checkout
          </p>
          <h1 className="mt-1 break-words font-display text-3xl font-normal text-ink sm:text-5xl">
            Finalize Your Order
          </h1>
        </div>
        <button
          type="button"
          onClick={() => router.push('/cart')}
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cocoa hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Bag
        </button>
      </div>

      {/* Customer Session Status Banner */}
      {isAuthenticated && user ? (
        <div className="mb-6 min-w-0 p-4 bg-paper border border-gold/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-sans text-cocoa shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-gold/15 text-gold-dark grid place-items-center font-bold text-xs">
              {(user.name || user.email || 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0 break-words">
              <span className="text-ink font-semibold">{user.name || user.email}</span>
              <span className="text-cocoa-light ml-1.5 break-all">({user.email})</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-gold-dark font-bold">
              ✓ Atelier Account Active
            </span>
            <Link
              href="/account"
              className="text-[11px] font-semibold uppercase tracking-wider text-ink hover:underline"
            >
              Manage Addresses →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-6 min-w-0 p-4 bg-paper border border-ink/15 rounded-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-3">
            <div>
              <p className="text-xs font-semibold text-ink">Already have an atelier account?</p>
              <p className="text-[11px] text-cocoa-light">Sign in to instantly use your saved delivery addresses and track orders.</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/auth/google/url?redirect_to=${encodeURIComponent('/checkout')}`}
                onClick={handleGoogleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink/20 text-ink bg-cream hover:border-ink text-xs font-semibold uppercase tracking-wider transition"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
                {googleLoading ? 'Connecting…' : 'Google'}
              </a>
              <Link
                href="/login?redirect_to=/checkout"
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-ink/20 text-ink bg-cream hover:border-ink text-xs font-semibold uppercase tracking-wider transition"
              >
                Sign In
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-cocoa">
            <span className="font-medium text-ink">New to Thretha?</span>
            <span className="text-cocoa-light">✦ Fast Guest Checkout — No account required to complete order</span>
          </div>
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid min-w-0 gap-6 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left Form Column */}
        <div className="min-w-0 space-y-6 sm:space-y-8">
          {/* Step 1: Customer Contact */}
          <div className="min-w-0 bg-cream p-4 sm:p-8 border border-ink/10 rounded-sm shadow-xs space-y-4">
            <div className="flex flex-col gap-2 border-b border-ink/10 pb-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
              <h2 className="min-w-0 font-display text-xl text-ink font-normal flex items-center gap-2 sm:text-2xl">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-cream text-xs font-sans font-bold">1</span>
                Contact Information
              </h2>
              <span className="text-[10px] uppercase tracking-wider text-cocoa-light font-medium">Step 1 of 3</span>
            </div>

            <Field
              id="checkout-name"
              label="Full Name"
              placeholder="e.g. Ananya Menon"
              required
              value={form.name}
              onChange={setField('name')}
              onBlur={() => handleBlur('name')}
              error={errors.name || errors.fullName}
              touched={touched.name || touched.fullName}
            />

            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="checkout-phone"
                label="WhatsApp / Mobile Number"
                placeholder="e.g. 9876543210"
                required
                type="tel"
                inputMode="numeric"
                value={form.phone || form.whatsapp || ''}
                onChange={setField('phone')}
                onBlur={() => handleBlur('phone')}
                error={errors.phone || errors.whatsapp}
                touched={touched.phone || touched.whatsapp}
              />
              <Field
                id="checkout-email"
                label="Email Address"
                placeholder="ananya@example.com"
                type="email"
                required
                disabled={Boolean(user)}
                value={user ? user.email : form.email}
                onChange={user ? undefined : setField('email')}
                onBlur={user ? undefined : () => handleBlur('email')}
                error={errors.email}
                touched={touched.email}
                helper={user ? 'Verified atelier account email' : undefined}
              />
            </div>
          </div>

          {/* Step 2: Shipping Address */}
          <div className="min-w-0 bg-cream p-4 sm:p-8 border border-ink/10 rounded-sm shadow-xs space-y-4">
            <div className="flex flex-col gap-2 border-b border-ink/10 pb-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
              <h2 className="min-w-0 font-display text-xl text-ink font-normal flex items-center gap-2 sm:text-2xl">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-cream text-xs font-sans font-bold">2</span>
                Delivery Address
              </h2>
              <span className="text-[10px] uppercase tracking-wider text-cocoa-light font-medium">Step 2 of 3</span>
            </div>

            {/* Saved Addresses Picker (if authenticated customer has addresses) */}
            {savedAddresses.length > 0 && (
              <div className="space-y-2 pb-2">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-cocoa-light">
                  Use Saved Atelier Address:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {savedAddresses.map((addr) => {
                    const isSelected = selectedAddressId === addr.id
                    return (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => handleSelectSavedAddress(addr)}
                        className={cn(
                          'text-left p-3 border rounded-sm transition flex flex-col justify-between',
                          isSelected
                            ? 'border-ink bg-paper shadow-xs ring-1 ring-ink'
                            : 'border-ink/15 bg-cream hover:border-ink/40'
                        )}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-xs text-ink uppercase tracking-wider">
                            {addr.label || 'Home'} {addr.isDefault && <span className="text-[9px] text-mango-dark font-semibold">· Default</span>}
                          </span>
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-ink shrink-0" />}
                        </div>
                        <p className="text-[11px] text-cocoa font-sans line-clamp-2">
                          {addr.fullName}, {addr.addressLine1}, {addr.city} — {addr.postalCode}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="checkout-house"
                label="House / Building / Apartment"
                placeholder="House Name, Flat 4B"
                required
                value={form.house}
                onChange={setField('house')}
                onBlur={() => handleBlur('house')}
                error={errors.house || errors.addressLine1}
                touched={touched.house || touched.addressLine1}
              />
              <Field
                id="checkout-street"
                label="Street / Landmark"
                placeholder="Near Post Office, Marine Drive"
                value={form.street}
                onChange={setField('street')}
                onBlur={() => handleBlur('street')}
                error={errors.street || errors.addressLine2}
                touched={touched.street || touched.addressLine2}
              />
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <Field
                id="checkout-city"
                label="City / Town"
                placeholder="e.g. Kochi"
                required
                value={form.city}
                onChange={setField('city')}
                onBlur={() => handleBlur('city')}
                error={errors.city}
                touched={touched.city}
              />
              <Field
                id="checkout-district"
                label="District"
                placeholder="Ernakulam"
                value={form.district}
                onChange={setField('district')}
                onBlur={() => handleBlur('district')}
                error={errors.district}
                touched={touched.district}
              />
              <div>
                <Label htmlFor="checkout-state" className="text-[11px] font-semibold uppercase tracking-wider text-ink/75 flex items-center justify-between">
                  <span>State <span className="text-coral">*</span></span>
                </Label>
                <select
                  id="checkout-state"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  onBlur={() => handleBlur('state')}
                  className="mt-1 w-full bg-cream border border-ink/20 px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-mango rounded-none transition"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                id="checkout-pincode"
                label="PIN Code"
                placeholder="682001"
                required
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={form.pincode}
                onChange={setField('pincode')}
                onBlur={() => handleBlur('pincode')}
                error={errors.pincode || errors.postalCode}
                touched={touched.pincode || touched.postalCode}
              />
            </div>
          </div>

          {/* Step 3: Payment Method Selection */}
          <div className="min-w-0 bg-cream p-4 sm:p-8 border border-ink/10 rounded-sm shadow-xs space-y-4">
            <div className="flex flex-col gap-2 border-b border-ink/10 pb-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
              <h2 className="min-w-0 font-display text-xl text-ink font-normal flex items-center gap-2 sm:text-2xl">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-cream text-xs font-sans font-bold">3</span>
                Payment Preference
              </h2>
              <span className="text-[10px] uppercase tracking-wider text-cocoa-light font-medium">Step 3 of 3</span>
            </div>

            {checkoutMethodsLoaded ? <RadioGroup
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              className="grid min-w-0 gap-3 pt-2 sm:grid-cols-2"
            >
              {checkoutMethods.whatsapp_order_enabled && <label
                className={cn(
                  'min-w-0 cursor-pointer border p-3 sm:p-4 rounded-sm transition flex flex-col justify-between',
                  paymentMethod === 'WHATSAPP'
                    ? 'border-[#25D366] bg-emerald-50/50 shadow-sm ring-1 ring-[#25D366]'
                    : 'border-ink/15 bg-paper hover:border-ink/40'
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <RadioGroupItem value="WHATSAPP" id="pm-wa" />
                    <span className="min-w-0 break-words font-bold text-xs text-ink uppercase tracking-wider">
                      Place Order on WhatsApp
                    </span>
                  </div>
                  <WAIcon className="h-4 w-4 shrink-0 text-[#25D366]" />
                </div>
                <p className="mt-2 text-[11px] text-cocoa leading-relaxed font-sans">
                  Send your order to our team and confirm availability, fittings, and payment on WhatsApp.
                </p>
              </label>}

              {checkoutMethods.pay_online_enabled && <label
                className={cn(
                  'min-w-0 cursor-pointer border p-3 sm:p-4 rounded-sm transition flex flex-col justify-between',
                  paymentMethod === 'CASHFREE'
                    ? 'border-mango bg-mango-light/30 shadow-sm ring-1 ring-mango'
                    : 'border-ink/15 bg-paper hover:border-ink/40'
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <RadioGroupItem value="CASHFREE" id="pm-cf" />
                    <span className="min-w-0 break-words font-bold text-xs text-ink uppercase tracking-wider">
                      Pay Online
                    </span>
                  </div>
                  <CreditCard className="h-4 w-4 shrink-0 text-mango-dark" />
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap gap-2 text-[10px] text-cocoa leading-relaxed font-sans" aria-label="Supported payment methods: UPI, cards, and net banking">
                  <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-sm border border-ink/10 bg-cream px-2 py-1 font-semibold"><Smartphone className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />UPI</span>
                  <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-sm border border-ink/10 bg-cream px-2 py-1 font-semibold"><CreditCard className="h-3.5 w-3.5 shrink-0 text-blue-700" aria-hidden="true" />Credit &amp; debit cards</span>
                  <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-sm border border-ink/10 bg-cream px-2 py-1 font-semibold"><Landmark className="h-3.5 w-3.5 shrink-0 text-cocoa" aria-hidden="true" />Net banking</span>
                </div>
                <p className="mt-2 text-[10px] text-cocoa-light">Secure payment is processed by Cashfree. Available options appear in the payment window.</p>
              </label>}
              {!checkoutMethods.pay_online_enabled && !checkoutMethods.whatsapp_order_enabled && (
                <p role="alert" className="text-xs font-medium text-coral">Checkout is temporarily unavailable. Please try again shortly.</p>
              )}
            </RadioGroup> : <p role="status" className="pt-2 text-xs text-cocoa-light">Checking available payment methods…</p>}
          </div>
        </div>

        {/* Right Summary Column */}
        <aside className="h-fit min-w-0 space-y-6">
          <div className="min-w-0 bg-cream p-4 sm:p-8 border border-ink/10 rounded-sm shadow-sm space-y-6">
            <h3 className="break-words font-display text-xl text-ink font-normal sm:text-2xl">
              Order Review ({cartCount} {cartCount === 1 ? 'item' : 'items'})
            </h3>

            {/* Items List */}
            <div className="space-y-4 max-h-64 overflow-y-auto pr-1 border-b border-ink/10 pb-4 hide-scrollbar">
              {cart.map((item, idx) => (
                <div key={idx} className="flex min-w-0 gap-3 text-xs">
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-sm bg-sand/30 border border-ink/10">
                    {item.image ? (
                      <img src={item.image} alt={item.product_name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-[9px] text-cocoa-light">Item</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="min-w-0 whitespace-normal break-words font-semibold text-ink flex items-start gap-1">
                        {item.is_combo && <Sparkles className="h-3 w-3 text-mango-dark shrink-0" />}
                        <span className="min-w-0 break-words">{item.combo_name || item.product_name}</span>
                      </p>
                      {item.is_combo ? (
                        <div className="space-y-0.5 mt-0.5">
                          <p className="text-[10px] text-mango-dark font-medium">Curated Ensemble ({item.quantity}x)</p>
                          {Array.isArray(item.components) && item.components.length > 0 && (
                          <p className="text-[9px] text-cocoa whitespace-normal break-words">
                              {item.components.map((c) => `${c.product_name} (${c.size || 'Free Size'})`).join(', ')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-cocoa-light">
                          Size: {item.size || 'Free Size'} · Qty: {item.quantity}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 font-semibold text-ink">{inr(item.price * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Promo Code Section */}
            <div className="space-y-2 border-b border-ink/10 pb-4">
              <label className="text-[11px] uppercase tracking-wider font-bold text-ink flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-mango-dark" />
                <span>Promo Code</span>
              </label>

              {coupon ? (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xs text-xs font-semibold text-emerald-800">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 break-words">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span>
                      <strong>{coupon.code}</strong> applied{' '}
                      {coupon.type === 'free_delivery' || coupon.discountType === 'free_delivery' || (discountAmount === 0 && isFreeShipping)
                        ? '— Free Delivery'
                        : `(-${inr(discountAmount)})`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={removePromoCode}
                    className="text-xs uppercase tracking-wider text-coral hover:underline font-bold ml-2"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 gap-2">
                  <Input
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value)
                      if (couponError) setCouponError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyPromoCode()
                      }
                    }}
                    placeholder="Enter coupon code"
                    className="min-w-0 flex-1 rounded-none border-ink/20 bg-paper text-xs uppercase tracking-wider focus-visible:border-mango"
                  />
                  <Button
                    type="button"
                    onClick={applyPromoCode}
                    disabled={couponLoading || !couponInput.trim()}
                    className="shrink-0 rounded-none bg-ink text-cream text-xs uppercase tracking-wider px-3 sm:px-4 font-semibold hover:bg-cocoa-dark"
                  >
                    {couponLoading ? 'Checking…' : 'Apply'}
                  </Button>
                </div>
              )}

              {couponError && (
                <p className="text-[11px] text-coral font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {couponError}
                </p>
              )}
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2.5 text-xs border-b border-ink/10 pb-4">
              <div className="flex justify-between text-cocoa">
                <span>Subtotal</span>
                <span className="font-bold text-ink">{inr(cartSubtotal)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-plum font-semibold">
                  <span>Discount ({coupon?.code})</span>
                  <span>-{inr(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-cocoa">
                <span>Shipping</span>
                <span className="font-semibold text-ink">
                  {isFreeShipping ? <span className="text-emerald-700 font-bold">FREE</span> : inr(shippingCharge)}
                </span>
              </div>
            </div>

            {/* Total */}
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="font-display text-base text-ink sm:text-xl">Total Payable</span>
              <span className="shrink-0 font-display text-2xl font-semibold text-ink sm:text-3xl">{inr(cartTotal)}</span>
            </div>

            {error && (
              <div className="p-3 bg-coral-light border border-coral/40 text-xs text-coral-dark font-medium rounded-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={submitting || !checkoutMethodsLoaded || !paymentMethod}
              className={cn(
                'w-full max-w-full rounded-none py-6 text-xs uppercase tracking-[0.12em] sm:tracking-[0.22em] font-semibold text-white shadow-lg transition flex items-center justify-center gap-2',
                paymentMethod === 'WHATSAPP'
                  ? 'bg-[#25D366] hover:bg-[#1eb457]'
                  : 'bg-ink hover:bg-cocoa-dark'
              )}
            >
              {submitting ? (
                paymentMethod === 'WHATSAPP' ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Opening WhatsApp…</span>
                  </>
                ) : (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>SECURING PAYMENT…</span>
                  </>
                )
              ) : paymentMethod === 'WHATSAPP' ? (
                <>
                  <WAIcon className="h-4 w-4" />
                  <span>Order on WhatsApp →</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Place Order Securely →</span>
                </>
              )}
            </Button>

            <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-cocoa-light">
              <ShieldCheck className="h-4 w-4 text-teal" />
              <span>Encrypted & 100% Secure Checkout</span>
            </div>
          </div>
        </aside>
      </form>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <StoreLayout>
      <ErrorBoundary sectionName="Checkout">
        <CheckoutInner />
      </ErrorBoundary>
    </StoreLayout>
  )
}
