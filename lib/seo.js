export const SITE_URL = 'https://thretha.in'
export const BRAND_NAME = 'Thretha Couture'

export function absoluteUrl(path) {
  if (!path) return null
  try {
    const url = new URL(path, SITE_URL)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export function cleanText(value, limit = 160) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

export function productImageUrls(product) {
  return (product?.media || [])
    .filter(item => item?.url && item.type !== 'video' && !/\.(mp4|webm|mov)(?:[?#]|$)/i.test(item.url))
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
    .map(item => absoluteUrl(item.url))
    .filter(Boolean)
}

export function pageMetadata({ title, description, path, image, noindex = false, type = 'website' }) {
  const canonical = absoluteUrl(path)
  const ogImage = absoluteUrl(image)
  const fullTitle = title ? `${title} | ${BRAND_NAME}` : `${BRAND_NAME} | Contemporary Kerala Fashion`
  return {
    title: fullTitle,
    description,
    ...(noindex ? { robots: { index: false, follow: false } } : { alternates: { canonical } }),
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      type,
      siteName: BRAND_NAME,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: fullTitle,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export function productMetadata(product) {
  const path = `/product/${encodeURIComponent(product.slug)}`
  const description = cleanText(product.description) || cleanText(`${product.name}${product.category_name ? ` in ${product.category_name}` : ''} at Thretha Couture.`)
  return pageMetadata({ title: product.name, description, path, image: productImageUrls(product)[0] })
}

export function categoryMetadata(category) {
  const description = cleanText(category.description) || cleanText(`Explore ${category.name} at Thretha Couture.`)
  return pageMetadata({ title: category.name, description, path: `/category/${encodeURIComponent(category.slug)}`, image: category.image })
}

export function productJsonLd(product) {
  const images = productImageUrls(product)
  const rawPrice = product.discount_price ?? product.price
  const price = rawPrice === null || rawPrice === undefined || rawPrice === '' ? NaN : Number(rawPrice)
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: absoluteUrl(`/product/${encodeURIComponent(product.slug)}`),
    brand: { '@type': 'Brand', name: BRAND_NAME },
    ...(product.description ? { description: cleanText(product.description, 5000) } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(images.length ? { image: images } : {}),
  }
  if (Number.isFinite(price) && price >= 0 && product.stock !== null && product.stock !== undefined && Number.isFinite(Number(product.stock))) {
    data.offers = {
      '@type': 'Offer',
      url: data.url,
      priceCurrency: 'INR',
      price,
      availability: Number(product.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    }
  }
  return data
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  }
}

export function organizationJsonLd(settings) {
  const instagram = absoluteUrl(settings?.instagram)
  const logo = absoluteUrl(settings?.logo_url)
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND_NAME,
    url: SITE_URL,
    ...(logo ? { logo } : {}),
    ...(instagram?.startsWith('https://www.instagram.com/') ? { sameAs: [instagram] } : {}),
  }
}

export function websiteJsonLd() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND_NAME, url: SITE_URL }
}

export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
