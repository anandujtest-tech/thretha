'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StoreLayout from '@/components/tc/StoreLayout'
import { Sparkles, MapPin, Heart, ShieldCheck, Leaf, ArrowRight } from 'lucide-react'
import { api } from '@/lib/tc'
import TrustPillars from '@/components/tc/TrustPillars'

export default function AboutPage() {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    api('/settings').then(setSettings).catch(() => {})
  }, [])

  return (
    <StoreLayout>
      <div className="w-full bg-paper text-ink space-y-0">

        {/* ── CHAPTER 01: HERO / OUR STORY ── */}
        <section className="bg-paper-warm py-16 sm:py-24 border-b border-ink/10">
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold/15 border border-gold/25 px-3.5 py-1 text-[10px] font-sans font-semibold uppercase tracking-[0.25em] text-gold-dark">
              <Sparkles className="h-3 w-3 text-gold" />
              <span>Chapter 01 · Our Story</span>
            </div>

            <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl text-ink font-normal leading-[1.05] tracking-tight">
              A Wardrobe Worth Getting Dressed For
            </h1>

            <p className="text-sm sm:text-base text-cocoa leading-relaxed font-sans max-w-2xl mx-auto">
              Thretha Couture was born out of a quiet rebellion against heavy, uncomfortable traditional wear. We set out to create a mindful wardrobe of contemporary drapes, pure handloom sarees, and everyday staples tailored with a deep reverence for Kerala elegance.
            </p>
          </div>
        </section>

        {/* ── CHAPTER 02: THE THRETHA WOMAN ── */}
        <section className="py-16 sm:py-24 border-b border-ink/10 bg-cream">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-14 items-center">
            <div className="relative aspect-[4/5] overflow-hidden bg-sand/40 border border-ink/10 shadow-lg">
              <img
                src="/api/media/file/seed-04.jpg"
                alt="The Thretha Woman"
                className="h-full w-full object-cover object-[center_20%]"
              />
            </div>

            <div className="space-y-6">
              <div className="inline-flex items-center gap-1.5 text-terracotta text-[10px] uppercase tracking-[0.25em] font-sans font-bold">
                <span>Chapter 02</span>
              </div>
              <h2 className="font-display text-3xl sm:text-5xl text-ink font-normal leading-tight">
                The Thretha Woman
              </h2>
              <p className="text-sm sm:text-base text-cocoa leading-relaxed font-sans">
                She values effortless poise over rigid convention. She wears clothes that feel like a second skin — whether she is stepping into a sunlit morning ceremony, leading a meeting, or hosting an intimate evening gathering.
              </p>
              <p className="text-sm sm:text-base text-cocoa leading-relaxed font-sans">
                Our silhouettes are designed to celebrate her quiet confidence, with breathable weaves that move when she moves.
              </p>
              <div className="pt-2">
                <span className="font-hand text-2xl text-gold-dark block">
                  unhurried, grounded & luminous ✦
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 03: DESIGN PHILOSOPHY ── */}
        <section className="py-16 sm:py-24 border-b border-ink/10 bg-sand/20">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-1.5 text-gold-dark text-[10px] uppercase tracking-[0.25em] font-sans font-bold">
              <span>Chapter 03</span>
            </div>
            <h2 className="font-display text-3xl sm:text-5xl text-ink font-normal leading-tight">
              Design Philosophy
            </h2>
            <p className="text-sm sm:text-base text-cocoa leading-relaxed font-sans">
              We believe luxury lies in comfort and texture, not in excessive ornamentation. By paring back unnecessary layers and focusing on pure cuts, we allow the intrinsic beauty of the textile and the silhouette to take center stage.
            </p>
          </div>

          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="p-8 bg-paper border border-ink/10 shadow-2xs space-y-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/15 text-gold-dark">
                <Leaf className="h-5 w-5 text-gold" />
              </span>
              <h3 className="font-display text-2xl text-ink">100% Pure Natural Fibers</h3>
              <p className="text-xs text-cocoa leading-relaxed font-sans">
                Strictly pure cottons, organzas, fine mulmul, and hand-spun silks. Zero synthetic plastics or scratchy linings against your skin.
              </p>
            </div>

            <div className="p-8 bg-paper border border-ink/10 shadow-2xs space-y-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-coral/15 text-coral-dark">
                <Heart className="h-5 w-5 text-coral" />
              </span>
              <h3 className="font-display text-2xl text-ink">Small-Batch Tailoring</h3>
              <p className="text-xs text-cocoa leading-relaxed font-sans">
                Every piece is tailored in limited numbers in Kochi. Mindful production ensures zero mass deadstock and unmatched hand finish.
              </p>
            </div>

            <div className="p-8 bg-paper border border-ink/10 shadow-2xs space-y-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-teal/15 text-teal-dark">
                <ShieldCheck className="h-5 w-5 text-teal" />
              </span>
              <h3 className="font-display text-2xl text-ink">Atelier Direct Value</h3>
              <p className="text-xs text-cocoa leading-relaxed font-sans">
                Direct from our Kochi cutting tables to your door across India. Fair artisanal wages paired with approachable pricing.
              </p>
            </div>
          </div>
        </section>

        {/* ── CHAPTER 04: CRAFT & FABRIC ── */}
        <section className="py-16 sm:py-24 border-b border-ink/10 bg-cream">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-14 items-center">
            <div className="space-y-6 order-2 lg:order-1">
              <div className="inline-flex items-center gap-1.5 text-gold-dark text-[10px] uppercase tracking-[0.25em] font-sans font-bold">
                <span>Chapter 04</span>
              </div>
              <h2 className="font-display text-3xl sm:text-5xl text-ink font-normal leading-tight">
                Craft & Fabric
              </h2>
              <p className="text-sm sm:text-base text-cocoa leading-relaxed font-sans">
                Kerala has a centuries-old tradition of handloom weaving, celebrated for its subtle zari borders and natural unbleached cottons. We work closely with master weavers to translate these heirloom techniques into versatile, modern silhouettes.
              </p>
              <div className="border-l-2 border-gold pl-4 py-1 text-xs text-cocoa/80 italic font-serif">
                "Each drape carries the memory of the weaver's loom, balanced for the rhythms of modern living."
              </div>
            </div>

            <div className="relative aspect-[4/5] overflow-hidden bg-sand/40 border border-ink/10 shadow-lg order-1 lg:order-2">
              <img
                src="/api/media/file/seed-02.jpg"
                alt="Craft & Fabric"
                className="h-full w-full object-cover object-[center_15%]"
              />
            </div>
          </div>
        </section>

        {/* ── CHAPTER 05: OUR APPROACH & CONCIERGE ── */}
        <section className="py-16 sm:py-24 border-b border-ink/10 bg-paper">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <div className="inline-flex items-center gap-1.5 text-terracotta text-[10px] uppercase tracking-[0.25em] font-sans font-bold">
              <span>Chapter 05</span>
            </div>
            <h2 className="font-display text-3xl sm:text-5xl text-ink font-normal leading-tight">
              Our Approach
            </h2>
            <p className="text-sm sm:text-base text-cocoa leading-relaxed font-sans max-w-2xl mx-auto">
              We want your shopping experience to feel as warm and personalized as visiting a boutique atelier. Our team is available directly on WhatsApp to answer sizing questions, offer drape styling advice, and arrange custom alterations.
            </p>
            <div className="pt-4">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-ink text-cream px-9 py-4 text-xs font-sans uppercase tracking-[0.22em] font-semibold hover:bg-cocoa-dark transition shadow-md"
              >
                <span>Explore The Wardrobe</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Service Strip ── */}
        <TrustPillars />

      </div>
    </StoreLayout>
  )
}
