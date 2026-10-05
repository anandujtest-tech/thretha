import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import ProductGrid from '@/components/tc/ProductGrid'
import { getCategory, getProducts } from '@/lib/seoData'
import { breadcrumbJsonLd, categoryMetadata, jsonLd, pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }) {
  const { slug } = await params
  try {
    const category = await getCategory(slug)
    if (!category) notFound()
    return categoryMetadata(category)
  } catch (error) {
    if (error?.digest?.startsWith('NEXT_')) throw error
    return pageMetadata({ title: 'Collections', description: 'Explore current collections at Thretha Couture.', path: `/category/${slug}`, noindex: true })
  }
}

export default async function CategoryPage({ params }) {
  const { slug } = await params
  let category, products
  try {
    category = await getCategory(slug)
    if (!category) notFound()
    if (category.slug !== slug) permanentRedirect(`/category/${encodeURIComponent(category.slug)}`)
    products = await getProducts({ category_id: category.id })
  } catch (error) {
    if (error?.digest?.startsWith('NEXT_')) throw error
    console.error('Category SEO data unavailable:', error)
  }
  return <>
    {category && <>
      <nav aria-label="Breadcrumb" className="container pt-6 text-xs"><Link href="/">Home</Link> / <Link href="/collections">Collections</Link> / <span>{category.name}</span></nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Collections', path: '/collections' }, { name: category.name, path: `/category/${slug}` }])) }} />
    </>}
    <ProductGrid key={slug} path={`/category/${slug}`} initialCategory={category} initialProducts={products} />
  </>
}
