'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Cubic Bezier easing function
 * easeOutCubic: 1 - Math.pow(1 - t, 3)
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * FlyingCartAnimation Component
 * 
 * Creates an elegant, physics-inspired curved flight trajectory of the product thumbnail
 * from the "Add to Shopping Bag" button to the Navbar Shopping Bag icon.
 */
export default function FlyingCartAnimation({
  image,
  sourceRect,
  destRect,
  onComplete,
}) {
  const thumbRef = useRef(null)
  const animFrameRef = useRef(null)

  useEffect(() => {
    if (!sourceRect || !destRect) {
      if (onComplete) onComplete()
      return
    }

    const thumbEl = thumbRef.current
    if (!thumbEl) {
      if (onComplete) onComplete()
      return
    }

    // Thumbnail dimensions
    const THUMB_WIDTH = 58
    const THUMB_HEIGHT = 72

    // Calculate start center
    const startX = sourceRect.left + sourceRect.width / 2 - THUMB_WIDTH / 2
    const startY = sourceRect.top + sourceRect.height / 2 - THUMB_HEIGHT / 2

    // Calculate end center
    const endX = destRect.left + destRect.width / 2 - (THUMB_WIDTH * 0.25) / 2
    const endY = destRect.top + destRect.height / 2 - (THUMB_HEIGHT * 0.25) / 2

    // Control point for smooth parabolic arc
    // Arcs upward and slightly inward before descending into bag
    const dx = endX - startX
    const dy = endY - startY
    const arcHeight = Math.max(80, Math.abs(dy) * 0.35)
    const controlX = startX + dx * 0.3 - 40
    const controlY = Math.min(startY, endY) - arcHeight

    const startTime = performance.now()
    const DURATION = 720 // 720ms for smooth luxury feel

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(1, elapsed / DURATION)
      const easeT = easeInOutQuad(progress)

      // Quadratic Bezier interpolation: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
      const oneMinusT = 1 - easeT
      const currentX =
        oneMinusT * oneMinusT * startX +
        2 * oneMinusT * easeT * controlX +
        easeT * easeT * endX

      const currentY =
        oneMinusT * oneMinusT * startY +
        2 * oneMinusT * easeT * controlY +
        easeT * easeT * endY

      // Scale down as it approaches bag (1.0 -> 0.28)
      const currentScale = 1 - 0.72 * easeOutCubic(progress)

      // Fade out in final 18% of flight
      let currentOpacity = 1
      if (progress > 0.82) {
        currentOpacity = Math.max(0, 1 - (progress - 0.82) / 0.18)
      }

      // Subtle rotation tilt (0deg -> 12deg -> 4deg)
      const currentRotate = progress < 0.7 ? progress * 14 : 14 - (progress - 0.7) * 20

      thumbEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale}) rotate(${currentRotate}deg)`
      thumbEl.style.opacity = currentOpacity

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        if (onComplete) onComplete()
      }
    }

    // Set initial position
    thumbEl.style.transform = `translate3d(${startX}px, ${startY}px, 0) scale(1) rotate(0deg)`
    thumbEl.style.opacity = '1'

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [sourceRect, destRect, onComplete])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[99999] overflow-hidden"
    >
      <div
        ref={thumbRef}
        className="absolute top-0 left-0 w-[58px] h-[72px] rounded-sm overflow-hidden border border-[#C5A059]/50 bg-paper shadow-[0_16px_36px_-6px_rgba(20,19,18,0.35)] will-change-transform"
        style={{
          transform: 'translate3d(-9999px, -9999px, 0)',
        }}
      >
        <img
          src={image || '/api/media/file/seed-01.jpg'}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    </div>,
    document.body
  )
}

