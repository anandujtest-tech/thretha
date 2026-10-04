import { BRAND_NAME } from '@/lib/seo'

export default function manifest() {
  return {
    // Resolve the app identity on the current origin. This keeps installs
    // scoped correctly on preview and HTTPS tunnel hosts such as ngrok.
    id: '/',
    name: BRAND_NAME,
    short_name: 'Thretha',
    description: 'Contemporary Kerala fashion from Thretha Couture.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfaf7',
    theme_color: '#24221f',
    icons: [
      { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
