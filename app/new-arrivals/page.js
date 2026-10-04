import StoreLayout from '@/components/tc/StoreLayout'
import ProductGrid from '@/components/tc/ProductGrid'
import { getProducts } from '@/lib/seoData'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ title: 'New Arrivals', description: 'Discover the latest sarees and contemporary fashion arrivals at Thretha Couture.', path: '/new-arrivals' })

export default async function NewArrivalsPage() {
  let products
  try { products = await getProducts({ new_arrival: true }) } catch (error) { console.error('New arrivals SEO data unavailable:', error) }
  return <StoreLayout><ProductGrid path="/new-arrivals" initialProducts={products} /></StoreLayout>
}
