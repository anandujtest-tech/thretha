'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, PhoneCall, Mail, Instagram, ArrowUpRight } from 'lucide-react'

function WAIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

export default function Footer({ navigate, settings, initialCategories, resolvedCategories, editorial = false }) {
  const [categories, setCategories] = useState(() => Array.isArray(initialCategories) ? initialCategories : [])

  useEffect(() => {
    if (Array.isArray(initialCategories)) setCategories(initialCategories)
    else if (Array.isArray(resolvedCategories)) setCategories(resolvedCategories)
  }, [initialCategories, resolvedCategories])

  const waNum = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')
  const waUrl = `https://wa.me/${waNum}`

  if (editorial) return (
    <footer className="fashion-footer">
      <div className="fashion-footer-grid">
        <div className="fashion-footer-brand"><Link href="/" className="fashion-wordmark">THRETHA</Link><p>Made for your moments.</p></div>
        <div><h2>Shop</h2><nav aria-label="Footer shopping">{categories.slice(0, 4).map((cat) => <Link key={cat.id || cat.slug} href={`/category/${cat.slug}`}>{cat.name}</Link>)}<Link href="/collections">Collections</Link>{settings?.combos_enabled !== false && <Link href="/combos">Curated combos</Link>}<Link href="/shop">Shop all</Link></nav></div>
        <div><h2>Help</h2><nav aria-label="Customer help"><a href={waUrl} target="_blank" rel="noreferrer">Contact / WhatsApp</a><Link href="/track-order">Track an order</Link><Link href="/account">My account</Link><Link href="/about">About Thretha</Link>{settings?.email && <a href={`mailto:${settings.email}`}>Email us</a>}</nav></div>
        <div><h2>Follow</h2><a href={settings?.instagram || 'https://www.instagram.com/thretha_couture/'} target="_blank" rel="noreferrer" className="fashion-footer-social">Instagram <ArrowUpRight size={14} aria-hidden="true" /></a></div>
      </div>
      <div className="fashion-footer-bottom"><span>© {new Date().getFullYear()} Thretha Couture</span><span>Everyday. Occasion. You.</span></div>
    </footer>
  )

  return (
    <footer className="border-t border-ink/10 bg-cream">
      <div className="container px-4 sm:px-6 lg:px-8 grid gap-8 sm:gap-10 py-12 sm:py-16 md:grid-cols-4">
        {/* Brand & Mission */}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <span className="font-display text-2xl sm:text-3xl text-ink font-medium tracking-wide leading-none block">
              THRETHA
            </span>
            <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.45em] text-mango-dark font-semibold block mt-0.5">
              COUTURE
            </span>
          </div>
          <p className="max-w-xs text-xs text-cocoa leading-relaxed">
            A wardrobe worth getting dressed for. Contemporary drapes, silhouettes, and everyday essentials handcrafted with a soft spot for Kerala elegance.
          </p>
          <div>
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#25D366] hover:underline"
            >
              <WAIcon className="h-4 w-4" /> WhatsApp Concierge
            </a>
          </div>
        </div>

        {/* Dynamic Silhouettes / Categories */}
        <div>
          <p className="mb-3 sm:mb-4 text-[11px] font-bold uppercase tracking-[0.25em] text-ink">
            Silhouettes
          </p>
          <ul className="space-y-2.5 text-xs text-cocoa">
            {categories.slice(0, 5).map((cat) => (
              <li key={cat.id || cat.slug}>
                <Link href={`/category/${cat.slug}`} className="hover:text-mango-dark transition">
                  {cat.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/new-arrivals" className="hover:text-mango-dark transition">
                Just Dropped Pieces
              </Link>
            </li>
            <li>
              <Link href="/shop" className="hover:text-mango-dark transition">
                The Complete Catalogue
              </Link>
            </li>
          </ul>
        </div>

        {/* Quick Links & Service */}
        <div>
          <p className="mb-3 sm:mb-4 text-[11px] font-bold uppercase tracking-[0.25em] text-ink">
            Atelier & Service
          </p>
          <ul className="space-y-2.5 text-xs text-cocoa">
            <li>
              <Link href="/about" className="hover:text-mango-dark transition">
                Our Story & Craft
              </Link>
            </li>
            <li>
              <Link href="/track-order" className="hover:text-mango-dark transition font-semibold text-ink">
                Track Your Order →
              </Link>
            </li>
            <li>
              <Link href="/wishlist" className="hover:text-mango-dark transition">
                Saved Wishlist
              </Link>
            </li>
            <li>
              <Link href="/collections" className="hover:text-mango-dark transition">
                Lookbook Collections
              </Link>
            </li>
            <li>
              <span className="text-[11px] text-cocoa-light">
                Pan-India Express: {settings?.shipping?.delivery_timeframe || '3–6 days'}
              </span>
            </li>
          </ul>
        </div>

        {/* Atelier Direct Contact */}
        <div className="space-y-3 text-xs text-cocoa">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-ink">
            Kochi Atelier
          </p>
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-mango-dark mt-0.5" />
            <span className="leading-relaxed">
              {settings?.address || 'Kochi, Kerala, India — 682001'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 shrink-0 text-mango-dark" />
            <span>{settings?.phone || '+91 83018 24696'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-mango-dark" />
            <span>{settings?.email || 'care@threthacouture.com'}</span>
          </div>

          <div className="pt-2">
            <a
              href={settings?.instagram || 'https://www.instagram.com/thretha_couture/'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink hover:text-mango-dark transition"
            >
              <Instagram className="h-4 w-4 text-coral" />
              <span>@thretha_couture</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-ink/10 bg-paper py-5 text-center text-[11px] text-cocoa-light">
        <div className="container px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Thretha Couture. Handcrafted with reverence in Kerala.</p>
          <div className="flex gap-4">
            <Link href="/shop" className="hover:underline">Shop</Link>
            <Link href="/about" className="hover:underline">About</Link>
            <Link href="/track-order" className="hover:underline">Track</Link>
            <Link href="/admin" className="hover:underline text-cocoa-light/60">Console</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
