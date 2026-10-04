'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, getWishlist } from '@/lib/tc'
import ProductCard from './ProductCard'

export default function WishlistPage({ navigate, settings, addToCart }) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const slugs = getWishlist()
    if (!slugs.length) {
      setLoading(false)
      return
    }
    Promise.all(slugs.map((s) => api(`/products/${s}`).catch(() => null))).then((res) => {
      setItems(res.filter(Boolean))
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="container py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading saved atelier pieces…
        </p>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="container py-24 text-center max-w-md mx-auto">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sand/40 text-coral">
          <Heart className="h-8 w-8 fill-coral text-coral" />
        </div>
        <h1 className="mt-5 font-display text-4xl text-ink font-normal">Your Wishlist is Empty</h1>
        <p className="mt-2 text-sm text-cocoa leading-relaxed font-sans">
          Found something you adore? Tap the little heart on any saree or top to save it to your private styling board.
        </p>
        <div className="mt-8">
          <Button
            onClick={() => nav('/shop')}
            className="rounded-none bg-ink px-8 py-6 text-xs uppercase tracking-[0.25em] text-cream hover:bg-cocoa-dark shadow-md font-semibold"
          >
            Explore The Collection →
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-10 sm:py-16">
      <div className="mb-8 border-b border-ink/10 pb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-bold">
          Saved Collection
        </p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl text-ink font-normal">
          Your Styling Board
        </h1>
        <p className="mt-2 text-sm text-cocoa">
          {items.length} {items.length === 1 ? 'piece' : 'pieces'} saved for later styling.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
        {items.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            navigate={nav}
            settings={settings}
            addToCart={addToCart}
          />
        ))}
      </div>
    </div>
  )
}

