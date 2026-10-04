'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Search,
  RefreshCw,
  Eye,
  Check,
  X,
  Tag,
  ShoppingBag,
  TrendingUp,
  Layers,
  Calendar,
  AlertCircle,
  HelpCircle,
  Upload,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
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
import { getColourData } from '@/lib/colours'

function extractProductColours(product) {
  if (!product) return []
  if (Array.isArray(product.colours) && product.colours.length > 0) {
    return product.colours
      .map((c) => (typeof c === 'string' ? c.trim() : String(c?.name || c?.colour || '')))
      .filter(Boolean)
  }
  if (typeof product.colour === 'string' && product.colour.trim()) {
    if (product.colour.includes(',')) {
      return product.colour.split(',').map((c) => c.trim()).filter(Boolean)
    }
    if (product.colour.includes('/')) {
      return product.colour.split('/').map((c) => c.trim()).filter(Boolean)
    }
    return [product.colour.trim()]
  }
  return ['Standard']
}

function Uploader({ token, label = 'Upload Image', onDone }) {
  const ref = useRef()
  const [busy, setBusy] = useState(false)

  const handle = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api('/admin/media', { method: 'POST', body: fd, token })
      onDone(res?.url || res?.file?.url || '')
    } catch (err) {
      alert(err.message || 'Media upload failed')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" onChange={handle} className="hidden" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="rounded-none border-ink/20 bg-cream text-xs uppercase tracking-wider text-ink hover:bg-sand/30"
      >
        <Upload className="mr-1.5 h-3.5 w-3.5 text-mango-dark" />
        {busy ? 'Uploading…' : label}
      </Button>
    </div>
  )
}

const COMBO_TYPES = [
  { value: 'CURATED_OUTFIT', label: 'Curated Outfit / Fixed Ensemble (Customer selects sizes/colours of fixed products)' },
  { value: 'PICK_AND_CHOOSE', label: 'Pick & Choose (Customer selects from category product grids)' },
  { value: 'BUY_X_FOR_Y', label: 'Buy X for ₹Y (e.g. Pick any 2 Crops for ₹1,999)' },
  { value: 'FIXED', label: 'Fixed Bundle (Exact specific pieces)' },
  { value: 'MULTI_CATEGORY', label: 'Multi-Category Ensemble (Saree + Blouse + Accessory)' },
]

const PRICING_METHODS = [
  { value: 'fixed_price', label: 'Fixed Bundle Price (e.g. ₹2,999)' },
  { value: 'percentage_discount', label: 'Percentage Off Total (% Off)' },
  { value: 'flat_discount', label: 'Flat Discount (₹ Off Total)' },
]

export default function CombosManager() {
  const token = auth.get()
  const [combos, setCombos] = useState([])
  const [categories, setCategories] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCombo, setEditingCombo] = useState(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // Stats Modal State
  const [statsModalOpen, setStatsModalOpen] = useState(false)
  const [selectedStatsCombo, setSelectedStatsCombo] = useState(null)

  // Form State
  const [formName, setFormName] = useState('')
  const [formCustomerTitle, setFormCustomerTitle] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formImage, setFormImage] = useState('')
  const [formType, setFormType] = useState('CURATED_OUTFIT')
  const [formPricingMethod, setFormPricingMethod] = useState('fixed_price')
  const [formComboPrice, setFormComboPrice] = useState('')
  const [formDiscountValue, setFormDiscountValue] = useState('')
  const [formMinValue, setFormMinValue] = useState('')
  const [formMaxDiscount, setFormMaxDiscount] = useState('')
  const [formAllowCoupons, setFormAllowCoupons] = useState(true)
  const [formStartDate, setFormStartDate] = useState('')
  const [formExpiryDate, setFormExpiryDate] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formDisplayOrder, setFormDisplayOrder] = useState('0')
  const [formSlots, setFormSlots] = useState([])
  const [globalCombosEnabled, setGlobalCombosEnabled] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [combosRes, catsRes, prodsRes, settingsRes] = await Promise.all([
        api('/admin/combos', { token }),
        api('/categories'),
        api('/products'),
        api('/settings').catch(() => null),
      ])
      setCombos(Array.isArray(combosRes) ? combosRes : [])
      setCategories(Array.isArray(catsRes) ? catsRes : [])
      setAllProducts(Array.isArray(prodsRes) ? prodsRes : [])
      if (settingsRes) {
        setGlobalCombosEnabled(settingsRes.combos_enabled !== false)
      }
    } catch (err) {
      console.error('Failed to load combos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const openCreateModal = () => {
    setEditingCombo(null)
    setFormName('')
    setFormCustomerTitle('')
    setFormSlug('')
    setFormDescription('')
    setFormImage('')
    setFormType('CURATED_OUTFIT')
    setFormPricingMethod('fixed_price')
    setFormComboPrice('2499')
    setFormDiscountValue('')
    setFormMinValue('')
    setFormMaxDiscount('')
    setFormAllowCoupons(true)
    setFormStartDate('')
    setFormExpiryDate('')
    setFormActive(true)
    setFormDisplayOrder('0')

    // Default 2 slots
    const p1 = allProducts[0]
    const p2 = allProducts[1] || allProducts[0]

    setFormSlots([
      {
        id: 'slot_1',
        name: 'Top / Saree Piece',
        required: true,
        quantity: 1,
        source_type: 'fixed_product',
        product_id: p1 ? String(p1.id) : '',
        product_name: p1 ? p1.name : '',
        product_slug: p1 ? p1.slug : '',
      },
      {
        id: 'slot_2',
        name: 'Pants / Blouse Piece',
        required: true,
        quantity: 1,
        source_type: 'fixed_product',
        product_id: p2 ? String(p2.id) : '',
        product_name: p2 ? p2.name : '',
        product_slug: p2 ? p2.slug : '',
      },
    ])

    setFormError('')
    setModalOpen(true)
  }

  const openEditModal = (combo) => {
    setEditingCombo(combo)
    setFormName(combo.name || '')
    setFormCustomerTitle(combo.customer_title || combo.name || '')
    setFormSlug(combo.slug || '')
    setFormDescription(combo.description || '')
    setFormImage(combo.image || '')
    setFormType(combo.type || 'CURATED_OUTFIT')
    setFormPricingMethod(combo.pricing_method || 'fixed_price')
    setFormComboPrice(combo.combo_price !== undefined ? String(combo.combo_price) : '')
    setFormDiscountValue(combo.discount_value !== undefined ? String(combo.discount_value) : '')
    setFormMinValue(combo.min_value ? String(combo.min_value) : '')
    setFormMaxDiscount(combo.max_discount ? String(combo.max_discount) : '')
    setFormAllowCoupons(combo.allow_coupons !== false)
    setFormStartDate(combo.start_date ? new Date(combo.start_date).toISOString().slice(0, 10) : '')
    setFormExpiryDate(combo.expiry_date ? new Date(combo.expiry_date).toISOString().slice(0, 10) : '')
    setFormActive(combo.active !== false)
    setFormDisplayOrder(String(combo.display_order || 0))
    setFormSlots(
      Array.isArray(combo.slots)
        ? combo.slots.map((s, i) => {
            const { allowed_colours, allowed_sizes, ...rest } = s
            const prodId = s.product_id ? String(s.product_id) : (Array.isArray(s.product_ids) && s.product_ids[0] ? String(s.product_ids[0]) : '')
            const matchedProduct = allProducts.find((p) => String(p.id) === prodId)
            return {
              ...rest,
              id: s.id || `slot_${i + 1}`,
              source_type: s.source_type || (combo.type === 'CURATED_OUTFIT' ? 'fixed_product' : 'category'),
              product_id: prodId,
              product_name: s.product_name || (matchedProduct ? matchedProduct.name : ''),
              product_slug: s.product_slug || (matchedProduct ? matchedProduct.slug : ''),
            }
          })
        : []
    )
    setFormError('')
    setModalOpen(true)
  }

  const addSlot = () => {
    const newIdx = formSlots.length + 1
    const p = allProducts[newIdx - 1] || allProducts[0]
    const defaultCat = categories[0]

    if (formType === 'CURATED_OUTFIT') {
      setFormSlots([
        ...formSlots,
        {
          id: `slot_${newIdx}_${Date.now().toString(36)}`,
          name: `Piece ${newIdx}`,
          required: true,
          quantity: 1,
          source_type: 'fixed_product',
          product_id: p ? String(p.id) : '',
          product_name: p ? p.name : '',
          product_slug: p ? p.slug : '',
        },
      ])
    } else {
      setFormSlots([
        ...formSlots,
        {
          id: `slot_${newIdx}_${Date.now().toString(36)}`,
          name: `Choose Piece ${newIdx}`,
          required: true,
          quantity: 1,
          source_type: 'category',
          category_id: defaultCat ? String(defaultCat.id) : '',
          category_name: defaultCat ? defaultCat.name : '',
          category_slug: defaultCat ? defaultCat.slug : '',
          product_ids: [],
        },
      ])
    }
  }

  const removeSlot = (idx) => {
    if (formSlots.length <= 1) {
      alert('A combo must have at least one selection component.')
      return
    }
    setFormSlots(formSlots.filter((_, i) => i !== idx))
  }

  const moveSlot = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= formSlots.length) return
    const next = [...formSlots]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setFormSlots(next)
  }

  const updateSlot = (idx, patch) => {
    setFormSlots(
      formSlots.map((slot, i) => {
        if (i !== idx) return slot
        const updated = { ...slot, ...patch }
        if (patch.category_id !== undefined) {
          const cat = categories.find((c) => String(c.id) === String(patch.category_id))
          updated.category_name = cat ? cat.name : ''
          updated.category_slug = cat ? cat.slug : ''
        }
        if (patch.product_id !== undefined) {
          const prod = allProducts.find((p) => String(p.id) === String(patch.product_id))
          updated.product_id = patch.product_id ? String(patch.product_id) : ''
          updated.product_name = prod ? prod.name : ''
          updated.product_slug = prod ? prod.slug : ''
        }
        return updated
      })
    )
  }

  const handleSaveCombo = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!formName.trim()) {
      setFormError('Combo name is required.')
      return
    }

    if (formSlots.length === 0) {
      setFormError('Please add at least one component or selection slot.')
      return
    }

    if (formType === 'CURATED_OUTFIT') {
      for (let i = 0; i < formSlots.length; i++) {
        const slot = formSlots[i]
        if (!slot.product_id) {
          setFormError(`Please select a product for Component #${i + 1} (${slot.name || 'Unnamed'}).`)
          return
        }
      }
    }

    setFormBusy(true)
    try {
      // Clean slots so that product colours and sizes are NEVER stored in combo records
      const cleanedSlots = formSlots.map((s) => {
        const base = {
          id: s.id,
          name: s.name,
          required: s.required !== false,
          quantity: Math.max(1, Number(s.quantity) || 1),
          source_type: s.source_type || 'category',
        }
        if (s.source_type === 'fixed_product' || formType === 'CURATED_OUTFIT') {
          return {
            ...base,
            source_type: 'fixed_product',
            product_id: String(s.product_id),
            product_name: s.product_name || '',
            product_slug: s.product_slug || '',
          }
        }
        if (s.source_type === 'category') {
          return {
            ...base,
            category_id: s.category_id,
            category_name: s.category_name,
            category_slug: s.category_slug,
          }
        }
        if (s.source_type === 'product_list') {
          return {
            ...base,
            product_ids: Array.isArray(s.product_ids) ? s.product_ids : [],
          }
        }
        return base
      })

      const payload = {
        name: formName.trim(),
        customer_title: formCustomerTitle.trim() || formName.trim(),
        slug: formSlug.trim(),
        description: formDescription.trim(),
        image: formImage.trim(),
        type: formType,
        pricing_method: formPricingMethod,
        combo_price: Number(formComboPrice) || 0,
        discount_value: Number(formDiscountValue) || 0,
        min_value: Number(formMinValue) || 0,
        max_discount: formMaxDiscount ? Number(formMaxDiscount) : null,
        allow_coupons: formAllowCoupons,
        start_date: formStartDate ? new Date(formStartDate).toISOString() : null,
        expiry_date: formExpiryDate ? new Date(formExpiryDate).toISOString() : null,
        active: formActive,
        display_order: Number(formDisplayOrder) || 0,
        slots: cleanedSlots,
      }

      console.log('[CombosManager:Save] Saving combo:', {
        id: editingCombo?.id || 'new',
        slug: formSlug.trim() || 'auto-generated',
        type: formType,
        component_count: cleanedSlots.length,
        components: cleanedSlots.map((s, i) => ({
          component_number: i + 1,
          label: s.name,
          product_id: s.product_id,
          product_name: s.product_name,
          required: s.required,
          source_type: s.source_type,
          quantity: s.quantity,
        })),
        payload,
      })

      let res
      if (editingCombo) {
        res = await api(`/admin/combos/${editingCombo.id}`, {
          method: 'PUT',
          token,
          body: payload,
        })
      } else {
        res = await api('/admin/combos', {
          method: 'POST',
          token,
          body: payload,
        })
      }

      console.log('[CombosManager:Save] Response:', res)

      setModalOpen(false)
      loadData()
    } catch (err) {
      console.error('[CombosManager:Save] Error:', err)
      setFormError(err.message || 'Failed to save combo')
    } finally {
      setFormBusy(false)
    }
  }

  const handleToggle = async (combo) => {
    try {
      await api(`/admin/combos/${combo.id}/toggle`, {
        method: 'POST',
        token,
      })
      setCombos((prev) =>
        prev.map((c) => (c.id === combo.id ? { ...c, active: !c.active } : c))
      )
    } catch (err) {
      alert(err.message || 'Failed to toggle combo status')
    }
  }

  const handleDuplicate = async (combo) => {
    if (!confirm(`Duplicate "${combo.name}"?`)) return
    try {
      await api(`/admin/combos/${combo.id}/duplicate`, {
        method: 'POST',
        token,
      })
      loadData()
    } catch (err) {
      alert(err.message || 'Failed to duplicate combo')
    }
  }

  const handleDelete = async (combo) => {
    if (!confirm(`Are you sure you want to delete "${combo.name}"? This action cannot be undone.`)) {
      return
    }
    try {
      await api(`/admin/combos/${combo.id}`, {
        method: 'DELETE',
        token,
      })
      setCombos((prev) => prev.filter((c) => c.id !== combo.id))
    } catch (err) {
      alert(err.message || 'Failed to delete combo')
    }
  }

  // Filter combos
  const filteredCombos = combos.filter((c) => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      c.name?.toLowerCase().includes(q) ||
      c.customer_title?.toLowerCase().includes(q) ||
      c.slug?.toLowerCase().includes(q)

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && c.active !== false) ||
      (statusFilter === 'INACTIVE' && c.active === false)

    const matchesType = typeFilter === 'ALL' || c.type === typeFilter

    return matchesSearch && matchesStatus && matchesType
  })

  // Global metrics
  const totalCombos = combos.length
  const activeCombos = combos.filter((c) => c.active !== false).length
  const totalUnitsSold = combos.reduce((sum, c) => sum + (c.stats?.units_sold || 0), 0)
  const totalRevenue = combos.reduce((sum, c) => sum + (c.stats?.revenue_generated || 0), 0)
  const totalSavings = combos.reduce((sum, c) => sum + (c.stats?.total_savings || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-mango-dark" />
            <h2 className="font-display text-2xl text-ink">Curated Combos & Ensembles</h2>
          </div>
          <p className="mt-1 text-xs text-cocoa">
            Create and manage multi-item bundles, silhouette pairings, and tiered promotional sets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="rounded-none border-ink/20 bg-cream text-xs uppercase tracking-wider text-ink hover:bg-sand/30"
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={openCreateModal}
            className="rounded-none bg-mango-dark px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cream hover:bg-mango shadow-sm transition"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create Combo
          </Button>
        </div>
      </div>

      {/* Global Setting Disabled Notice */}
      {!globalCombosEnabled && (
        <div className="border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 flex items-start gap-3 shadow-2xs">
          <span className="text-base">⚠️</span>
          <div>
            <p className="font-semibold">Notice: Global Combos toggle is currently OFF in Settings.</p>
            <p className="text-amber-900 mt-0.5">
              Storefront navigation hides Combos, catalogue browsing is disabled, and new checkouts for combos are blocked. Admin creation, editing, status toggles, and duplicate actions remain fully functional.
            </p>
          </div>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="border border-ink/10 bg-cream p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Total Combos</p>
          <p className="mt-1 font-display text-2xl text-ink">{totalCombos}</p>
        </div>
        <div className="border border-ink/10 bg-cream p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Active Sets</p>
          <p className="mt-1 font-display text-2xl text-emerald-700">{activeCombos}</p>
        </div>
        <div className="border border-ink/10 bg-cream p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Units Sold</p>
          <p className="mt-1 font-display text-2xl text-ink">{totalUnitsSold}</p>
        </div>
        <div className="border border-ink/10 bg-cream p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Total Revenue</p>
          <p className="mt-1 font-display text-2xl text-mango-dark">{inr(totalRevenue)}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 border border-ink/10 bg-cream p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa-light">Customer Savings</p>
          <p className="mt-1 font-display text-2xl text-rose-700">{inr(totalSavings)}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 rounded-none border border-ink/10 bg-cream p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cocoa-light" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by combo name, customer title, or slug…"
            className="rounded-none border-ink/15 bg-paper pl-9 text-xs focus-visible:border-mango"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 rounded-none border-ink/15 bg-paper text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active Only</SelectItem>
              <SelectItem value="INACTIVE">Inactive Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44 rounded-none border-ink/15 bg-paper text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {COMBO_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label.split('(')[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Combo List */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
          <p className="mt-3 text-xs uppercase tracking-widest text-cocoa">Loading Curated Combos…</p>
        </div>
      ) : filteredCombos.length === 0 ? (
        <div className="border border-dashed border-ink/20 bg-cream p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-mango-dark opacity-60" />
          <p className="mt-2 font-display text-lg text-ink">No combos found</p>
          <p className="mt-1 text-xs text-cocoa">
            {search ? 'Try adjusting your search or filters' : 'Create your first curated combo to get started.'}
          </p>
          {!search && (
            <Button
              type="button"
              onClick={openCreateModal}
              className="mt-4 rounded-none bg-mango-dark px-4 py-2 text-xs uppercase tracking-wider text-cream"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Create Combo Now
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-ink/10 bg-cream overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink/10 bg-sand/30 text-[10px] font-bold uppercase tracking-wider text-cocoa">
                <tr>
                  <th className="py-3.5 pl-4 pr-3">Combo Details</th>
                  <th className="py-3.5 px-3">Type & Structure</th>
                  <th className="py-3.5 px-3">Pricing & Method</th>
                  <th className="py-3.5 px-3">Performance</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-cream font-sans">
                {filteredCombos.map((combo) => {
                  const slots = Array.isArray(combo.slots) ? combo.slots : []
                  const units = combo.stats?.units_sold || 0
                  const rev = combo.stats?.revenue_generated || 0

                  return (
                    <tr key={combo.id} className="hover:bg-sand/15 transition">
                      {/* Details */}
                      <td className="py-4 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-10 shrink-0 overflow-hidden border border-ink/10 bg-sand/30">
                            {combo.image ? (
                              <img
                                src={combo.image}
                                alt={combo.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.onerror = null
                                  e.currentTarget.src = '/api/media/file/seed-01.jpg'
                                }}
                              />
                            ) : (
                              <div className="grid h-full place-items-center text-[9px] text-cocoa-light">
                                Set
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-ink text-sm leading-tight">{combo.name}</p>
                            <p className="text-[11px] text-cocoa mt-0.5">{combo.customer_title}</p>
                            <span className="text-[10px] text-cocoa-light font-mono block">/{combo.slug}</span>
                          </div>
                        </div>
                      </td>

                      {/* Type & Slots */}
                      <td className="py-4 px-3">
                        <span className="inline-block rounded-none bg-sand/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink border border-ink/10">
                          {combo.type?.replace(/_/g, ' ') || 'PICK & CHOOSE'}
                        </span>
                        <div className="mt-1.5 space-y-0.5">
                          {slots.map((s, i) => (
                            <p key={s.id || i} className="text-[11px] text-cocoa flex items-center gap-1">
                              <span className="text-mango-dark font-bold">•</span>
                              <span>{s.name || `Slot ${i + 1}`}</span>
                              <span className="text-[10px] text-cocoa-light">({s.category_name || s.source_type})</span>
                            </p>
                          ))}
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="py-4 px-3">
                        {combo.pricing_method === 'fixed_price' ? (
                          <div>
                            <p className="font-bold text-ink text-sm">{inr(combo.combo_price)}</p>
                            <p className="text-[10px] text-cocoa-light uppercase tracking-wider">Fixed Bundle Price</p>
                          </div>
                        ) : combo.pricing_method === 'percentage_discount' ? (
                          <div>
                            <p className="font-bold text-rose-700 text-sm">{combo.discount_value}% OFF</p>
                            <p className="text-[10px] text-cocoa-light uppercase tracking-wider">
                              {combo.max_discount ? `Max ₹${combo.max_discount}` : 'No Cap'}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="font-bold text-rose-700 text-sm">₹{combo.discount_value} OFF</p>
                            <p className="text-[10px] text-cocoa-light uppercase tracking-wider">Flat Savings</p>
                          </div>
                        )}
                        <p className="text-[10px] text-cocoa mt-1">
                          Coupons: <strong className={combo.allow_coupons !== false ? 'text-emerald-700' : 'text-cocoa-light'}>
                            {combo.allow_coupons !== false ? 'Allowed' : 'Disabled'}
                          </strong>
                        </p>
                      </td>

                      {/* Performance */}
                      <td className="py-4 px-3">
                        <p className="font-semibold text-ink">{units} units sold</p>
                        <p className="text-[11px] text-mango-dark font-medium">{inr(rev)} revenue</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatsCombo(combo)
                            setStatsModalOpen(true)
                          }}
                          className="mt-1 text-[10px] text-cocoa hover:text-ink underline flex items-center gap-1"
                        >
                          <TrendingUp className="h-3 w-3" /> View Stats
                        </button>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggle(combo)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition border',
                            combo.active !== false
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-sand/40 text-cocoa-light border-ink/10 hover:bg-sand/60'
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              combo.active !== false ? 'bg-emerald-600' : 'bg-cocoa-light'
                            )}
                          />
                          {combo.active !== false ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 pl-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Edit Combo"
                            onClick={() => openEditModal(combo)}
                            className="h-8 w-8 p-0 text-cocoa hover:text-ink"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Duplicate Combo"
                            onClick={() => handleDuplicate(combo)}
                            className="h-8 w-8 p-0 text-cocoa hover:text-ink"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            title="Delete Combo"
                            onClick={() => handleDelete(combo)}
                            className="h-8 w-8 p-0 text-terracotta hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE / EDIT COMBO MODAL */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-none border-ink/20 bg-paper p-6 text-ink">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink">
              {editingCombo ? 'Edit Curated Combo' : 'Create New Curated Combo'}
            </DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="border border-coral/30 bg-coral-light/20 p-3 text-xs text-coral flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSaveCombo} className="space-y-6 mt-2">
            {/* Section 1: General Info */}
            <div className="border border-ink/10 bg-cream p-4 space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-mango-dark">
                1. General Information
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Admin Combo Name *
                  </Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Saree & Crop Blouse Curated Ensemble"
                    required
                    className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                  />
                </div>

                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Customer-Facing Title *
                  </Label>
                  <Input
                    value={formCustomerTitle}
                    onChange={(e) => setFormCustomerTitle(e.target.value)}
                    placeholder="e.g. Pick 1 Saree + Pick 1 Crop Top for ₹3,499"
                    required
                    className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                  Description
                </Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe the pairing inspiration, styling advice, and bundle benefits…"
                  rows={2}
                  className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Combo Banner Image URL
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={formImage}
                      onChange={(e) => setFormImage(e.target.value)}
                      placeholder="/api/media/file/... or https://..."
                      className="rounded-none border-ink/15 bg-paper text-xs"
                    />
                    <Uploader token={token} label="Upload" onDone={(url) => setFormImage(url)} />
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Display Order
                  </Label>
                  <Input
                    type="number"
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(e.target.value)}
                    placeholder="0"
                    className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Type & Pricing */}
            <div className="border border-ink/10 bg-cream p-4 space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-mango-dark">
                2. Type & Pricing Rules
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Combo Type
                  </Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger className="mt-1 rounded-none border-ink/15 bg-paper text-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMBO_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Pricing Method
                  </Label>
                  <Select value={formPricingMethod} onValueChange={setFormPricingMethod}>
                    <SelectTrigger className="mt-1 rounded-none border-ink/15 bg-paper text-xs">
                      <SelectValue placeholder="Pricing method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_METHODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {formPricingMethod === 'fixed_price' ? (
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                      Combo Final Price (₹) *
                    </Label>
                    <Input
                      type="number"
                      value={formComboPrice}
                      onChange={(e) => setFormComboPrice(e.target.value)}
                      placeholder="2999"
                      required
                      className="mt-1 rounded-none border-ink/15 bg-paper text-xs font-bold text-ink"
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                      {formPricingMethod === 'percentage_discount' ? 'Discount Value (%) *' : 'Flat Discount (₹) *'}
                    </Label>
                    <Input
                      type="number"
                      value={formDiscountValue}
                      onChange={(e) => setFormDiscountValue(e.target.value)}
                      placeholder={formPricingMethod === 'percentage_discount' ? '20' : '500'}
                      required
                      className="mt-1 rounded-none border-ink/15 bg-paper text-xs font-bold text-ink"
                    />
                  </div>
                )}

                {formPricingMethod === 'percentage_discount' && (
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                      Max Discount Cap (₹)
                    </Label>
                    <Input
                      type="number"
                      value={formMaxDiscount}
                      onChange={(e) => setFormMaxDiscount(e.target.value)}
                      placeholder="e.g. 1000"
                      className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Min Cart Value (₹)
                  </Label>
                  <Input
                    type="number"
                    value={formMinValue}
                    onChange={(e) => setFormMinValue(e.target.value)}
                    placeholder="0"
                    className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Start Date (Optional)
                  </Label>
                  <Input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                  />
                </div>

                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                    Expiry Date (Optional)
                  </Label>
                  <Input
                    type="date"
                    value={formExpiryDate}
                    onChange={(e) => setFormExpiryDate(e.target.value)}
                    className="mt-1 rounded-none border-ink/15 bg-paper text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2 border-t border-ink/10">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink">
                  <Checkbox
                    checked={formAllowCoupons}
                    onCheckedChange={(checked) => setFormAllowCoupons(Boolean(checked))}
                    className="rounded-none border-ink/30"
                  />
                  <span>Allow Promotional Coupons on this combo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink">
                  <Checkbox
                    checked={formActive}
                    onCheckedChange={(checked) => setFormActive(Boolean(checked))}
                    className="rounded-none border-ink/30"
                  />
                  <span>Active &amp; Visible on Storefront</span>
                </label>
              </div>
            </div>

            {/* Section 3: Selection Slots / Outfit Components Builder */}
            <div className="border border-ink/10 bg-cream p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-mango-dark">
                    {formType === 'CURATED_OUTFIT' ? '3. Curated Outfit Components' : '3. Selection Slots & Rules'}
                  </p>
                  <p className="text-[10px] text-cocoa mt-0.5">
                    {formType === 'CURATED_OUTFIT'
                      ? 'Select the exact handcrafted products making up this look. Customers will choose colour & size variants.'
                      : 'Define what pieces the customer picks from category product grids (e.g. Slot 1 = Top, Slot 2 = Pant)'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addSlot}
                  className="rounded-none bg-ink text-[11px] uppercase tracking-wider text-cream hover:bg-cocoa-dark"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {formType === 'CURATED_OUTFIT' ? 'Add Outfit Component' : 'Add Selection Slot'}
                </Button>
              </div>

              <div className="space-y-4">
                {formSlots.map((slot, idx) => {
                  const selectedProduct = allProducts.find((p) => String(p.id) === String(slot.product_id))

                  return (
                    <div
                      key={slot.id || idx}
                      className="border border-ink/15 bg-paper p-4 space-y-3 relative group shadow-2xs"
                    >
                      <div className="flex items-center justify-between border-b border-ink/8 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-mango-dark">
                            {formType === 'CURATED_OUTFIT' ? `Component #${idx + 1}` : `Slot #${idx + 1}`}
                          </span>
                          {slot.product_name && formType === 'CURATED_OUTFIT' && (
                            <span className="text-xs font-semibold text-ink">· {slot.product_name}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Reorder Buttons */}
                          {idx > 0 && (
                            <button
                              type="button"
                              title="Move Up"
                              onClick={() => moveSlot(idx, idx - 1)}
                              className="p-1 text-cocoa hover:text-ink hover:bg-sand/40 transition"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {idx < formSlots.length - 1 && (
                            <button
                              type="button"
                              title="Move Down"
                              onClick={() => moveSlot(idx, idx + 1)}
                              className="p-1 text-cocoa hover:text-ink hover:bg-sand/40 transition"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {formSlots.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSlot(idx)}
                              className="text-cocoa hover:text-coral transition text-xs flex items-center gap-1 ml-2"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          )}
                        </div>
                      </div>

                      {/* CURATED OUTFIT: FIXED PRODUCT BUILDER */}
                      {formType === 'CURATED_OUTFIT' ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">
                                Component Label * (e.g. Crop Top, Trousers, Saree)
                              </Label>
                              <Input
                                value={slot.name}
                                onChange={(e) => updateSlot(idx, { name: e.target.value })}
                                placeholder="e.g. Handcrafted Crop Top"
                                required
                                className="mt-1 rounded-none border-ink/15 bg-cream text-xs font-medium"
                              />
                            </div>

                            <div>
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">
                                Select Exact Product *
                              </Label>
                              <Select
                                value={slot.product_id || ''}
                                onValueChange={(val) => updateSlot(idx, { product_id: val, source_type: 'fixed_product' })}
                              >
                                <SelectTrigger className="mt-1 rounded-none border-ink/15 bg-cream text-xs">
                                  <SelectValue placeholder="Select component product" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {allProducts.map((prod) => (
                                    <SelectItem key={prod.id} value={String(prod.id)}>
                                      {prod.name} ({prod.category_name || 'Piece'} · {inr(prod.discount_price || prod.price)})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Selected Product Live Preview & Variant Inspection */}
                          {selectedProduct ? (
                            <div className="border border-ink/10 bg-cream p-4 space-y-3 shadow-xs">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={
                                      selectedProduct.media?.find((m) => m.is_primary)?.url ||
                                      selectedProduct.image ||
                                      '/api/media/file/seed-01.jpg'
                                    }
                                    alt=""
                                    className="h-16 w-12 object-cover border border-ink/10 bg-sand/30 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <h4 className="font-display text-sm text-ink font-medium leading-snug">
                                      {selectedProduct.name}
                                    </h4>
                                    <p className="text-[11px] text-cocoa mt-0.5">
                                      SKU: <span className="font-mono">{selectedProduct.sku || 'TC-PIECE'}</span> · Base:{' '}
                                      <strong>{inr(selectedProduct.discount_price || selectedProduct.price)}</strong>
                                    </p>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider block',
                                      selectedProduct.active !== false
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-coral-light/30 text-coral border border-coral/40'
                                    )}
                                  >
                                    {selectedProduct.active !== false ? 'Active' : 'Inactive'}
                                  </span>
                                  <span className="text-[10px] text-cocoa mt-1 block">
                                    Total Stock: <strong>{selectedProduct.stock ?? 0} units</strong>
                                  </span>
                                </div>
                              </div>

                              {selectedProduct.active === false && (
                                <p className="text-[11px] text-coral font-medium flex items-center gap-1.5 bg-coral-light/10 p-2 border border-coral/20">
                                  ⚠️ Warning: This product is currently inactive and cannot be purchased by customers.
                                </p>
                              )}

                              {Number(selectedProduct.stock ?? 0) <= 0 && (
                                <p className="text-[11px] text-coral font-medium flex items-center gap-1.5 bg-coral-light/10 p-2 border border-coral/20">
                                  ⚠️ Warning: This product has zero inventory stock in the atelier.
                                </p>
                              )}

                              {/* Available Colours directly from Product */}
                              <div className="pt-2 border-t border-ink/8 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold uppercase tracking-wider text-cocoa-light text-[10px]">
                                    Available Colours (from Product):
                                  </span>
                                  <span className="text-[10px] text-cocoa font-medium">
                                    {(() => {
                                      const cols = extractProductColours(selectedProduct)
                                      return cols.length > 0 ? `${cols.length} colour(s)` : 'Default'
                                    })()}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  {(() => {
                                    const cols = extractProductColours(selectedProduct)
                                    if (cols.length === 0) {
                                      return <span className="text-[11px] text-cocoa italic">None specified (Defaults to Standard)</span>
                                    }
                                    return cols.map((colName, cIdx) => (
                                      <span
                                        key={cIdx}
                                        className="inline-flex items-center gap-1.5 bg-paper border border-ink/15 px-2 py-0.5 text-xs text-ink shadow-2xs font-medium"
                                      >
                                        <span
                                          className="h-2.5 w-2.5 rounded-full border border-ink/20 shrink-0"
                                          style={{ background: getColourData(colName).hex }}
                                        />
                                        {colName}
                                      </span>
                                    ))
                                  })()}
                                </div>
                              </div>

                              {/* Available Sizes & Stock Breakdown directly from Product */}
                              <div className="pt-2 border-t border-ink/8 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold uppercase tracking-wider text-cocoa-light text-[10px]">
                                    Available Sizes &amp; Variant Stock (from Product):
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(() => {
                                    const sizes = Array.isArray(selectedProduct.sizes) && selectedProduct.sizes.length > 0
                                      ? selectedProduct.sizes
                                      : [{ size: 'Free Size', available: Number(selectedProduct.stock ?? 0) > 0, stock: selectedProduct.stock || 0 }]

                                    return sizes.map((sObj, sIdx) => {
                                      const sName = typeof sObj === 'string' ? sObj : sObj.size || 'Free Size'
                                      const isAvail = typeof sObj === 'object'
                                        ? sObj.available !== false && (sObj.stock === undefined || Number(sObj.stock) > 0)
                                        : Number(selectedProduct.stock ?? 0) > 0
                                      const stockCount = typeof sObj === 'object' && sObj.stock !== undefined ? sObj.stock : selectedProduct.stock ?? 0

                                      return (
                                        <span
                                          key={sIdx}
                                          className={cn(
                                            'inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] border shadow-2xs',
                                            isAvail
                                              ? 'bg-paper text-ink border-ink/15'
                                              : 'bg-sand/30 text-cocoa line-through border-ink/10 opacity-60'
                                          )}
                                        >
                                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', isAvail ? 'bg-emerald-600' : 'bg-coral')} />
                                          <strong>{sName}</strong>
                                          <span className="text-[10px] opacity-75 font-mono">({stockCount} in stock)</span>
                                        </span>
                                      )
                                    })
                                  })()}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-50/60 border border-amber-200 text-xs text-amber-800">
                              Please select a product for this component slot above.
                            </div>
                          )}
                        </div>
                      ) : (
                        /* PICK & CHOOSE / CATEGORY BUILDER */
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-1">
                            <Label className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">
                              Slot Name *
                            </Label>
                            <Input
                              value={slot.name}
                              onChange={(e) => updateSlot(idx, { name: e.target.value })}
                              placeholder="e.g. Choose your Top"
                              required
                              className="mt-1 rounded-none border-ink/15 bg-cream text-xs font-medium"
                            />
                          </div>

                          <div>
                            <Label className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">
                              Source Type
                            </Label>
                            <Select
                              value={slot.source_type || 'category'}
                              onValueChange={(val) => updateSlot(idx, { source_type: val })}
                            >
                              <SelectTrigger className="mt-1 rounded-none border-ink/15 bg-cream text-xs">
                                <SelectValue placeholder="Source" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="category">Category Collection</SelectItem>
                                <SelectItem value="product_list">Specific Products</SelectItem>
                                <SelectItem value="any">Any Store Product</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {slot.source_type === 'category' ? (
                            <div>
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">
                                Category Selection
                              </Label>
                              <Select
                                value={slot.category_id || ''}
                                onValueChange={(val) => updateSlot(idx, { category_id: val })}
                              >
                                <SelectTrigger className="mt-1 rounded-none border-ink/15 bg-cream text-xs">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={String(cat.id)}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div>
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-cocoa">
                                Quantity Per Set
                              </Label>
                              <Input
                                type="number"
                                min="1"
                                value={slot.quantity || 1}
                                onChange={(e) =>
                                  updateSlot(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                                }
                                className="mt-1 rounded-none border-ink/15 bg-cream text-xs"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink/10">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={formBusy}
                className="rounded-none border-ink/20 text-xs uppercase tracking-wider text-cocoa hover:bg-sand/30"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={formBusy}
                className="rounded-none bg-mango-dark px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream hover:bg-mango shadow-sm"
              >
                {formBusy ? 'Saving…' : editingCombo ? 'Save Changes' : 'Create Curated Combo'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* COMBO PERFORMANCE STATS MODAL */}
      <Dialog open={statsModalOpen} onOpenChange={setStatsModalOpen}>
        <DialogContent className="max-w-xl rounded-none border-ink/20 bg-paper p-6 text-ink">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink">
              Combo Performance &amp; Analytics
            </DialogTitle>
          </DialogHeader>

          {selectedStatsCombo && (
            <div className="space-y-4 mt-2">
              <div className="border border-ink/10 bg-cream p-4">
                <p className="font-display text-xl text-ink">{selectedStatsCombo.name}</p>
                <p className="text-xs text-cocoa mt-0.5">{selectedStatsCombo.customer_title}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-ink/10 bg-cream p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-cocoa-light">Orders</p>
                  <p className="mt-1 font-display text-lg text-ink">
                    {selectedStatsCombo.stats?.times_purchased || 0}
                  </p>
                </div>
                <div className="border border-ink/10 bg-cream p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-cocoa-light">Units Sold</p>
                  <p className="mt-1 font-display text-lg text-emerald-700">
                    {selectedStatsCombo.stats?.units_sold || 0}
                  </p>
                </div>
                <div className="border border-ink/10 bg-cream p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-cocoa-light">Revenue</p>
                  <p className="mt-1 font-display text-lg text-mango-dark">
                    {inr(selectedStatsCombo.stats?.revenue_generated || 0)}
                  </p>
                </div>
                <div className="border border-ink/10 bg-cream p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-cocoa-light">Total Savings</p>
                  <p className="mt-1 font-display text-lg text-rose-700">
                    {inr(selectedStatsCombo.stats?.total_savings || 0)}
                  </p>
                </div>
              </div>

              <div className="border border-ink/10 bg-cream p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cocoa">
                  Slot Inclusions &amp; Setup
                </p>
                <div className="space-y-1.5">
                  {selectedStatsCombo.slots?.map((s, idx) => (
                    <div key={s.id || idx} className="text-xs flex items-center justify-between py-1 border-b border-ink/5">
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="text-cocoa text-[11px]">
                        {s.category_name ? `Category: ${s.category_name}` : s.source_type} (Qty: {s.quantity || 1})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-right">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStatsModalOpen(false)}
                  className="rounded-none border-ink/20 text-xs uppercase tracking-wider text-ink"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

