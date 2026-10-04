import CombosPageClient from '@/components/tc/CombosPageClient'
import { getCombos } from '@/lib/seoData'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ title: 'Curated Combos', description: 'Explore active Thretha Couture curated ensembles and choose pieces and sizes for your look.', path: '/combos' })

export default async function CombosPage() {
  let combos
  try { combos = await getCombos() } catch (error) { console.error('Combos SEO data unavailable:', error) }
  return <CombosPageClient initialCombos={combos} />
}
