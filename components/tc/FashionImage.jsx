'use client'

import { useState } from 'react'
import Image from 'next/image'

export function productImage(product) {
  const images = (product?.media || []).filter((item) => item.type !== 'video' && item.url)
  return images.find((item) => item.is_primary)?.url || images[0]?.url || ''
}

// Keep the frame stable when a catalog or externally hosted image is unavailable.
export default function FashionImage({ src, alt, sizes = '100vw', priority = false, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null)
  if (!src || failedSrc === src) {
    return <div className="fashion-image-empty" role="img" aria-label={`${alt} — image unavailable`}><span>THRETHA</span></div>
  }
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={className} onError={() => setFailedSrc(src)} />
}
