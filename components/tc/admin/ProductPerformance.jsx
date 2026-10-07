'use client'

import { useEffect, useState } from 'react'
import { api, auth } from '@/lib/tc'

export default function ProductPerformance() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    api(`/admin/product-performance?days=${days}`, { token: auth.get() }).then((result) => { if (active) setData(result) }).catch((err) => { if (active) setError(err.message || 'Could not load product performance.') })
    return () => { active = false }
  }, [days])

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Storefront funnel</p><h1 className="mt-1 font-display text-3xl text-ink">Product Performance</h1></div><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="min-h-10 border border-ink/15 bg-cream px-3 text-xs"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div>
    <p className="text-xs text-cocoa-light">Views, bag additions and checkout starts are deduplicated by browser session within their event windows (30 minutes for views/checkouts, 10 seconds for bag additions). Older events recorded before deduplication may include repeats. Orders are distinct paid or delivered order records; conversion is those orders divided by recorded product views, not unique customers.</p>
    {error && <p role="alert" className="text-xs text-coral">{error}</p>}
    {!data ? <p className="py-8 text-center text-xs text-cocoa">Loading product events…</p> : <div className="overflow-x-auto border border-ink/10 bg-cream"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-ink/10 text-[10px] uppercase tracking-wider text-cocoa"><tr><th className="p-3">Product</th><th className="p-3 text-right">Views · 30m/session</th><th className="p-3 text-right">Bag adds · 10s dedupe</th><th className="p-3 text-right">Checkout · 30m/session</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Conversion</th></tr></thead><tbody className="divide-y divide-ink/5">{data.products.map((product) => <tr key={product.id}><td className="p-3 font-medium text-ink">{product.name}</td><td className="p-3 text-right">{product.views}</td><td className="p-3 text-right">{product.add_to_bag}</td><td className="p-3 text-right">{product.checkout_started}</td><td className="p-3 text-right">{product.orders}</td><td className="p-3 text-right">{product.conversion.toFixed(2)}%</td></tr>)}</tbody></table>{data.products.length === 0 && <p className="p-8 text-center text-cocoa-light">No active products.</p>}</div>}
  </section>
}
