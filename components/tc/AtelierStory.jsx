'use client'

import { Instagram, MapPin, Sparkles, ExternalLink, Heart } from 'lucide-react'

export default function AtelierStory({ settings }) {
  const brandStory =
    settings?.brand_story ||
    'Thretha Couture was born out of a quiet rebellion against heavy, uncomfortable traditional wear. We set out to create a little wardrobe of sarees, crop tops, and everyday essentials with a soft spot for Kerala elegance. Every piece is tailored with breathable natural fabrics, pure weaves, and mindful details so you feel completely at ease while looking extraordinary.'

  const storyImg = settings?.brand_story_image || '/api/media/file/seed-04.jpg'
  const instagramGallery = settings?.instagram_gallery?.length
    ? settings.instagram_gallery
    : [
        '/api/media/file/seed-01.jpg',
        '/api/media/file/seed-02.jpg',
        '/api/media/file/seed-03.jpg',
        '/api/media/file/seed-06.jpg',
        '/api/media/file/seed-07.jpg',
        '/api/media/file/seed-10.jpg',
      ]

  const igUrl = settings?.instagram || 'https://www.instagram.com/thretha_couture/'

  return (
    <section id="about" className="py-12 sm:py-20 lg:py-24 border-b border-ink/10 bg-paper">
      <div className="container px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-20 lg:space-y-24">
        {/* Story Section */}
        <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 items-center">
          <div className="space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-mango-light px-3 py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-mango-dark">
              <MapPin className="h-3 w-3 text-mango" />
              <span>{settings?.address || 'Kerala, India'}</span>
            </div>

            <h2 className="font-display text-3xl sm:text-5xl lg:text-6xl text-ink font-normal leading-[1.1]">
              A Wardrobe Worth Getting Dressed For
            </h2>

            <p className="text-xs sm:text-base text-cocoa leading-relaxed font-sans">
              {brandStory}
            </p>

            <div className="pt-1 sm:pt-2">
              <span className="font-hand text-xl sm:text-2xl text-mango-dark block">
                with warmth & grace,
              </span>
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] font-bold text-ink mt-0.5 block">
                The Thretha Atelier Team
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] mx-auto max-w-md overflow-hidden rounded-sm bg-sand/40 shadow-xl border border-ink/10">
              <img
                src={storyImg}
                alt="Thretha Atelier Story"
                className="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Instagram Grid Wall */}
        <div>
          <div className="mb-6 sm:mb-8 flex flex-row items-end justify-between gap-4 border-b border-ink/10 pb-3 sm:pb-4">
            <div>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] sm:tracking-[0.3em] text-mango-dark">
                Atelier Lookbook Feed
              </p>
              <h3 className="mt-0.5 sm:mt-1 font-display text-2xl sm:text-3xl text-ink font-normal">
                Follow The Journey
              </h3>
            </div>
            <a
              href={igUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-ink hover:text-mango-dark transition shrink-0"
            >
              <Instagram className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-coral" />
              <span>@thretha_couture</span>
              <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {instagramGallery.slice(0, 6).map((img, idx) => (
              <a
                key={idx}
                href={igUrl}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-square overflow-hidden rounded-sm bg-sand/30 border border-ink/10 shadow-2xs block"
              >
                <img
                  src={img}
                  alt={`Thretha Instagram Photo ${idx + 1}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-ink/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center text-cream">
                  <Instagram className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
