'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Menu,
  Search,
  Heart,
  ShoppingBag,
  User,
  X,
  Sparkles,
  ArrowRight,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

function AnnouncementBar({ settings }) {
  const threshold = settings?.shipping?.free_shipping_threshold || 2999
  const waNum = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')

  return (
    <aside aria-label="Announcement" className="relative z-50 bg-gradient-to-r from-plum-dark via-plum to-coral-dark text-cream text-[10px] sm:text-[11px] font-medium tracking-wider">
      <div className="container px-3 sm:px-6 lg:px-8 flex h-8 sm:h-9 items-center justify-between">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-hidden whitespace-nowrap">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-shimmer animate-ping shrink-0" />
          <span className="truncate">
            ✦ Free Express Shipping on orders over ₹{threshold.toLocaleString('en-IN')} across India
          </span>
        </div>

        <div className="hidden items-center gap-4 sm:flex text-[10px] uppercase tracking-widest shrink-0">
          <span className="text-sand/80">Kochi Atelier Direct</span>
          <a
            href={`https://wa.me/${waNum}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-semibold text-gold-shimmer hover:underline"
          >
            <WAIcon className="h-3 w-3" /> WhatsApp Concierge
          </a>
        </div>
      </div>
    </aside>
  )
}

export default function Navbar({ navigate, settings, initialCategories, wishCount = 0, cartCount = 0 }) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))
  const { user, isAuthenticated, logout } = useAuth()

  const [liveSettings, setLiveSettings] = useState(settings || null)
  const [categories, setCategories] = useState(() => Array.isArray(initialCategories) ? initialCategories : [])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isBagBouncing, setIsBagBouncing] = useState(false)
  const [radixReady, setRadixReady] = useState(false)

  // Keep the server and first client render identical. Radix derives trigger
  // aria-controls IDs from the render tree, so mount these interactive roots
  // after hydration while preserving their visible trigger buttons in SSR.
  useEffect(() => setRadixReady(true), [])

  // Sync / load settings
  useEffect(() => {
    setLiveSettings(settings || null)
  }, [settings])

  const combosEnabled = liveSettings?.combos_enabled !== false

  // Listen for Add-To-Bag flight animation completion to trigger bag bounce & badge pulse
  useEffect(() => {
    let timer = null
    const handleBagBounce = () => {
      setIsBagBouncing(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setIsBagBouncing(false), 450)
    }
    window.addEventListener('tc-bag-bounce', handleBagBounce)
    return () => {
      window.removeEventListener('tc-bag-bounce', handleBagBounce)
      if (timer) clearTimeout(timer)
    }
  }, [])

  const waNum = (liveSettings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')

  // Dynamically load categories from API
  useEffect(() => {
    setCategories(Array.isArray(initialCategories) ? initialCategories : [])
  }, [initialCategories])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setSearchOpen(false)
      nav(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

  return (
    <>
      <AnnouncementBar settings={settings} />

      <header className="sticky top-0 z-40 w-full border-b border-ink/10 bg-paper/90 backdrop-blur-xl transition-all duration-300">
        <div className="container px-3 sm:px-6 lg:px-8 flex h-14 sm:h-20 items-center justify-between">
          {/* Mobile Hamburger Drawer Trigger */}
          <div className="flex items-center xl:hidden">
            {radixReady ? (
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label="Open Navigation Menu"
                    className="grid h-11 w-11 place-items-center text-ink hover:text-mango-dark active:scale-95 transition"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>

              <SheetContent side="left" className="w-[85vw] max-w-sm bg-paper p-6 sm:p-8 flex flex-col justify-between overflow-y-auto">
                <div>
                  <SheetHeader className="text-left border-b border-ink/10 pb-4">
                    <SheetTitle className="font-display text-3xl tracking-wide text-ink font-normal">
                      THRETHA
                    </SheetTitle>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-mango-dark font-semibold">
                      Contemporary Kerala Atelier
                    </p>
                  </SheetHeader>

                  {/* Primary Editorial Links */}
                  <nav className="mt-6 flex flex-col space-y-3">
                    <button
                      type="button"
                      className="flex items-center justify-between text-left font-display text-2xl text-ink transition hover:text-mango-dark"
                      onClick={() => {
                        setMobileOpen(false)
                        nav('/shop')
                      }}
                    >
                      <span>The Complete Edit</span>
                      <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-ink text-cream font-sans font-semibold">
                        All
                      </span>
                    </button>

                    <button
                      type="button"
                      className="flex items-center justify-between text-left font-display text-2xl text-ink transition hover:text-mango-dark"
                      onClick={() => {
                        setMobileOpen(false)
                        nav('/new-arrivals')
                      }}
                    >
                      <span>New Arrivals</span>
                      <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-coral text-cream font-sans font-semibold">
                        Fresh
                      </span>
                    </button>

                    {combosEnabled && (
                      <button
                        type="button"
                        className="flex items-center justify-between text-left font-display text-2xl text-ink transition hover:text-mango-dark"
                        onClick={() => {
                          setMobileOpen(false)
                          nav('/combos')
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-mango-dark" /> Curated Combos
                        </span>
                        <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-gold/20 text-mango-dark font-sans font-bold border border-gold/40">
                          Bundles
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="flex items-center justify-between text-left font-display text-2xl text-ink transition hover:text-mango-dark"
                      onClick={() => {
                        setMobileOpen(false)
                        nav('/collections')
                      }}
                    >
                      <span>Collections</span>
                    </button>
                  </nav>

                  {/* Dynamic Category List */}
                  {categories.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-ink/10">
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cocoa-light mb-3">
                        Shop By Silhouette
                      </p>
                      <div className="flex flex-col space-y-2">
                        {categories.map((cat) => (
                          <button
                            key={cat.id || cat.slug}
                            type="button"
                            className="flex items-center justify-between text-left text-base text-ink hover:text-mango-dark font-medium transition py-1"
                            onClick={() => {
                              setMobileOpen(false)
                              nav(`/category/${cat.slug}`)
                            }}
                          >
                            <span>{cat.name}</span>
                            {cat.product_count !== undefined && (
                              <span className="text-xs text-cocoa-light">
                                {cat.product_count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* About & Utility Links */}
                  <div className="mt-6 pt-4 border-t border-ink/10 space-y-2">
                    <button
                      type="button"
                      className="block text-left text-xs uppercase tracking-wider text-cocoa hover:text-ink font-semibold py-1"
                      onClick={() => {
                        setMobileOpen(false)
                        nav(isAuthenticated ? '/account' : '/login')
                      }}
                    >
                      {isAuthenticated ? `My Account (${user?.name || 'Member'})` : 'Sign In / Account'}
                    </button>
                    <button
                      type="button"
                      className="block text-left text-xs uppercase tracking-wider text-cocoa hover:text-ink font-semibold py-1"
                      onClick={() => {
                        setMobileOpen(false)
                        nav('/about')
                      }}
                    >
                      About Atelier
                    </button>
                    <button
                      type="button"
                      className="block text-left text-xs uppercase tracking-wider text-cocoa hover:text-ink font-semibold py-1"
                      onClick={() => {
                        setMobileOpen(false)
                        nav('/track-order')
                      }}
                    >
                      Track My Order
                    </button>
                    {isAuthenticated && (
                      <button
                        type="button"
                        className="block text-left text-xs uppercase tracking-wider text-terracotta hover:underline font-semibold py-1"
                        onClick={async () => {
                          setMobileOpen(false)
                          await logout()
                          nav('/')
                        }}
                      >
                        Sign Out
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-ink/10 pt-6 space-y-3">
                  <a
                    href={`https://wa.me/${waNum}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3.5 text-xs uppercase tracking-[0.2em] font-semibold rounded-none shadow-md active:scale-95 transition"
                  >
                    <WAIcon className="h-4 w-4" /> Order on WhatsApp
                  </a>

                  {settings?.instagram && (
                    <a
                      href={settings.instagram}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-center text-xs text-cocoa hover:text-ink uppercase tracking-wider py-1 font-medium"
                    >
                      Follow @thretha_couture
                    </a>
                  )}
                </div>
              </SheetContent>
              </Sheet>
            ) : (
              <button
                type="button"
                aria-label="Open Navigation Menu"
                className="grid h-11 w-11 place-items-center text-ink hover:text-mango-dark active:scale-95 transition"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Brand Logo / Wordmark */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => nav('/')}
              className="text-left group flex flex-col items-start"
            >
              <span className="font-display text-xl sm:text-3xl font-medium tracking-wider text-ink group-hover:text-mango-dark transition duration-300 leading-none">
                THRETHA
              </span>
              <span className="text-[7.5px] sm:text-[9px] uppercase tracking-[0.4em] sm:tracking-[0.45em] text-mango-dark font-semibold block mt-0.5">
                COUTURE
              </span>
            </button>
          </div>

          {/* Desktop Navigation Links (Dynamic Category Integration) */}
          <nav className="hidden xl:flex items-center space-x-7">
            <button
              type="button"
              onClick={() => nav('/shop')}
              className="relative py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/80 hover:text-mango-dark transition-colors duration-200"
            >
              <span>The Edit</span>
            </button>

            {combosEnabled && (
              <button
                type="button"
                onClick={() => nav('/combos')}
                className="relative py-2 text-xs font-semibold uppercase tracking-[0.2em] text-mango-dark hover:text-mango transition-colors duration-200 flex items-center gap-1 font-bold"
              >
                <Sparkles className="h-3 w-3 text-mango-dark" />
                <span>Combos</span>
              </button>
            )}

            {/* Dynamic Category Navigation Links */}
            {categories.slice(0, 4).map((cat) => (
              <button
                key={cat.id || cat.slug}
                type="button"
                onClick={() => nav(`/category/${cat.slug}`)}
                className="relative py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/80 hover:text-mango-dark transition-colors duration-200"
              >
                <span>{cat.name}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => nav('/new-arrivals')}
              className="relative py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/80 hover:text-mango-dark transition-colors duration-200"
            >
              <span>New Arrivals</span>
              <span className="ml-1.5 inline-block text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-coral text-cream">
                Fresh
              </span>
            </button>

            <button
              type="button"
              onClick={() => nav('/collections')}
              className="relative py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/80 hover:text-mango-dark transition-colors duration-200"
            >
              <span>Collections</span>
            </button>

            <button
              type="button"
              onClick={() => nav('/about')}
              className="relative py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/80 hover:text-mango-dark transition-colors duration-200"
            >
              <span>Atelier</span>
            </button>
          </nav>

          {/* Action Icons */}
          <div className="flex items-center space-x-0 sm:space-x-4">
            {/* Search Popover */}
            {radixReady ? (
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Search Collection"
                    className="grid h-11 w-11 place-items-center text-ink hover:text-mango-dark transition rounded-full hover:bg-sand/30 active:scale-95"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-72 sm:w-96 bg-paper p-4 border border-ink/15 shadow-2xl rounded-none"
                >
                  <form onSubmit={handleSearchSubmit}>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
                      <Input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search sarees, dresses, crop tops, fabrics…"
                        className="rounded-none border-ink/20 bg-cream pl-9 pr-8 text-xs focus-visible:border-mango focus-visible:ring-mango/20"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cocoa-light hover:text-ink"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Dynamic Category Quick Pills */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-cocoa-light flex-wrap gap-1">
                      <span>Popular:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map((c) => (
                          <button
                            key={c.id || c.slug}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false)
                              nav(`/category/${c.slug}`)
                            }}
                            className="text-ink hover:text-mango-dark font-medium underline"
                          >
                            {c.name}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setSearchOpen(false)
                            nav('/new-arrivals')
                          }}
                          className="text-ink hover:text-mango-dark font-medium underline"
                        >
                          New
                        </button>
                      </div>
                    </div>
                  </form>
                </PopoverContent>
              </Popover>
            ) : (
              <button
                type="button"
                aria-label="Search Collection"
                className="grid h-11 w-11 place-items-center text-ink hover:text-mango-dark transition rounded-full hover:bg-sand/30 active:scale-95"
              >
                <Search className="h-4 w-4" />
              </button>
            )}

            {/* Account Profile / Sign In Button */}
            <button
              type="button"
              aria-label={isAuthenticated ? 'My Account' : 'Sign In'}
              onClick={() => nav(isAuthenticated ? '/account' : '/login')}
              className="relative hidden min-[400px]:grid h-11 w-11 place-items-center text-ink hover:text-gold transition rounded-full hover:bg-sand/30 active:scale-95"
            >
              <User className={cn('h-4 w-4', isAuthenticated && 'text-gold stroke-[2.2]')} />
              {isAuthenticated && (
                <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-paper" />
              )}
            </button>

            {/* Wishlist Button */}
            <button
              type="button"
              aria-label="Wishlist"
              onClick={() => nav('/wishlist')}
              className="relative grid h-11 w-11 place-items-center text-ink hover:text-coral transition rounded-full hover:bg-sand/30 active:scale-95"
            >
              <Heart className={cn('h-4 w-4', wishCount > 0 && 'fill-coral text-coral')} />
              {wishCount > 0 && (
                <span className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-coral text-[9px] font-bold text-cream">
                  {wishCount}
                </span>
              )}
            </button>

            {/* Shopping Bag Button */}
            <button
              type="button"
              id="navbar-bag-button"
              data-cart-button="true"
              aria-label="Shopping Bag"
              onClick={() => nav('/cart')}
              className={cn(
                "relative flex items-center justify-center gap-1.5 bg-ink text-cream hover:bg-cocoa-dark w-11 sm:w-auto px-0 sm:px-3.5 py-2.5 sm:py-2 rounded-none transition-all duration-300 text-xs font-semibold uppercase tracking-wider shadow-sm min-h-[44px] active:scale-95",
                isBagBouncing && "animate-bag-bounce ring-1 ring-mango/50 bg-ink"
              )}
            >
              <ShoppingBag className={cn("h-3.5 w-3.5 transition-transform duration-300", isBagBouncing && "scale-110 text-mango")} />
              <span className="hidden sm:inline">Bag</span>
              {cartCount > 0 && (
                <span
                  className={cn(
                    "absolute right-0 top-0 sm:static grid h-4 min-w-4 px-0.5 place-items-center rounded-full bg-mango text-[9px] font-bold text-ink sm:ml-0.5 transition-transform duration-300",
                    isBagBouncing && "animate-badge-pulse scale-125 bg-mango"
                  )}
                >
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>
    </>
  )
}
