'use client'

import { useState, useEffect } from 'react'
import {
  Instagram,
  ExternalLink,
  Video,
  ShoppingBag,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const EXPECTED_HANDLE = 'thretha_couture'
const OFFICIAL_PROFILE_URL = 'https://www.instagram.com/thretha_couture/'

export default function LookbookWall({ settings, editorial = false, content = {}, initialFeedData = null }) {
  const igConfig = settings?.instagram_feed

  const [feedData, setFeedData] = useState(initialFeedData)
  const [loading, setLoading] = useState(!initialFeedData)
  const [failedImages, setFailedImages] = useState({})
  const [activeShopModalPost, setActiveShopModalPost] = useState(null)

  useEffect(() => {
    if (initialFeedData) return
    if (igConfig?.enabled === false) return
    let isMounted = true

    api('/instagram/feed')
      .then((data) => {
        if (isMounted && data) {
          setFeedData(data)
        }
      })
      .catch(() => {
        // Silently catch and avoid crashing
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [igConfig?.enabled, initialFeedData])

  useEffect(() => {
    if (!initialFeedData) return
    setFeedData(initialFeedData)
    setLoading(false)
  }, [initialFeedData])

  // Hooks must remain stable when settings arrive asynchronously.
  if (igConfig?.enabled === false) return null

  // If public feed API explicitly returned enabled: false, hide section
  if (feedData && feedData.enabled === false) {
    return null
  }

  // Only display real Instagram posts from active source — zero fake/seed content
  const posts = Array.isArray(feedData?.posts) ? feedData.posts : []
  const postsToDisplay = feedData?.posts_to_display || igConfig?.posts_to_display || 6
  const shown = posts.slice(0, postsToDisplay)

  const username = EXPECTED_HANDLE
  const profileUrl = OFFICIAL_PROFILE_URL
  const openInNewTab = feedData?.open_in_new_tab !== false && igConfig?.open_in_new_tab !== false
  const showCaptions = Boolean(feedData?.show_captions || igConfig?.show_captions)
  const showUsername = feedData?.show_username !== false && igConfig?.show_username !== false

  const handleImageError = (postId) => {
    setFailedImages((prev) => ({ ...prev, [postId]: true }))
  }

  if (editorial && (loading || shown.length === 0)) return (
    <section className="fashion-social-cta" aria-label="Follow Thretha"><span className="fashion-eyebrow">{content.journey_kicker || 'A little inspiration, daily.'}</span><a href={profileUrl} target="_blank" rel="noopener noreferrer" className="fashion-link">@{username} <ArrowRight size={16} aria-hidden="true" /></a></section>
  )

  return (
    <section
      aria-labelledby="lookbook-heading"
      className={cn('py-14 sm:py-20 lg:py-24 bg-paper border-b border-ink/8 relative overflow-hidden', editorial && 'fashion-social')}
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Editorial Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-12">
          <div>
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.28em] text-cocoa/70 font-sans font-semibold mb-2">
              {content.journey_kicker || 'The Thretha Look'}
            </p>
            <h2
              id="lookbook-heading"
              className="font-display text-[clamp(1.75rem,5vw,3rem)] text-ink font-normal leading-[1.1] tracking-tight"
            >
              {content.journey_heading || 'Follow The Journey'}
            </h2>
          </div>

          {showUsername && (
            <a
              href={profileUrl}
              target={openInNewTab ? '_blank' : undefined}
              rel={openInNewTab ? 'noopener noreferrer' : undefined}
              aria-label={`Follow @${username} on Instagram`}
              className="inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold uppercase tracking-[0.18em] text-ink hover:text-terracotta transition-colors border-b border-ink/30 pb-0.5 hover:border-terracotta self-start sm:self-end"
            >
              <Instagram className="h-3.5 w-3.5 text-gold-dark" />
              <span>@{username}</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          )}
        </div>

        {/* If no real posts available, render graceful placeholder empty state */}
        {shown.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-ink/15 rounded-sm bg-sand/15 max-w-xl mx-auto p-8 space-y-3">
            <Instagram className="h-8 w-8 text-gold-dark/70 mx-auto" />
            <p className="text-xs uppercase tracking-[0.2em] font-sans font-semibold text-cocoa">
              Instagram posts will appear here once the feed is connected.
            </p>
            <p className="text-xs text-ink/60 font-sans leading-relaxed">
              Explore our latest atelier pieces and stories directly on Instagram{' '}
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-terracotta font-medium"
              >
                @{username}
              </a>
            </p>
          </div>
        ) : (
          /* ── Asymmetric Editorial Grid with Real Posts Only ── */
          <div className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1.3fr] gap-2 sm:gap-3 auto-rows-[minmax(120px,1fr)]', editorial && 'fashion-social-grid')}>
            {shown.map((post, i) => {
              const isTall = i === 0 || i === 3
              const hasPermalink = Boolean(post.permalink && post.permalink.startsWith('https://'))
              const linkUrl = hasPermalink ? post.permalink : null
              const imgSrc = post.thumbnail_url || post.media_url
              const isFailed = failedImages[post.id || i]
              const hasLinkedProducts = Array.isArray(post.linked_products) && post.linked_products.length > 0

              const cardContent = (
                <>
                  {isFailed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-sand/30 text-cocoa p-4 text-center">
                      <Instagram className="h-6 w-6 text-gold-dark opacity-50 mb-1" />
                      <span className="text-[10px] uppercase font-sans tracking-widest text-cocoa/70">
                        @thretha_couture
                      </span>
                    </div>
                  ) : (
                    <img
                      src={imgSrc}
                      alt={post.alt_text || `Thretha Couture Instagram post ${i + 1}`}
                      loading="lazy"
                      onError={() => handleImageError(post.id || i)}
                      className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
                      draggable={false}
                    />
                  )}

                  {/* Video Indicator */}
                  {post.is_video && !isFailed && (
                    <div className="absolute top-2.5 right-2.5 bg-black/40 backdrop-blur-xs text-white p-1 rounded-full pointer-events-none transition-opacity group-hover:opacity-0">
                      <Video className="h-3.5 w-3.5" />
                    </div>
                  )}

                  {/* Shop This Look Badge on Card */}
                  {hasLinkedProducts && !isFailed && (
                    <div className="absolute bottom-2.5 left-2.5 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setActiveShopModalPost(post)
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ink/80 backdrop-blur-xs text-cream hover:bg-gold-dark text-[10px] uppercase tracking-wider font-semibold shadow-xs transition-colors"
                      >
                        <ShoppingBag className="h-3 w-3 text-gold-light" />
                        <span>Shop This Look</span>
                      </button>
                    </div>
                  )}

                  {/* Editorial Hover Overlay */}
                  <div className="absolute inset-0 bg-ink/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center text-cream p-4 text-center">
                    <Instagram className="h-6 w-6 text-gold-light mb-2 transition-transform duration-300 group-hover:scale-110" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-cream">
                      {hasPermalink
                        ? post.is_video
                          ? 'Watch on Instagram'
                          : 'View on Instagram'
                        : 'Follow @thretha_couture'}
                    </span>

                    {showCaptions && post.caption && (
                      <p className="text-[11px] line-clamp-2 mt-2 text-cream/90 font-light max-w-[200px] leading-relaxed">
                        {post.caption}
                      </p>
                    )}

                    {hasLinkedProducts && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setActiveShopModalPost(post)
                        }}
                        className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-cream/90 text-ink text-[10px] uppercase tracking-widest font-semibold hover:bg-gold hover:text-ink transition-colors"
                      >
                        <ShoppingBag className="h-3 w-3" />
                        <span>Shop Pieces ({post.linked_products.length})</span>
                      </button>
                    )}
                  </div>
                </>
              )

              const cardClasses = cn(
                'group relative overflow-hidden bg-sand/40 border border-ink/8 block focus:outline-none focus:ring-2 focus:ring-gold-dark focus:ring-offset-2',
                isTall ? 'lg:row-span-2' : '',
                'aspect-square lg:aspect-auto'
              )

              if (hasPermalink) {
                return (
                  <a
                    key={post.id || post.instagram_id || i}
                    href={linkUrl}
                    target={openInNewTab ? '_blank' : undefined}
                    rel={openInNewTab ? 'noopener noreferrer' : undefined}
                    aria-label={post.alt_text || `Thretha Couture on Instagram — post ${i + 1}`}
                    className={cardClasses}
                  >
                    {cardContent}
                  </a>
                )
              }

              return (
                <div
                  key={post.id || post.instagram_id || i}
                  aria-label={post.alt_text || `Thretha Couture on Instagram — post ${i + 1}`}
                  className={cardClasses}
                >
                  {cardContent}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* ── SHOP THIS LOOK MODAL / DRAWER ── */}
      {activeShopModalPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setActiveShopModalPost(null)}
        >
          <div
            className="relative w-full max-w-lg bg-paper border border-ink/15 shadow-2xl p-6 sm:p-8 space-y-6 overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-ink/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-gold-dark" />
                <h3 className="font-display text-xl sm:text-2xl text-ink font-normal">
                  Shop This Look
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveShopModalPost(null)}
                aria-label="Close Shop Look"
                className="p-1.5 text-cocoa hover:text-ink hover:bg-sand/40 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Post Snapshot */}
            <div className="flex items-center gap-3.5 bg-sand/30 p-3 border border-ink/10">
              <div className="h-14 w-14 shrink-0 bg-sand/60 overflow-hidden border border-ink/10">
                <img
                  src={activeShopModalPost.thumbnail_url || activeShopModalPost.media_url}
                  alt="Look snapshot"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink/80 line-clamp-2 font-sans italic">
                  {activeShopModalPost.caption || 'Thretha Couture artisanal ensemble styling.'}
                </p>
                {activeShopModalPost.permalink && (
                  <a
                    href={activeShopModalPost.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-gold-dark hover:underline mt-1"
                  >
                    <span>View original Instagram post</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Associated Products List */}
            <div className="overflow-y-auto space-y-3 divide-y divide-ink/10 flex-1 pr-1">
              {activeShopModalPost.linked_products?.map((prod) => (
                <div key={prod.id} className="pt-3 first:pt-0 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-16 w-14 shrink-0 bg-sand/40 border border-ink/10 overflow-hidden">
                      {prod.image ? (
                        <img
                          src={prod.image}
                          alt={prod.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-cocoa-light">
                          <ShoppingBag className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold text-ink line-clamp-1 font-sans">
                        {prod.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        {prod.discount_price ? (
                          <>
                            <span className="font-bold text-ink">₹{prod.discount_price.toLocaleString('en-IN')}</span>
                            <span className="text-cocoa-light line-through text-[11px]">₹{prod.price.toLocaleString('en-IN')}</span>
                          </>
                        ) : (
                          <span className="font-bold text-ink">₹{prod.price.toLocaleString('en-IN')}</span>
                        )}
                      </div>
                      <span className={cn(
                        'text-[10px] uppercase font-mono tracking-wider',
                        prod.in_stock ? 'text-emerald-700' : 'text-coral'
                      )}>
                        {prod.in_stock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/product/${prod.slug}`}
                    onClick={() => setActiveShopModalPost(null)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink text-cream hover:bg-terracotta text-xs uppercase tracking-wider font-semibold transition-colors"
                  >
                    <span>View Piece</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>

            {/* Footer Dismiss */}
            <div className="border-t border-ink/10 pt-4 flex justify-between items-center text-xs text-cocoa">
              <span>{activeShopModalPost.linked_products?.length} piece(s) in this look</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveShopModalPost(null)}
                className="rounded-none text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
