'use client'

import { useEffect, useState } from 'react'
import {
  Tag,
  Truck,
  Plus,
  Trash2,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Sparkles,
  Search,
  Filter,
  Layers,
  ShoppingBag,
  Percent,
  IndianRupee,
  Calendar,
  UserCheck,
  RefreshCw,
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
  DialogFooter,
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

function Field({ label, required = false, children, error = null }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink/80 flex items-center gap-1">
        {label} {required && <span className="text-coral">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-coral font-medium">{error}</p>}
    </div>
  )
}

export default function PromotionsManager() {
  const [activeTab, setActiveTab] = useState('coupons') // 'coupons' | 'free_delivery' | 'overview'
  const [coupons, setCoupons] = useState([])
  const [freeRules, setFreeRules] = useState([])
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal States
  const [couponModalOpen, setCouponModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [couponForm, setCouponForm] = useState({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 1499,
    maxDiscount: '',
    usageLimit: '',
    perCustomerLimit: '',
    startAt: '',
    expiresAt: '',
    firstOrderOnly: false,
    appliesTo: 'all',
    categoryIds: [],
    productIds: [],
    isActive: true,
  })
  const [couponFormErrors, setCouponFormErrors] = useState({})
  const [couponSaving, setCouponSaving] = useState(false)

  // Free Delivery Rule Modal States
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [ruleForm, setRuleForm] = useState({
    name: '',
    minOrderValue: 2999,
    maxOrderValue: '',
    appliesTo: 'all',
    categoryIds: [],
    productIds: [],
    couponCode: '',
    startAt: '',
    expiresAt: '',
    isActive: true,
  })
  const [ruleFormErrors, setRuleFormErrors] = useState({})
  const [ruleSaving, setRuleSaving] = useState(false)

  // Usages View Modal
  const [usagesModalOpen, setUsagesModalOpen] = useState(false)
  const [selectedCouponForUsages, setSelectedCouponForUsages] = useState(null)
  const [couponUsages, setCouponUsages] = useState([])
  const [usagesLoading, setUsagesLoading] = useState(false)

  // Delete Confirmation Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null) // { type: 'coupon' | 'rule', id, name }
  const [deleteBusy, setDeleteBusy] = useState(false)

  const token = auth.get()

  const loadData = async () => {
    setLoading(true)
    try {
      const [cRes, fRes, catRes, prodRes] = await Promise.all([
        api('/admin/promotions/coupons', { token }).catch(() => []),
        api('/admin/promotions/free-delivery-rules', { token }).catch(() => []),
        api('/categories').catch(() => []),
        api('/products').catch(() => []),
      ])
      setCoupons(Array.isArray(cRes) ? cRes : [])
      setFreeRules(Array.isArray(fRes) ? fRes : [])
      setCategories(Array.isArray(catRes) ? catRes : [])
      setProducts(Array.isArray(prodRes) ? prodRes : [])
    } catch (err) {
      console.error('[PromotionsManager] Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // --- COUPON FORM ACTIONS ---
  const openCreateCoupon = () => {
    setEditingCoupon(null)
    setCouponForm({
      code: '',
      description: '',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 1000,
      maxDiscount: '',
      usageLimit: '',
      perCustomerLimit: '',
      startAt: '',
      expiresAt: '',
      firstOrderOnly: false,
      appliesTo: 'all',
      categoryIds: [],
      productIds: [],
      isActive: true,
    })
    setCouponFormErrors({})
    setCouponModalOpen(true)
  }

  const openEditCoupon = (coupon) => {
    setEditingCoupon(coupon)
    setCouponForm({
      code: coupon.code || '',
      description: coupon.description || '',
      discountType: coupon.discountType || 'percentage',
      discountValue: coupon.discountValue ?? 10,
      minOrderValue: coupon.minOrderValue ?? 0,
      maxDiscount: coupon.maxDiscount ?? '',
      usageLimit: coupon.usageLimit ?? '',
      perCustomerLimit: coupon.perCustomerLimit ?? '',
      startAt: coupon.startAt ? new Date(coupon.startAt).toISOString().slice(0, 10) : '',
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : '',
      firstOrderOnly: Boolean(coupon.firstOrderOnly),
      appliesTo: coupon.appliesTo || 'all',
      categoryIds: coupon.categoryIds || [],
      productIds: coupon.productIds || [],
      isActive: coupon.isActive !== false,
    })
    setCouponFormErrors({})
    setCouponModalOpen(true)
  }

  const validateCouponForm = () => {
    const errors = {}
    const code = (couponForm.code || '').trim().toUpperCase()
    if (!code) {
      errors.code = 'Coupon code is required'
    } else if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
      errors.code = 'Must be 2–30 letters/numbers (hyphens & underscores allowed)'
    }

    const val = Number(couponForm.discountValue)
    if (isNaN(val) || val <= 0) {
      errors.discountValue = 'Discount value must be greater than 0'
    } else if (couponForm.discountType === 'percentage' && val > 100) {
      errors.discountValue = 'Percentage discount cannot exceed 100%'
    }

    if (couponForm.minOrderValue !== '' && Number(couponForm.minOrderValue) < 0) {
      errors.minOrderValue = 'Minimum order value cannot be negative'
    }

    if (couponForm.maxDiscount !== '' && Number(couponForm.maxDiscount) < 0) {
      errors.maxDiscount = 'Max discount cannot be negative'
    }

    if (couponForm.startAt && couponForm.expiresAt) {
      if (new Date(couponForm.expiresAt) <= new Date(couponForm.startAt)) {
        errors.expiresAt = 'Expiry date must be after start date'
      }
    }

    if (couponForm.appliesTo === 'categories' && (!couponForm.categoryIds || couponForm.categoryIds.length === 0)) {
      errors.categoryIds = 'Select at least one category'
    }

    if (couponForm.appliesTo === 'products' && (!couponForm.productIds || couponForm.productIds.length === 0)) {
      errors.productIds = 'Select at least one product'
    }

    setCouponFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSaveCoupon = async (e) => {
    e.preventDefault()
    if (!validateCouponForm()) return

    setCouponSaving(true)
    try {
      const payload = {
        code: couponForm.code.trim().toUpperCase(),
        description: couponForm.description.trim(),
        discountType: couponForm.discountType,
        discountValue: Number(couponForm.discountValue),
        minOrderValue: couponForm.minOrderValue === '' ? 0 : Number(couponForm.minOrderValue),
        maxDiscount: couponForm.maxDiscount === '' ? null : Number(couponForm.maxDiscount),
        usageLimit: couponForm.usageLimit === '' ? null : Number(couponForm.usageLimit),
        perCustomerLimit: couponForm.perCustomerLimit === '' ? null : Number(couponForm.perCustomerLimit),
        startAt: couponForm.startAt ? new Date(couponForm.startAt).toISOString() : null,
        expiresAt: couponForm.expiresAt ? new Date(couponForm.expiresAt).toISOString() : null,
        firstOrderOnly: Boolean(couponForm.firstOrderOnly),
        appliesTo: couponForm.appliesTo,
        categoryIds: couponForm.categoryIds,
        productIds: couponForm.productIds,
        isActive: Boolean(couponForm.isActive),
      }

      if (editingCoupon) {
        await api(`/admin/promotions/coupons/${editingCoupon.id}`, {
          method: 'PATCH',
          token,
          body: payload,
        })
      } else {
        await api('/admin/promotions/coupons', {
          method: 'POST',
          token,
          body: payload,
        })
      }

      setCouponModalOpen(false)
      await loadData()
    } catch (err) {
      setCouponFormErrors({ submit: err.message || 'Failed to save coupon' })
    } finally {
      setCouponSaving(false)
    }
  }

  const toggleCouponStatus = async (coupon) => {
    try {
      await api(`/admin/promotions/coupons/${coupon.id}`, {
        method: 'PATCH',
        token,
        body: { isActive: !coupon.isActive },
      })
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c))
      )
    } catch (err) {
      alert(err.message || 'Failed to toggle coupon status')
    }
  }

  // --- FREE DELIVERY RULE ACTIONS ---
  const openCreateRule = () => {
    setEditingRule(null)
    setRuleForm({
      name: '',
      minOrderValue: 2999,
      maxOrderValue: '',
      appliesTo: 'all',
      categoryIds: [],
      productIds: [],
      couponCode: '',
      startAt: '',
      expiresAt: '',
      isActive: true,
    })
    setRuleFormErrors({})
    setRuleModalOpen(true)
  }

  const openEditRule = (rule) => {
    setEditingRule(rule)
    setRuleForm({
      name: rule.name || '',
      minOrderValue: rule.minOrderValue ?? 0,
      maxOrderValue: rule.maxOrderValue ?? '',
      appliesTo: rule.appliesTo || 'all',
      categoryIds: rule.categoryIds || [],
      productIds: rule.productIds || [],
      couponCode: rule.couponCode || '',
      startAt: rule.startAt ? new Date(rule.startAt).toISOString().slice(0, 10) : '',
      expiresAt: rule.expiresAt ? new Date(rule.expiresAt).toISOString().slice(0, 10) : '',
      isActive: rule.isActive !== false,
    })
    setRuleFormErrors({})
    setRuleModalOpen(true)
  }

  const handleSaveRule = async (e) => {
    e.preventDefault()
    if (!ruleForm.name.trim()) {
      setRuleFormErrors({ name: 'Rule name is required' })
      return
    }

    setRuleSaving(true)
    try {
      const payload = {
        name: ruleForm.name.trim(),
        minOrderValue: ruleForm.minOrderValue === '' ? 0 : Number(ruleForm.minOrderValue),
        maxOrderValue: ruleForm.maxOrderValue === '' ? null : Number(ruleForm.maxOrderValue),
        appliesTo: ruleForm.appliesTo,
        categoryIds: ruleForm.categoryIds,
        productIds: ruleForm.productIds,
        couponCode: ruleForm.couponCode.trim() ? ruleForm.couponCode.trim().toUpperCase() : null,
        startAt: ruleForm.startAt ? new Date(ruleForm.startAt).toISOString() : null,
        expiresAt: ruleForm.expiresAt ? new Date(ruleForm.expiresAt).toISOString() : null,
        isActive: Boolean(ruleForm.isActive),
      }

      if (editingRule) {
        await api(`/admin/promotions/free-delivery-rules/${editingRule.id}`, {
          method: 'PATCH',
          token,
          body: payload,
        })
      } else {
        await api('/admin/promotions/free-delivery-rules', {
          method: 'POST',
          token,
          body: payload,
        })
      }

      setRuleModalOpen(false)
      await loadData()
    } catch (err) {
      setRuleFormErrors({ submit: err.message || 'Failed to save free delivery rule' })
    } finally {
      setRuleSaving(false)
    }
  }

  const toggleRuleStatus = async (rule) => {
    try {
      await api(`/admin/promotions/free-delivery-rules/${rule.id}`, {
        method: 'PATCH',
        token,
        body: { isActive: !rule.isActive },
      })
      setFreeRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
      )
    } catch (err) {
      alert(err.message || 'Failed to toggle rule status')
    }
  }

  // --- USAGE MODAL ---
  const viewUsages = async (coupon) => {
    setSelectedCouponForUsages(coupon)
    setUsagesModalOpen(true)
    setUsagesLoading(true)
    try {
      const res = await api(`/admin/promotions/coupons/${coupon.id}/usages`, { token })
      setCouponUsages(Array.isArray(res) ? res : [])
    } catch (err) {
      console.error('[PromotionsManager] Failed to fetch usages:', err)
      setCouponUsages([])
    } finally {
      setUsagesLoading(false)
    }
  }

  // --- DELETE CONFIRMATION ---
  const promptDelete = (type, item) => {
    setItemToDelete({
      type,
      id: item.id,
      name: type === 'coupon' ? `Coupon "${item.code}"` : `Rule "${item.name}"`,
    })
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete) return
    setDeleteBusy(true)
    try {
      if (itemToDelete.type === 'coupon') {
        await api(`/admin/promotions/coupons/${itemToDelete.id}`, {
          method: 'DELETE',
          token,
        })
        setCoupons((prev) => prev.filter((c) => c.id !== itemToDelete.id))
      } else {
        await api(`/admin/promotions/free-delivery-rules/${itemToDelete.id}`, {
          method: 'DELETE',
          token,
        })
        setFreeRules((prev) => prev.filter((r) => r.id !== itemToDelete.id))
      }
      setDeleteConfirmOpen(false)
      setItemToDelete(null)
    } catch (err) {
      alert(err.message || 'Failed to delete item')
    } finally {
      setDeleteBusy(false)
    }
  }

  const filteredCoupons = coupons.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (c.code || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink/10 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-gold-dark" />
            <h2 className="font-display text-3xl text-ink">Promotions & Privileges</h2>
          </div>
          <p className="mt-1 text-xs text-cocoa">
            Authoritative management of boutique coupons, free delivery rules, and customer concessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={openCreateCoupon}
            className="rounded-none bg-gold text-ink text-xs uppercase tracking-wider font-semibold hover:bg-gold-shimmer shadow-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Coupon
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={openCreateRule}
            className="rounded-none border-ink/20 bg-cream text-ink text-xs uppercase tracking-wider font-semibold hover:bg-sand/30 shadow-xs"
          >
            <Truck className="mr-1.5 h-3.5 w-3.5 text-teal" />
            Create Free Delivery Rule
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-ink/10 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('coupons')}
          className={cn(
            'px-5 py-3 text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 border-b-2',
            activeTab === 'coupons'
              ? 'border-gold text-ink bg-cream/50'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Tag className="h-4 w-4" />
          <span>Coupons ({coupons.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('free_delivery')}
          className={cn(
            'px-5 py-3 text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 border-b-2',
            activeTab === 'free_delivery'
              ? 'border-gold text-ink bg-cream/50'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Truck className="h-4 w-4" />
          <span>Free Delivery ({freeRules.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-5 py-3 text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 border-b-2',
            activeTab === 'overview'
              ? 'border-gold text-ink bg-cream/50'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span>Discounts Overview</span>
        </button>
      </div>

      {/* Loading Spinner */}
      {loading && (
        <div className="py-20 text-center text-xs uppercase tracking-widest text-cocoa">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent mb-2" />
          <p>Loading promotions data…</p>
        </div>
      )}

      {/* TAB 1: COUPONS */}
      {!loading && activeTab === 'coupons' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cocoa-light" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search coupon code or description…"
                className="pl-9 rounded-none border-ink/15 bg-cream text-xs uppercase tracking-wider"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadData}
              className="text-xs uppercase tracking-wider text-cocoa hover:text-ink"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          <div className="overflow-x-auto border border-ink/10 bg-cream rounded-sm shadow-xs">
            <table className="w-full text-left text-xs min-w-[900px]">
              <thead className="bg-[#1D1B19] text-cream text-[10px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Coupon Code</th>
                  <th className="py-3.5 px-4">Discount</th>
                  <th className="py-3.5 px-4">Min Order</th>
                  <th className="py-3.5 px-4">Max Cap</th>
                  <th className="py-3.5 px-4">Usage / Limit</th>
                  <th className="py-3.5 px-4">Scope & Rules</th>
                  <th className="py-3.5 px-4">Validity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filteredCoupons.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-cocoa-light italic">
                      No coupons found. Click &ldquo;Create Coupon&rdquo; to add your first boutique voucher.
                    </td>
                  </tr>
                ) : (
                  filteredCoupons.map((c) => {
                    const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date()
                    const isFuture = c.startAt && new Date(c.startAt) > new Date()
                    const isLimitReached = c.usageLimit && c.usageCount >= c.usageLimit

                    return (
                      <tr key={c.id} className="hover:bg-sand/10 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-ink text-sm">
                          <div className="flex items-center gap-1.5">
                            <span>{c.code}</span>
                            {c.firstOrderOnly && (
                              <span className="rounded-xs bg-plum-light px-1.5 py-0.5 text-[9px] font-sans font-bold uppercase text-plum">
                                First Order
                              </span>
                            )}
                          </div>
                          {c.description && (
                            <p className="text-[11px] font-sans text-cocoa font-normal max-w-xs truncate">
                              {c.description}
                            </p>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-ink">
                          {c.discountType === 'percentage' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs">
                              <Percent className="h-3 w-3" /> {c.discountValue}% OFF
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-plum bg-plum-light border border-plum/20 px-2 py-0.5 rounded-xs">
                              {inr(c.discountValue)} OFF
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-cocoa font-medium">
                          {c.minOrderValue > 0 ? inr(c.minOrderValue) : '₹0 (None)'}
                        </td>

                        <td className="py-3.5 px-4 text-cocoa font-medium">
                          {c.maxDiscount ? inr(c.maxDiscount) : 'No Cap'}
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => viewUsages(c)}
                            className="font-medium text-ink hover:underline flex items-center gap-1"
                          >
                            <span className={cn(isLimitReached ? 'text-coral font-bold' : 'text-ink')}>
                              {c.usageCount || 0}
                            </span>
                            <span className="text-cocoa-light">/ {c.usageLimit || '∞'}</span>
                            <Eye className="h-3 w-3 text-gold-dark ml-0.5" />
                          </button>
                          {c.perCustomerLimit && (
                            <span className="text-[10px] text-cocoa-light block">
                              Max {c.perCustomerLimit} / cust
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-cocoa">
                          <span className="capitalize font-medium text-ink">
                            {c.appliesTo === 'all'
                              ? 'Entire Atelier'
                              : c.appliesTo === 'categories'
                              ? `${c.categoryIds?.length || 0} Categories`
                              : `${c.productIds?.length || 0} Products`}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-[11px] text-cocoa">
                          {c.expiresAt ? (
                            <span className={cn(isExpired ? 'text-coral font-semibold' : 'text-cocoa')}>
                              {isExpired ? 'Expired: ' : 'Exp: '}
                              {new Date(c.expiresAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium">No Expiry</span>
                          )}
                          {isFuture && (
                            <span className="text-[10px] text-amber-700 block">Starts in future</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleCouponStatus(c)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition',
                              c.isActive
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-sand text-ink/50 border border-ink/10 hover:bg-sand/80'
                            )}
                          >
                            {c.isActive ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3" /> Inactive
                              </>
                            )}
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-right space-x-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditCoupon(c)}
                            className="h-7 w-7 p-0 text-ink hover:text-gold-dark hover:bg-sand/30"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => promptDelete('coupon', c)}
                            className="h-7 w-7 p-0 text-coral hover:text-coral-dark hover:bg-coral-light/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: FREE DELIVERY RULES */}
      {!loading && activeTab === 'free_delivery' && (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-ink/10 bg-cream rounded-sm shadow-xs">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-[#1D1B19] text-cream text-[10px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Rule Name</th>
                  <th className="py-3.5 px-4">Order Threshold</th>
                  <th className="py-3.5 px-4">Promotion Code</th>
                  <th className="py-3.5 px-4">Scope</th>
                  <th className="py-3.5 px-4">Validity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {freeRules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-cocoa-light italic">
                      No custom free delivery rules configured.
                    </td>
                  </tr>
                ) : (
                  freeRules.map((r) => (
                    <tr key={r.id} className="hover:bg-sand/10 transition">
                      <td className="py-3.5 px-4 font-semibold text-ink">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-teal" />
                          <span>{r.name}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-cocoa font-medium">
                        Above {inr(r.minOrderValue || 0)}
                        {r.maxOrderValue ? ` (Up to ${inr(r.maxOrderValue)})` : ''}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-ink">
                        {r.couponCode ? (
                          <span className="bg-mango-light border border-mango/30 px-2 py-0.5 rounded-xs text-mango-dark">
                            {r.couponCode}
                          </span>
                        ) : (
                          <span className="text-cocoa-light font-sans font-normal">Automatic on Cart Value</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-cocoa capitalize font-medium">
                        {r.appliesTo === 'all'
                          ? 'Entire Atelier'
                          : r.appliesTo === 'categories'
                          ? `${r.categoryIds?.length || 0} Categories`
                          : `${r.productIds?.length || 0} Products`}
                      </td>

                      <td className="py-3.5 px-4 text-[11px] text-cocoa">
                        {r.expiresAt ? (
                          <span>
                            Exp: {new Date(r.expiresAt).toLocaleDateString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Always Active</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => toggleRuleStatus(r)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition',
                            r.isActive
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                              : 'bg-sand text-ink/50 border border-ink/10 hover:bg-sand/80'
                          )}
                        >
                          {r.isActive ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" /> Inactive
                            </>
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditRule(r)}
                          className="h-7 w-7 p-0 text-ink hover:text-gold-dark hover:bg-sand/30"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => promptDelete('rule', r)}
                          className="h-7 w-7 p-0 text-coral hover:text-coral-dark hover:bg-coral-light/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PROMOTIONS OVERVIEW */}
      {!loading && activeTab === 'overview' && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-cream border border-ink/10 p-6 rounded-sm space-y-2 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
              <Tag className="h-4 w-4 text-gold-dark" />
              <span>Active Coupons</span>
            </div>
            <p className="font-display text-3xl text-ink font-bold">
              {coupons.filter((c) => c.isActive).length}
            </p>
            <p className="text-xs text-cocoa">
              Out of {coupons.length} total configured coupons.
            </p>
          </div>

          <div className="bg-cream border border-ink/10 p-6 rounded-sm space-y-2 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
              <Truck className="h-4 w-4 text-teal" />
              <span>Free Delivery Rules</span>
            </div>
            <p className="font-display text-3xl text-ink font-bold">
              {freeRules.filter((r) => r.isActive).length}
            </p>
            <p className="text-xs text-cocoa">
              Active shipping concession rule(s).
            </p>
          </div>

          <div className="bg-cream border border-ink/10 p-6 rounded-sm space-y-2 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span>Total Redemptions</span>
            </div>
            <p className="font-display text-3xl text-ink font-bold">
              {coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0)}
            </p>
            <p className="text-xs text-cocoa">
              Cumulative orders placed with discount vouchers.
            </p>
          </div>
        </div>
      )}

      {/* DIALOG: CREATE / EDIT COUPON */}
      <Dialog open={couponModalOpen} onOpenChange={setCouponModalOpen}>
        <DialogContent className="max-w-2xl bg-paper border border-ink/20 p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink">
              {editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create New Boutique Coupon'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveCoupon} className="space-y-4 pt-2">
            {couponFormErrors.submit && (
              <div className="p-3 bg-coral-light border border-coral text-xs text-coral-dark font-medium rounded-sm">
                {couponFormErrors.submit}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Coupon Code" required error={couponFormErrors.code}>
                <Input
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. THRETHA10, FESTIVE25"
                  className="font-mono rounded-none border-ink/20 bg-cream uppercase"
                />
              </Field>

              <Field label="Discount Type" required>
                <Select
                  value={couponForm.discountType}
                  onValueChange={(val) => setCouponForm({ ...couponForm, discountType: val })}
                >
                  <SelectTrigger className="rounded-none border-ink/20 bg-cream">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage Discount (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={couponForm.discountType === 'percentage' ? 'Percentage Value (%)' : 'Fixed Discount (₹)'}
                required
                error={couponFormErrors.discountValue}
              >
                <Input
                  type="number"
                  min="1"
                  max={couponForm.discountType === 'percentage' ? '100' : '99999'}
                  value={couponForm.discountValue}
                  onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>

              <Field label="Minimum Order Value (₹)" error={couponFormErrors.minOrderValue}>
                <Input
                  type="number"
                  min="0"
                  value={couponForm.minOrderValue}
                  onChange={(e) => setCouponForm({ ...couponForm, minOrderValue: e.target.value })}
                  placeholder="e.g. 1499"
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>

              <Field label="Max Discount Cap (₹)" error={couponFormErrors.maxDiscount}>
                <Input
                  type="number"
                  min="0"
                  value={couponForm.maxDiscount}
                  onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: e.target.value })}
                  placeholder="e.g. 500 (Optional)"
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>
            </div>

            <Field label="Description / Customer Label">
              <Input
                value={couponForm.description}
                onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
                placeholder="e.g. 10% off on all festive sarees above ₹1,499"
                className="rounded-none border-ink/20 bg-cream text-xs"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total Usage Limit (Store-wide)">
                <Input
                  type="number"
                  min="1"
                  value={couponForm.usageLimit}
                  onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })}
                  placeholder="Leave empty for unlimited"
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>

              <Field label="Per-Customer Usage Limit">
                <Input
                  type="number"
                  min="1"
                  value={couponForm.perCustomerLimit}
                  onChange={(e) => setCouponForm({ ...couponForm, perCustomerLimit: e.target.value })}
                  placeholder="e.g. 1 per customer"
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date (Optional)">
                <Input
                  type="date"
                  value={couponForm.startAt}
                  onChange={(e) => setCouponForm({ ...couponForm, startAt: e.target.value })}
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>

              <Field label="Expiry Date (Optional)" error={couponFormErrors.expiresAt}>
                <Input
                  type="date"
                  value={couponForm.expiresAt}
                  onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>
            </div>

            <div className="space-y-2 border-t border-ink/10 pt-4">
              <Field label="Applies To Scope">
                <Select
                  value={couponForm.appliesTo}
                  onValueChange={(val) => setCouponForm({ ...couponForm, appliesTo: val })}
                >
                  <SelectTrigger className="rounded-none border-ink/20 bg-cream">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Entire Atelier (All Pieces)</SelectItem>
                    <SelectItem value="categories">Specific Categories Only</SelectItem>
                    <SelectItem value="products">Specific Products Only</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {couponForm.appliesTo === 'categories' && (
                <div className="p-3 bg-cream border border-ink/10 rounded-sm space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-ink">Select Categories:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {categories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={couponForm.categoryIds.includes(cat.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCouponForm({
                                ...couponForm,
                                categoryIds: [...couponForm.categoryIds, cat.id],
                              })
                            } else {
                              setCouponForm({
                                ...couponForm,
                                categoryIds: couponForm.categoryIds.filter((id) => id !== cat.id),
                              })
                            }
                          }}
                        />
                        <span>{cat.name}</span>
                      </label>
                    ))}
                  </div>
                  {couponFormErrors.categoryIds && (
                    <p className="text-[11px] text-coral">{couponFormErrors.categoryIds}</p>
                  )}
                </div>
              )}

              {couponForm.appliesTo === 'products' && (
                <div className="p-3 bg-cream border border-ink/10 rounded-sm space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-ink">Select Products:</Label>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {products.map((prod) => (
                      <label key={prod.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={couponForm.productIds.includes(prod.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCouponForm({
                                ...couponForm,
                                productIds: [...couponForm.productIds, prod.id],
                              })
                            } else {
                              setCouponForm({
                                ...couponForm,
                                productIds: couponForm.productIds.filter((id) => id !== prod.id),
                              })
                            }
                          }}
                        />
                        <span className="truncate">{prod.name} ({inr(prod.discount_price || prod.price)})</span>
                      </label>
                    ))}
                  </div>
                  {couponFormErrors.productIds && (
                    <p className="text-[11px] text-coral">{couponFormErrors.productIds}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-ink/10 pt-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                <Checkbox
                  checked={couponForm.firstOrderOnly}
                  onCheckedChange={(checked) => setCouponForm({ ...couponForm, firstOrderOnly: Boolean(checked) })}
                />
                <span>First Order Only (New Customers)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                <Checkbox
                  checked={couponForm.isActive}
                  onCheckedChange={(checked) => setCouponForm({ ...couponForm, isActive: Boolean(checked) })}
                />
                <span>Coupon Active</span>
              </label>
            </div>

            <DialogFooter className="pt-4 border-t border-ink/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCouponModalOpen(false)}
                className="rounded-none text-xs uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={couponSaving}
                className="rounded-none bg-gold text-ink text-xs uppercase tracking-wider font-semibold hover:bg-gold-shimmer px-6"
              >
                {couponSaving ? 'Saving…' : editingCoupon ? 'Update Coupon' : 'Create Coupon'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: CREATE / EDIT FREE DELIVERY RULE */}
      <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
        <DialogContent className="max-w-xl bg-paper border border-ink/20 p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink">
              {editingRule ? `Edit Rule: ${editingRule.name}` : 'Create Free Delivery Rule'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveRule} className="space-y-4 pt-2">
            {ruleFormErrors.submit && (
              <div className="p-3 bg-coral-light border border-coral text-xs text-coral-dark font-medium rounded-sm">
                {ruleFormErrors.submit}
              </div>
            )}

            <Field label="Rule Name / Description" required error={ruleFormErrors.name}>
              <Input
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                placeholder="e.g. Free Pan-India Delivery on orders above ₹2,999"
                className="rounded-none border-ink/20 bg-cream"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum Order Value (₹)" required>
                <Input
                  type="number"
                  min="0"
                  value={ruleForm.minOrderValue}
                  onChange={(e) => setRuleForm({ ...ruleForm, minOrderValue: e.target.value })}
                  placeholder="e.g. 2999"
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>

              <Field label="Free Delivery Code (Optional)">
                <Input
                  value={ruleForm.couponCode}
                  onChange={(e) => setRuleForm({ ...ruleForm, couponCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. FREED (Leave blank for automatic on cart value)"
                  className="font-mono rounded-none border-ink/20 bg-cream uppercase"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date (Optional)">
                <Input
                  type="date"
                  value={ruleForm.startAt}
                  onChange={(e) => setRuleForm({ ...ruleForm, startAt: e.target.value })}
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>

              <Field label="Expiry Date (Optional)">
                <Input
                  type="date"
                  value={ruleForm.expiresAt}
                  onChange={(e) => setRuleForm({ ...ruleForm, expiresAt: e.target.value })}
                  className="rounded-none border-ink/20 bg-cream"
                />
              </Field>
            </div>

            <div className="flex items-center justify-between border-t border-ink/10 pt-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                <Checkbox
                  checked={ruleForm.isActive}
                  onCheckedChange={(checked) => setRuleForm({ ...ruleForm, isActive: Boolean(checked) })}
                />
                <span>Rule Active</span>
              </label>
            </div>

            <DialogFooter className="pt-4 border-t border-ink/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRuleModalOpen(false)}
                className="rounded-none text-xs uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={ruleSaving}
                className="rounded-none bg-gold text-ink text-xs uppercase tracking-wider font-semibold hover:bg-gold-shimmer px-6"
              >
                {ruleSaving ? 'Saving…' : editingRule ? 'Update Rule' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: VIEW COUPON USAGES */}
      <Dialog open={usagesModalOpen} onOpenChange={setUsagesModalOpen}>
        <DialogContent className="max-w-2xl bg-paper border border-ink/20 p-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink flex items-center gap-2">
              <Eye className="h-5 w-5 text-gold-dark" />
              <span>Redemption History: {selectedCouponForUsages?.code}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {usagesLoading ? (
              <div className="py-12 text-center text-xs uppercase tracking-wider text-cocoa">
                Loading redemption log…
              </div>
            ) : couponUsages.length === 0 ? (
              <div className="py-12 text-center text-xs text-cocoa-light italic">
                No orders have redeemed this coupon yet.
              </div>
            ) : (
              <div className="overflow-x-auto border border-ink/10 bg-cream rounded-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1D1B19] text-cream text-[10px] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Order Ref</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Discount Applied</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {couponUsages.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-ink">
                          {u.orderNumber || u.orderId}
                        </td>
                        <td className="py-3 px-4 font-medium text-ink">
                          {u.customerName || 'Customer'}
                        </td>
                        <td className="py-3 px-4 text-cocoa text-[11px]">
                          {u.email || u.phone || '—'}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-700">
                          {inr(u.discountAmount || 0)}
                        </td>
                        <td className="py-3 px-4 text-cocoa text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOG: DELETE CONFIRMATION */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md bg-paper border border-coral/30 p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-coral-dark flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-coral" />
              <span>Confirm Deletion</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-cocoa leading-relaxed">
            Are you sure you want to permanently delete <strong>{itemToDelete?.name}</strong>?
            This action cannot be undone.
          </div>
          <DialogFooter className="pt-3 border-t border-ink/10 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded-none text-xs uppercase tracking-wider"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleteBusy}
              onClick={confirmDelete}
              className="rounded-none bg-coral text-white text-xs uppercase tracking-wider font-semibold hover:bg-coral-dark"
            >
              {deleteBusy ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

