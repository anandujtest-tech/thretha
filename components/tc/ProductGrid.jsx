'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  LayoutGrid,
  Grid2X2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { api } from '@/lib/tc'
import ProductCard from './ProductCard'

export default function ProductGrid({ navigate, settings, path, addToCart, initialProducts, initialCategory }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryOccasion = searchParams.get('occasion') || ''
  const queryMinPrice = searchParams.get('minPrice') || ''
  const queryMaxPrice = searchParams.get('maxPrice') || ''
  const queryMinNumber = queryMinPrice === '' ? null : Number(queryMinPrice)
  const queryMaxNumber = queryMaxPrice === '' ? null : Number(queryMaxPrice)
  const initialPriceValid = (queryMinNumber === null || (Number.isFinite(queryMinNumber) && queryMinNumber >= 0)) && (queryMaxNumber === null || (Number.isFinite(queryMaxNumber) && queryMaxNumber >= 0)) && (queryMinNumber === null || queryMaxNumber === null || queryMinNumber <= queryMaxNumber)
  const initialMinPrice = initialPriceValid ? queryMinPrice : ''
  const initialMaxPrice = initialPriceValid ? queryMaxPrice : ''
  const nav = navigate || ((to) => router.push(to))
  const [products, setProducts] = useState(initialProducts || [])
  const [loading, setLoading] = useState(!initialProducts)
  const [cat, setCat] = useState(initialCategory || null)
  const [occasion, setOccasion] = useState('')
  const [sort, setSort] = useState('newest')
  const [q, setQ] = useState('')
  const [cols, setCols] = useState(3) // 2 or 3/4
  const [filters, setFilters] = useState({
    availability: '',
    size: '',
    colour: '',
    min_price: initialMinPrice,
    max_price: initialMaxPrice,
  })
  const [priceDraft, setPriceDraft] = useState({ min: initialMinPrice, max: initialMaxPrice })
  const [priceError, setPriceError] = useState('')

  const isNew = path === '/new-arrivals'
  const isShop = path === '/shop'
  const catSlug = path.startsWith('/category/') ? path.split('/')[2] : null

  const load = () => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (catSlug) sp.set('category', catSlug)
    if (occasion) sp.set('occasion', occasion)
    if (isNew) sp.set('new', 'true')
    if (sort) sp.set('sort', sort)
    if (q) sp.set('search', q)
    if (filters.availability) sp.set('availability', filters.availability)
    if (filters.size) sp.set('size', filters.size)
    if (filters.colour) sp.set('colour', filters.colour)
    if (filters.min_price !== '') sp.set('minPrice', filters.min_price)
    if (filters.max_price !== '') sp.set('maxPrice', filters.max_price)

    api(`/products?${sp.toString()}`)
      .then((res) => {
        setProducts(res || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    const searchQuery = searchParams.get('search') || ''
    setQ(searchQuery)
  }, [searchParams])

  useEffect(() => {
    const hasFilters = Object.values(filters).some(Boolean)
    if (Array.isArray(initialProducts) && sort === 'newest' && !q && !hasFilters && !occasion) {
      setProducts(initialProducts)
      setLoading(false)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, sort, filters, q, initialProducts, occasion])

  useEffect(() => { setOccasion(queryOccasion) }, [queryOccasion])

  useEffect(() => {
    if (initialCategory) {
      setCat(initialCategory)
      return
    }
    if (catSlug) {
      api('/categories')
        .then((cs) => setCat(cs.find((c) => c.slug === catSlug)))
        .catch(() => {})
    } else {
      setCat(null)
    }
  }, [catSlug, initialCategory])

  const title = isNew ? 'Just Dropped' : cat ? cat.name : occasion ? occasion.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'The Complete Edit'
  const sub = isNew
    ? 'The freshest handcrafted drapes and contemporary tops directly from our atelier.'
    : cat
    ? cat.description
    : 'A joyful wardrobe worth getting dressed for. Curated sarees, crop tops, and everyday staples.'

  const applyPriceFilter = () => {
    const parse = (value) => {
      if (value === '') return { valid: true, value: '' }
      const number = Number(value)
      return { valid: Number.isFinite(number) && number >= 0, value: String(number) }
    }
    const min = parse(priceDraft.min)
    const max = parse(priceDraft.max)
    if (!min.valid || !max.valid) { setPriceError('Enter valid prices of zero or more.'); return }
    if (min.value !== '' && max.value !== '' && Number(min.value) > Number(max.value)) { setPriceError('Minimum price cannot be greater than maximum price.'); return }
    setPriceError('')
    setFilters((current) => ({ ...current, min_price: min.value, max_price: max.value }))
  }

  const resetPriceFilter = () => {
    setPriceDraft({ min: '', max: '' })
    setPriceError('')
    setFilters((current) => ({ ...current, min_price: '', max_price: '' }))
  }

  const FilterControls = () => (
    <div className="space-y-6 text-xs">
      {/* Availability */}
      <div>
        <Label className="text-[11px] uppercase tracking-[0.2em] text-ink font-bold">
          Availability
        </Label>
        <Select
          value={filters.availability || 'all'}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, availability: v === 'all' ? '' : v }))
          }
        >
          <SelectTrigger className="mt-2 rounded-none border-ink/20 bg-cream">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-paper">
            <SelectItem value="all">All Pieces</SelectItem>
            <SelectItem value="in">In Stock Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sizes */}
      <div>
        <Label className="text-[11px] uppercase tracking-[0.2em] text-ink font-bold">
          Size Filter
        </Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['all', 'XS', 'S', 'M', 'L', 'XL', 'Free Size'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                setFilters((f) => ({ ...f, size: s === 'all' ? '' : s }))
              }
              className={cn(
                'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded-sm transition',
                (filters.size === s || (s === 'all' && !filters.size))
                  ? 'border-ink bg-ink text-cream'
                  : 'border-ink/20 bg-cream text-ink hover:border-mango'
              )}
            >
              {s === 'all' ? 'Any' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Colour */}
      <div>
        <Label className="text-[11px] uppercase tracking-[0.2em] text-ink font-bold">
          Colour Filter
        </Label>
        <Input
          value={filters.colour}
          onChange={(e) => setFilters((f) => ({ ...f, colour: e.target.value }))}
          placeholder="e.g. Rose, Gold, Ivory, Blue, Black"
          className="mt-2 rounded-none border-ink/20 bg-cream text-xs focus-visible:border-mango"
        />
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-[0.2em] text-ink font-bold">Price Range</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input type="number" inputMode="decimal" min="0" step="1" value={priceDraft.min} onChange={(event) => { setPriceDraft((current) => ({ ...current, min: event.target.value })); setPriceError('') }} placeholder="Min ₹" aria-label="Minimum price" className="rounded-none border-ink/20 bg-cream text-xs" />
          <Input type="number" inputMode="decimal" min="0" step="1" value={priceDraft.max} onChange={(event) => { setPriceDraft((current) => ({ ...current, max: event.target.value })); setPriceError('') }} placeholder="Max ₹" aria-label="Maximum price" className="rounded-none border-ink/20 bg-cream text-xs" />
        </div>
        {priceError && <p role="alert" className="mt-2 text-[11px] text-coral">{priceError}</p>}
        <div className="mt-2 flex gap-2"><button type="button" onClick={applyPriceFilter} className="min-h-9 bg-ink px-3 text-[10px] font-bold uppercase tracking-wider text-cream">Apply</button><button type="button" onClick={resetPriceFilter} className="min-h-9 border border-ink/20 px-3 text-[10px] font-bold uppercase tracking-wider text-cocoa">Reset price</button></div>
      </div>

      {/* Clear Filters */}
      {(filters.availability || filters.size || filters.colour || filters.min_price !== '' || filters.max_price !== '' || q) && (
        <button
          type="button"
          onClick={() => {
            setFilters({ availability: '', size: '', colour: '', min_price: '', max_price: '' })
            setPriceDraft({ min: '', max: '' })
            setPriceError('')
            setQ('')
          }}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-coral hover:underline font-bold pt-2"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Clear All Filters
        </button>
      )}
    </div>
  )

  return (
    <div className="container py-8 sm:py-12">
      {/* Banner */}
      <div className="mb-8 border-b border-ink/10 pb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-bold">
          {isNew ? 'Fresh Atelier Release' : cat ? 'Collection Showcase' : 'Catalogue'}
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-6xl text-ink font-normal leading-tight">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-cocoa leading-relaxed font-sans">{sub}</p>
        <p className="mt-3 text-xs uppercase tracking-widest text-cocoa-light font-medium">
          Showing {products.length} {products.length === 1 ? 'piece' : 'pieces'}
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            load()
          }}
          className="relative flex-1 min-w-[220px] max-w-md"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search within collection…"
            className="rounded-none border-ink/20 bg-cream pl-9 text-xs focus-visible:border-mango"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2.5 max-w-full">
          {/* Sorting */}
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[190px] rounded-none border-ink/20 bg-cream text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-paper">
              <SelectItem value="newest">Sort: Newest First</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
              <SelectItem value="featured">Featured First</SelectItem>
            </SelectContent>
          </Select>

          {/* Grid Layout Switcher (Desktop) */}
          <div className="hidden sm:flex border border-ink/20 bg-cream">
            <button
              onClick={() => setCols(2)}
              className={cn('p-2 text-ink hover:bg-sand/30', cols === 2 && 'bg-sand/50')}
              title="2-column view"
            >
              <Grid2X2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCols(3)}
              className={cn('p-2 text-ink hover:bg-sand/30', cols === 3 && 'bg-sand/50')}
              title="3-column view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile Filter Sheet Trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="rounded-none border-ink/20 bg-cream md:hidden text-xs uppercase tracking-wider font-semibold"
              >
                <SlidersHorizontal className="mr-2 h-3.5 w-3.5" /> Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto bg-paper p-6">
              <SheetHeader className="text-left border-b border-ink/10 pb-3">
                <SheetTitle className="font-display text-2xl text-ink font-normal">
                  Refine Collection
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <FilterControls />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Grid + Desktop Sidebar */}
      <div className="grid gap-10 md:grid-cols-[230px_1fr]">
        <aside className="hidden md:block border-r border-ink/10 pr-8">
          <FilterControls />
        </aside>

        <div>
          {loading ? (
            <div className={cn('grid gap-6', cols === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-sm bg-sand/40" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-ink/20 bg-cream/50 p-8 rounded-sm">
              <Sparkles className="mx-auto h-8 w-8 text-mango" />
              <p className="mt-3 font-display text-3xl text-ink">
                No matching pieces found.
              </p>
              <p className="mt-1 text-xs text-cocoa">
                Try clearing or adjusting your search terms and filters.
              </p>
              <Button
                onClick={() => {
                  setFilters({ availability: '', size: '', colour: '', min_price: '', max_price: '' })
                  setPriceDraft({ min: '', max: '' })
                  setPriceError('')
                  setQ('')
                  setSort('newest')
                }}
                className="mt-6 rounded-none bg-ink text-cream text-xs uppercase tracking-widest font-semibold"
              >
                Reset All Filters
              </Button>
            </div>
          ) : (
            <div className={cn('grid gap-4 sm:gap-6', cols === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  navigate={nav}
                  settings={settings}
                  addToCart={addToCart}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
