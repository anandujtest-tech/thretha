import StoreLayout from '@/components/tc/StoreLayout'
import HomeView from '@/components/tc/HomeView'
import { getCategories, getHomepageInstagramFeed, getProducts, getSettings } from '@/lib/seoData'
import { BRAND_NAME, jsonLd, organizationJsonLd, pageMetadata, websiteJsonLd } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  try {
    const settings = await getSettings()
    const hero = settings?.hero || {}
    const heroTitle = hero.title?.trim()
    const title = heroTitle && heroTitle.toLowerCase() !== BRAND_NAME.toLowerCase()
      ? [heroTitle, hero.kicker].filter(Boolean).join(' — ')
      : 'Contemporary Kerala Fashion'
    return pageMetadata({
      title,
      description: hero.subtitle || 'Discover Thretha Couture sarees, contemporary tops and thoughtfully chosen everyday favourites inspired by Kerala style.',
      path: '/',
    })
  } catch {
    return pageMetadata({
      title: 'Contemporary Kerala Fashion',
      description: 'Discover Thretha Couture sarees, contemporary tops and thoughtfully chosen everyday favourites inspired by Kerala style.',
      path: '/',
    })
  }
}

export default async function HomePage() {
  let initialData = null
  try {
    const [core, instagramFeed] = await Promise.all([
      Promise.all([
        getProducts({ new_arrival: true }), getProducts({ featured: true }), getCategories(), getSettings(),
      ]),
      getHomepageInstagramFeed().catch((error) => {
        console.error('Homepage Instagram feed unavailable:', error)
        return null
      }),
    ])
    const [arrivals, featured, categories, settings] = core
    initialData = { arrivals, featured, categories, settings, instagramFeed }
  } catch (error) {
    console.error('Homepage SEO data unavailable:', error)
  }
  return <StoreLayout initialSettings={initialData?.settings}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd(initialData?.settings)) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd()) }} />
    <HomeView initialData={initialData} />
  </StoreLayout>
}
