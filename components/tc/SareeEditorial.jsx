'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'

export default function SareeEditorial({ navigate, settings }) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))
  const sareeImg = settings?.saree_edit_image || '/api/media/file/seed-05.jpg'

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-paper-warm via-paper to-sand/40 py-12 sm:py-20 lg:py-24 border-b border-ink/10">
      <div className="container px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 items-center">
          {/* Visual Showcase */}
          <div className="relative order-2 lg:order-1">
            <div className="relative mx-auto aspect-[4/5] max-w-md overflow-hidden rounded-sm bg-sand/50 shadow-xl border border-ink/10">
              <img
                src={sareeImg}
                alt="The Saree Edit Campaign"
                className="h-full w-full object-cover object-top transition-transform duration-700 hover:scale-105"
                loading="lazy"
              />
              <div className="absolute top-3 sm:top-4 left-3 sm:left-4 bg-cream/90 backdrop-blur-md px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xs border border-ink/10 shadow-xs">
                <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.25em] font-bold text-plum">
                  Artisan Saree Edit ’26
                </span>
              </div>
            </div>

            {/* Floating Editorial Card (Contained within mobile viewport) */}
            <div className="mt-3 sm:mt-0 sm:absolute sm:-bottom-6 sm:right-6 bg-cream p-3.5 sm:p-5 max-w-xs shadow-md sm:shadow-xl border border-ink/10 rounded-sm">
              <p className="font-hand text-base sm:text-lg text-mango-dark">
                "a drape that breathes with you"
              </p>
              <p className="mt-1 text-[11px] text-cocoa leading-relaxed">
                Hand-finished borders & pure lightweight cottons designed for all-day comfort.
              </p>
            </div>
          </div>

          {/* Text & Features */}
          <div className="order-1 lg:order-2 space-y-4 sm:space-y-6">
            <div className="space-y-2 sm:space-y-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-coral-light px-2.5 sm:px-3 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-coral-dark">
                <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-coral" />
                <span>The Drape Story</span>
              </div>

              <h2 className="font-display text-3xl sm:text-5xl lg:text-6xl text-ink font-normal leading-[1.1]">
                The Art Of Everyday Saree Draping
              </h2>

              <p className="text-xs sm:text-base text-cocoa leading-relaxed font-sans">
                We believe a saree should never feel restrictive or heavy. Our drapes are crafted from pure breathable weaves, handloom cotton blends, and fluid silks that require no fussy maintenance.
              </p>
            </div>

            {/* Feature List */}
            <div className="space-y-2 sm:space-y-3 pt-1 text-xs text-ink font-medium">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-teal shrink-0" />
                <span>Includes running unstitched matching blouse fabric</span>
              </div>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-teal shrink-0" />
                <span>Pre-tucked fall borders ready to style immediately</span>
              </div>
              <div className="flex items-center gap-2.5 sm:gap-3">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-teal shrink-0" />
                <span>Free Size fitting suitable for all drape lengths</span>
              </div>
            </div>

            <div className="pt-2 sm:pt-4 flex items-center">
              <Button
                type="button"
                onClick={() => nav('/category/sarees')}
                className="w-full sm:w-auto rounded-none bg-ink px-6 sm:px-8 py-5 sm:py-6 text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-cream hover:bg-cocoa-dark active:scale-[0.98] shadow-md font-semibold"
              >
                <span>Shop The Saree Edit</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
