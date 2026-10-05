'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/tc'
import { STOREFRONT_SETTINGS_CHANNEL } from '@/lib/storefrontEvents'

const TryOnSettingsContext = createContext({ settings: null, loaded: false, refresh: async () => {} })

export function TryOnSettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const pendingRequest = useRef(null)

  const refresh = useCallback(async () => {
    if (pendingRequest.current) return pendingRequest.current
    const request = (async () => {
    try {
      const current = await api('/tryon/settings')
      setSettings(current)
      setLoaded(true)
      return current
    } catch {
      // Fail closed: do not advertise a feature when its authoritative state is unknown.
      setSettings(null)
      setLoaded(true)
      return null
    }
    })()
    pendingRequest.current = request
    try {
      return await request
    } finally {
      if (pendingRequest.current === request) pendingRequest.current = null
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = () => { if (active) refresh() }
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    const onVisibility = () => { if (document.visibilityState === 'visible') load() }
    const onLocalUpdate = () => { if (loaded) load() }
    if (!loaded) return () => { active = false }
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
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('tc-storefront-settings-changed', onLocalUpdate)
      document.removeEventListener('visibilitychange', onVisibility)
      channel?.close()
    }
  }, [loaded, refresh])

  const value = useMemo(() => ({ settings, loaded, refresh }), [settings, loaded, refresh])
  return <TryOnSettingsContext.Provider value={value}>{children}</TryOnSettingsContext.Provider>
}

export function useTryOnAvailability(mode = 'product', productEnabled = true) {
  const { settings, loaded, refresh } = useContext(TryOnSettingsContext)
  useEffect(() => {
    if (!loaded) refresh()
  }, [loaded, refresh])
  const modeEnabled = mode === 'combo'
    ? settings?.combo_tryon_enabled === true
    : settings?.product_tryon_enabled === true
  return {
    settings,
    refresh,
    loaded,
    available: settings?.enabled === true && modeEnabled && productEnabled !== false,
  }
}
