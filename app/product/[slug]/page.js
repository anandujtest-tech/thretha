import { notFound, permanentRedirect } from 'next/navigation'
import StoreLayout from '@/components/tc/StoreLayout'
import ProductDetail from '@/components/tc/ProductDetail'
import ErrorBoundary from '@/components/tc/ErrorBoundary'
import { getCategoryById, getProduct } from '@/lib/seoData'
import { breadcrumbJsonLd, jsonLd, pageMetadata, productJsonLd, productMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { slug } = await params
  try {
    const product = await getProduct(slug)
    if (!product) notFound()
    return productMetadata(product)
  } catch (error) {
    if (error?.digest?.startsWith('NEXT_')) throw error
    return pageMetadata({ title: 'Shop', description: 'Explore current pieces at Thretha Couture.', path: `/product/${slug}`, noindex: true })
  }
}

export default async function ProductPageRoute({ params }) {
  const { slug } = await params
  let product, category
  try {
    product = await getProduct(slug)
    if (!product) notFound()
    if (product.slug !== slug) permanentRedirect(`/product/${encodeURIComponent(product.slug)}`)
    category = await getCategoryById(product.category_id)
  } catch (error) {
    if (error?.digest?.startsWith('NEXT_')) throw error
    console.error('Product SEO data unavailable:', error)
  }
  const trail = [{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }]
  if (category) trail.push({ name: category.name, path: `/category/${category.slug}` })
  if (product) trail.push({ name: product.name, path: `/product/${product.slug}` })
  return <StoreLayout>
    {product && <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(product)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(trail)) }} />
    </>}
    <ErrorBoundary sectionName="Product Details"><ProductDetail slug={slug} initialProduct={product} categorySlug={category?.slug} /></ErrorBoundary>
  </StoreLayout>
}
