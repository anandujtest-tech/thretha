import './globals.css'
import { Providers } from './providers'
import { SITE_URL, BRAND_NAME } from '@/lib/seo'
import { Cormorant_Garamond, Inter } from 'next/font/google'

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: 'variable', style: ['normal', 'italic'], display: 'swap', variable: '--font-cormorant' })
const inter = Inter({ subsets: ['latin'], weight: 'variable', display: 'swap', variable: '--font-inter' })

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
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <head>
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
