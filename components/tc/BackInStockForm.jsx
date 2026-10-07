'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { api } from '@/lib/tc'

export default function BackInStockForm({ product, size }) {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setConsent(false)
    setMessage('')
    setError('')
  }, [product.slug, size])

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const result = await api('/back-in-stock/subscribe', { method: 'POST', body: { product_slug: product.slug, size: size || '', email, consent } })
      setMessage(result.message || 'We will email you when it is available.')
    } catch (err) { setError(err.message || 'Could not save your stock alert.') }
    finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="border border-ink/10 bg-sand/20 p-4">
    <div className="flex items-center gap-2"><Bell size={15} className="text-mango-dark" /><p className="text-[10px] font-bold uppercase tracking-wider text-ink">Notify me when available</p></div>
    <p className="mt-1 text-xs text-cocoa">{size ? `${size} will be selected for this alert.` : 'We will send one email when this piece is back in stock.'}</p>
    <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-cocoa"><input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-ink" /><span>I agree to receive one email when this item becomes available. I can unsubscribe at any time.</span></label>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email address" className="min-h-10 min-w-0 flex-1 border border-ink/15 bg-paper px-3 text-xs" /><button disabled={busy || !consent} className="min-h-10 bg-ink px-4 text-[10px] font-bold uppercase tracking-wider text-cream disabled:opacity-50">{busy ? 'Saving…' : 'Notify Me'}</button></div>
    {message && <p role="status" className="mt-2 text-xs text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-2 text-xs text-coral">{error}</p>}
  </form>
}
