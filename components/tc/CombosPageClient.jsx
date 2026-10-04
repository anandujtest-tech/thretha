'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight, Layers, Tag, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inr, api } from '@/lib/tc'
import { cn } from '@/lib/utils'

export default function CombosPage({ initialCombos }) {
  const [combos, setCombos] = useState(initialCombos || [])
  const [loading, setLoading] = useState(!initialCombos)

  useEffect(() => {
    api('/combos')
      .then((data) => {
        setCombos(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        console.error('Failed to load combos:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-paper pb-24 text-ink font-sans">
      {/* Editorial Hero */}
      <section className="relative overflow-hidden border-b border-ink/10 bg-[#141312] px-6 py-20 text-center text-cream sm:px-12 sm:py-28">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 border border-gold/30 bg-gold/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-gold-light">
            <Sparkles className="h-3.5 w-3.5" /> Curated Ensembles &amp; Bundles
          </div>
          <h1 className="font-display text-4xl sm:text-6xl tracking-wide text-cream font-light">
            Curated Combos
          </h1>
          <p className="mx-auto max-w-xl text-sm sm:text-base text-cream/70 font-light leading-relaxed">
            Handcrafted silhouettes paired by our atelier stylists. Choose your favourite pieces and bespoke sizes to complete your ensemble at exceptional bundle value.
          </p>
        </div>
      </section>

      {/* Main Catalog */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="py-24 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
            <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
              Curating atelier ensembles…
            </p>
          </div>
        ) : combos.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-cream p-16 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-mango-dark opacity-60" />
            <h2 className="mt-3 font-display text-2xl text-ink font-normal">
              No Active Combos Available
            </h2>
            <p className="mt-1 text-xs text-cocoa">
              Our atelier is crafting new seasonal pairings. Please check back soon or explore our full collection.
            </p>
            <Link href="/shop" className="mt-6 inline-block">
              <Button className="rounded-none bg-ink px-6 py-2.5 text-xs uppercase tracking-widest text-cream">
                Explore Full Catalog
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {combos.map((combo) => {
              const slotsCount = Array.isArray(combo.slots) ? combo.slots.length : 0
              const slotLabels = (combo.slots || [])
                .map((s) => s.name || s.category_name || 'Piece')
                .join(' + ')

              return (
                <div
                  key={combo.id}
                  className="group flex flex-col justify-between border border-ink/10 bg-cream transition-all duration-300 hover:border-mango/60 hover:shadow-md"
                >
                  <div>
                    {/* Image / Banner */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-sand/30 border-b border-ink/10">
                      {combo.image ? (
                        <img
                          src={combo.image}
                          alt={combo.name}
                          onError={(e) => {
                            e.currentTarget.onerror = null
                            e.currentTarget.src = '/api/media/file/seed-01.jpg'
                          }}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-full place-items-center bg-sand/30 text-xs uppercase tracking-widest text-cocoa-light">
                          Atelier Set
                        </div>
                      )}

                      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                        <span className="inline-block bg-[#141312]/90 backdrop-blur-xs px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gold-light border border-gold/20">
                          {combo.type?.replace(/_/g, ' ') || 'CURATED COMBO'}
                        </span>
                      </div>

                      {combo.pricing_method === 'fixed_price' && combo.combo_price > 0 && (
                        <div className="absolute bottom-3 right-3 bg-cream/95 backdrop-blur-xs border border-ink/10 px-3 py-1 text-right shadow-xs">
                          <span className="block text-[9px] uppercase tracking-wider text-cocoa-light">
                            Bundle Price
                          </span>
                          <span className="font-display text-lg font-semibold text-ink">
                            {inr(combo.combo_price)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-3">
                      <div>
                        <h2 className="font-display text-2xl text-ink font-medium leading-snug group-hover:text-mango-dark transition">
                          {combo.name}
                        </h2>
                        <p className="mt-1 text-xs text-cocoa font-medium">
                          {combo.customer_title}
                        </p>
                      </div>

                      {combo.description && (
                        <p className="text-xs text-cocoa line-clamp-2 leading-relaxed">
                          {combo.description}
                        </p>
                      )}

                      <div className="border-t border-ink/10 pt-3 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">
                          Includes {slotsCount} Curated Pieces:
                        </p>
                        <div className="space-y-1">
                          {(combo.slots || []).map((s, idx) => (
                            <div
                              key={s.id || idx}
                              className="flex items-center gap-1.5 text-xs text-ink"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                              <span>{s.name}</span>
                              {s.category_name && (
                                <span className="text-[10px] text-cocoa-light">({s.category_name})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="p-6 pt-0">
                    <Link href={`/combos/${combo.slug || combo.id}`} className="block w-full">
                      <Button
                        type="button"
                        className="w-full rounded-none bg-mango-dark py-6 text-xs uppercase tracking-widest font-semibold text-cream hover:bg-mango transition shadow-sm flex items-center justify-center gap-2 group-hover:bg-mango"
                      >
                        <span>
                          {combo.type === 'CURATED_OUTFIT' ? 'View Ensemble & Customize' : 'Build Your Ensemble'}
                        </span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

