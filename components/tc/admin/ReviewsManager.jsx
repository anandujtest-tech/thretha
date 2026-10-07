'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { auth, api } from '@/lib/tc'

export default function ReviewsManager() {
  const [reviews, setReviews] = useState([])
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const token = auth.get()

  const load = () => {
    setLoading(true); setError('')
    api(`/admin/reviews?status=${encodeURIComponent(status)}`, { token }).then(setReviews).catch((err) => setError(err.message || 'Could not load reviews.')).finally(() => setLoading(false))
  }
  useEffect(load, [status])

  const moderate = async (review, update) => {
    try {
      await api(`/admin/reviews/${encodeURIComponent(review.id)}`, { method: 'PATCH', body: update, token })
      load()
    } catch (err) { setError(err.message || 'Could not update review.') }
  }

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-4"><div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Customer feedback</p><h1 className="mt-1 font-display text-3xl text-ink">Product Reviews</h1></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 border border-ink/15 bg-cream px-3 text-xs"><option value="all">All reviews</option>{['pending', 'approved', 'rejected', 'hidden'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></div>
    {error && <p role="alert" className="border border-coral/20 bg-coral-light/20 p-3 text-xs text-coral">{error}</p>}
    {loading ? <p className="py-12 text-center text-xs text-cocoa">Loading reviews…</p> : reviews.length === 0 ? <p className="border border-ink/10 bg-cream p-8 text-center text-sm text-cocoa-light">No reviews in this view.</p> : <div className="space-y-3">{reviews.map((review) => <article key={review.id} className="grid gap-4 border border-ink/10 bg-cream p-4 sm:grid-cols-[1fr_auto]">
      <div className="flex gap-4">{review.photo_url && <Image src={review.photo_url} alt="Customer submitted review" width={100} height={120} className="h-28 w-20 shrink-0 object-cover" />}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-ink">{review.product_name || review.product_slug}</strong><span className="text-xs text-gold-dark">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><span className="rounded-full bg-sand px-2 py-0.5 text-[9px] uppercase">{review.status}</span>{review.verified_purchase && <span className="text-[9px] font-bold uppercase text-emerald-800">Verified</span>}</div><p className="mt-1 text-[10px] text-cocoa">{review.customer_name} · Order {review.order_number} · {new Date(review.created_at).toLocaleString()}</p><p className="mt-3 whitespace-pre-wrap text-sm text-cocoa">{review.text}</p></div></div>
      <div className="flex flex-wrap items-start gap-2 sm:justify-end">{review.status !== 'approved' && <button onClick={() => moderate(review, { status: 'approved' })} className="border border-emerald-800/30 px-3 py-2 text-[10px] font-bold uppercase text-emerald-900">Approve</button>}{review.status !== 'rejected' && <button onClick={() => moderate(review, { status: 'rejected' })} className="border border-ink/20 px-3 py-2 text-[10px] font-bold uppercase text-cocoa">Reject</button>}{review.photo_url && <button onClick={() => moderate(review, { remove_photo: true })} className="border border-ink/20 px-3 py-2 text-[10px] font-bold uppercase text-cocoa">Remove photo</button>}<button onClick={() => moderate(review, { status: 'hidden' })} className="border border-coral/30 px-3 py-2 text-[10px] font-bold uppercase text-coral">Hide</button></div>
    </article>)}</div>}
  </section>
}
