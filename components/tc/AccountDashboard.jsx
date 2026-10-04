'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User,
  ShoppingBag,
  Heart,
  MapPin,
  Shield,
  LogOut,
  Sparkles,
  ArrowRight,
  Package,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Phone,
  Mail,
  Home,
  ChevronRight,
  Clock,
  Truck,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import { useCart } from './CartContext'
import { api, inr } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { INDIAN_STATES, validateAddress } from '@/lib/addressValidation'
import ProductCard from './ProductCard'

const ACCOUNT_SECTION_LABELS = {
  overview: 'Overview',
  orders: 'My Orders',
  addresses: 'Saved Addresses',
  wishlist: 'Styling Board',
  profile: 'Profile Details',
  security: 'Security & Privacy',
}

export default function AccountDashboard({ initialTab = 'overview' }) {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading, logout, updateProfile, deleteAccount } = useAuth()
  const { addToCart } = useCart()

  const [activeTab, setActiveTab] = useState(initialTab)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(initialTab === 'overview')
  const mobileSectionHistory = useRef(0)
  const [orders, setOrders] = useState([])
  const [addresses, setAddresses] = useState([])
  const [wishlistProducts, setWishlistProducts] = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    const handlePopState = (event) => {
      if (mobileSectionHistory.current > 0) {
        mobileSectionHistory.current -= 1
        if (event.state?.threthaAccountSection) {
          setActiveTab(event.state.threthaAccountSection)
          setMobileMenuOpen(false)
        } else {
          setMobileMenuOpen(true)
        }
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen || window.matchMedia('(min-width: 768px)').matches) return
    window.scrollTo({ top: 0 })
  }, [activeTab, mobileMenuOpen])

  const selectTab = (tab) => {
    setActiveTab(tab)
    if (window.matchMedia('(max-width: 767px)').matches) {
      window.history.pushState({ ...window.history.state, threthaAccountSection: tab }, '', window.location.href)
      mobileSectionHistory.current += 1
      setMobileMenuOpen(false)
    }
  }

  const returnToAccountMenu = () => {
    if (mobileSectionHistory.current > 0) {
      window.history.back()
      return
    }
    setMobileMenuOpen(true)
  }

  // Profile Form
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  // Delete Account Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Address Modal / Form State
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [addressForm, setAddressForm] = useState({
    label: 'Home',
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    district: '',
    state: 'Kerala',
    postalCode: '',
    isDefault: false,
  })
  const [addressErrors, setAddressErrors] = useState({})
  const [addressTouched, setAddressTouched] = useState({})
  const [addressSaving, setAddressSaving] = useState(false)
  const [addressError, setAddressError] = useState('')

  // Single field blur validation
  const handleAddressBlur = (field) => {
    setAddressTouched((prev) => ({ ...prev, [field]: true }))
    const res = validateAddress(addressForm, { requireDistrict: false })
    if (res.errors[field]) {
      setAddressErrors((prev) => ({ ...prev, [field]: res.errors[field] }))
    } else {
      setAddressErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Handle Address Save with Strict Validation and IDOR Protection
  const handleSaveAddress = async (e) => {
    e.preventDefault()
    setAddressError('')

    const validation = validateAddress(addressForm, { requireDistrict: false })
    if (!validation.isValid) {
      setAddressErrors(validation.errors)
      setAddressTouched({
        fullName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        district: true,
        state: true,
        postalCode: true,
      })
      const firstField = Object.keys(validation.errors)[0]
      const el = document.getElementById(`addr-input-${firstField}`)
      if (el) el.focus()
      return
    }

    setAddressSaving(true)
    try {
      if (editingAddressId) {
        // Update existing address
        const res = await api(`/account/addresses/${editingAddressId}`, {
          method: 'PATCH',
          body: validation.sanitized,
        })
        if (!res?.ok) throw new Error(res?.error || 'Failed to update address')
      } else {
        // Create new address
        const res = await api('/account/addresses', {
          method: 'POST',
          body: validation.sanitized,
        })
        if (!res?.ok) throw new Error(res?.error || 'Failed to add address')
      }

      setAddressModalOpen(false)
      setEditingAddressId(null)
      setAddressErrors({})
      setAddressTouched({})
      loadAccountData()
    } catch (err) {
      setAddressError(err.message || 'Failed to save address.')
    } finally {
      setAddressSaving(false)
    }
  }

  // Handle Delete Address
  const handleDeleteAddress = async (addressId) => {
    if (!confirm('Are you sure you want to remove this delivery address?')) return
    try {
      await api(`/account/addresses/${addressId}`, { method: 'DELETE' })
      loadAccountData()
    } catch (err) {
      alert(err.message || 'Failed to remove address.')
    }
  }

  // Open Edit Address Modal
  const openEditAddress = (addr) => {
    setEditingAddressId(addr.id)
    setAddressForm({
      label: addr.label || 'Home',
      fullName: addr.fullName || '',
      phone: addr.phone || '',
      addressLine1: addr.addressLine1 || '',
      addressLine2: addr.addressLine2 || '',
      city: addr.city || '',
      district: addr.district || '',
      state: addr.state || 'Kerala',
      postalCode: addr.postalCode || '',
      isDefault: Boolean(addr.isDefault),
    })
    setAddressErrors({})
    setAddressTouched({})
    setAddressError('')
    setAddressModalOpen(true)
  }

  // Handle Profile Save
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault()
    setProfileError('')
    setProfileSuccess('')

    if (!profileName.trim()) {
      setProfileError('Please enter your full name.')
      return
    }

    setProfileSaving(true)
    try {
      const res = await updateProfile({
        name: profileName.trim(),
        phone: profilePhone.trim(),
      })
      if (res?.ok) {
        setProfileSuccess('Your profile details have been successfully updated.')
        setTimeout(() => setProfileSuccess(''), 4000)
      } else {
        throw new Error(res?.error || 'Failed to update profile.')
      }
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile details.')
    } finally {
      setProfileSaving(false)
    }
  }

  // Load account orders, addresses, and wishlist items
  const loadAccountData = async () => {
    if (!isAuthenticated) return
    setDataLoading(true)
    try {
      const [ordersRes, addrRes, wishRes] = await Promise.all([
        api('/account/orders').catch(() => ({ orders: [] })),
        api('/account/addresses').catch(() => ({ addresses: [] })),
        api('/account/wishlist').catch(() => ({ products: [] })),
      ])
      if (ordersRes?.orders) setOrders(ordersRes.orders)
      if (addrRes?.addresses) setAddresses(addrRes.addresses)
      if (wishRes?.products) setWishlistProducts(wishRes.products)
    } catch (err) {
      console.error('[AccountDashboard] Error loading data:', err)
    } finally {
      setDataLoading(false)
    }
  }

  // Populate profile fields when user is loaded
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '')
      setProfilePhone(user.phone || '')
    }
  }, [user])

  // Load account data on mount or authentication change
  useEffect(() => {
    if (isAuthenticated) {
      loadAccountData()
    }
  }, [isAuthenticated])

  // Handle Account Deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== 'delete') {
      alert('Please type "DELETE" to confirm.')
      return
    }
    setDeleting(true)
    try {
      const res = await deleteAccount()
      if (res?.ok) {
        setDeleteModalOpen(false)
        setDeleteConfirmText('')
        router.push('/')
      } else {
        throw new Error(res?.error || 'Failed to delete account.')
      }
    } catch (err) {
      alert(err.message || 'Failed to delete account.')
      setDeleting(false)
    }
  }

  // Handle Logout
  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  if (authLoading || (!user && isAuthenticated)) {
    return (
      <div className="container py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <p className="mt-4 text-xs font-sans uppercase tracking-widest text-cocoa">
          Accessing your atelier profile…
        </p>
      </div>
    )
  }

  if (!user) return null

  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0]

  return (
    <div className={cn('w-full bg-paper sm:py-16', mobileMenuOpen ? 'py-10' : 'py-4 md:py-10')}>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Welcome Header ── */}
        <div className={cn('mb-10 pb-8 border-b border-ink/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4', !mobileMenuOpen && 'hidden md:flex')}>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/15 text-gold-dark text-[10px] font-sans font-semibold uppercase tracking-[0.25em] mb-2">
              <Sparkles className="h-3 w-3 text-gold" />
              <span>Atelier Member</span>
            </div>
            <h1 className="font-display text-3xl sm:text-5xl text-ink font-normal leading-tight">
              Welcome Back, {user.name || 'Valued Customer'}
            </h1>
            <p className="text-xs sm:text-sm text-cocoa font-sans mt-1">
              Signed in as <strong className="text-ink font-medium">{user.email}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 text-xs font-sans font-semibold uppercase tracking-wider text-cocoa hover:text-terracotta border border-ink/15 hover:border-terracotta px-4 py-2.5 bg-cream transition self-start sm:self-auto shadow-2xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* ── Account Grid Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 sm:gap-12 items-start">

          {/* Navigation Sidebar */}
          <nav className={cn('bg-cream border border-ink/10 p-3 sm:p-4 shadow-sm space-y-1', mobileMenuOpen ? 'block' : 'hidden md:block')} aria-label="Account sections">
            {[
              { id: 'overview', label: 'Overview', icon: Home },
              { id: 'orders', label: `My Orders (${orders.length})`, icon: Package },
              { id: 'addresses', label: `Saved Addresses (${addresses.length})`, icon: MapPin },
              { id: 'wishlist', label: `Styling Board (${wishlistProducts.length})`, icon: Heart },
              { id: 'profile', label: 'Profile Details', icon: User },
              { id: 'security', label: 'Security & Privacy', icon: Shield },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={cn(
                  'w-full flex items-center justify-between px-3.5 py-3 text-xs font-sans font-semibold uppercase tracking-wider transition-colors text-left',
                  activeTab === id
                    ? 'bg-ink text-cream shadow-2xs'
                    : 'text-cocoa hover:bg-sand/30 hover:text-ink'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </span>
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', activeTab === id ? 'rotate-90' : '')} />
              </button>
            ))}
          </nav>

          {/* Tab Content Area */}
          <div className={cn('bg-cream border border-ink/10 p-6 sm:p-10 shadow-sm min-h-[450px]', mobileMenuOpen ? 'hidden md:block' : 'block')}>
            {!mobileMenuOpen && (
              <div className="mb-6 flex items-center justify-between border-b border-ink/10 pb-4 md:hidden">
                <button type="button" onClick={returnToAccountMenu} className="min-h-11 text-xs font-sans font-semibold uppercase tracking-wider text-ink" aria-label="Return to Account menu">
                  ← Account
                </button>
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-cocoa" aria-current="page">
                  {ACCOUNT_SECTION_LABELS[activeTab] || 'Account'}
                </span>
              </div>
            )}

            {/* ════ TAB: OVERVIEW ════ */}
            {activeTab === 'overview' && (
              <div className="space-y-10">
                <h2 className="font-display text-3xl text-ink font-normal md:hidden">Overview</h2>
                {/* Stats Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={() => selectTab('orders')}
                    className="p-5 bg-paper border border-ink/8 text-left hover:border-ink/20 transition group"
                  >
                    <Package className="h-5 w-5 text-terracotta mb-2" />
                    <p className="font-display text-2xl sm:text-3xl text-ink font-normal">{orders.length}</p>
                    <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.2em] text-cocoa-light mt-0.5 group-hover:text-ink">
                      Orders Placed →
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectTab('wishlist')}
                    className="p-5 bg-paper border border-ink/8 text-left hover:border-ink/20 transition group"
                  >
                    <Heart className="h-5 w-5 text-coral mb-2" />
                    <p className="font-display text-2xl sm:text-3xl text-ink font-normal">{wishlistProducts.length}</p>
                    <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.2em] text-cocoa-light mt-0.5 group-hover:text-ink">
                      Saved Pieces →
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectTab('addresses')}
                    className="p-5 bg-paper border border-ink/8 text-left hover:border-ink/20 transition group"
                  >
                    <MapPin className="h-5 w-5 text-gold mb-2" />
                    <p className="font-display text-2xl sm:text-3xl text-ink font-normal">{addresses.length}</p>
                    <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.2em] text-cocoa-light mt-0.5 group-hover:text-ink">
                      Saved Addresses →
                    </p>
                  </button>
                </div>

                {/* Recent Orders Preview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                    <h2 className="font-display text-2xl text-ink font-normal">Recent Orders</h2>
                    {orders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => selectTab('orders')}
                        className="text-xs font-sans font-semibold uppercase tracking-wider text-terracotta hover:underline"
                      >
                        View All ({orders.length}) →
                      </button>
                    )}
                  </div>

                  {orders.length === 0 ? (
                    <div className="py-8 text-center bg-paper/50 border border-dashed border-ink/15 p-6">
                      <ShoppingBag className="h-8 w-8 mx-auto text-cocoa/40 mb-2" />
                      <p className="text-xs font-sans text-cocoa">You haven't placed an order yet.</p>
                      <Link
                        href="/shop"
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-sans font-semibold uppercase tracking-wider text-ink hover:text-terracotta underline"
                      >
                        <span>Explore The Wardrobe</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.slice(0, 3).map((ord) => (
                        <div
                          key={ord.id || ord.order_number}
                          className="p-4 sm:p-5 bg-paper border border-ink/8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-ink">#{ord.order_number}</span>
                              <span className="px-2 py-0.5 text-[9px] font-sans font-bold uppercase tracking-wider bg-ink text-cream">
                                {ord.status || 'CONFIRMED'}
                              </span>
                            </div>
                            <p className="text-[11px] text-cocoa-light font-sans mt-1">
                              Placed on {new Date(ord.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {ord.items?.length || 1} piece(s)
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4">
                            <span className="font-display text-lg font-medium text-ink">{inr(ord.total)}</span>
                            <Link
                              href={`/account/orders/${ord.order_number || ord.id}`}
                              className="inline-flex items-center gap-1 text-xs font-sans font-semibold uppercase tracking-wider text-terracotta hover:underline"
                            >
                              <span>Details</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Default Address Preview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                    <h2 className="font-display text-2xl text-ink font-normal">Primary Delivery Address</h2>
                    <button
                      type="button"
                      onClick={() => selectTab('addresses')}
                      className="text-xs font-sans font-semibold uppercase tracking-wider text-terracotta hover:underline"
                    >
                      Manage Addresses →
                    </button>
                  </div>

                  {defaultAddress ? (
                    <div className="p-5 bg-paper border border-ink/8 space-y-1 text-xs font-sans text-cocoa">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-ink text-sm">{defaultAddress.fullName}</span>
                        <span className="px-2 py-0.5 text-[8.5px] uppercase font-bold tracking-wider bg-gold text-ink">Default</span>
                      </div>
                      <p>{defaultAddress.addressLine1}</p>
                      {defaultAddress.addressLine2 && <p>{defaultAddress.addressLine2}</p>}
                      <p>{defaultAddress.city}, {defaultAddress.state} — {defaultAddress.postalCode}</p>
                      <p className="pt-1 text-ink font-medium">Phone: {defaultAddress.phone}</p>
                    </div>
                  ) : (
                    <div className="py-6 text-center bg-paper/50 border border-dashed border-ink/15 p-6">
                      <p className="text-xs font-sans text-cocoa">No saved delivery addresses yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          selectTab('addresses')
                          setAddressModalOpen(true)
                        }}
                        className="mt-2 text-xs font-sans font-semibold uppercase tracking-wider text-ink underline"
                      >
                        + Add Delivery Address
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ TAB: ORDERS ════ */}
            {activeTab === 'orders' && (
              <div className="space-y-6">
                <div className="border-b border-ink/10 pb-4">
                  <h2 className="font-display text-3xl text-ink font-normal">Order History</h2>
                  <p className="text-xs font-sans text-cocoa mt-1">
                    Review and track all handcrafted atelier orders placed with Thretha.
                  </p>
                </div>

                {orders.length === 0 ? (
                  <div className="py-16 text-center max-w-sm mx-auto space-y-3">
                    <Package className="h-10 w-10 text-cocoa-light mx-auto" />
                    <h3 className="font-display text-2xl text-ink">No orders found</h3>
                    <p className="text-xs text-cocoa font-sans leading-relaxed">
                      You have not placed any orders yet. Discover our latest festive drapes and tops.
                    </p>
                    <Link
                      href="/shop"
                      className="inline-flex items-center gap-2 bg-ink text-cream px-6 py-3 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark transition"
                    >
                      <span>Explore Shop</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((ord) => (
                      <div
                        key={ord.id || ord.order_number}
                        className="p-5 sm:p-6 bg-paper border border-ink/10 rounded-none space-y-4 shadow-2xs"
                      >
                        {/* Order Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-ink/8">
                          <div>
                            <span className="font-mono text-sm font-bold text-ink">#{ord.order_number}</span>
                            <p className="text-[11px] text-cocoa-light font-sans mt-0.5">
                              Ordered on {new Date(ord.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              'px-2.5 py-1 text-[9px] font-sans font-bold uppercase tracking-wider',
                              ord.status === 'CANCELLED' ? 'bg-coral-light text-coral-dark border border-coral/30' : 'bg-gold text-ink'
                            )}>
                              {ord.status || 'CONFIRMED'}
                            </span>
                            {ord.payment_status === 'PAID' && (
                              <span className="px-2.5 py-1 text-[9px] font-sans font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                PAID
                              </span>
                            )}
                            {(ord.refund?.status === 'COMPLETED' || ord.payment?.refund_status === 'COMPLETED' || ord.refund_status === 'REFUNDED') && (
                              <span className="px-2.5 py-1 text-[9px] font-sans font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Refunded {inr(ord.refund?.amount || ord.total)}
                              </span>
                            )}
                            {(ord.refund?.status === 'PENDING' || ord.payment?.refund_status === 'PENDING' || ord.refund_status === 'REFUND_PENDING') && (
                              <span className="px-2.5 py-1 text-[9px] font-sans font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                Refund Processing
                              </span>
                            )}
                            {(ord.refund?.status === 'FAILED' || ord.payment?.refund_status === 'FAILED') && (
                              <span className="px-2.5 py-1 text-[9px] font-sans font-bold uppercase tracking-wider bg-coral-light text-coral-dark border border-coral">
                                Refund Failed
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Items Thumbnail Grid */}
                        <div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
                          {ord.items?.map((it, idx) => (
                            <div key={idx} className="flex items-center gap-3 shrink-0 bg-cream p-2 border border-ink/5">
                              {it.image && (
                                <img src={it.image} alt={it.combo_name || it.product_name} className="h-12 w-10 object-cover" />
                              )}
                              <div className="text-xs font-sans pr-2">
                                <p className="font-semibold text-ink line-clamp-1 max-w-[160px]">
                                  {it.combo_name || it.product_name}
                                </p>
                                {it.is_combo ? (
                                  <p className="text-[10px] text-mango-dark font-medium">Curated Ensemble · Qty {it.quantity}</p>
                                ) : (
                                  <p className="text-[10.5px] text-cocoa-light">{it.size || 'Free Size'} · Qty {it.quantity}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Order Footer */}
                        <div className="flex items-center justify-between pt-2">
                          <div>
                            <span className="text-[10.5px] font-sans uppercase tracking-wider text-cocoa-light">Total Amount: </span>
                            <strong className="font-display text-xl text-ink font-medium">{inr(ord.total)}</strong>
                          </div>

                          <Link
                            href={`/account/orders/${ord.order_number || ord.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold uppercase tracking-wider text-ink hover:text-terracotta border-b border-ink/30 pb-0.5"
                          >
                            <span>View Full Details & Tracking</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ TAB: SAVED ADDRESSES ════ */}
            {activeTab === 'addresses' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-ink/10 pb-4">
                  <div>
                    <h2 className="font-display text-3xl text-ink font-normal">Saved Delivery Addresses</h2>
                    <p className="text-xs font-sans text-cocoa mt-1">
                      Manage your shipping locations for seamless one-click checkout.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingAddressId(null)
                      setAddressForm({
                        label: 'Home',
                        fullName: user?.name || '',
                        phone: user?.phone || '',
                        addressLine1: '',
                        addressLine2: '',
                        city: '',
                        district: '',
                        state: 'Kerala',
                        postalCode: '',
                        isDefault: addresses.length === 0,
                      })
                      setAddressError('')
                      setAddressModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1.5 bg-ink text-cream px-4 py-2.5 text-xs font-sans font-semibold uppercase tracking-wider hover:bg-cocoa-dark transition shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Address</span>
                  </button>
                </div>

                {/* Addresses Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className={cn(
                        'p-5 sm:p-6 bg-paper border flex flex-col justify-between space-y-4 shadow-2xs',
                        addr.isDefault ? 'border-gold ring-1 ring-gold/30' : 'border-ink/10'
                      )}
                    >
                      <div className="space-y-1 text-xs font-sans text-cocoa">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold uppercase tracking-wider text-[10px] bg-sand px-2 py-0.5 text-ink">
                            {addr.label || 'Home'}
                          </span>
                          {addr.isDefault && (
                            <span className="text-[9px] uppercase font-bold tracking-wider text-gold-dark flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-gold" /> Default
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-sm text-ink">{addr.fullName}</p>
                        <p className="text-cocoa/90">{addr.addressLine1}</p>
                        {addr.addressLine2 && <p className="text-cocoa/90">{addr.addressLine2}</p>}
                        <p className="text-cocoa/90">{addr.city}, {addr.state} — {addr.postalCode}</p>
                        <p className="pt-2 text-ink font-medium flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-cocoa-light" />
                          <span>{addr.phone}</span>
                        </p>
                      </div>

                      <div className="pt-3 border-t border-ink/8 flex items-center justify-between text-xs font-sans">
                        <button
                          type="button"
                          onClick={() => openEditAddress(addr)}
                          className="text-ink font-semibold uppercase tracking-wider hover:text-terracotta inline-flex items-center gap-1"
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="text-coral font-semibold uppercase tracking-wider hover:underline inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {addresses.length === 0 && (
                    <div className="col-span-2 py-12 text-center bg-paper/50 border border-dashed border-ink/15 p-6">
                      <MapPin className="h-8 w-8 mx-auto text-cocoa-light mb-2" />
                      <p className="text-xs font-sans text-cocoa">No delivery addresses saved yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddressId(null)
                          setAddressModalOpen(true)
                        }}
                        className="mt-2 text-xs font-sans font-semibold uppercase tracking-wider text-ink underline"
                      >
                        + Add Your First Address
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ TAB: STYLING BOARD (WISHLIST) ════ */}
            {activeTab === 'wishlist' && (
              <div className="space-y-6">
                <div className="border-b border-ink/10 pb-4">
                  <h2 className="font-display text-3xl text-ink font-normal">Your Styling Board</h2>
                  <p className="text-xs font-sans text-cocoa mt-1">
                    Handcrafted pieces saved for celebration moments and wardrobe curation.
                  </p>
                </div>

                {wishlistProducts.length === 0 ? (
                  <div className="py-16 text-center max-w-sm mx-auto space-y-3">
                    <Heart className="h-10 w-10 text-coral mx-auto" />
                    <h3 className="font-display text-2xl text-ink">Your styling board is empty</h3>
                    <p className="text-xs text-cocoa font-sans leading-relaxed">
                      Tap the heart icon on any saree or top to save it to your private account board.
                    </p>
                    <Link
                      href="/shop"
                      className="inline-flex items-center gap-2 bg-ink text-cream px-6 py-3 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark transition"
                    >
                      <span>Explore Collection</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
                    {wishlistProducts.map((p) => (
                      <ProductCard
                        key={p.id}
                        p={p}
                        addToCart={addToCart}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ TAB: PROFILE DETAILS ════ */}
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-lg">
                <div className="border-b border-ink/10 pb-4">
                  <h2 className="font-display text-3xl text-ink font-normal">Personal Profile</h2>
                  <p className="text-xs font-sans text-cocoa mt-1">
                    Manage your contact information and preferences.
                  </p>
                </div>

                {profileSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-sans flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{profileSuccess}</span>
                  </div>
                )}

                {profileError && (
                  <div className="p-3 bg-rose/10 border border-coral/30 text-ink text-xs font-sans flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-coral shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-ink mb-1.5">
                      Verified Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cocoa-light" />
                      <input
                        type="email"
                        disabled
                        value={user.email}
                        className="w-full bg-sand/30 border border-ink/15 pl-10 pr-4 py-3 text-xs font-sans text-cocoa cursor-not-allowed rounded-none"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-cocoa-light font-sans">
                      Email address is verified and permanently linked to your session.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="prof-name" className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-ink mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cocoa-light" />
                      <input
                        id="prof-name"
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full bg-paper border border-ink/20 pl-10 pr-4 py-3 text-xs font-sans text-ink focus:outline-none focus:border-ink rounded-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="prof-phone" className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-ink mb-1.5">
                      Mobile / WhatsApp Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cocoa-light" />
                      <input
                        id="prof-phone"
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full bg-paper border border-ink/20 pl-10 pr-4 py-3 text-xs font-sans text-ink focus:outline-none focus:border-ink rounded-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="inline-flex items-center justify-center gap-2 bg-ink text-cream px-7 py-3 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark transition shadow-md disabled:opacity-50"
                  >
                    <span>{profileSaving ? 'Updating…' : 'Save Changes'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* ════ TAB: SECURITY & PRIVACY ════ */}
            {activeTab === 'security' && (
              <div className="space-y-8 max-w-lg">
                <div className="border-b border-ink/10 pb-4">
                  <h2 className="font-display text-3xl text-ink font-normal">Security & Privacy</h2>
                  <p className="text-xs font-sans text-cocoa mt-1">
                    Manage session authorization and data privacy.
                  </p>
                </div>

                {/* Session Security */}
                <div className="p-5 bg-paper border border-ink/10 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-sans font-bold text-ink uppercase tracking-wider">
                    <Shield className="h-4 w-4 text-gold" />
                    <span>Protected HTTP-Only Session</span>
                  </div>
                  <p className="text-xs text-cocoa font-sans leading-relaxed">
                    Your session is cryptographically signed and stored in a secure, HTTP-only cookie. It automatically expires after 30 days of inactivity.
                  </p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs font-sans font-semibold uppercase tracking-wider text-ink hover:text-terracotta underline block pt-1"
                  >
                    Sign out of this device →
                  </button>
                </div>

                {/* Account Deletion */}
                <div className="p-5 bg-rose/10 border border-coral/30 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-sans font-bold text-coral uppercase tracking-wider">
                    <AlertCircle className="h-4 w-4 text-coral" />
                    <span>Delete Account & Personal Data</span>
                  </div>
                  <p className="text-xs text-cocoa font-sans leading-relaxed">
                    Permanently removes your saved addresses, wishlist items, and session identities. Historical orders will be anonymized to preserve required accounting records.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(true)}
                    className="text-xs font-sans font-semibold uppercase tracking-wider text-coral hover:underline"
                  >
                    Delete Account…
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ── ADDRESS MODAL ── */}
      {addressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-cream border border-ink/15 p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-display text-2xl text-ink font-normal">
                {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
              </h3>
              <button
                type="button"
                onClick={() => setAddressModalOpen(false)}
                className="text-cocoa hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {addressError && (
              <div className="p-3 bg-rose/10 border border-coral/30 text-ink text-xs font-sans">
                {addressError}
              </div>
            )}

            <form onSubmit={handleSaveAddress} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                  Address Label
                </label>
                <div className="flex gap-2">
                  {['Home', 'Office', 'Other'].map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setAddressForm((f) => ({ ...f, label: lbl }))}
                      className={cn(
                        'px-3 py-1.5 border text-xs font-semibold uppercase tracking-wider transition',
                        addressForm.label === lbl
                          ? 'bg-ink text-cream border-ink'
                          : 'bg-paper text-cocoa border-ink/20 hover:border-ink'
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {addressError && (
                <div className="bg-coral-light border border-coral/30 p-2.5 text-xs text-coral-dark font-medium flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{addressError}</span>
                </div>
              )}

              <div>
                <label htmlFor="addr-input-fullName" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                  Full Name *
                </label>
                <input
                  id="addr-input-fullName"
                  type="text"
                  value={addressForm.fullName}
                  onChange={(e) => setAddressForm((f) => ({ ...f, fullName: e.target.value }))}
                  onBlur={() => handleAddressBlur('fullName')}
                  placeholder="Recipient Name"
                  aria-invalid={Boolean(addressTouched.fullName && addressErrors.fullName)}
                  aria-describedby={addressErrors.fullName ? 'addr-fullName-err' : undefined}
                  className={cn(
                    'w-full bg-paper border px-3.5 py-2.5 text-xs text-ink focus:outline-none rounded-none transition',
                    addressTouched.fullName && addressErrors.fullName
                      ? 'border-coral focus:border-coral bg-coral-light/10'
                      : 'border-ink/20 focus:border-ink'
                  )}
                />
                {addressTouched.fullName && addressErrors.fullName && (
                  <p id="addr-fullName-err" className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" /> {addressErrors.fullName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="addr-input-phone" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                  Mobile / WhatsApp Number *
                </label>
                <input
                  id="addr-input-phone"
                  type="tel"
                  inputMode="numeric"
                  value={addressForm.phone}
                  onChange={(e) => setAddressForm((f) => ({ ...f, phone: e.target.value }))}
                  onBlur={() => handleAddressBlur('phone')}
                  placeholder="10-digit mobile number"
                  aria-invalid={Boolean(addressTouched.phone && addressErrors.phone)}
                  aria-describedby={addressErrors.phone ? 'addr-phone-err' : undefined}
                  className={cn(
                    'w-full bg-paper border px-3.5 py-2.5 text-xs text-ink focus:outline-none rounded-none transition',
                    addressTouched.phone && addressErrors.phone
                      ? 'border-coral focus:border-coral bg-coral-light/10'
                      : 'border-ink/20 focus:border-ink'
                  )}
                />
                {addressTouched.phone && addressErrors.phone && (
                  <p id="addr-phone-err" className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" /> {addressErrors.phone}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="addr-input-addressLine1" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                  Address Line 1 (House / Flat / Building) *
                </label>
                <input
                  id="addr-input-addressLine1"
                  type="text"
                  value={addressForm.addressLine1}
                  onChange={(e) => setAddressForm((f) => ({ ...f, addressLine1: e.target.value }))}
                  onBlur={() => handleAddressBlur('addressLine1')}
                  placeholder="House No, Building, Flat 4B"
                  aria-invalid={Boolean(addressTouched.addressLine1 && addressErrors.addressLine1)}
                  aria-describedby={addressErrors.addressLine1 ? 'addr-line1-err' : undefined}
                  className={cn(
                    'w-full bg-paper border px-3.5 py-2.5 text-xs text-ink focus:outline-none rounded-none transition',
                    addressTouched.addressLine1 && addressErrors.addressLine1
                      ? 'border-coral focus:border-coral bg-coral-light/10'
                      : 'border-ink/20 focus:border-ink'
                  )}
                />
                {addressTouched.addressLine1 && addressErrors.addressLine1 && (
                  <p id="addr-line1-err" className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" /> {addressErrors.addressLine1}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="addr-input-addressLine2" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                  Address Line 2 (Street / Locality / Landmark)
                </label>
                <input
                  id="addr-input-addressLine2"
                  type="text"
                  value={addressForm.addressLine2}
                  onChange={(e) => setAddressForm((f) => ({ ...f, addressLine2: e.target.value }))}
                  onBlur={() => handleAddressBlur('addressLine2')}
                  placeholder="Near temple, crossroad, etc."
                  className="w-full bg-paper border border-ink/20 px-3.5 py-2.5 text-xs text-ink focus:outline-none focus:border-ink rounded-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="addr-input-city" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                    City / Town *
                  </label>
                  <input
                    id="addr-input-city"
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                    onBlur={() => handleAddressBlur('city')}
                    placeholder="Kochi"
                    aria-invalid={Boolean(addressTouched.city && addressErrors.city)}
                    aria-describedby={addressErrors.city ? 'addr-city-err' : undefined}
                    className={cn(
                      'w-full bg-paper border px-3.5 py-2.5 text-xs text-ink focus:outline-none rounded-none transition',
                      addressTouched.city && addressErrors.city
                        ? 'border-coral focus:border-coral bg-coral-light/10'
                        : 'border-ink/20 focus:border-ink'
                    )}
                  />
                  {addressTouched.city && addressErrors.city && (
                    <p id="addr-city-err" className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" /> {addressErrors.city}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="addr-input-district" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                    District
                  </label>
                  <input
                    id="addr-input-district"
                    type="text"
                    value={addressForm.district}
                    onChange={(e) => setAddressForm((f) => ({ ...f, district: e.target.value }))}
                    onBlur={() => handleAddressBlur('district')}
                    placeholder="Ernakulam"
                    className="w-full bg-paper border border-ink/20 px-3.5 py-2.5 text-xs text-ink focus:outline-none focus:border-ink rounded-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="addr-input-state" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                    State *
                  </label>
                  <select
                    id="addr-input-state"
                    value={addressForm.state}
                    onChange={(e) => setAddressForm((f) => ({ ...f, state: e.target.value }))}
                    className="w-full bg-paper border border-ink/20 px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-ink rounded-none"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="addr-input-postalCode" className="block font-semibold uppercase tracking-wider text-[10.5px] text-ink mb-1">
                    PIN Code *
                  </label>
                  <input
                    id="addr-input-postalCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={addressForm.postalCode}
                    onChange={(e) => setAddressForm((f) => ({ ...f, postalCode: e.target.value }))}
                    onBlur={() => handleAddressBlur('postalCode')}
                    placeholder="682001"
                    aria-invalid={Boolean(addressTouched.postalCode && addressErrors.postalCode)}
                    aria-describedby={addressErrors.postalCode ? 'addr-pin-err' : undefined}
                    className={cn(
                      'w-full bg-paper border px-3.5 py-2.5 text-xs text-ink focus:outline-none rounded-none transition',
                      addressTouched.postalCode && addressErrors.postalCode
                        ? 'border-coral focus:border-coral bg-coral-light/10'
                        : 'border-ink/20 focus:border-ink'
                    )}
                  />
                  {addressTouched.postalCode && addressErrors.postalCode && (
                    <p id="addr-pin-err" className="text-[11px] text-coral font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" /> {addressErrors.postalCode}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="addr-default"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="h-4 w-4 rounded-none accent-ink"
                />
                <label htmlFor="addr-default" className="text-xs text-ink cursor-pointer">
                  Set as default delivery address
                </label>
              </div>

              <div className="pt-3 border-t border-ink/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAddressModalOpen(false)}
                  className="px-4 py-2.5 text-xs uppercase tracking-wider font-semibold text-cocoa hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addressSaving}
                  className="bg-ink text-cream px-6 py-2.5 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-cocoa-dark transition shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {addressSaving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream border-t-transparent" />}
                  {addressSaving ? 'Saving…' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE ACCOUNT CONFIRMATION MODAL ── */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-cream border border-coral/30 p-6 sm:p-8 shadow-2xl space-y-4">
            <h3 className="font-display text-2xl text-coral font-normal">
              Confirm Account Deletion
            </h3>
            <p className="text-xs text-cocoa font-sans leading-relaxed">
              This action is permanent. All saved addresses, wishlist items, and authentication links will be deleted.
            </p>
            <p className="text-xs text-ink font-sans">
              Type <strong>DELETE</strong> below to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-paper border border-coral/30 px-3.5 py-2.5 text-xs text-ink font-mono focus:outline-none focus:border-coral rounded-none"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false)
                  setDeleteConfirmText('')
                }}
                className="px-4 py-2 text-xs uppercase tracking-wider font-semibold text-cocoa"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'}
                onClick={handleDeleteAccount}
                className="bg-coral text-cream px-5 py-2 text-xs font-sans uppercase tracking-[0.2em] font-semibold hover:bg-coral-dark transition shadow-sm disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
