'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Layers } from 'lucide-react'

export default function SilhouetteStudio({ navigate }) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))

  const styles = [
    {
      title: 'The Linen Crop',
      desc: 'Structured shoulders and breathable linen for sunlit casual outings.',
      img: '/api/media/file/seed-07.jpg',
    },
    {
      title: 'Minimal Blouse',
      desc: 'Pairs seamlessly beneath sheer sarees or high-waisted linen trousers.',
      img: '/api/media/file/seed-08.jpg',
    },
    {
      title: 'Cobalt Signature',
      desc: 'Vibrant indigo tones cut in a relaxed contemporary boxy silhouette.',
      img: '/api/media/file/seed-09.jpg',
    },
  ]

  return (
    <section className="py-12 sm:py-20 lg:py-24 border-b border-ink/10 bg-cream">
      <div className="container px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-12 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-light px-2.5 sm:px-3 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-teal-dark mb-2">
            <Layers className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-teal" />
            <span>Mix & Match Atelier</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-ink font-normal leading-tight">
            The Contemporary Silhouette Studio
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-cocoa leading-relaxed font-sans">
            Designed to pair effortlessly with handloom sarees, layered skirts, or your favourite daily denim.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
          {styles.map((st, i) => (
            <div
              key={i}
              onClick={() => nav('/category/crop-tops')}
              className="group cursor-pointer flex flex-col justify-between overflow-hidden rounded-sm bg-sand/30 border border-ink/10 transition-all duration-300 hover:shadow-lg active:scale-[0.99]"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-sand/40">
                <img
                  src={st.img}
                  alt={st.title}
                  className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-106"
                  loading="lazy"
                />
              </div>
              <div className="p-4 sm:p-5 bg-cream flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-display text-xl sm:text-2xl text-ink font-normal group-hover:text-mango-dark transition">
                    {st.title}
                  </h3>
                  <p className="mt-1 text-xs text-cocoa leading-relaxed line-clamp-2 sm:line-clamp-none">
                    {st.desc}
                  </p>
                </div>
                <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-ink/10 flex items-center justify-between text-[11px] sm:text-xs font-bold uppercase tracking-wider text-ink group-hover:text-mango-dark">
                  <span>Explore Silhouette</span>
                  <ArrowRight className="h-3.5 w-3.5 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 sm:mt-10 text-center">
          <Button
            type="button"
            onClick={() => nav('/category/crop-tops')}
            className="w-full sm:w-auto rounded-none bg-ink px-6 sm:px-8 py-5 sm:py-6 text-xs uppercase tracking-[0.2em] sm:tracking-[0.25em] text-cream hover:bg-cocoa-dark active:scale-[0.98] shadow-md font-semibold"
          >
            <span>View All Crop Tops & Blouses</span>
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
