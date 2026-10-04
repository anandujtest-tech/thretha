'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, getWishlist } from '@/lib/tc'
import Navbar from './Navbar'
import HomeView from './HomeView'
import CollectionsPage from './CollectionsPage'
import ProductGrid from './ProductGrid'
import ProductDetail from './ProductDetail'
import CartPage from './CartPage'
import WishlistPage from './WishlistPage'
import Footer from './Footer'
import MobileNav from './MobileNav'
import { Button } from '@/components/ui/button'

export default function Store({ path, navigate }) {
  const router = useRouter()
  const nav = navigate || ((to) => router.push(to))
  const [settings, setSettings] = useState(null)
  const [wishCount, setWishCount] = useState(0)
  const [cart, setCart] = useState([])

  // Load cart from localStorage
  useEffect(() => {
    try {
      const savedCart = JSON.parse(localStorage.getItem('thretha_cart') || '[]')
      if (Array.isArray(savedCart)) {
        setCart(savedCart)
      }
    } catch {
      setCart([])
    }
  }, [])

  // Save cart whenever it changes
  useEffect(() => {
    localStorage.setItem('thretha_cart', JSON.stringify(cart))
  }, [cart])

  // Add product to cart
  const addToCart = (product, quantity = 1, size = null) => {
    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) => item.product_id === product.id && item.size === size
      )

      if (existingIndex >= 0) {
        return current.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }

      const primaryImage =
        product.media?.find((m) => m.is_primary)?.url ||
        product.media?.find((m) => m.type !== 'video')?.url ||
        product.media?.[0]?.url ||
        ''

      return [
        ...current,
        {
          product_id: product.id,
          product_name: product.name,
          slug: product.slug,
          price: product.discount_price || product.price,
          original_price: product.price,
          image: primaryImage,
          size: size || 'Free Size',
          colour: product.colour,
          quantity,
        },
      ]
    })
  }

  // Update cart quantity
  const updateCartQuantity = (productId, size, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId, size)
      return
    }

    setCart((current) =>
      current.map((item) =>
        item.product_id === productId && item.size === size
          ? { ...item, quantity }
          : item
      )
    )
  }

  // Remove from cart
  const removeFromCart = (productId, size) => {
    setCart((current) =>
      current.filter(
        (item) => !(item.product_id === productId && item.size === size)
      )
    )
  }

  // Cart total & count
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  )

  // Load settings
  useEffect(() => {
    api('/settings')
      .then(setSettings)
      .catch(() => {})
  }, [])

  // Wishlist count
  useEffect(() => {
    const updateWishlistCount = () => {
      setWishCount(getWishlist().length)
    }
    updateWishlistCount()
    window.addEventListener('tc-wishlist', updateWishlistCount)
    return () => window.removeEventListener('tc-wishlist', updateWishlistCount)
  }, [])

  // Scroll to top on navigation
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])

  let view

  if (path === '/') {
    view = <HomeView navigate={navigate} settings={settings} addToCart={addToCart} />
  } else if (path === '/collections') {
    view = <CollectionsPage navigate={navigate} settings={settings} />
  } else if (
    path === '/shop' ||
    path.startsWith('/category/') ||
    path === '/new-arrivals'
  ) {
    view = (
      <ProductGrid
        navigate={navigate}
        settings={settings}
        path={path}
        addToCart={addToCart}
      />
    )
  } else if (path.startsWith('/product/')) {
    view = (
      <ProductDetail
        navigate={navigate}
        settings={settings}
        slug={path.split('/')[2]}
        addToCart={addToCart}
      />
    )
  } else if (path === '/cart') {
    view = (
      <CartPage
        navigate={navigate}
        settings={settings}
        cart={cart}
        updateCartQuantity={updateCartQuantity}
        removeFromCart={removeFromCart}
        cartTotal={cartTotal}
      />
    )
  } else if (path === '/wishlist') {
    view = (
      <WishlistPage
        navigate={navigate}
        settings={settings}
        addToCart={addToCart}
      />
    )
  } else {
    view = (
      <div className="container py-24 text-center">
        <h1 className="font-display text-5xl text-ink">Page Not Found</h1>
        <p className="mt-2 text-sm text-cocoa">
          The requested silhouette or page has moved.
        </p>
        <Button
          type="button"
          onClick={() => nav('/')}
          className="mt-6 rounded-none bg-ink text-cream text-xs uppercase tracking-widest font-semibold"
        >
          Return to Atelier Home →
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-between selection:bg-mango-light selection:text-ink">
      <div>
        <Navbar
          navigate={navigate}
          settings={settings}
          wishCount={wishCount}
          cartCount={cartCount}
        />
        <main className="animate-fade-in">{view}</main>
      </div>

      <Footer navigate={navigate} settings={settings} />

      <MobileNav
        navigate={navigate}
        path={path}
        settings={settings}
        wishCount={wishCount}
        cartCount={cartCount}
      />
    </div>
  )
}
