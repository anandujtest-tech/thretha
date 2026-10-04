'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, inr } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { Check, MessageCircle, Sparkles, ShieldCheck, AlertCircle } from 'lucide-react'
import { INDIAN_STATES, validateAddress } from '@/lib/addressValidation'

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
  error,
  touched,
  className,
}) {
  const hasError = Boolean(touched && error)
  const inputId = id || `ordermodal-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

  return (
    <div className={className}>
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
        placeholder={placeholder}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        className={cn(
          'mt-1 rounded-none bg-cream text-xs focus-visible:ring-mango/20 transition',
          hasError
            ? 'border-coral focus-visible:border-coral bg-coral-light/10'
            : 'border-ink/20 focus-visible:border-mango'
        )}
      />
      {hasError && (
        <p id={`${inputId}-error`} className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

export default function OrderModal({ open, onOpenChange, product, size, qty = 1, settings }) {
  const [form, setForm] = useState({
    name: '',
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const setField = (key) => (e) => {
    const val = e.target.value
    setForm((f) => ({ ...f, [key]: val }))
    if (touched[key]) {
      const updated = { ...form, [key]: val }
      const res = validateAddress(updated, { requireDistrict: false })
      if (!res.errors[key]) {
        setErrors((errs) => {
          const next = { ...errs }
          delete next[key]
          return next
        })
      }
    }
  }

  const handleBlur = (field) => {
    setTouched((t) => ({ ...t, [field]: true }))
    const res = validateAddress(form, { requireDistrict: false })
    if (res.errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: res.errors[field] }))
    } else {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const price = product?.discount_price || product?.price || 0
  const total = price * qty

  const submitOrder = async () => {
    setError('')

    const validation = validateAddress(form, { requireDistrict: false })
    if (!validation.isValid) {
      setErrors(validation.errors)
      setTouched({
        name: true,
        whatsapp: true,
        phone: true,
        house: true,
        street: true,
        city: true,
        district: true,
        state: true,
        pincode: true,
      })
      const firstErr = Object.values(validation.errors)[0]
      setError(firstErr || 'Please provide valid address details.')
      const firstKey = Object.keys(validation.errors)[0]
      const el = document.getElementById(`ordermodal-${firstKey}`)
      if (el) el.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await api('/orders', {
        method: 'POST',
        body: {
          customer: validation.sanitized,
          item: {
            product_id: product.id,
            size: size || 'Free Size',
            quantity: qty,
          },
        },
      })
      if (res?.whatsapp?.url) {
        window.open(res.whatsapp.url, '_blank')
      }
      onOpenChange(false)
    } catch (e) {
      setError(e.message || 'Failed to place order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-paper p-6 sm:p-8 sm:max-w-lg border border-ink/15 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <WAIcon className="h-3.5 w-3.5" />
            </span>
            <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-800 font-semibold">
              WhatsApp Concierge Order
            </p>
          </div>
          <DialogTitle className="mt-1 font-display text-3xl sm:text-4xl text-ink font-normal">
            Make It Yours
          </DialogTitle>
          <DialogDescription className="text-xs text-cocoa">
            Complete delivery details to initiate WhatsApp order confirmation with our atelier.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Order recap box */}
          <div className="border border-ink/15 bg-cream/90 p-4 rounded-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light mb-2">
              Selected Atelier Piece
            </p>
            <div className="flex justify-between text-sm font-semibold text-ink">
              <span>{product?.name}</span>
              <span className="font-display text-lg">{inr(total)}</span>
            </div>
            <p className="mt-1 text-xs text-cocoa">
              Size: <span className="font-semibold text-ink">{size || 'Free Size'}</span> · Qty: {qty} · SKU: {product?.sku}
            </p>
          </div>

          <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-ink pt-2 flex items-center gap-1.5">
            <span>1. Contact Details</span>
          </p>
          <Field
            id="ordermodal-name"
            label="Full Name"
            placeholder="e.g. Ananya Menon"
            required
            value={form.name}
            onChange={setField('name')}
            onBlur={() => handleBlur('name')}
            error={errors.name || errors.fullName}
            touched={touched.name || touched.fullName}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="ordermodal-phone"
              label="WhatsApp Number"
              placeholder="e.g. 9876543210"
              required
              type="tel"
              inputMode="numeric"
              value={form.whatsapp}
              onChange={(e) => {
                setField('whatsapp')(e)
                setField('phone')(e)
              }}
              onBlur={() => handleBlur('phone')}
              error={errors.whatsapp || errors.phone}
              touched={touched.whatsapp || touched.phone}
            />
            <Field
              id="ordermodal-alternatePhone"
              label="Alternate Phone"
              placeholder="Optional"
              type="tel"
              inputMode="numeric"
              value={form.phone !== form.whatsapp ? form.phone : ''}
              onChange={setField('phone')}
              onBlur={() => handleBlur('phone')}
            />
          </div>

          <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-ink pt-3">
            2. Delivery Address
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="ordermodal-house"
              label="House / Flat / Building"
              placeholder="House name, Apt no"
              required
              value={form.house}
              onChange={setField('house')}
              onBlur={() => handleBlur('house')}
              error={errors.house || errors.addressLine1}
              touched={touched.house || touched.addressLine1}
            />
            <Field
              id="ordermodal-street"
              label="Street / Locality"
              placeholder="Street name, landmark"
              value={form.street}
              onChange={setField('street')}
              onBlur={() => handleBlur('street')}
              error={errors.street || errors.addressLine2}
              touched={touched.street || touched.addressLine2}
            />
            <Field
              id="ordermodal-city"
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
              id="ordermodal-district"
              label="District"
              placeholder="e.g. Ernakulam"
              value={form.district}
              onChange={setField('district')}
              onBlur={() => handleBlur('district')}
              error={errors.district}
              touched={touched.district}
            />
            <div>
              <Label htmlFor="ordermodal-state" className="text-[11px] font-semibold uppercase tracking-wider text-ink/75 flex items-center justify-between">
                <span>State <span className="text-coral">*</span></span>
              </Label>
              <select
                id="ordermodal-state"
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
              id="ordermodal-pincode"
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

          {error && (
            <div className="rounded-none bg-coral-light border border-coral/40 p-3 text-xs text-coral-dark font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-coral" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-3">
            <Button
              onClick={submitOrder}
              disabled={submitting}
              className="w-full rounded-none bg-[#25D366] py-6 text-xs uppercase tracking-[0.22em] text-white hover:bg-[#1eb457] shadow-lg font-semibold flex items-center justify-center gap-2"
            >
              <WAIcon className="h-4 w-4" />
              {submitting ? 'Connecting Concierge…' : 'Confirm & Chat on WhatsApp →'}
            </Button>
            <p className="mt-2 text-center text-[10px] text-cocoa-light leading-relaxed">
              ✦ No immediate online payment required. You will confirm your custom order, address and payment option directly with the Thretha team on WhatsApp.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
