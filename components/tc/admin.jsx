'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  Trash2,
  Copy,
  Upload,
  X,
  Star,
  Sparkles,
  KeyRound,
  Search,
  RefreshCw,
  Tag,
  Bell,
  Truck,
} from 'lucide-react'
import PromotionsManager from './admin/PromotionsManager'
import ShippingDetailsEditor from './admin/ShippingDetailsEditor'
import OrderNotificationsManager from './admin/OrderNotificationsManager'
import CombosManager from './admin/CombosManager'
import InstagramFeedManager from './admin/InstagramFeedManager'
import TryOnSettingsManager from './admin/TryOnSettingsManager'
import { GARMENT_TYPES } from '@/lib/tryon-constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api, inr, auth } from '@/lib/tc'
import { broadcastStorefrontSettingsChanged } from '@/lib/storefrontEvents'
import { DEFAULT_HOMEPAGE_CONTENT } from '@/lib/homepageContent'
import { DELIVERY_SERVICES } from '@/lib/deliveryServices'

const STATUSES = [
  'NEW',
  'WHATSAPP CONTACTED',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size']

/* --------- Media Uploader --------- */
function Uploader({ token, label = 'Upload Media', multiple = false, onDone }) {
  const ref = useRef()
  const [busy, setBusy] = useState(false)

  const handle = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(true)
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await api('/admin/media', { method: 'POST', body: fd, token })
        onDone(res)
      } catch (err) {
        alert(err.message || 'Media upload failed')
      }
    }
    setBusy(false)
    if (ref.current) ref.current.value = ''
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        multiple={multiple}
        onChange={handle}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="rounded-none border-ink/20 bg-cream text-xs uppercase tracking-wider text-ink hover:bg-sand/30"
      >
        <Upload className="mr-2 h-3.5 w-3.5 text-gold-dark" />
        {busy ? 'Uploading…' : label}
      </Button>
    </div>
  )
}

function AField({ label, value, onChange, placeholder, type = 'text', ...rest }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
        {label}
      </Label>
      <Input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        className="rounded-none border-ink/15 bg-cream text-sm focus-visible:border-gold focus-visible:ring-gold/20"
        {...rest}
      />
    </div>
  )
}

/* --------- Admin Login --------- */
function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@threthacouture.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await api('/admin/login', {
        method: 'POST',
        body: { email, password },
      })
      auth.set(res.token)
      onLogin()
    } catch (err) {
      setError(err.message || 'Invalid credentials')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#141312] px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl text-cream tracking-wide leading-none">
            THRETHA
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.4em] text-gold-light font-medium">
            Atelier Management Console
          </p>
        </div>

        <div className="space-y-5 border border-white/10 bg-[#1D1B19] p-7 shadow-2xl rounded-sm">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-cream/70 font-medium">
              Admin Email
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 rounded-none border-white/15 bg-[#141312] text-cream text-sm focus-visible:border-gold"
            />
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider text-cream/70 font-medium">
              Password
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 rounded-none border-white/15 bg-[#141312] text-cream text-sm focus-visible:border-gold"
            />
          </div>

          {error && (
            <div className="bg-terracotta/20 border border-terracotta/40 p-3 text-xs text-rose-light space-y-1">
              <p className="font-semibold">{error}</p>
              {error.toLowerCase().includes('server error') && (
                <p className="text-[11px] text-cream/70">
                  Database is not connected. Make sure MongoDB is running and <code className="text-gold-light">MONGO_URL</code> & <code className="text-gold-light">DB_NAME</code> are defined in <code className="text-gold-light">.env.local</code>.
                </p>
              )}
            </div>
          )}

          <Button
            disabled={busy}
            className="w-full rounded-none bg-gold py-6 text-xs uppercase tracking-[0.25em] text-ink font-semibold hover:bg-gold-shimmer shadow-subtle transition"
          >
            {busy ? 'Authenticating…' : 'Access Console →'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/* --------- Change Password Component --------- */
function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setMessage('')
    setError('')

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setBusy(true)
    try {
      await api('/admin/change-password', {
        method: 'POST',
        token: auth.get(),
        body: { currentPassword, newPassword },
      })
      setMessage('Password changed successfully ✓')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gold-dark" />
          <h3 className="font-display text-2xl text-ink">Change Admin Password</h3>
        </div>
        <p className="mt-1 text-xs text-cocoa">
          Update the security credentials used to access the boutique console.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <AField
          label="Current Password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <AField
          label="New Password (min 8 chars)"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <AField
          label="Confirm New Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        {error && <p className="text-xs text-terracotta">{error}</p>}
        {message && <p className="text-xs text-green-700 font-medium">{message}</p>}

        <Button
          type="submit"
          disabled={busy}
          className="rounded-none bg-ink px-6 py-5 text-xs uppercase tracking-widest text-cream hover:bg-cocoa-dark"
        >
          {busy ? 'Updating…' : 'Update Password'}
        </Button>
      </form>
    </div>
  )
}

/* --------- Dashboard --------- */
function Dashboard() {
  const token = auth.get()
  const [s, setS] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = () => {
    setRefreshing(true)
    Promise.all([
      api('/admin/stats', { token }),
      api('/admin/analytics', { token }),
    ])
      .then(([stats, visitorData]) => {
        setS(stats)
        setAnalytics(visitorData)
        setRefreshing(false)
      })
      .catch((err) => {
        console.error('Dashboard loading error:', err)
        setRefreshing(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [])

  if (!s || !analytics) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold-dark border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading atelier dashboard…
        </p>
      </div>
    )
  }

  const storeCards = [
    { label: 'Active Catalogue', val: s.products, sub: 'Total Products' },
    { label: 'Collections', val: s.categories, sub: 'Categories' },
    { label: 'WhatsApp Orders', val: s.orders, sub: `${s.new_orders || 0} New Requests` },
    { label: 'Stock Alerts', val: s.low_stock_count, sub: 'Low / Out of Stock', alert: s.low_stock_count > 0 },
  ]

  const visitorCards = [
    { label: 'Total Visitors', val: analytics.total_visitors },
    { label: 'Today', val: analytics.today_visitors },
    { label: 'This Week', val: analytics.week_visitors },
    { label: 'This Month', val: analytics.month_visitors },
    { label: 'Online Now', val: analytics.currently_online, live: true },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-dark font-medium">
            Atelier Executive Overview
          </span>
          <h1 className="mt-1 font-display text-4xl text-ink">
            Good day, Thretha ✦
          </h1>
        </div>

        <button
          onClick={loadData}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 self-start text-xs uppercase tracking-wider text-cocoa hover:text-ink font-medium border border-ink/15 px-3 py-1.5 bg-cream"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh Stats
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {storeCards.map((c) => (
          <div
            key={c.label}
            className={cn(
              'border border-ink/10 bg-cream p-5 paper-card transition-all',
              c.alert && 'border-terracotta/30 bg-terracotta/5'
            )}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-cocoa-light font-medium">
              {c.label}
            </p>
            <p className="mt-2 font-display text-4xl text-ink font-semibold">
              {c.val}
            </p>
            <p className="mt-1 text-xs text-cocoa">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="border border-ink/10 bg-sand/25 p-6 paper-card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl text-ink">Visitor Traffic Intelligence</h2>
            <p className="text-xs text-cocoa">Real-time visitor tracking and storefront engagement</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live Tracking Active
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visitorCards.map((vc) => (
            <div key={vc.label} className="border border-ink/10 bg-cream p-4">
              <p className="text-[10px] uppercase tracking-wider text-cocoa-light">
                {vc.label}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="font-display text-3xl text-ink font-semibold">
                  {vc.val ?? 0}
                </p>
                {vc.live && (
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="border border-ink/10 bg-cream p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink mb-3">
              Most Visited Pages
            </h3>
            {analytics.pages?.length === 0 ? (
              <p className="text-xs text-cocoa-light">No page tracking data recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {analytics.pages?.slice(0, 5).map((page) => (
                  <div key={page.page} className="flex justify-between items-center text-xs">
                    <span className="truncate max-w-[200px] text-ink font-mono">{page.page}</span>
                    <span className="text-cocoa font-medium">{page.views} views</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-ink/10 bg-cream p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink mb-3">
              Most Viewed Products
            </h3>
            {analytics.products?.length === 0 ? (
              <p className="text-xs text-cocoa-light">No product view analytics recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {analytics.products?.slice(0, 5).map((prod) => (
                  <div key={prod.product_slug} className="flex justify-between items-center text-xs">
                    <span className="truncate max-w-[200px] text-ink font-medium">{prod.product_slug}</span>
                    <span className="text-cocoa font-medium">{prod.views} views</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border border-ink/10 bg-cream p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink mb-3">
            Recent Visitor Stream
          </h3>
          {analytics.recent_visitors?.length === 0 ? (
            <p className="text-xs text-cocoa-light">No visitor sessions recorded yet.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-ink/10 bg-sand/30 uppercase tracking-wider text-[10px] text-cocoa">
                  <tr>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Visitor ID</th>
                    <th className="p-2.5">IP</th>
                    <th className="p-2.5">Device</th>
                    <th className="p-2.5">Browser / OS</th>
                    <th className="p-2.5">Page</th>
                    <th className="p-2.5">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 text-ink">
                  {analytics.recent_visitors.slice(0, 10).map((v, i) => (
                    <tr key={`${v.visitor_id}-${i}`} className="hover:bg-sand/20">
                      <td className="p-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
                            v.online
                              ? 'bg-green-100 text-green-800'
                              : 'bg-sand text-cocoa'
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              v.online ? 'bg-green-600' : 'bg-cocoa-light'
                            )}
                          />
                          {v.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-cocoa truncate max-w-[120px]">
                        {v.visitor_id}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-cocoa">{v.ip}</td>
                      <td className="p-2.5 font-medium">{v.device_type || 'Desktop'}</td>
                      <td className="p-2.5 text-cocoa">
                        {v.browser} / {v.operating_system}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-ink truncate max-w-[150px]">
                        {v.page}
                      </td>
                      <td className="p-2.5 text-cocoa-light text-[11px]">
                        {v.last_seen ? new Date(v.last_seen).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------- Product Editor Modal --------- */
function ProductEditor({ token, product, categories, onClose, onSaved }) {
  const [f, setF] = useState(
    () =>
      product || {
        name: '',
        sku: '',
        category_id: categories[0]?.id || '',
        description: '',
        price: '',
        discount_price: '',
        fabric: '',
        colour: '',
        material: '',
        pattern: '',
        care_instructions: '',
        stock: 0,
        sizes: [],
        media: [],
        featured: false,
        new_arrival: false,
        best_seller: false,
        active: true,
        ai_tryon_enabled: true,
        garment_type: 'Top',
        tryon_image: '',
      }
  )

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setV = (k) => (e) => {
    setErrorMsg('')
    set(k, e.target.value)
  }

  const toggleSize = (size) => {
    const exists = (f.sizes || []).find((s) => s.size === size)
    if (exists) {
      set('sizes', f.sizes.filter((s) => s.size !== size))
    } else {
      set('sizes', [...(f.sizes || []), { size, available: true, stock: 1 }])
    }
  }

  const addMedia = (m) => {
    set('media', [
      ...(f.media || []),
      {
        ...m,
        id: crypto.randomUUID(),
        is_primary: (f.media || []).length === 0,
        display_order: (f.media || []).length,
      },
    ])
  }

  const removeMedia = (id) => {
    set('media', f.media.filter((m) => m.id !== id))
  }

  const makePrimary = (id) => {
    set(
      'media',
      f.media.map((m) => ({
        ...m,
        is_primary: m.id === id,
      }))
    )
  }

  const save = async () => {
    setErrorMsg('')

    if (!f.name || !f.name.trim()) {
      setErrorMsg('Product title is required.')
      return
    }

    if (!f.price || isNaN(Number(f.price)) || Number(f.price) <= 0) {
      setErrorMsg('Please enter a valid product price (> 0).')
      return
    }

    if (!f.category_id) {
      setErrorMsg('Please select a category for this product.')
      return
    }

    setBusy(true)
    try {
      if (product?.id) {
        await api(`/admin/products/${product.id}`, {
          method: 'PUT',
          body: f,
          token,
        })
      } else {
        await api('/admin/products', {
          method: 'POST',
          body: f,
          token,
        })
      }
      onSaved()
    } catch (e) {
      setErrorMsg(e.message || 'Failed to save product.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[92vh] overflow-y-auto bg-paper p-6 sm:p-8 border border-ink/15">
        <DialogHeader>
          <p className="text-[10px] uppercase tracking-widest text-gold-dark font-medium">
            Atelier Product Registry
          </p>
          <DialogTitle className="font-display text-3xl sm:text-4xl text-ink">
            {product?.id ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
        </DialogHeader>

        {errorMsg && (
          <div className="mt-3 p-3 bg-coral-light/15 border border-coral text-coral text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AField
              label="Product Title"
              placeholder="e.g. Kerala Rose Saree"
              value={f.name}
              onChange={setV('name')}
              required
            />
            <AField
              label="Product Code / SKU"
              placeholder="e.g. TC-SR-001"
              value={f.sku}
              onChange={setV('sku')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
                Category
              </Label>
              <Select
                value={f.category_id || ''}
                onValueChange={(v) => set('category_id', v)}
              >
                <SelectTrigger className="mt-1.5 rounded-none border-ink/15 bg-cream">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent className="bg-paper">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <AField
              label="Total Stock Inventory"
              type="number"
              value={f.stock}
              onChange={setV('stock')}
            />
          </div>

          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Product Story & Description
            </Label>
            <Textarea
              value={f.description || ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder="A lightweight piece designed for easy styling…"
              className="mt-1.5 min-h-24 rounded-none border-ink/15 bg-cream text-sm focus-visible:border-gold"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AField
              label="Retail Price (₹)"
              type="number"
              placeholder="2499"
              value={f.price}
              onChange={setV('price')}
            />
            <AField
              label="Special Discount Price (₹) — Optional"
              type="number"
              placeholder="1999"
              value={f.discount_price}
              onChange={setV('discount_price')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <AField label="Fabric" placeholder="Cotton Blend" value={f.fabric} onChange={setV('fabric')} />
            <AField label="Colour" placeholder="Rose Pink" value={f.colour} onChange={setV('colour')} />
            <AField label="Material" placeholder="Cotton" value={f.material} onChange={setV('material')} />
            <AField label="Pattern" placeholder="Woven Zari" value={f.pattern} onChange={setV('pattern')} />
          </div>

          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Care Instructions
            </Label>
            <Textarea
              value={f.care_instructions || ''}
              onChange={(e) => set('care_instructions', e.target.value)}
              placeholder="Dry clean recommended. Store folded in muslin cloth."
              className="mt-1.5 min-h-20 rounded-none border-ink/15 bg-cream text-sm"
            />
          </div>

          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Available Sizes
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_SIZES.map((s) => {
                const isSelected = (f.sizes || []).some((x) => x.size === s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSize(s)}
                    className={cn(
                      'border px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider transition',
                      isSelected
                        ? 'border-ink bg-ink text-cream'
                        : 'border-ink/20 bg-cream text-ink hover:border-ink'
                    )}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
                  Lookbook Photography & Video
                </Label>
                <p className="text-xs text-cocoa-light">Upload high-resolution photos and video clips.</p>
              </div>
              <Uploader token={token} multiple label="Upload Media" onDone={addMedia} />
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              {(f.media || []).map((m) => (
                <div
                  key={m.id}
                  className="relative h-28 w-24 overflow-hidden rounded-sm border border-ink/20 bg-sand/30"
                >
                  {m.type === 'video' ? (
                    <video src={m.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                  )}

                  <button
                    type="button"
                    onClick={() => removeMedia(m.id)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-cream hover:bg-terracotta"
                  >
                    <X className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => makePrimary(m.id)}
                    className={cn(
                      'absolute bottom-1 left-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-cream',
                      m.is_primary && 'bg-gold text-ink'
                    )}
                    title={m.is_primary ? 'Primary cover' : 'Set as primary cover'}
                  >
                    <Star className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6 border-t border-ink/10 pt-4 text-xs font-medium text-ink">
            {[
              ['active', 'Active on Storefront'],
              ['new_arrival', 'New Arrival Drop'],
              ['featured', 'Featured Spotlight'],
              ['best_seller', 'Bestseller'],
            ].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!f[k]}
                  onCheckedChange={(v) => set(k, !!v)}
                />
                <span>{l}</span>
              </label>
            ))}
          </div>

          {/* AI Virtual Try-On Product Overrides */}
          <div className="border border-ink/10 bg-cream/70 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold-dark" />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                  AI Virtual Try-On Settings
                </span>
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider',
                  f.ai_tryon_enabled !== false && (f.tryon_image || (f.media && f.media.length > 0))
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                )}
              >
                {f.ai_tryon_enabled !== false && (f.tryon_image || (f.media && f.media.length > 0))
                  ? '✓ Ready for Try-On'
                  : f.ai_tryon_enabled === false
                  ? 'Disabled'
                  : '⚠ Needs Media'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <Checkbox
                  checked={f.ai_tryon_enabled !== false}
                  onCheckedChange={(v) => set('ai_tryon_enabled', !!v)}
                />
                <span className="font-medium text-ink">Enable Try-On for this product</span>
              </label>

              <div className="space-y-1">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-ink/70">
                  Try-On Garment Type
                </Label>
                <select
                  value={f.garment_type || 'Top'}
                  onChange={(e) => set('garment_type', e.target.value)}
                  className="w-full h-9 px-2.5 bg-paper border border-ink/20 text-xs font-sans rounded-none outline-hidden"
                >
                  {GARMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-ink/70">
                Custom Try-On Garment Image URL (Optional flat-lay override)
              </Label>
              <Input
                value={f.tryon_image || ''}
                onChange={setV('tryon_image')}
                placeholder="https://... or leave empty to use primary product image"
                className="rounded-none bg-paper border-ink/20 text-xs font-mono"
              />
            </div>
          </div>

          <Button
            onClick={save}
            disabled={busy}
            className="w-full rounded-none bg-ink py-6 text-xs uppercase tracking-[0.25em] text-cream hover:bg-cocoa-dark font-medium shadow-subtle"
          >
            {busy ? 'Saving Piece…' : 'Save Product →'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* --------- Products Manager --------- */
function Products() {
  const token = auth.get()
  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')

  const load = () => api('/admin/products', { token }).then(setList)

  useEffect(() => {
    load()
    api('/admin/categories', { token }).then(setCats)
  }, [])

  const filtered = list.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.sku?.toLowerCase().includes(q.toLowerCase()) ||
      p.category_name?.toLowerCase().includes(q.toLowerCase())
  )

  const del = async (id) => {
    if (confirm('Delete this product permanently from the catalogue?')) {
      await api(`/admin/products/${id}`, { method: 'DELETE', token })
      load()
    }
  }

  const dup = async (id) => {
    await api(`/admin/products/${id}/duplicate`, { method: 'POST', token })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-dark font-medium">
            Inventory & Catalogue
          </span>
          <h1 className="mt-1 font-display text-4xl text-ink">Products ({list.length})</h1>
        </div>

        <Button
          onClick={() => setEditing({})}
          className="rounded-none bg-ink px-6 py-5 text-xs uppercase tracking-widest text-cream hover:bg-cocoa-dark shadow-subtle"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by title, SKU, category…"
            className="rounded-none border-ink/20 bg-cream pl-9 text-xs"
          />
        </div>
      </div>

      <div className="w-full overflow-x-auto border border-ink/10 bg-cream paper-card">
        <table className="min-w-[850px] w-full text-left text-xs">
          <thead className="border-b border-ink/10 bg-sand/30 uppercase tracking-wider text-[10px] text-cocoa">
            <tr>
              <th className="p-3">Cover</th>
              <th className="p-3">Product Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Price</th>
              <th className="p-3">Inventory</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5 text-ink">
            {filtered.map((p) => {
              const img = p.media?.[0]?.url
              return (
                <tr key={p.id} className="hover:bg-sand/15">
                  <td className="p-3">
                    <div className="h-14 w-11 overflow-hidden rounded-sm bg-sand/40">
                      {img ? (
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-[10px] text-cocoa-light">
                          No img
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <p className="font-semibold text-sm text-ink">{p.name}</p>
                    <p className="font-mono text-[10px] text-cocoa-light">SKU: {p.sku}</p>
                  </td>
                  <td className="p-3 text-cocoa">{p.category_name}</td>
                  <td className="p-3 font-medium">
                    {inr(p.discount_price || p.price)}
                    {p.discount_price && (
                      <span className="block text-[10px] text-cocoa-light line-through">
                        {inr(p.price)}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-sm',
                        p.stock > 3
                          ? 'bg-green-100 text-green-800'
                          : p.stock > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      )}
                    >
                      {p.stock > 0 ? `${p.stock} in stock` : 'Sold out'}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.active !== false ? (
                      <span className="text-green-700 font-medium">Active</span>
                    ) : (
                      <span className="text-cocoa-light">Hidden</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs uppercase tracking-wider text-ink font-semibold hover:text-gold-dark underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => dup(p.id)}
                        className="text-xs uppercase tracking-wider text-cocoa hover:text-ink"
                        title="Duplicate piece"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => del(p.id)}
                        className="text-xs text-terracotta hover:opacity-75"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProductEditor
          token={token}
          product={editing.id ? editing : null}
          categories={cats}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/* --------- Categories Manager --------- */
function Categories() {
  const token = auth.get()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)

  const load = () => api('/admin/categories', { token }).then(setList)
  useEffect(() => {
    load()
  }, [])

  const del = async (id) => {
    if (confirm('Delete category?')) {
      await api(`/admin/categories/${id}`, { method: 'DELETE', token })
      load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-ink/10 pb-5">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-dark font-medium">
            Taxonomy & Navigation
          </span>
          <h1 className="mt-1 font-display text-4xl text-ink">Categories</h1>
        </div>

        <Button
          onClick={() =>
            setEditing({ name: '', description: '', image: '', active: true })
          }
          className="rounded-none bg-ink px-6 py-5 text-xs uppercase tracking-widest text-cream"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add Category
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <div
            key={c.id}
            className="border border-ink/10 bg-cream p-5 paper-card flex flex-col justify-between"
          >
            <div>
              {c.image && (
                <div className="aspect-[16/9] w-full overflow-hidden rounded-sm bg-sand/40 mb-3">
                  <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
                </div>
              )}
              <h3 className="font-display text-2xl text-ink">{c.name}</h3>
              <p className="mt-1 text-xs text-cocoa leading-relaxed">{c.description}</p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3 text-xs">
              <span className="text-cocoa-light font-mono">slug: {c.slug}</span>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(c)}
                  className="font-semibold text-ink hover:text-gold-dark underline uppercase tracking-wider text-[11px]"
                >
                  Edit
                </button>
                <button
                  onClick={() => del(c.id)}
                  className="text-terracotta hover:opacity-75 uppercase tracking-wider text-[11px]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <CategoryEditor
          token={token}
          cat={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function CategoryEditor({ token, cat, onClose, onSaved }) {
  const [f, setF] = useState(cat)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const set = (k, v) => {
    setErrorMsg('')
    setF((s) => ({ ...s, [k]: v }))
  }

  const save = async () => {
    setErrorMsg('')
    if (!f.name || !f.name.trim()) {
      setErrorMsg('Category name is required.')
      return
    }

    setBusy(true)
    try {
      if (cat.id) {
        await api(`/admin/categories/${cat.id}`, { method: 'PUT', body: f, token })
      } else {
        await api('/admin/categories', { method: 'POST', body: f, token })
      }
      onSaved()
    } catch (e) {
      setErrorMsg(e.message || 'Failed to save category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-paper p-6 max-w-md border border-ink/15">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl text-ink">
            {cat.id ? 'Edit Category' : 'Add Category'}
          </DialogTitle>
        </DialogHeader>

        {errorMsg && (
          <div className="mt-2 p-3 bg-coral-light/15 border border-coral text-coral text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-4 mt-2">
          <AField
            label="Category Name"
            value={f.name || ''}
            onChange={(e) => set('name', e.target.value)}
            required
          />

          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Description
            </Label>
            <Textarea
              value={f.description || ''}
              onChange={(e) => set('description', e.target.value)}
              className="mt-1 rounded-none border-ink/15 bg-cream text-xs"
            />
          </div>

          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70 block mb-1.5">
              Category Cover Image
            </Label>
            <div className="flex items-center gap-3">
              {f.image && (
                <img
                  src={f.image}
                  alt=""
                  className="h-16 w-24 object-cover rounded-sm border border-ink/15"
                />
              )}
              <Uploader
                token={token}
                label="Upload Cover"
                onDone={(m) => set('image', m.url)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer pt-2">
            <Checkbox
              checked={!!f.active}
              onCheckedChange={(v) => set('active', !!v)}
            />
            <span>Active on storefront</span>
          </label>

          <Button
            onClick={save}
            className="w-full rounded-none bg-ink py-6 text-xs uppercase tracking-widest text-cream font-medium"
          >
            Save Category
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* --------- Orders Pipeline Manager --------- */
function Orders() {
  const token = auth.get()
  const [list, setList] = useState([])
  const [busyOrderId, setBusyOrderId] = useState(null)
  const [actionMsg, setActionMsg] = useState('')

  const load = () => api('/admin/orders', { token }).then(setList)
  useEffect(() => {
    load()
  }, [])

  const setStatus = async (id, status) => {
    await api(`/admin/orders/${id}`, {
      method: 'PUT',
      body: { status },
      token,
    })
    load()
  }

  const handleInitiateRefund = async (order) => {
    if (busyOrderId || !order) return
    const confirmed = window.confirm(`Initiate full refund of ${inr(order.total)} for Order #${order.order_number}?`)
    if (!confirmed) return

    setBusyOrderId(order.id)
    setActionMsg('')

    try {
      const res = await api(`/admin/orders/${order.id}/refund`, {
        method: 'POST',
        body: { reason: 'Admin initiated cancellation & refund' },
        token,
      })

      if (res?.ok) {
        setActionMsg(`Refund initiated for #${order.order_number}`)
        await load()
      } else {
        alert(res?.error || 'Failed to initiate refund')
      }
    } catch (err) {
      alert(err.message || 'Error executing refund')
    } finally {
      setBusyOrderId(null)
    }
  }

  const handleCancelItem = async (order, item, itemIndex) => {
    const busyKey = `${order.id}:${itemIndex}`
    if (busyOrderId || !order || !item) return
    const amount = Math.max(0, Number(item.price || 0) * Math.max(1, Number(item.quantity) || 1))
    const confirmed = window.confirm(`Cancel ${item.product_name || item.combo_name || 'this item'} from Order #${order.order_number}?${order.payment_status === 'PAID' ? ` Cashfree will be asked to refund the item's discounted value (up to ${inr(amount)}).` : ''} Other items in the order will remain active.`)
    if (!confirmed) return
    setBusyOrderId(busyKey)
    try {
      const result = await api(`/admin/orders/${order.id}/items/${itemIndex}/cancel`, { method: 'POST', body: { reason: 'Admin cancelled this product' }, token })
      if (!result?.ok) throw new Error(result?.error || 'Could not cancel item.')
      setList(current => current.map(entry => entry.id === order.id ? result.order : entry))
      setActionMsg(result.refund_status === 'PENDING' ? `Cashfree refund pending for ${item.product_name || 'item'} in #${order.order_number}` : `Item cancelled in #${order.order_number}`)
    } catch (error) {
      alert(error.message || 'Could not cancel this item.')
    } finally {
      setBusyOrderId(null)
    }
  }

  const handleSyncItemRefund = async (order, itemIndex) => {
    if (busyOrderId) return
    setBusyOrderId(`${order.id}:${itemIndex}`)
    try {
      const result = await api(`/admin/orders/${order.id}/items/${itemIndex}/sync-refund`, { method: 'POST', token })
      if (!result?.ok) throw new Error(result?.error || 'Could not sync item refund.')
      setList(current => current.map(entry => entry.id === order.id ? result.order : entry))
    } catch (error) {
      alert(error.message || 'Could not sync item refund.')
    } finally {
      setBusyOrderId(null)
    }
  }

  const handleSyncRefund = async (orderId) => {
    if (busyOrderId) return
    setBusyOrderId(orderId)
    try {
      const res = await api(`/admin/orders/${orderId}/sync-refund`, {
        method: 'POST',
        token,
      })
      if (res?.ok) {
        await load()
      } else {
        alert(res?.error || 'Failed to sync refund status')
      }
    } catch (err) {
      alert(err.message || 'Error syncing refund')
    } finally {
      setBusyOrderId(null)
    }
  }

  const getStatusColor = (st) => {
    switch (st) {
      case 'NEW':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'WHATSAPP CONTACTED':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'CONFIRMED':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'PACKED':
      case 'SHIPPED':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200'
      case 'DELIVERED':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-sand text-cocoa'
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-ink/10 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-dark font-medium">
            Orders & WhatsApp Fulfillment
          </span>
          <h1 className="mt-1 font-display text-4xl text-ink">
            Orders ({list.length})
          </h1>
        </div>

        {actionMsg && (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5">
            ✓ {actionMsg}
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-ink/20 bg-cream/50 p-8">
          <ShoppingBag className="mx-auto h-8 w-8 text-cocoa-light" />
          <p className="mt-3 font-display text-2xl text-ink">No customer orders yet.</p>
          <p className="text-xs text-cocoa">Orders placed via WhatsApp will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((o) => {
            const isPaid = o.payment_status === 'PAID' || o.payment?.status === 'PAID'
            const isCancelled = o.status === 'CANCELLED' || o.payment_status === 'CANCELLED'
            const itemRefundedAmount = (o.items || []).reduce((sum, item) => sum + (item.cancellation?.refund_status === 'COMPLETED' ? Number(item.cancellation.amount || 0) : 0), 0)
            const refundStatus = (o.refund?.status || o.payment?.refund_status || o.refund_status || (itemRefundedAmount ? 'PARTIAL' : 'NONE')).toUpperCase()
            const refundAmount = o.refund?.amount || o.payment?.refund_amount || o.refund?.partial_amount_total || itemRefundedAmount || o.total
            const cfRefundId = o.refund?.cf_refund_id || o.payment?.cashfree_refund_id
            const hasItemCancellation = (o.items || []).some(item => Boolean(item.cancellation?.status || item.cancellation?.refund_id))

            return (
              <div
                key={o.id}
                className="border border-ink/10 bg-cream p-5 sm:p-6 paper-card space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-ink/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-2xl text-ink font-semibold">
                        {o.order_number}
                      </span>
                      <span
                        className={cn(
                          'border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                          getStatusColor(o.status)
                        )}
                      >
                        {o.status}
                      </span>
                      {isPaid ? (
                        <span className="border border-emerald-300 bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                          PAID ({o.payment_method})
                        </span>
                      ) : (
                        <span className="border border-ink/15 bg-paper text-ink px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                          {o.payment_status || 'PENDING'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-cocoa">
                      {new Date(o.created_at).toLocaleString()}
                      {o.payment?.cashfree_payment_id && ` · Ref: ${o.payment.cashfree_payment_id}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-display text-2xl text-ink font-semibold">
                      {inr(o.total)}
                    </span>
                    <Select
                      value={o.status}
                      onValueChange={(v) => setStatus(o.id, v)}
                    >
                      <SelectTrigger className="w-[190px] rounded-none border-ink/20 bg-paper text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-paper">
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ShippingDetailsEditor order={o} token={token} onSaved={updated => setList(current => current.map(item => item.id === updated.id ? updated : item))} />

                {/* Refund Information & Admin Action Bar */}
                {(isCancelled || refundStatus !== 'NONE' || o.refund) && (
                  <div className="p-3.5 bg-paper border border-ink/10 text-xs space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                          Refund Management:
                        </span>
                        {refundStatus === 'PARTIAL' ? (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">PARTIAL ({inr(refundAmount)})</span>
                        ) : refundStatus === 'COMPLETED' ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                            COMPLETED ({inr(refundAmount)})
                          </span>
                        ) : refundStatus === 'FAILED' ? (
                          <span className="bg-coral-light text-coral-dark border border-coral px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                            REFUND FAILED
                          </span>
                        ) : refundStatus === 'PENDING' || refundStatus === 'REFUND_PENDING' ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                            REFUND PENDING ({inr(refundAmount)})
                          </span>
                        ) : (
                          <span className="bg-sand text-cocoa px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                            NO REFUND
                          </span>
                        )}
                      </div>

                      {/* Admin Refund Trigger Buttons */}
                      <div className="flex items-center gap-2">
                        {isPaid && refundStatus === 'PENDING' && (
                          <button
                            type="button"
                            disabled={busyOrderId === o.id}
                            onClick={() => handleSyncRefund(o.id)}
                            className="px-3 py-1 bg-paper border border-ink/20 text-ink text-[11px] font-semibold uppercase tracking-wider hover:bg-cream"
                          >
                            {busyOrderId === o.id ? 'Syncing...' : 'Sync Cashfree'}
                          </button>
                        )}

                        {isPaid && !hasItemCancellation && (refundStatus === 'NONE' || refundStatus === 'FAILED') && (
                          <button
                            type="button"
                            disabled={busyOrderId === o.id}
                            onClick={() => handleInitiateRefund(o)}
                            className="px-3 py-1 bg-ink text-cream text-[11px] font-semibold uppercase tracking-wider hover:bg-cocoa-dark"
                          >
                            {busyOrderId === o.id ? 'Processing...' : refundStatus === 'FAILED' ? 'Retry Refund' : 'Initiate Refund'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-cocoa text-[11px] space-y-0.5">
                      {o.cancellation_reason && (
                        <p><strong>Cancellation Reason:</strong> {o.cancellation_reason}</p>
                      )}
                      {cfRefundId && (
                        <p><strong>Cashfree Refund ID:</strong> <span className="font-mono text-ink">{cfRefundId}</span></p>
                      )}
                      {o.refund?.failure_reason && (
                        <p className="text-coral-dark"><strong>Failure Error:</strong> {o.refund.failure_reason}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid gap-6 md:grid-cols-2 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-ink mb-2">
                      Order Items
                    </p>
                    <div className="space-y-2">
                      {(o.items || []).map((it, idx) => (
                        <div key={idx} className="bg-sand/20 p-2.5 rounded-sm border border-ink/5">
                          {it.is_combo ? (
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-ink flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5 text-mango-dark" />
                                  {it.combo_name || it.product_name}
                                </span>
                                <span className="bg-mango-dark/10 text-mango-dark border border-mango/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                                  CURATED COMBO ({it.quantity}x)
                                </span>
                              </div>
                              <p className="text-cocoa text-[11px] mt-0.5">
                                Package Price: {inr(it.price)} {it.savings ? `· You Saved: ${inr(it.savings)}` : ''}
                              </p>
                              {Array.isArray(it.components) && it.components.length > 0 && (
                                <div className="mt-2 pl-2.5 border-l-2 border-mango/40 space-y-1 bg-paper/60 p-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Components for Packing:</p>
                                  {it.components.map((comp, cIdx) => (
                                    <div key={cIdx} className="text-[11px] text-ink flex items-center justify-between">
                                      <span>• {comp.product_name} (Size: <strong>{comp.size || 'Free Size'}</strong>)</span>
                                      <span className="text-cocoa text-[10px]">SKU: {comp.sku || 'TC-PIECE'} · Qty: {comp.quantity * it.quantity}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p className="font-semibold text-ink">{it.product_name}</p>
                              <p className="text-cocoa">
                                Code: {it.sku} · Size: {it.size} · Qty: {it.quantity} · Price: {inr(it.price)}
                              </p>
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-ink/5 pt-2">
                            <span className="text-[10px] text-cocoa">Item state: <strong>{it.cancellation?.status || 'ACTIVE'}</strong>{it.cancellation?.refund_status ? ` · Refund ${it.cancellation.refund_status}` : ''}</span>
                            <div className="flex flex-wrap gap-2">
                              {it.cancellation?.refund_status === 'PENDING' && <button type="button" disabled={busyOrderId === `${o.id}:${idx}`} onClick={() => handleSyncItemRefund(o, idx)} className="min-h-9 border border-ink/20 px-3 text-[10px] font-semibold uppercase tracking-wider">Sync item refund</button>}
                              {!['PENDING', 'CANCELLED'].includes(String(it.cancellation?.status || '').toUpperCase()) && !['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLATION_PENDING', 'CANCELLED'].includes(String(o.status || '').toUpperCase()) && <button type="button" disabled={Boolean(busyOrderId)} onClick={() => handleCancelItem(o, it, idx)} className="min-h-9 border border-coral/50 px-3 text-[10px] font-semibold uppercase tracking-wider text-coral-dark disabled:opacity-50">{busyOrderId === `${o.id}:${idx}` ? 'Processing…' : it.cancellation?.status === 'FAILED' ? 'Retry item cancel' : 'Cancel item'}</button>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-ink mb-2">
                        Customer & Delivery Info
                      </p>
                      <div className="bg-sand/20 p-2.5 rounded-sm border border-ink/5 space-y-1 text-cocoa">
                        <p className="font-semibold text-ink">
                          {o.customer?.name} ({o.customer?.whatsapp || o.customer?.phone})
                        </p>
                        <p>
                          {[
                            o.customer?.house,
                            o.customer?.street,
                            o.customer?.city,
                            o.customer?.district,
                            o.customer?.state,
                            o.customer?.pincode,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="bg-paper p-3 rounded-sm border border-ink/10 space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-cocoa">
                        <span>Merchandise Subtotal:</span>
                        <span className="font-medium text-ink">{inr(o.subtotal || 0)}</span>
                      </div>
                      {o.discount > 0 && (
                        <div className="flex justify-between text-plum font-semibold">
                          <span>Discount {o.promotion?.code ? `(${o.promotion.code})` : ''}:</span>
                          <span>-{inr(o.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-cocoa items-center">
                        <span>Delivery Fee:</span>
                        <span className="font-semibold">
                          {o.shipping === 0 ? (
                            <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.2 border border-emerald-300">
                              FREE
                            </span>
                          ) : (
                            <span className="text-ink">{inr(o.shipping)}</span>
                          )}
                        </span>
                      </div>
                      <div className="text-[10px] text-cocoa-light">
                        {o.shipping_reason === 'FREE_DELIVERY_THRESHOLD'
                          ? 'Free delivery — threshold reached'
                          : o.shipping_reason === 'PROMOTION'
                          ? 'Free delivery — promotional coupon/rule'
                          : o.shipping_reason === 'DELIVERY_DISABLED'
                          ? 'Free delivery — storewide disabled'
                          : o.shipping === 0
                          ? 'Free delivery'
                          : `Standard delivery (${o.shipping_rule_snapshot?.delivery_timeframe || '5–7 working days'})`}
                      </div>
                      <div className="flex justify-between text-xs font-bold text-ink border-t border-ink/10 pt-1.5 mt-1">
                        <span>Final Order Total:</span>
                        <span>{inr(o.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* --------- Global Settings Page --------- */
function SettingsPage() {
  const token = auth.get()
  const [f, setF] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/admin/settings', { token })
      .then((data) => {
        setF(data || {})
      })
      .catch((err) => {
        setError(err.message || 'Failed to load settings')
      })
  }, [])

  if (!f && !error) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold-dark border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading settings…
        </p>
      </div>
    )
  }

  if (error && !f) {
    return (
      <div className="py-16 text-center border border-coral/30 bg-coral-light/20 p-8 space-y-4">
        <p className="text-sm font-semibold text-coral">{error}</p>
        <Button
          onClick={() => {
            setError('')
            api('/admin/settings', { token }).then(setF).catch((e) => setError(e.message))
          }}
          className="rounded-none bg-ink px-6 py-2 text-xs uppercase tracking-wider text-cream"
        >
          Retry
        </Button>
      </div>
    )
  }

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setV = (k) => (e) => set(k, e.target.value)

  const setHero = (k, v) =>
    setF((s) => ({
      ...s,
      hero: { ...s.hero, [k]: v },
    }))

  const setHomepageContent = (k, v) =>
    setF((s) => ({
      ...s,
      homepage_content: { ...s.homepage_content, [k]: v },
    }))

  const setShip = (k, v) =>
    setF((s) => ({
      ...s,
      shipping: { ...s.shipping, [k]: v },
    }))

  const save = async () => {
    setSaving(true)
    setError('')

    if (f.shipping) {
      const charge = Number(f.shipping.delivery_charge)
      const threshold = Number(f.shipping.free_shipping_threshold)
      if (f.shipping.delivery_charge !== undefined && (isNaN(charge) || charge < 0)) {
        setError('Default delivery charge must be a non-negative number (>= 0).')
        setSaving(false)
        return
      }
      if (f.shipping.free_shipping_threshold !== undefined && (isNaN(threshold) || threshold < 0)) {
        setError('Free delivery threshold must be a non-negative number (>= 0).')
        setSaving(false)
        return
      }
      if (f.shipping.delivery_timeframe !== undefined && !String(f.shipping.delivery_timeframe).trim()) {
        setError('Delivery timeframe is required and cannot be empty.')
        setSaving(false)
        return
      }
    }

    try {
      const requestedCourier = f.shipping?.default_courier
      const res = await api('/admin/settings', {
        method: 'PUT',
        body: f,
        token,
      })
      if (requestedCourier !== undefined && res?.shipping?.default_courier !== requestedCourier) {
        throw new Error('The server did not confirm the saved delivery service. Reload settings and try again.')
      }
      if (res) {
        setF(res)
      }
      broadcastStorefrontSettingsChanged('all')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between border-b border-ink/10 pb-5">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-dark font-medium">
            Storefront Configuration
          </span>
          <h1 className="mt-1 font-display text-4xl text-ink">Settings</h1>
        </div>

        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-coral font-medium">{error}</span>}
          <Button
            disabled={saving}
            onClick={save}
            className="rounded-none bg-ink px-8 py-5 text-xs uppercase tracking-widest text-cream hover:bg-cocoa-dark shadow-subtle flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream border-t-transparent" />
                <span>Saving…</span>
              </>
            ) : saved ? (
              'Saved ✓'
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>

      <section className="border border-ink/10 bg-cream p-5 paper-card shadow-2xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">PWA Install Prompt</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-cocoa-light">Show customers an option to install Thretha as an app on supported devices.</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-cocoa">{f.pwa?.install_prompt_enabled !== false ? 'ON' : 'OFF'}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={f.pwa?.install_prompt_enabled !== false}
            aria-label="Toggle PWA install prompt"
            onClick={() => set('pwa', { ...f.pwa, install_prompt_enabled: f.pwa?.install_prompt_enabled === false })}
            className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', f.pwa?.install_prompt_enabled !== false ? 'bg-ink' : 'bg-ink/20')}
          >
            <span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white transition-transform', f.pwa?.install_prompt_enabled !== false ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>
      </section>

      {/* Global Combos & Ensembles Master Toggle */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4 shadow-2xs">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-mango-dark" />
              <h2 className="font-display text-2xl text-ink">Combos &amp; Ensembles</h2>
            </div>
            <p className="text-xs text-cocoa leading-relaxed max-w-xl">
              Enable or disable the combo shopping experience across the storefront.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className={cn(
                'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                f.combos_enabled !== false
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-sand/60 text-cocoa border border-ink/15'
              )}
            >
              {f.combos_enabled !== false ? 'Enabled (ON)' : 'Disabled (OFF)'}
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={f.combos_enabled !== false}
              aria-label="Toggle Combos & Ensembles feature"
              onClick={() => set('combos_enabled', f.combos_enabled === false ? true : false)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-mango-dark',
                f.combos_enabled !== false ? 'bg-mango-dark' : 'bg-ink/20'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform shadow-xs',
                  f.combos_enabled !== false ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>

        <div className="text-xs text-cocoa-light border-t border-ink/10 pt-3">
          {f.combos_enabled !== false ? (
            <p className="text-emerald-800 font-medium">
              ✓ <strong>Active on Storefront:</strong> Navigation menu displays &ldquo;Combos&rdquo;, customer catalogue at <code className="bg-paper px-1 py-0.5 border border-ink/10 font-mono text-[11px]">/combos</code> is accessible, and customers can select &amp; purchase active ensembles.
            </p>
          ) : (
            <p className="text-coral font-medium">
              ✕ <strong>Disabled Globally:</strong> Storefront navigation hides &ldquo;Combos&rdquo;, combo browsing is disabled, and checkout/validation APIs reject new combo purchases. Admin management remains fully functional.
            </p>
          )}
        </div>
      </section>

      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <h2 className="font-display text-2xl text-ink">1. Brand &amp; Contact Information</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AField label="Brand Name" value={f.brand_name} onChange={setV('brand_name')} />
          <AField label="WhatsApp Order Phone (with country code)" value={f.whatsapp} onChange={setV('whatsapp')} placeholder="918301824696" />
          <AField label="Instagram URL" value={f.instagram} onChange={setV('instagram')} />
          <AField label="Contact Email" value={f.email} onChange={setV('email')} />
          <AField label="Business Address" value={f.address} onChange={setV('address')} />
          <AField label="Low Stock Alert Threshold" type="number" value={f.low_stock_threshold ?? 3} onChange={(e) => set('low_stock_threshold', Number(e.target.value))} />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4">
          <div>
            <p className="text-xs font-semibold text-ink">Visitor Geolocation Analytics</p>
            <p className="text-xs text-cocoa-light">Prompt visitors for approximate location permissions to map customer regions.</p>
          </div>
          <button
            type="button"
            onClick={() => set('ask_visitor_location', !f.ask_visitor_location)}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              f.ask_visitor_location ? 'bg-ink' : 'bg-ink/20'
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                f.ask_visitor_location ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </section>

      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <h2 className="font-display text-2xl text-ink">2. Homepage Hero Banner</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AField label="Hero Title" value={f.hero?.title} onChange={(e) => setHero('title', e.target.value)} />
          <AField label="Hero Kicker / Tag" value={f.hero?.kicker} onChange={(e) => setHero('kicker', e.target.value)} />
          <AField label="Hero Subtitle" value={f.hero?.subtitle} onChange={(e) => setHero('subtitle', e.target.value)} />
          <AField label="Hero Annotation" value={f.hero?.annotation} onChange={(e) => setHero('annotation', e.target.value)} />
          <AField label="CTA Button Text" value={f.hero?.cta} onChange={(e) => setHero('cta', e.target.value)} />
          <AField label="CTA Link" value={f.hero?.cta_link || '/shop'} onChange={(e) => setHero('cta_link', e.target.value)} placeholder="/shop" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Hero Carousel Images
            </Label>
            <Uploader
              token={token}
              label="Add Hero Slide"
              onDone={(m) => setHero('images', [...(f.hero?.images || []), m.url])}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {(f.hero?.images || []).map((img, idx) => (
              <div key={idx} className="relative h-24 w-20 overflow-hidden rounded-sm border border-ink/15 bg-sand/30">
                <img src={img} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setHero(
                      'images',
                      f.hero.images.filter((_, i) => i !== idx)
                    )
                  }
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/80 text-cream hover:bg-terracotta"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-5">
        <div>
          <h2 className="font-display text-2xl text-ink">3. Homepage Section Content</h2>
          <p className="mt-1 text-xs text-cocoa">Edit the current homepage section copy. Product, category, and Instagram content continues to come from its existing Admin-managed source.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AField label="Intro Line 1" value={f.homepage_content?.intro_left ?? DEFAULT_HOMEPAGE_CONTENT.intro_left} onChange={(e) => setHomepageContent('intro_left', e.target.value)} />
          <AField label="Intro Line 2" value={f.homepage_content?.intro_right ?? DEFAULT_HOMEPAGE_CONTENT.intro_right} onChange={(e) => setHomepageContent('intro_right', e.target.value)} />
          <AField label="Category Section Heading" value={f.homepage_content?.categories_heading ?? DEFAULT_HOMEPAGE_CONTENT.categories_heading} onChange={(e) => setHomepageContent('categories_heading', e.target.value)} />
          <AField label="Category Section Eyebrow" value={f.homepage_content?.categories_eyebrow ?? DEFAULT_HOMEPAGE_CONTENT.categories_eyebrow} onChange={(e) => setHomepageContent('categories_eyebrow', e.target.value)} />
          <AField label="New Arrivals Heading" value={f.homepage_content?.arrivals_heading ?? DEFAULT_HOMEPAGE_CONTENT.arrivals_heading} onChange={(e) => setHomepageContent('arrivals_heading', e.target.value)} />
          <AField label="Featured Edit Eyebrow" value={f.homepage_content?.featured_eyebrow ?? DEFAULT_HOMEPAGE_CONTENT.featured_eyebrow} onChange={(e) => setHomepageContent('featured_eyebrow', e.target.value)} />
          <AField label="Featured Edit CTA" value={f.homepage_content?.featured_cta ?? DEFAULT_HOMEPAGE_CONTENT.featured_cta} onChange={(e) => setHomepageContent('featured_cta', e.target.value)} />
          <AField label="Featured Edit CTA Link" value={f.homepage_content?.featured_cta_link ?? DEFAULT_HOMEPAGE_CONTENT.featured_cta_link} onChange={(e) => setHomepageContent('featured_cta_link', e.target.value)} />
          <div className="sm:col-span-2 border-t border-ink/10 pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div><Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">Featured Editorial Image</Label><p className="mt-1 text-[10px] text-cocoa-light">Shown in the existing homepage featured edit section.</p></div>
              <Uploader token={token} label={f.homepage_content?.featured_editorial_image ? 'Replace Image' : 'Upload Image'} onDone={media => setHomepageContent('featured_editorial_image', media.url)} />
            </div>
            {f.homepage_content?.featured_editorial_image ? <div className="relative h-36 w-28 overflow-hidden border border-ink/15 bg-sand/30"><img src={f.homepage_content.featured_editorial_image} alt="Featured editorial preview" className="h-full w-full object-cover" /><button type="button" onClick={() => setHomepageContent('featured_editorial_image', '')} aria-label="Remove featured editorial image" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-ink/80 text-cream hover:bg-terracotta"><X className="h-3.5 w-3.5" /></button></div> : <p className="text-[11px] text-cocoa">Using the primary image of the featured product.</p>}
          </div>
          <AField label="Follow The Journey Eyebrow" value={f.homepage_content?.journey_kicker ?? DEFAULT_HOMEPAGE_CONTENT.journey_kicker} onChange={(e) => setHomepageContent('journey_kicker', e.target.value)} />
          <AField label="Follow The Journey Heading" value={f.homepage_content?.journey_heading ?? DEFAULT_HOMEPAGE_CONTENT.journey_heading} onChange={(e) => setHomepageContent('journey_heading', e.target.value)} />
          <AField label="Final CTA Eyebrow" value={f.homepage_content?.final_kicker ?? DEFAULT_HOMEPAGE_CONTENT.final_kicker} onChange={(e) => setHomepageContent('final_kicker', e.target.value)} />
          <AField label="Final CTA Button" value={f.homepage_content?.final_cta ?? DEFAULT_HOMEPAGE_CONTENT.final_cta} onChange={(e) => setHomepageContent('final_cta', e.target.value)} />
          <AField label="Final CTA Link" value={f.homepage_content?.final_cta_link ?? DEFAULT_HOMEPAGE_CONTENT.final_cta_link} onChange={(e) => setHomepageContent('final_cta_link', e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">Featured Edit Heading</Label>
          <Textarea value={f.homepage_content?.featured_heading ?? DEFAULT_HOMEPAGE_CONTENT.featured_heading} onChange={(e) => setHomepageContent('featured_heading', e.target.value)} className="mt-1.5 min-h-16 rounded-none border-ink/15 bg-cream text-xs" />
        </div>
        <div>
          <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">Featured Edit Description</Label>
          <Textarea value={f.homepage_content?.featured_description ?? DEFAULT_HOMEPAGE_CONTENT.featured_description} onChange={(e) => setHomepageContent('featured_description', e.target.value)} className="mt-1.5 min-h-20 rounded-none border-ink/15 bg-cream text-xs" />
        </div>
        <div>
          <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">Final CTA Heading</Label>
          <Textarea value={f.homepage_content?.final_heading ?? DEFAULT_HOMEPAGE_CONTENT.final_heading} onChange={(e) => setHomepageContent('final_heading', e.target.value)} className="mt-1.5 min-h-16 rounded-none border-ink/15 bg-cream text-xs" />
        </div>
      </section>

      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <h2 className="font-display text-2xl text-ink">4. Editorial Campaign & Story Images</h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70 block mb-2">
              The Saree Edit Campaign Image
            </Label>
            <div className="flex items-center gap-3">
              {f.saree_edit_image && (
                <img src={f.saree_edit_image} alt="" className="h-20 w-16 object-cover rounded-sm border border-ink/15" />
              )}
              <Uploader token={token} label="Change Image" onDone={(m) => set('saree_edit_image', m.url)} />
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70 block mb-2">
              Brand Story Lookbook Image
            </Label>
            <div className="flex items-center gap-3">
              {f.brand_story_image && (
                <img src={f.brand_story_image} alt="" className="h-20 w-16 object-cover rounded-sm border border-ink/15" />
              )}
              <Uploader token={token} label="Change Image" onDone={(m) => set('brand_story_image', m.url)} />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
            Brand Story Copy
          </Label>
          <Textarea
            value={f.brand_story || ''}
            onChange={(e) => set('brand_story', e.target.value)}
            className="mt-1.5 min-h-24 rounded-none border-ink/15 bg-cream text-xs"
          />
        </div>
      </section>

      {/* 5. Delivery & Shipping Management */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-gold-dark" />
              <h2 className="font-display text-2xl text-ink">5. Delivery &amp; Shipping</h2>
            </div>
            <p className="text-xs text-cocoa leading-relaxed max-w-xl">
              Configure global delivery fees, free delivery thresholds, timeframes, and customer policies.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className={cn(
                'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                f.shipping?.delivery_enabled !== false
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-sand/60 text-cocoa border border-ink/15'
              )}
            >
              {f.shipping?.delivery_enabled !== false ? 'Delivery Active' : 'Delivery Disabled (Storewide Free)'}
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={f.shipping?.delivery_enabled !== false}
              aria-label="Toggle Delivery Charges"
              onClick={() => setShip('delivery_enabled', f.shipping?.delivery_enabled === false ? true : false)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-gold-dark',
                f.shipping?.delivery_enabled !== false ? 'bg-gold-dark' : 'bg-ink/20'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform shadow-xs',
                  f.shipping?.delivery_enabled !== false ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">Default delivery service for new orders</Label>
            <select value={f.shipping?.default_courier || ''} onChange={e => setShip('default_courier', e.target.value)} className="min-h-10 w-full border border-ink/20 bg-cream px-3 text-xs text-ink">
              <option value="">Assign courier after order is placed</option>
              {DELIVERY_SERVICES.map(service => <option key={service.value} value={service.value}>{service.label}</option>)}
            </select>
            <p className="text-[10px] text-cocoa-light">This sets the courier on new orders only. Existing orders keep their own shipping details.</p>
          </div>
          <AField
            label="Default Delivery Charge (₹)"
            type="number"
            min="0"
            step="1"
            value={f.shipping?.delivery_charge ?? 80}
            onChange={(e) => setShip('delivery_charge', Math.max(0, Number(e.target.value) || 0))}
            placeholder="80"
          />

          <AField
            label="Free Delivery Threshold (₹)"
            type="number"
            min="0"
            step="1"
            value={f.shipping?.free_shipping_threshold ?? 2999}
            onChange={(e) => setShip('free_shipping_threshold', Math.max(0, Number(e.target.value) || 0))}
            placeholder="2999"
          />

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Free Delivery Threshold Enabled
            </Label>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                role="switch"
                aria-checked={f.shipping?.free_delivery_threshold_enabled !== false}
                aria-label="Toggle Free Delivery Threshold"
                onClick={() => setShip('free_delivery_threshold_enabled', f.shipping?.free_delivery_threshold_enabled === false ? true : false)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-gold-dark',
                  f.shipping?.free_delivery_threshold_enabled !== false ? 'bg-gold-dark' : 'bg-ink/20'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform shadow-xs',
                    f.shipping?.free_delivery_threshold_enabled !== false ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
              <span className="text-xs font-semibold text-ink">
                {f.shipping?.free_delivery_threshold_enabled !== false ? 'Enabled (Automatic Free Shipping above threshold)' : 'Disabled (Flat delivery charge on all carts)'}
              </span>
            </div>
          </div>

          <AField
            label="Delivery Timeframe"
            value={f.shipping?.delivery_timeframe || '5–7 working days'}
            onChange={(e) => setShip('delivery_timeframe', e.target.value)}
            placeholder="5–7 working days"
          />

          <AField
            label="Return Policy"
            value={f.shipping?.return_policy || 'Easy 3-day return on unworn pieces with tags.'}
            onChange={(e) => setShip('return_policy', e.target.value)}
          />

          <AField
            label="Exchange Policy"
            value={f.shipping?.exchange_policy || 'Size exchange available within 5 days.'}
            onChange={(e) => setShip('exchange_policy', e.target.value)}
          />
        </div>

        {/* Helpful Explanation */}
        <div className="p-4 bg-paper border border-ink/10 text-xs space-y-1">
          <p className="font-semibold text-ink">Active Policy Rule:</p>
          {f.shipping?.delivery_enabled === false ? (
            <p className="text-cocoa">
              Delivery charges are currently <strong>disabled</strong> across the entire storefront. All customer orders receive <strong>FREE shipping</strong> regardless of cart value.
            </p>
          ) : f.shipping?.free_delivery_threshold_enabled === false ? (
            <p className="text-cocoa">
              A flat delivery fee of <strong>₹{Number(f.shipping?.delivery_charge ?? 80)}</strong> is charged on all orders regardless of cart total.
            </p>
          ) : (
            <p className="text-cocoa">
              Orders below <strong>₹{Number(f.shipping?.free_shipping_threshold ?? 2999).toLocaleString('en-IN')}</strong> are charged <strong>₹{Number(f.shipping?.delivery_charge ?? 80)}</strong> delivery. Orders of <strong>₹{Number(f.shipping?.free_shipping_threshold ?? 2999).toLocaleString('en-IN')}</strong> or more qualify for <strong>FREE delivery</strong>.
            </p>
          )}
        </div>

        {/* Live Admin Preview (Requirement 14) */}
        <div className="border border-ink/10 bg-sand/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-bold text-cocoa-light">
              Live Customer Calculation Preview (UI Simulation)
            </span>
            <span className="text-[10px] text-cocoa font-mono">Backend Authoritative Engine</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {(() => {
              const deliveryEnabled = f.shipping?.delivery_enabled !== false
              const charge = Math.max(0, Number(f.shipping?.delivery_charge ?? 80))
              const threshold = Math.max(0, Number(f.shipping?.free_shipping_threshold ?? 2999))
              const thresholdEnabled = f.shipping?.free_delivery_threshold_enabled !== false

              const calcPreview = (subtotal) => {
                if (!deliveryEnabled) return { fee: 0, isFree: true }
                if (thresholdEnabled && (subtotal >= threshold || subtotal === 0)) return { fee: 0, isFree: true }
                return { fee: charge, isFree: charge === 0 }
              }

              const sample1 = 2000
              const sample2 = threshold
              const sample3 = threshold + 1000

              const res1 = calcPreview(sample1)
              const res2 = calcPreview(sample2)
              const res3 = calcPreview(sample3)

              return (
                <>
                  <div className="bg-cream p-3 border border-ink/10 space-y-1">
                    <p className="text-cocoa">Order: <strong className="text-ink">₹{sample1.toLocaleString('en-IN')}</strong></p>
                    <p className="font-semibold">
                      → Delivery:{' '}
                      {res1.isFree ? (
                        <span className="text-emerald-800 font-bold">FREE</span>
                      ) : (
                        <span className="text-ink">₹{res1.fee}</span>
                      )}
                    </p>
                  </div>

                  <div className="bg-cream p-3 border border-ink/10 space-y-1">
                    <p className="text-cocoa">Order: <strong className="text-ink">₹{sample2.toLocaleString('en-IN')}</strong> (Threshold)</p>
                    <p className="font-semibold">
                      → Delivery:{' '}
                      {res2.isFree ? (
                        <span className="text-emerald-800 font-bold">FREE</span>
                      ) : (
                        <span className="text-ink">₹{res2.fee}</span>
                      )}
                    </p>
                  </div>

                  <div className="bg-cream p-3 border border-ink/10 space-y-1">
                    <p className="text-cocoa">Order: <strong className="text-ink">₹{sample3.toLocaleString('en-IN')}</strong></p>
                    <p className="font-semibold">
                      → Delivery:{' '}
                      {res3.isFree ? (
                        <span className="text-emerald-800 font-bold">FREE</span>
                      ) : (
                        <span className="text-ink">₹{res3.fee}</span>
                      )}
                    </p>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </section>

      {/* 6. Instagram Feed & Editorial Lookbook */}
      <section className="border border-ink/10 bg-cream p-6 paper-card">
        <InstagramFeedManager
          token={token}
          initialSettings={f}
          onSettingsChange={(updated) => setForm(updated)}
        />
      </section>

      {/* 7. AI Virtual Try-On */}
      <TryOnSettingsManager token={token} />

      <section className="border border-ink/10 bg-cream p-6 paper-card">
        <OrderNotificationsManager />
      </section>

      <section className="border border-ink/10 bg-cream p-6 paper-card">
        <ChangePassword />
      </section>

      <div className="pt-2">
        <Button
          onClick={save}
          className="w-full rounded-none bg-ink py-6 text-xs uppercase tracking-[0.25em] text-cream font-medium"
        >
          {saved ? 'All Settings Saved ✓' : 'Save All Settings'}
        </Button>
      </div>
    </div>
  )
}

/* --------- Master Admin Shell --------- */
export default function Admin({ navigate, defaultTab = 'dashboard' }) {
  const router = useRouter()
  const navTo = navigate || ((to) => router.push(to))
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState(defaultTab || 'dashboard')

  useEffect(() => {
    if (defaultTab) setTab(defaultTab)
  }, [defaultTab])

  useEffect(() => {
    const t = auth.get()
    if (!t) {
      setChecking(false)
      return
    }
    api('/admin/me', { token: t })
      .then(() => {
        setAuthed(true)
        setChecking(false)
      })
      .catch(() => {
        auth.clear()
        setChecking(false)
      })
  }, [])

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#141312] text-gold-light">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          <p className="mt-3 text-xs uppercase tracking-widest">Connecting to Atelier…</p>
        </div>
      </div>
    )
  }

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />
  }

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['products', 'Products', Package],
    ['categories', 'Categories', FolderTree],
    ['combos', 'Combos', Sparkles],
    ['orders', 'Orders', ShoppingBag],
    ['promotions', 'Promotions', Tag],
    ['notifications', 'Notifications', Bell],
    ['settings', 'Settings', SettingsIcon],
  ]

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-ink/10 bg-[#141312] p-6 md:flex text-cream">
        <div>
          <div className="mb-8">
            <h1 className="font-display text-2xl tracking-wide text-cream leading-none">
              THRETHA
            </h1>
            <span className="text-[9px] uppercase tracking-[0.35em] text-gold-light font-medium block mt-1">
              Atelier Console
            </span>
          </div>

          <nav className="space-y-1.5">
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-none px-3.5 py-3 text-xs uppercase tracking-wider font-medium transition',
                  tab === id
                    ? 'bg-white/10 text-gold-light border-l-2 border-gold shadow-sm'
                    : 'text-cream/70 hover:bg-white/5 hover:text-cream'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 pt-4 space-y-2">
          <button
            type="button"
            onClick={() => navTo('/')}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider text-gold-light hover:text-cream transition"
          >
            <Sparkles className="h-4 w-4" /> View Storefront
          </button>
          <button
            onClick={() => {
              auth.clear()
              setAuthed(false)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider text-rose-light/80 hover:text-rose-light transition"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between border-b border-ink/10 bg-[#141312] px-4 py-3 text-cream md:hidden">
        <span className="font-display text-lg tracking-wide text-cream">THRETHA ADMIN</span>
        <div className="flex items-center gap-2">
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            className="bg-[#1D1B19] border border-white/20 text-xs text-cream px-2 py-1"
          >
            {nav.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              auth.clear()
              setAuthed(false)
            }}
            className="text-xs text-rose-light"
          >
            Exit
          </button>
        </div>
      </div>

      <main className="min-w-0 flex-1 p-4 pt-16 sm:p-8 md:pt-8 overflow-y-auto">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'products' && <Products />}
        {tab === 'categories' && <Categories />}
        {tab === 'combos' && <CombosManager />}
        {tab === 'orders' && <Orders />}
        {tab === 'promotions' && <PromotionsManager />}
        {tab === 'notifications' && <OrderNotificationsManager />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
