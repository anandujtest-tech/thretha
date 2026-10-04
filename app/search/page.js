'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import StoreLayout from '@/components/tc/StoreLayout'
import ProductCard from '@/components/tc/ProductCard'
import { api } from '@/lib/tc'
import { Search, Sparkles, SlidersHorizontal, ArrowRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function SearchResultsInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQuery = searchParams.get('q') || ''

  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState(null)

  const executeSearch = (q) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    api(`/products?search=${encodeURIComponent(q.trim())}`)
      .then((data) => setResults(data || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api('/settings').then(setSettings).catch(() => {})
    if (initialQuery) {
      executeSearch(initialQuery)
    }
  }, [initialQuery])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      executeSearch(query)
    }
  }

  return (
    <div className="container py-10 sm:py-16">
      {/* Search Header */}
      <div className="mb-10 text-center space-y-4 max-w-xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.3em] text-mango-dark font-bold">
          Search the Atelier Catalogue
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-ink font-normal">
          {initialQuery ? `Results for “${initialQuery}”` : 'Find Your Silhouette'}
        </h1>

        <form onSubmit={handleSearchSubmit} className="relative flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sarees, crop tops, mulmul, festive drops…"
            className="rounded-none border-ink/20 bg-cream py-6 pl-10 text-xs focus-visible:border-mango"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cocoa-light pointer-events-none" />
          <Button
            type="submit"
            className="rounded-none bg-ink text-cream text-xs uppercase tracking-widest px-6 font-semibold"
          >
            Search
          </Button>
        </form>

        {/* Quick Suggestion Tags */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-cocoa-light font-bold">Popular:</span>
          {['Saree', 'Crop Top', 'Cotton', 'Festive', 'Mulmul'].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setQuery(tag)
                router.push(`/search?q=${encodeURIComponent(tag)}`)
                executeSearch(tag)
              }}
              className="rounded-full bg-sand/40 px-3 py-0.5 text-[11px] text-ink hover:bg-mango-light hover:text-mango-dark transition font-medium"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Results View */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
          <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
            Searching curated pieces…
          </p>
        </div>
      ) : results.length > 0 ? (
        <div>
          <div className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4">
            <p className="text-xs uppercase tracking-wider text-cocoa font-semibold">
              Showing {results.length} matching {results.length === 1 ? 'piece' : 'pieces'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {results.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                settings={settings}
              />
            ))}
          </div>
        </div>
      ) : initialQuery ? (
        <div className="py-16 text-center max-w-md mx-auto space-y-4">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sand/40 text-cocoa">
            <Search className="h-6 w-6" />
          </div>
          <h2 className="font-display text-3xl text-ink">No exact matches found</h2>
          <p className="text-xs text-cocoa leading-relaxed font-sans">
            We couldn’t find any silhouettes matching &ldquo;{initialQuery}&rdquo;. Try browsing our full edit or searching for materials like cotton or organza.
          </p>
          <Button
            onClick={() => router.push('/shop')}
            className="rounded-none bg-ink text-cream text-xs uppercase tracking-widest px-8 py-5 font-semibold"
          >
            Explore Complete Collection →
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function SearchPage() {
  return (
    <StoreLayout>
      <Suspense fallback={
        <div className="container py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        </div>
      }>
        <SearchResultsInner />
      </Suspense>
    </StoreLayout>
  )
}

