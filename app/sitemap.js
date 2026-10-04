import { getCategories, getCombos, getProducts } from '@/lib/seoData'
import { absoluteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export default async function sitemap() {
  const [categories, products, combos] = await Promise.all([getCategories(), getProducts({}), getCombos()])
  const staticRoutes = ['/', '/shop', '/collections', '/new-arrivals', '/combos', '/about']
  const entries = [
    ...staticRoutes.map(path => ({ url: absoluteUrl(path) })),
    ...categories.filter(item => item.slug).map(item => ({ url: absoluteUrl(`/category/${encodeURIComponent(item.slug)}`), lastModified: item.updated_at || item.created_at })),
    ...products.filter(item => item.slug).map(item => ({ url: absoluteUrl(`/product/${encodeURIComponent(item.slug)}`), lastModified: item.updated_at || item.created_at })),
    ...combos.filter(item => item.slug).map(item => ({ url: absoluteUrl(`/combos/${encodeURIComponent(item.slug)}`), lastModified: item.updated_at || item.created_at })),
  ]
  return entries.map(({ url, lastModified }) => ({ url, ...(lastModified && !Number.isNaN(Date.parse(lastModified)) ? { lastModified: new Date(lastModified) } : {}) }))
}
