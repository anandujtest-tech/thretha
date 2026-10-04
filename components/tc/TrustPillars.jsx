'use client'

import { Sparkles, Truck, ShieldCheck, MessageCircle } from 'lucide-react'

const PILLARS = [
  {
    Icon: Truck,
    title: 'Free Shipping',
    sub: 'Across India above ₹2,999',
  },
  {
    Icon: Sparkles,
    title: 'Natural Fibers',
    sub: 'Breathable handlooms & pure cottons',
  },
  {
    Icon: ShieldCheck,
    title: 'Secure Payments',
    sub: 'Protected 256-bit Cashfree checkout',
  },
  {
    Icon: MessageCircle,
    title: 'WhatsApp Concierge',
    sub: 'Personal styling assistance',
  },
]

export default function TrustPillars() {
  return (
    <div
      aria-label="Service highlights"
      className="bg-ink/95 border-b border-white/5"
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/8 divide-y divide-white/8 lg:divide-y-0">
          {PILLARS.map(({ Icon, title, sub }) => (
            <div
              key={title}
              className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-5 sm:py-6"
            >
              <span className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full bg-gold/15 shrink-0">
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gold" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-sans font-semibold text-cream uppercase tracking-[0.15em] truncate">
                  {title}
                </p>
                <p className="text-[10px] sm:text-[11px] text-cream/45 font-sans leading-snug mt-0.5 line-clamp-2">
                  {sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
