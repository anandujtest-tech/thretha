'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

export default function HomeDiscoveryFilters() {
  const router = useRouter()
  const [colour, setColour] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [error, setError] = useState('')

  const explore = (event) => {
    event.preventDefault()
    const min = minPrice === '' ? null : Number(minPrice)
    const max = maxPrice === '' ? null : Number(maxPrice)
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)) || (min !== null && max !== null && min > max)) {
      setError('Enter a valid price range.')
      return
    }
    setError('')
    const query = new URLSearchParams()
    if (colour.trim()) query.set('colour', colour.trim())
    if (min !== null) query.set('minPrice', String(min))
    if (max !== null) query.set('maxPrice', String(max))
    router.push(query.size ? `/shop?${query}` : '/shop')
  }

  return <section className="fashion-section min-w-0" aria-labelledby="home-filters-heading">
    <div className="fashion-section-heading"><h2 id="home-filters-heading">Find your piece</h2><span className="fashion-eyebrow">Explore the collection</span></div>
    <form onSubmit={explore} className="grid min-w-0 gap-3 border border-ink/10 bg-cream p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,120px)_minmax(0,120px)_auto] sm:items-end sm:p-6">
      <label className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-ink">Colour
        <input value={colour} onChange={(event) => setColour(event.target.value)} placeholder="e.g. Ivory" className="mt-2 block h-11 w-full min-w-0 border border-ink/20 bg-paper px-3 text-sm font-normal normal-case tracking-normal" />
      </label>
      <label className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-ink">Min price
        <input type="number" min="0" inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="₹" className="mt-2 block h-11 w-full min-w-0 border border-ink/20 bg-paper px-3 text-sm font-normal normal-case tracking-normal" />
      </label>
      <label className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-ink">Max price
        <input type="number" min="0" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="₹" className="mt-2 block h-11 w-full min-w-0 border border-ink/20 bg-paper px-3 text-sm font-normal normal-case tracking-normal" />
      </label>
      <button type="submit" className="flex h-11 items-center justify-center gap-2 bg-ink px-5 text-[11px] font-bold uppercase tracking-wider text-cream">Explore <ArrowRight size={15} aria-hidden="true" /></button>
      {error && <p role="alert" className="text-xs text-coral sm:col-span-4">{error}</p>}
    </form>
  </section>
}
