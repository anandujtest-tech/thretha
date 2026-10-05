'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/lib/tc'
import { useCart } from './CartContext'
import Navbar from './Navbar'
import Footer from './Footer'
import MobileNav from './MobileNav'
import VisitorTracker from './VisitorTracker'
import PwaInstallPrompt from './PwaInstallPrompt'
import VisitorLocationPrompt from './VisitorLocationPrompt'

function StoreLayoutInner({ children, initialSettings, initialCategories }) {
  const [settings, setSettings] = useState(initialSettings || null)
  const [categories, setCategories] = useState(() => Array.isArray(initialCategories) ? initialCategories : [])
  const pathname = usePathname()
  const router = useRouter()
  const { cartCount, wishCount, setStoreSettings } = useCart()
  const isHome = pathname === '/'

  useEffect(() => {
    let active = true
    const applySettings = (current) => {
      if (!active) return
      setSettings(current)
      setStoreSettings(current)
    }
    const loadSettings = () => api('/settings').then(applySettings).catch(() => {})
    const applyCategories = (current) => {
      if (active && Array.isArray(current)) setCategories(current)
    }
    const loadCategories = () => api('/categories').then(applyCategories).catch(() => {})
    if (initialSettings) applySettings(initialSettings)
    else loadSettings()
    if (Array.isArray(initialCategories)) applyCategories(initialCategories)
    else loadCategories()
    window.addEventListener('tc-storefront-settings-changed', loadSettings)
    return () => {
      active = false
      window.removeEventListener('tc-storefront-settings-changed', loadSettings)
    }
  }, [initialSettings, initialCategories, setStoreSettings])

  const navigate = (to) => {
    if (to.startsWith('/#')) {
      if (pathname !== '/') {
        router.push('/')
      }
      setTimeout(() => {
        const el = document.getElementById(to.slice(2))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 100)
      return
    }
    router.push(to)
  }

  return (
    <div className={`min-h-screen bg-paper text-ink flex flex-col justify-between selection:bg-mango-light selection:text-ink ${isHome ? 'fashion-store' : ''}`}>
      <VisitorTracker />
      <div>
        <PwaInstallPrompt enabled={isHome && settings?.pwa?.install_prompt_enabled !== false} />
        <Navbar
          navigate={navigate}
          settings={settings}
          initialCategories={categories}
          wishCount={wishCount}
          cartCount={cartCount}
        />
        <main id={isHome ? 'homepage-content' : undefined} className={isHome ? '' : 'animate-fade-in pb-16 md:pb-0'}>{children}</main>
        <VisitorLocationPrompt enabled={settings?.ask_visitor_location === true} />
      </div>

      <Footer navigate={navigate} settings={settings} initialCategories={categories} editorial={isHome} />

      {!isHome && <MobileNav
        navigate={navigate}
        path={pathname}
        settings={settings}
        wishCount={wishCount}
        cartCount={cartCount}
      />}
    </div>
  )
}

export default function StoreLayout({ children, initialSettings, initialCategories }) {
  return <StoreLayoutInner initialSettings={initialSettings} initialCategories={initialCategories}>{children}</StoreLayoutInner>
}
