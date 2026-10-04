export const STOREFRONT_SETTINGS_CHANNEL = 'tc-storefront-settings'

export function broadcastStorefrontSettingsChanged(scope = 'all') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('tc-storefront-settings-changed', { detail: { scope } }))
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(STOREFRONT_SETTINGS_CHANNEL)
    channel.postMessage({ type: 'settings-changed', scope })
    channel.close()
  }
}
