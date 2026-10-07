export function orderProductsByRequestedSlugs(requestedSlugs, products, currentProductId) {
  const bySlug = new Map((Array.isArray(products) ? products : [])
    .filter((product) => product?.active !== false && product?.id !== currentProductId && typeof product?.slug === 'string')
    .map((product) => [product.slug, product]))
  return [...new Set(Array.isArray(requestedSlugs) ? requestedSlugs : [])]
    .filter((slug) => typeof slug === 'string')
    .flatMap((slug) => bySlug.has(slug) ? [bySlug.get(slug)] : [])
}
