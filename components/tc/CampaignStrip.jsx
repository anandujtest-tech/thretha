'use client'

import { useEffect, useState } from 'react'

const MESSAGES = [
  'Handwoven In Kerala',
  'Mindful Drapes',
  'Modern Silhouettes',
  'Atelier Grade Craft',
  'Pure Natural Fibers',
  'Contemporary Indian Fashion',
  'Thoughtfully Tailored',
  'Made For Everyday Moments',
]

export default function CampaignStrip() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const h = (e) => setReduced(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const text = MESSAGES.map((m) => `${m} ·`).join('  ')
  // Duplicate so the marquee loops seamlessly
  const double = `${text}  ${text}`

  return (
    <div
      aria-hidden="true"
      className="w-full overflow-hidden bg-ink py-3.5 sm:py-4 border-b border-white/5 select-none"
    >
      <div
        className={
          reduced
            ? 'flex gap-8 px-6 flex-wrap'
            : 'flex whitespace-nowrap animate-marquee'
        }
        style={reduced ? {} : { willChange: 'transform' }}
      >
        <span className="font-sans text-[10px] sm:text-xs uppercase tracking-[0.22em] font-medium text-cream/55 shrink-0">
          {double}
        </span>
        {/* Second copy for seamless loop */}
        {!reduced && (
          <span className="font-sans text-[10px] sm:text-xs uppercase tracking-[0.22em] font-medium text-cream/55 shrink-0 ml-8">
            {double}
          </span>
        )}
      </div>
    </div>
  )
}

