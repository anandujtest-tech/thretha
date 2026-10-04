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

function StoreLayoutInner({ children, initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || null)
  const pathname = usePathname()
  const router = useRouter()
  const { cartCount, wishCount } = useCart()
  const isHome = pathname === '/'

  useEffect(() => {
    let active = true
    const loadSettings = () => api('/settings').then((current) => { if (active) setSettings(current) }).catch(() => {})
    if (initialSettings) setSettings(initialSettings)
    else loadSettings()
    window.addEventListener('tc-storefront-settings-changed', loadSettings)
    return () => {
      active = false
      window.removeEventListener('tc-storefront-settings-changed', loadSettings)
    }
  }, [initialSettings])

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
          wishCount={wishCount}
          cartCount={cartCount}
        />
        <main id={isHome ? 'homepage-content' : undefined} className={isHome ? '' : 'animate-fade-in pb-16 md:pb-0'}>{children}</main>
      </div>

      <Footer navigate={navigate} settings={settings} editorial={isHome} />

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

export default function StoreLayout({ children, initialSettings }) {
  return <StoreLayoutInner initialSettings={initialSettings}>{children}</StoreLayoutInner>
}
