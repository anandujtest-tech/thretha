import { notFound, permanentRedirect } from 'next/navigation'
import ComboDetailClient from '@/components/tc/ComboDetailClient'
import { getCombo } from '@/lib/seoData'
import { cleanText, jsonLd, pageMetadata, breadcrumbJsonLd } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { slug } = await params
  try {
    const combo = await getCombo(slug)
    if (!combo) notFound()
    return pageMetadata({ title: combo.name, description: cleanText(combo.description) || `Explore ${combo.name} at Thretha Couture.`, path: `/combos/${combo.slug}`, image: combo.image })
  } catch (error) {
    if (error?.digest?.startsWith('NEXT_')) throw error
    return pageMetadata({ title: 'Curated Combos', description: 'Explore current ensembles at Thretha Couture.', path: `/combos/${slug}`, noindex: true })
  }
}

export default async function ComboDetailPage({ params }) {
  const { slug } = await params
  let combo
  try {
    combo = await getCombo(slug)
    if (!combo) notFound()
    if (combo.slug !== slug) permanentRedirect(`/combos/${encodeURIComponent(combo.slug)}`)
  } catch (error) {
    if (error?.digest?.startsWith('NEXT_')) throw error
    console.error('Combo SEO data unavailable:', error)
  }
  return <>
    {combo && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Combos', path: '/combos' }, { name: combo.name, path: `/combos/${combo.slug}` }])) }} />}
    <ComboDetailClient slug={slug} initialCombo={combo} />
  </>
}
