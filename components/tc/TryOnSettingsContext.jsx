'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/tc'
import { STOREFRONT_SETTINGS_CHANNEL } from '@/lib/storefrontEvents'

const TryOnSettingsContext = createContext({ settings: null, refresh: async () => {} })

export function TryOnSettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const current = await api('/tryon/settings')
      setSettings(current)
      return current
    } catch {
      // Fail closed: do not advertise a feature when its authoritative state is unknown.
      setSettings(null)
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      const current = await api('/tryon/settings').catch(() => null)
      if (active) setSettings(current)
    }
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    const onVisibility = () => { if (document.visibilityState === 'visible') load() }
    const onLocalUpdate = () => load()
    const interval = window.setInterval(onFocus, 30000)
    let channel
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(STOREFRONT_SETTINGS_CHANNEL)
      channel.onmessage = (event) => {
        if (event.data?.type === 'settings-changed') {
          load()
          window.dispatchEvent(new CustomEvent('tc-storefront-settings-changed', { detail: event.data }))
        }
      }
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('tc-storefront-settings-changed', onLocalUpdate)
    document.addEventListener('visibilitychange', onVisibility)
    load()
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('tc-storefront-settings-changed', onLocalUpdate)
      document.removeEventListener('visibilitychange', onVisibility)
      channel?.close()
    }
  }, [])

  const value = useMemo(() => ({ settings, refresh }), [settings, refresh])
  return <TryOnSettingsContext.Provider value={value}>{children}</TryOnSettingsContext.Provider>
}

export function useTryOnAvailability(mode = 'product', productEnabled = true) {
  const { settings, refresh } = useContext(TryOnSettingsContext)
  const modeEnabled = mode === 'combo'
    ? settings?.combo_tryon_enabled === true
    : settings?.product_tryon_enabled === true
  return {
    settings,
    refresh,
    available: settings?.enabled === true && modeEnabled && productEnabled !== false,
  }
}
