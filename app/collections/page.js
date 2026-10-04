import StoreLayout from '@/components/tc/StoreLayout'
import CollectionsPage from '@/components/tc/CollectionsPage'
import { getCategories } from '@/lib/seoData'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ title: 'Collections', description: 'Browse Thretha Couture collections of sarees and contemporary Kerala-inspired fashion.', path: '/collections' })

export default async function CollectionsRoute() {
  let categories
  try { categories = await getCategories() } catch (error) { console.error('Collections SEO data unavailable:', error) }
  return <StoreLayout><CollectionsPage initialCategories={categories} /></StoreLayout>
}
