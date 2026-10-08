'use client'

import { useEffect, useState } from 'react'
import { api, auth } from '@/lib/tc'

const FILTERS = [
  ['all', 'All'], ['identified', 'Identified'], ['anonymous', 'Anonymous'],
  ['active', 'Active'], ['removed', 'Removed'],
]
const dateLabel = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Unavailable'
}
const deviceLabel = (subscriber) => [subscriber.platform, subscriber.browser].filter(Boolean).join(' · ') || 'Device information unavailable'

export default function PushSubscriberManager({ activeCount, onRemoved }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState(null)
  const [removing, setRemoving] = useState(false)
  const status = filter === 'active' || filter === 'removed' ? filter : 'all'
  const identity = filter === 'identified' || filter === 'anonymous' ? filter : 'all'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(false)
      try {
        const params = new URLSearchParams({ page: String(page), status, identity })
        if (search) params.set('search', search)
        const result = await api(`/admin/push/subscribers?${params}`, { token: auth.get() })
        if (!cancelled) { setData(result); setLoading(false) }
      } catch {
        if (!cancelled) { setError(true); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [page, status, identity, search, refresh])

  const remove = async () => {
    if (!selected || removing) return
    setRemoving(true)
    try {
      await api(`/admin/push/subscribers/${encodeURIComponent(selected.id)}`, { method: 'DELETE', token: auth.get() })
      setSelected(null)
      setRefresh((value) => value + 1)
      onRemoved?.()
    } catch { setError(true); setSelected(null) }
    finally { setRemoving(false) }
  }

  const rows = data?.subscribers || []
  const total = data?.total || 0
  const first = total ? (page - 1) * 20 + 1 : 0
  const last = Math.min(page * 20, total)
  const emptyMessage = search ? 'No notification subscribers match your search.'
    : filter === 'anonymous' ? 'No anonymous notification subscriptions found.'
    : filter === 'removed' ? 'No removed subscriptions found.'
    : filter === 'active' || filter === 'all' && Number(activeCount) === 0
      ? 'No active browser notification subscribers yet. Customers who enable browser notifications will appear here.'
      : 'No notification subscribers match this view.'

  return <section className="mt-6 min-w-0 border border-ink/10 bg-paper p-4 sm:p-5" aria-labelledby="push-subscribers-title">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <h3 id="push-subscribers-title" className="text-xs font-semibold uppercase tracking-wider text-ink">Notification Subscribers</h3>
      <p className="text-xs text-cocoa">{activeCount ?? '—'} active subscribers</p>
    </div>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()) }} className="mt-4 flex min-w-0 flex-wrap gap-2">
      <label className="min-w-0 flex-1 basis-48"><span className="sr-only">Search notification subscribers</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) { setSearch(''); setPage(1) } }} placeholder="Search name, email or phone..." className="min-h-11 w-full min-w-0 border border-ink/15 bg-cream px-3 text-sm" /></label>
      <button type="submit" className="min-h-11 border border-ink/20 px-4 text-xs font-semibold">Search</button>
    </form>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Notification subscriber filters">
      {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1) }} className={`min-h-10 border px-3 text-xs ${filter === value ? 'border-ink bg-ink text-cream' : 'border-ink/20 text-ink'}`}>{label}</button>)}
    </div>
    {loading ? <p role="status" className="mt-4 text-xs text-cocoa">Loading notification subscribers…</p>
      : error ? <div role="alert" className="mt-4 border border-coral/20 bg-coral-light/20 p-3 text-xs text-coral"><p>Unable to load notification subscribers. Please try again.</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-2 min-h-10 font-semibold underline">Retry</button></div>
      : !rows.length ? <p className="mt-4 border border-ink/10 bg-cream p-4 text-sm text-cocoa">{emptyMessage}</p>
      : <div className="mt-4 space-y-3">{rows.map((subscriber) => <article key={subscriber.id} className="min-w-0 border border-ink/10 bg-cream p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-semibold text-ink">{subscriber.customer?.name || (subscriber.customer ? subscriber.customer.email : 'Anonymous Visitor')}</p>{subscriber.customer?.email && <p className="break-all text-xs text-cocoa">{subscriber.customer.email}</p>}{subscriber.customer?.phone && <p className="break-words text-xs text-cocoa">{subscriber.customer.phone}</p>}</div><span className={`text-[10px] font-bold uppercase ${subscriber.status === 'active' ? 'text-emerald-800' : 'text-cocoa'}`}>{subscriber.status === 'active' ? 'Active' : 'Removed'}</span></div>
          <p className="mt-3 break-words text-xs text-ink">{subscriber.deviceType === 'mobile' ? '📱' : subscriber.deviceType === 'desktop' ? '💻' : '🔔'} {deviceLabel(subscriber)}</p>
          <p className="mt-2 text-xs text-cocoa">Subscribed: {dateLabel(subscriber.subscribedAt)}</p>
          <p className="text-xs text-cocoa">Last active: {dateLabel(subscriber.lastActiveAt)}</p>
          {subscriber.status === 'active' && <div className="mt-3 flex justify-end"><button type="button" onClick={() => setSelected(subscriber)} className="min-h-11 border border-coral/30 px-4 text-xs font-semibold text-coral">Remove</button></div>}
        </article>)}</div>}
    {!loading && !error && total > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-cocoa"><span>{first}–{last} of {total} subscribers</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 border border-ink/20 px-3 disabled:opacity-40">Previous</button><span>Page {page} of {data?.pages || 1}</span><button type="button" disabled={page >= (data?.pages || 1)} onClick={() => setPage((value) => value + 1)} className="min-h-10 border border-ink/20 px-3 disabled:opacity-40">Next</button></div></div>}
    {selected && <div role="dialog" aria-modal="true" aria-labelledby="remove-push-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-3"><div className="w-full max-w-md bg-paper p-5 shadow-xl"><h4 id="remove-push-title" className="font-display text-xl text-ink">Remove this browser notification subscription?</h4><p className="mt-3 break-words text-sm font-semibold">{selected.customer?.name || selected.customer?.email || 'Anonymous Visitor'}</p><p className="mt-1 text-xs text-cocoa">{deviceLabel(selected)}</p><p className="mt-3 text-sm text-cocoa">They will no longer receive browser notifications on this device.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={removing} onClick={() => setSelected(null)} className="min-h-11 border border-ink/20 px-4 text-xs">Cancel</button><button type="button" disabled={removing} onClick={remove} className="min-h-11 bg-coral px-4 text-xs font-semibold text-white disabled:opacity-50">{removing ? 'Removing…' : 'Remove Subscription'}</button></div></div></div>}
  </section>
}
