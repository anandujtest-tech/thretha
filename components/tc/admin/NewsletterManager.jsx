'use client'

import { useEffect, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { api, auth } from '@/lib/tc'
import NewsletterCampaignManager from './NewsletterCampaignManager'

export default function NewsletterManager() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState('')
  const [busyExport, setBusyExport] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    const params = new URLSearchParams({ status, page: String(page) })
    if (search) params.set('q', search)
    api(`/admin/newsletter-subscribers?${params}`, { token: auth.get() }).then(setData).catch((err) => setError(err.message || 'Could not load newsletter subscribers.'))
  }

  useEffect(() => { load() }, [status, search, page])

  const unsubscribe = async (subscriber) => {
    setBusyId(subscriber.id); setError('')
    try {
      await api(`/admin/newsletter-subscribers/${encodeURIComponent(subscriber.id)}`, { method: 'PATCH', body: { action: 'unsubscribe' }, token: auth.get() })
      load()
    } catch (err) { setError(err.message || 'Could not update subscriber.') }
    finally { setBusyId('') }
  }

  const exportActive = async () => {
    setBusyExport(true); setError('')
    try {
      const params = new URLSearchParams({ status: 'active', export: 'csv' })
      if (search) params.set('q', search)
      const response = await fetch(`/api/admin/newsletter-subscribers?${params}`, { headers: { Authorization: `Bearer ${auth.get()}` } })
      if (!response.ok) throw new Error('Could not export active subscribers.')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl; anchor.download = 'thretha-newsletter-subscribers.csv'; anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) { setError(err.message || 'Could not export active subscribers.') }
    finally { setBusyExport(false) }
  }

  return <div className="space-y-10"><NewsletterCampaignManager /><section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-4">
      <div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Audience</p><h1 className="mt-1 font-display text-3xl text-ink">Newsletter Subscribers</h1></div>
      <button type="button" disabled={busyExport} onClick={exportActive} className="inline-flex min-h-10 items-center gap-2 border border-ink/20 px-3 text-[10px] font-bold uppercase tracking-wider text-ink disabled:opacity-50"><Download size={14} />{busyExport ? 'Preparing…' : 'Export active'}</button>
    </div>
    {data && <div className="grid gap-3 sm:grid-cols-2"><div className="border border-ink/10 bg-cream p-4"><p className="text-[10px] uppercase tracking-wider text-cocoa">Active</p><p className="mt-1 font-display text-3xl text-ink">{data.activeCount}</p></div><div className="border border-ink/10 bg-cream p-4"><p className="text-[10px] uppercase tracking-wider text-cocoa">Unsubscribed</p><p className="mt-1 font-display text-3xl text-ink">{data.unsubscribedCount}</p></div></div>}
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()) }} className="flex flex-wrap gap-2">
      <label className="relative min-w-[200px] flex-1"><span className="sr-only">Search subscribers</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-cocoa-light" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by email" className="min-h-10 w-full border border-ink/15 bg-cream pl-9 pr-3 text-xs" /></label>
      <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }} className="min-h-10 border border-ink/15 bg-cream px-3 text-xs"><option value="all">All subscribers</option><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option></select>
      <button className="min-h-10 bg-ink px-4 text-[10px] font-bold uppercase tracking-wider text-cream">Search</button>
    </form>
    {error && <p role="alert" className="border border-coral/20 bg-coral-light/20 p-3 text-xs text-coral">{error}</p>}
    {!data ? <p className="py-10 text-center text-xs text-cocoa">Loading subscribers…</p> : data.subscribers.length === 0 ? <p className="border border-ink/10 bg-cream p-8 text-center text-sm text-cocoa-light">No subscribers match this view.</p> : <div className="divide-y divide-ink/10 border border-ink/10 bg-cream">
      {data.subscribers.map((subscriber) => <article key={subscriber.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="break-all text-sm font-semibold text-ink">{subscriber.email_normalized}</p><p className="mt-1 text-[10px] text-cocoa-light">Subscribed {subscriber.consented_at ? new Date(subscriber.consented_at).toLocaleString() : 'date unavailable'}{subscriber.unsubscribed_at ? ` · Unsubscribed ${new Date(subscriber.unsubscribed_at).toLocaleString()}` : ''}</p></div><div className="flex items-center gap-3"><span className={`text-[9px] font-bold uppercase tracking-wider ${subscriber.status === 'active' ? 'text-emerald-800' : 'text-cocoa'}`}>{subscriber.status}</span>{subscriber.status === 'active' && <button type="button" disabled={busyId === subscriber.id} onClick={() => unsubscribe(subscriber)} className="border border-ink/20 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-cocoa disabled:opacity-50">{busyId === subscriber.id ? 'Updating…' : 'Unsubscribe'}</button>}</div></article>)}
    </div>}
    {data?.pages > 1 && <div className="flex items-center justify-between text-xs"><span className="text-cocoa">Page {data.page} of {data.pages} · {data.total} records</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="border border-ink/20 px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= data.pages} onClick={() => setPage((value) => Math.min(data.pages, value + 1))} className="border border-ink/20 px-3 py-2 disabled:opacity-40">Next</button></div></div>}
  </section></div>
}
