'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Star, Upload, X } from 'lucide-react'
import { api } from '@/lib/tc'
import { useAuth } from './AuthContext'

function Stars({ value, interactive = false, onChange }) {
  return <div className="flex items-center gap-1" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" disabled={!interactive} onClick={() => onChange?.(star)} aria-label={`${star} star${star === 1 ? '' : 's'}`} className={interactive ? 'cursor-pointer' : 'cursor-default'}><Star size={interactive ? 22 : 15} className={star <= value ? 'fill-gold-dark text-gold-dark' : 'text-ink/20'} /></button>)}
  </div>
}

async function uploadReviewPhoto(file, { productSlug, orderNumber }) {
  const signature = await api('/reviews/photo/signature', { method: 'POST', body: { product_slug: productSlug, order_number: orderNumber } })
  const body = new FormData()
  body.append('file', file)
  body.append('api_key', signature.api_key)
  body.append('timestamp', String(signature.timestamp))
  body.append('folder', signature.folder)
  body.append('signature', signature.signature)
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloud_name)}/image/upload`, { method: 'POST', body })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.error?.message || 'Photo upload failed.')
  const url = new URL(result.secure_url)
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') throw new Error('The uploaded photo URL is not secure.')
  return url.toString()
}

export default function ProductReviews({ product }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [orders, setOrders] = useState([])
  const [myReview, setMyReview] = useState(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    api(`/reviews?product=${encodeURIComponent(product.slug)}`).then((result) => { if (active) setData(result) }).catch(() => { if (active) setData(null) })
    if (isAuthenticated) {
      Promise.allSettled([api(`/reviews/eligible?product=${encodeURIComponent(product.slug)}`), api(`/reviews/mine?product=${encodeURIComponent(product.slug)}`)]).then(([orderResult, reviewResult]) => {
        if (!active) return
        const eligible = orderResult.status === 'fulfilled' && Array.isArray(orderResult.value?.orders) ? orderResult.value.orders : []
        setOrders(eligible)
        if (reviewResult.status === 'fulfilled') {
          const review = reviewResult.value?.review || null
          setMyReview(review)
          if (review) { setRating(review.rating); setText(review.text); setPhotoUrl(review.photo_url || ''); setOrderNumber(review.order_number || '') }
          else if (eligible[0]) setOrderNumber(eligible[0].order_number || eligible[0].id)
        } else if (eligible[0]) setOrderNumber(eligible[0].order_number || eligible[0].id)
      })
    }
    return () => { active = false }
  }, [product.id, product.slug, isAuthenticated])

  if (!data || data.enabled === false) return null

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setSuccess('')
    try {
      const response = await api(myReview ? `/reviews/${encodeURIComponent(myReview.id)}` : '/reviews', { method: myReview ? 'PATCH' : 'POST', body: { product_slug: product.slug, order_number: orderNumber, rating, text, photo_url: photoUrl || undefined } })
      if (response?.review) setMyReview({ ...response.review, rating, text, photo_url: photoUrl || null })
      else if (myReview) setMyReview({ ...myReview, status: 'pending', rating, text, photo_url: photoUrl || null })
      setSuccess('Thank you. Your review is awaiting moderation.')
      if (!myReview) { setText(''); setPhotoUrl('') }
    } catch (err) { setError(err.message || 'Could not submit your review.') }
    finally { setBusy(false) }
  }

  const onPhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return }
    setBusy(true); setError('')
    try { setPhotoUrl(await uploadReviewPhoto(file, { productSlug: product.slug, orderNumber })) }
    catch (err) { setError(err.message || 'Photo upload failed.') }
    finally { setBusy(false); event.target.value = '' }
  }

  const deleteMyReview = async () => {
    if (!myReview) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await api(`/reviews/${encodeURIComponent(myReview.id)}`, { method: 'DELETE' })
      setMyReview(null); setText(''); setPhotoUrl(''); setRating(5)
      setSuccess('Your review was removed.')
    } catch (err) { setError(err.message || 'Could not remove your review.') }
    finally { setBusy(false) }
  }

  return <section className="mt-16 border-t border-ink/10 pt-10" aria-labelledby="reviews-title">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mango-dark">Customer notes</p><h2 id="reviews-title" className="mt-1 font-display text-3xl text-ink">Reviews</h2></div>
      {data.count > 0 && <div className="flex items-center gap-2"><Stars value={Math.round(data.average)} /><strong className="text-lg text-ink">{data.average}</strong><span className="text-xs text-cocoa">({data.count} reviews)</span></div>}
    </div>
    {data.count > 0 && <div className="mt-5 max-w-md space-y-1.5" aria-label="Rating distribution">{data.distribution.map((row) => <div key={row.rating} className="flex items-center gap-3 text-xs"><span className="w-8">{row.rating} star</span><div className="h-1.5 flex-1 bg-ink/10"><div className="h-full bg-gold-dark" style={{ width: `${Math.round((row.count / data.count) * 100)}%` }} /></div><span className="w-6 text-right text-cocoa">{row.count}</span></div>)}</div>}
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <div className="space-y-5">
        {data.reviews.length ? data.reviews.map((review) => <article key={review.id} className="border-b border-ink/10 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><Stars value={review.rating} /><time className="text-[10px] text-cocoa-light">{new Date(review.created_at).toLocaleDateString()}</time></div>
          <p className="mt-2 text-xs font-semibold text-ink">{review.customer_name || 'Thretha customer'}{review.verified_purchase && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-emerald-800">Verified Purchase</span>}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-cocoa">{review.text}</p>
          {review.photo_url && <Image src={review.photo_url} alt={`Customer photo for ${product.name}`} width={320} height={400} className="mt-3 h-44 w-36 object-cover" />}
        </article>) : <p className="text-sm text-cocoa-light">No approved reviews yet. Your experience can help another customer.</p>}
      </div>
      <div className="h-fit border border-ink/10 bg-cream p-5">
        <h3 className="font-display text-2xl text-ink">Write a Review</h3>
        {authLoading ? <p className="mt-3 text-xs text-cocoa">Checking account…</p> : !isAuthenticated ? <p className="mt-3 text-xs leading-relaxed text-cocoa">Sign in with the account used for your completed purchase to review this piece. <Link href={`/login?redirect_to=${encodeURIComponent(`/product/${product.slug}`)}`} className="underline underline-offset-2">Sign in</Link></p> : orders.length === 0 && !myReview ? <p className="mt-3 text-xs leading-relaxed text-cocoa">Reviews are available to customers with a completed purchase of this piece.</p> : <form onSubmit={submit} className="mt-4 space-y-4">
          {!myReview && <label className="block text-[10px] font-bold uppercase tracking-wider text-ink">Your completed order<select value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} className="mt-1 block min-h-10 w-full border border-ink/15 bg-paper px-3 text-xs">{orders.map((order) => <option key={order.id} value={order.order_number || order.id}>{order.order_number || order.id}</option>)}</select></label>}
          {myReview && <p className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">Your review · {myReview.status}</p>}
          <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink">Your rating</p><Stars value={rating} interactive onChange={setRating} /></div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-ink">Your review<textarea required minLength={8} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} className="mt-1 min-h-24 w-full border border-ink/15 bg-paper p-3 text-sm normal-case tracking-normal" placeholder="Share what you loved about this piece…" /></label>
          {photoUrl ? <div className="flex items-center gap-3"><Image src={photoUrl} alt="Your review upload" width={80} height={96} className="h-24 w-20 object-cover" /><button type="button" onClick={() => setPhotoUrl('')} className="inline-flex items-center gap-1 text-xs underline"><X size={14} /> Remove photo</button></div> : <label className="inline-flex cursor-pointer items-center gap-2 border border-ink/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wider"><Upload size={14} /> Add a photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPhoto} /></label>}
          {error && <p role="alert" className="text-xs text-coral">{error}</p>}{success && <p role="status" className="text-xs text-emerald-800">{success}</p>}
          <button type="submit" disabled={busy || !orderNumber} className="w-full bg-ink px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-cream disabled:opacity-50">{busy ? 'Submitting…' : 'Submit Review'}</button>
          {myReview && <button type="button" disabled={busy} onClick={deleteMyReview} className="w-full border border-ink/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-cocoa disabled:opacity-50">Delete My Review</button>}
        </form>}
      </div>
    </div>
  </section>
}
