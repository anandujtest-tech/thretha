import { pageMetadata } from '@/lib/seo'
import { Caveat } from 'next/font/google'

const caveat = Caveat({ subsets: ['latin'], weight: 'variable', display: 'swap', variable: '--font-caveat' })

export const metadata = pageMetadata({ title: 'Our Story', description: 'Discover the story and Kerala-inspired style behind Thretha Couture.', path: '/about' })

export default function AboutLayout({ children }) { return <div className={caveat.variable}>{children}</div> }
