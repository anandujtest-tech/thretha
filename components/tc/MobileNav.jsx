'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Home, Sparkles, ShoppingBag, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

export default function MobileNav({ navigate, settings, path, wishCount = 0, cartCount = 0 }) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))
  const waNum = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')
  const [isBagBouncing, setIsBagBouncing] = useState(false)

  useEffect(() => {
    let timer = null
    const handleBounce = () => {
      setIsBagBouncing(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setIsBagBouncing(false), 450)
    }
    window.addEventListener('tc-bag-bounce', handleBounce)
    return () => {
      window.removeEventListener('tc-bag-bounce', handleBounce)
      if (timer) clearTimeout(timer)
    }
  }, [])

  const navItems = [
    { label: 'Home', href: '/', icon: Home, active: path === '/' },
    { label: 'Shop', href: '/shop', icon: Sparkles, active: path === '/shop' || (path && path.startsWith('/category/')) },
    { label: 'Bag', href: '/cart', icon: ShoppingBag, count: cartCount, active: path === '/cart', isBag: true },
    { label: 'Wishlist', href: '/wishlist', icon: Heart, count: wishCount, active: path === '/wishlist' },
  ]

  return (
    <nav aria-label="Mobile Navigation" className="fixed bottom-0 left-0 right-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur-xl md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-5 items-center py-1.5 text-center">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              id={item.isBag ? 'mobile-bag-nav-button' : undefined}
              data-cart-button={item.isBag ? 'true' : undefined}
              onClick={() => nav(item.href)}
              className={cn(
                'relative flex flex-col items-center justify-center min-h-[46px] py-1 transition duration-150 active:scale-95',
                item.active ? 'text-mango-dark font-bold' : 'text-cocoa hover:text-ink',
                item.isBag && isBagBouncing && 'animate-bag-bounce text-mango-dark'
              )}
            >
              <div className="relative">
                <Icon className={cn('h-4 w-4', item.active && 'scale-110', item.isBag && isBagBouncing && 'scale-125')} />
                {item.count > 0 && (
                  <span
                    className={cn(
                      'absolute -top-1.5 -right-2.5 grid h-4 w-4 place-items-center rounded-full bg-coral text-[9px] font-bold text-cream transition-transform duration-300',
                      item.isBag && isBagBouncing && 'animate-badge-pulse scale-135 bg-mango text-ink'
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </div>
              <span className="text-[9px] uppercase tracking-wider mt-1">{item.label}</span>
            </button>
          )
        })}

        {/* Direct WhatsApp Concierge CTA */}
        <a
          href={`https://wa.me/${waNum}`}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp Concierge"
          className="flex flex-col items-center justify-center min-h-[46px] py-1 text-[#25D366] active:scale-95 transition"
        >
          <WAIcon className="h-4 w-4" />
          <span className="text-[9px] uppercase tracking-wider mt-1 font-semibold">WhatsApp</span>
        </a>
      </div>
    </nav>
  )
}
