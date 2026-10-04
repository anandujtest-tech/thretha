import './globals.css'
import { Providers } from './providers'
import { SITE_URL, BRAND_NAME } from '@/lib/seo'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: BRAND_NAME },
  icons: { apple: '/pwa-icons/apple-touch-icon.png' },
  title: `${BRAND_NAME} | Contemporary Kerala Fashion`,
  description:
    'Thretha Couture is a little wardrobe of sarees, crop tops and everyday favourites chosen with a soft spot for Kerala style. Browse the edit and order on WhatsApp.',
  openGraph: {
    title: 'Thretha Couture',
    description: 'A wardrobe worth getting dressed for. Kerala-inspired contemporary fashion.',
    type: 'website',
    siteName: BRAND_NAME,
  },
  twitter: { card: 'summary', title: BRAND_NAME, description: 'A wardrobe worth getting dressed for. Kerala-inspired contemporary fashion.' },
}

export const viewport = {
  themeColor: '#24221f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'window.__threthaDeferredInstallPrompt=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__threthaDeferredInstallPrompt=e});window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);',
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
