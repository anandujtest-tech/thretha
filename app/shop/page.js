import StoreLayout from '@/components/tc/StoreLayout'
import ProductGrid from '@/components/tc/ProductGrid'
import { getProducts } from '@/lib/seoData'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ title: 'Shop All', description: 'Explore sarees, contemporary tops and everyday pieces from Thretha Couture.', path: '/shop' })

export default async function ShopPage() {
  let products
  try { products = await getProducts({}) } catch (error) { console.error('Shop SEO data unavailable:', error) }
  return <StoreLayout><ProductGrid path="/shop" initialProducts={products} /></StoreLayout>
}
