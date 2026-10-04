'use client'

import { useEffect, useState } from 'react'
import {
  Bell,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Send,
  RefreshCw,
  Phone,
  User,
  ShieldCheck,
  Check,
  X,
  Radio,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { api, auth } from '@/lib/tc'

export default function OrderNotificationsManager() {
  const token = auth.get()

  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  // Recipient Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecipient, setEditingRecipient] = useState(null)
  const [recipientType, setRecipientType] = useState('email') // 'email' | 'whatsapp'
  const [recipientForm, setRecipientForm] = useState({
    name: '',
    email: '',
    phone: '',
    active: true,
  })
  const [formErrors, setFormErrors] = useState({})
  const [modalSaving, setModalSaving] = useState(false)

  // Testing States
  const [testEmail, setTestEmail] = useState('')
  const [testEmailType, setTestEmailType] = useState('customer') // 'customer' | 'sales'
  const [testEmailSending, setTestEmailSending] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState(null)

  const [testPhone, setTestPhone] = useState('')
  const [testWhatsAppSending, setTestWhatsAppSending] = useState(false)
  const [testWhatsAppResult, setTestWhatsAppResult] = useState(null)

  // Recent Logs State
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Load Settings
  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await api('/admin/notifications/settings', { token })
      setSettings(res)
      if (res?.sales_email?.recipients?.[0]?.email && !testEmail) {
        setTestEmail(res.sales_email.recipients[0].email)
      }
      if (res?.sales_whatsapp?.recipients?.[0]?.phone && !testPhone) {
        setTestPhone(res.sales_whatsapp.recipients[0].phone)
      }
    } catch (err) {
      console.error('Failed to load notification settings:', err)
      setErrorMessage(err.message || 'Failed to load notification settings.')
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await api('/admin/notifications/logs', { token })
      setLogs(res || [])
    } catch (err) {
      console.error('Failed to load notification logs:', err)
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
    loadLogs()
  }, [])

  // Save Settings Toggle Changes
  const handleSaveSettings = async (customSettings = null) => {
    setSaving(true)
    setErrorMessage(null)
    const payload = customSettings || settings
    try {
      const res = await api('/admin/notifications/settings', {
        method: 'PUT',
        body: payload,
        token,
      })
      setSettings(res)
      setSavedMessage('Notification settings updated successfully.')
      setTimeout(() => setSavedMessage(null), 3500)
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  // Open Modal for Add
  const openAddModal = (type) => {
    setRecipientType(type)
    setEditingRecipient(null)
    setRecipientForm({
      name: '',
      email: '',
      phone: '',
      active: true,
    })
    setFormErrors({})
    setModalOpen(true)
  }

  // Open Modal for Edit
  const openEditModal = (recipient, type) => {
    setRecipientType(type)
    setEditingRecipient(recipient)
    setRecipientForm({
      name: recipient.name || '',
      email: recipient.email || '',
      phone: recipient.phone || '',
      active: recipient.active !== false,
    })
    setFormErrors({})
    setModalOpen(true)
  }

  // Save Recipient
  const handleSaveRecipient = async (e) => {
    e.preventDefault()
    const errors = {}

    if (!recipientForm.name.trim()) {
      errors.name = 'Recipient name is required'
    }

    if (recipientType === 'email') {
      if (!recipientForm.email.trim() || !recipientForm.email.includes('@')) {
        errors.email = 'Valid email address is required'
      }
    } else {
      const cleanPhone = recipientForm.phone.replace(/[^0-9+]/g, '')
      if (!cleanPhone || cleanPhone.length < 8) {
        errors.phone = 'Valid WhatsApp number is required (e.g. +91 98765 43210)'
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setModalSaving(true)
    try {
      let res
      if (editingRecipient) {
        res = await api(`/admin/notifications/recipients/${editingRecipient.id}`, {
          method: 'PUT',
          body: {
            type: recipientType,
            name: recipientForm.name.trim(),
            email: recipientForm.email.trim(),
            phone: recipientForm.phone.trim(),
            active: recipientForm.active,
          },
          token,
        })
      } else {
        res = await api('/admin/notifications/recipients', {
          method: 'POST',
          body: {
            type: recipientType,
            name: recipientForm.name.trim(),
            email: recipientForm.email.trim(),
            phone: recipientForm.phone.trim(),
            active: recipientForm.active,
          },
          token,
        })
      }

      setSettings(res)
      setModalOpen(false)
      setSavedMessage(`Sales ${recipientType === 'email' ? 'email' : 'WhatsApp'} recipient saved.`)
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (err) {
      setFormErrors({ general: err.message || 'Failed to save recipient.' })
    } finally {
      setModalSaving(false)
    }
  }

  // Toggle Active State
  const handleToggleRecipient = async (recipient, type) => {
    try {
      const res = await api(`/admin/notifications/recipients/${recipient.id}`, {
        method: 'PUT',
        body: {
          active: !recipient.active,
        },
        token,
      })
      setSettings(res)
    } catch (err) {
      console.error('Failed to toggle recipient status:', err)
    }
  }

  // Delete Recipient
  const handleDeleteRecipient = async (recipientId) => {
    if (!confirm('Are you sure you want to remove this sales notification recipient?')) return
    try {
      const res = await api(`/admin/notifications/recipients/${recipientId}`, {
        method: 'DELETE',
        token,
      })
      setSettings(res)
      setSavedMessage('Recipient removed.')
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (err) {
      console.error('Failed to delete recipient:', err)
    }
  }

  // Send Test Email
  const handleSendTestEmail = async (e) => {
    e.preventDefault()
    if (!testEmail || !testEmail.includes('@')) {
      setTestEmailResult({ success: false, message: 'Please enter a valid destination email.' })
      return
    }

    setTestEmailSending(true)
    setTestEmailResult(null)
    try {
      const res = await api('/admin/notifications/test-email', {
        method: 'POST',
        body: { to: testEmail.trim(), type: testEmailType },
        token,
      })
      if (res.success === false) {
        setTestEmailResult({ success: false, message: res.error || res.message || 'Failed to send test email.' })
      } else {
        setTestEmailResult({ success: true, message: res.message || `Test email dispatched to ${testEmail}` })
      }
      loadLogs()
    } catch (err) {
      setTestEmailResult({ success: false, message: err.message || 'Failed to send test email.' })
    } finally {
      setTestEmailSending(false)
    }
  }

  // Send Test WhatsApp
  const handleSendTestWhatsApp = async (e) => {
    e.preventDefault()
    if (!testPhone || testPhone.length < 8) {
      setTestWhatsAppResult({ success: false, message: 'Please enter a valid phone number.' })
      return
    }

    setTestWhatsAppSending(true)
    setTestWhatsAppResult(null)
    try {
      const res = await api('/admin/notifications/test-whatsapp', {
        method: 'POST',
        body: { phone: testPhone.trim() },
        token,
      })
      if (res.success === false) {
        setTestWhatsAppResult({
          success: false,
          message: res.error || res.message || 'WhatsApp provider is not configured. Please check environment configuration.',
        })
      } else {
        setTestWhatsAppResult({
          success: true,
          message: res.message || `Test WhatsApp notification sent to ${testPhone}`,
        })
      }
      loadLogs()
    } catch (err) {
      setTestWhatsAppResult({ success: false, message: err.message || 'Failed to send test WhatsApp.' })
    } finally {
      setTestWhatsAppSending(false)
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold-dark border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Loading Notification Settings…
        </p>
      </div>
    )
  }

  const salesEmailRecipients = settings?.sales_email?.recipients || []
  const salesWhatsAppRecipients = settings?.sales_whatsapp?.recipients || []

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-ink/10 pb-5 gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-dark font-medium flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Order Alerts & Dispatch
          </span>
          <h1 className="mt-1 font-display text-4xl text-ink">Order Notifications</h1>
          <p className="text-xs text-cocoa-light mt-1">
            Configure automated customer email confirmations and multi-channel sales staff alerts.
          </p>
        </div>

        <Button
          onClick={() => handleSaveSettings()}
          disabled={saving}
          className="rounded-none bg-ink px-8 py-5 text-xs uppercase tracking-widest text-cream hover:bg-cocoa-dark shadow-subtle self-start sm:self-auto"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Alerts */}
      {savedMessage && (
        <div className="flex items-center gap-2 p-3 bg-moss-light/20 border border-moss/30 text-moss text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-coral-light/20 border border-coral/30 text-coral text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* SECTION 1: Customer Email Notifications */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gold-dark" />
              <h2 className="font-display text-2xl text-ink">1. Customer Confirmation Email</h2>
            </div>
            <p className="text-xs text-cocoa-light leading-relaxed">
              Automatically dispatches a branded, itemized order receipt to the customer upon verified payment.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const updated = {
                ...settings,
                customer_email_enabled: !settings.customer_email_enabled,
              }
              setSettings(updated)
              handleSaveSettings(updated)
            }}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors shrink-0',
              settings.customer_email_enabled ? 'bg-ink' : 'bg-ink/20'
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                settings.customer_email_enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="pt-2 border-t border-ink/5">
          <div className="flex items-center gap-2 text-xs text-cocoa">
            <ShieldCheck className="h-3.5 w-3.5 text-moss" />
            <span>
              Includes Thretha branding, customer details, ordered pieces, size/color, pricing breakdown, and live tracking link.
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 2: Sales Email Notifications */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gold-dark" />
              <h2 className="font-display text-2xl text-ink">2. Sales Team Email Alerts</h2>
            </div>
            <p className="text-xs text-cocoa-light">
              Send internal notifications to atelier staff members whenever a new order is confirmed.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const updated = {
                ...settings,
                sales_email: {
                  ...settings.sales_email,
                  enabled: !settings.sales_email?.enabled,
                },
              }
              setSettings(updated)
              handleSaveSettings(updated)
            }}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors shrink-0',
              settings.sales_email?.enabled ? 'bg-ink' : 'bg-ink/20'
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                settings.sales_email?.enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Recipients Table */}
        <div className="pt-3 border-t border-ink/5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/80">
              Sales Email Recipients ({salesEmailRecipients.length})
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openAddModal('email')}
              className="rounded-none border-ink/20 text-[11px] uppercase tracking-wider h-8"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Sales Email
            </Button>
          </div>

          {salesEmailRecipients.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-ink/15 text-xs text-cocoa-light bg-sand/20">
              No sales email recipients added yet. Click &quot;Add Sales Email&quot; to configure your team.
            </div>
          ) : (
            <div className="overflow-x-auto border border-ink/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-sand/40 border-b border-ink/10 text-[10px] uppercase tracking-wider text-ink/70 font-semibold">
                  <tr>
                    <th className="p-3">Staff Name</th>
                    <th className="p-3">Email Address</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {salesEmailRecipients.map((rec) => (
                    <tr key={rec.id} className="hover:bg-sand/20 transition-colors">
                      <td className="p-3 font-medium text-ink flex items-center gap-1.5">
                        <User className="h-3 w-3 text-cocoa-light" />
                        {rec.name}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-cocoa">
                        {rec.email}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRecipient(rec, 'email')}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-none transition',
                            rec.active !== false
                              ? 'bg-moss-light/30 text-moss border border-moss/30'
                              : 'bg-sand text-cocoa-light border border-ink/10'
                          )}
                        >
                          {rec.active !== false ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                          {rec.active !== false ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none"
                          onClick={() => openEditModal(rec, 'email')}
                        >
                          <Edit2 className="h-3 w-3 text-cocoa" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-coral hover:bg-coral-light/20"
                          onClick={() => handleDeleteRecipient(rec.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: Sales WhatsApp Notifications */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gold-dark" />
              <h2 className="font-display text-2xl text-ink">3. Sales Team WhatsApp Alerts</h2>
            </div>
            <p className="text-xs text-cocoa-light">
              Send automated WhatsApp alerts to concierge staff with order details and customer contact.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const updated = {
                ...settings,
                sales_whatsapp: {
                  ...settings.sales_whatsapp,
                  enabled: !settings.sales_whatsapp?.enabled,
                },
              }
              setSettings(updated)
              handleSaveSettings(updated)
            }}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors shrink-0',
              settings.sales_whatsapp?.enabled ? 'bg-ink' : 'bg-ink/20'
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                settings.sales_whatsapp?.enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Recipients Table */}
        <div className="pt-3 border-t border-ink/5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/80">
              WhatsApp Recipients ({salesWhatsAppRecipients.length})
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openAddModal('whatsapp')}
              className="rounded-none border-ink/20 text-[11px] uppercase tracking-wider h-8"
            >
              <Plus className="h-3 w-3 mr-1" /> Add WhatsApp Recipient
            </Button>
          </div>

          {salesWhatsAppRecipients.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-ink/15 text-xs text-cocoa-light bg-sand/20">
              No WhatsApp recipients added yet. Click &quot;Add WhatsApp Recipient&quot; to configure your concierge team.
            </div>
          ) : (
            <div className="overflow-x-auto border border-ink/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-sand/40 border-b border-ink/10 text-[10px] uppercase tracking-wider text-ink/70 font-semibold">
                  <tr>
                    <th className="p-3">Staff Name</th>
                    <th className="p-3">WhatsApp Number</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {salesWhatsAppRecipients.map((rec) => (
                    <tr key={rec.id} className="hover:bg-sand/20 transition-colors">
                      <td className="p-3 font-medium text-ink flex items-center gap-1.5">
                        <User className="h-3 w-3 text-cocoa-light" />
                        {rec.name}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-cocoa">
                        {rec.phone}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRecipient(rec, 'whatsapp')}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-none transition',
                            rec.active !== false
                              ? 'bg-moss-light/30 text-moss border border-moss/30'
                              : 'bg-sand text-cocoa-light border border-ink/10'
                          )}
                        >
                          {rec.active !== false ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                          {rec.active !== false ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none"
                          onClick={() => openEditModal(rec, 'whatsapp')}
                        >
                          <Edit2 className="h-3 w-3 text-cocoa" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-coral hover:bg-coral-light/20"
                          onClick={() => handleDeleteRecipient(rec.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: Notification Trigger Events */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <h2 className="font-display text-2xl text-ink">4. Trigger Events</h2>
        <p className="text-xs text-cocoa-light">
          Select order lifecycle events that should trigger notification dispatches.
        </p>

        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 p-3 bg-sand/20 border border-ink/5 cursor-pointer">
            <Checkbox
              checked={settings?.events?.order_confirmed !== false}
              onCheckedChange={(c) => {
                const updated = {
                  ...settings,
                  events: { ...settings.events, order_confirmed: Boolean(c) },
                }
                setSettings(updated)
                handleSaveSettings(updated)
              }}
            />
            <div>
              <p className="text-xs font-semibold text-ink">Order Confirmed / Paid (Active)</p>
              <p className="text-[11px] text-cocoa-light">Triggers when Cashfree payment is verified or WhatsApp Concierge order is submitted.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-sand/10 border border-ink/5 cursor-pointer">
            <Checkbox
              checked={Boolean(settings?.events?.order_cancelled)}
              onCheckedChange={(c) => {
                const updated = {
                  ...settings,
                  events: { ...settings.events, order_cancelled: Boolean(c) },
                }
                setSettings(updated)
                handleSaveSettings(updated)
              }}
            />
            <div>
              <p className="text-xs font-semibold text-ink">Order Cancelled</p>
              <p className="text-[11px] text-cocoa-light">Notify staff when an order status is marked as cancelled.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-sand/10 border border-ink/5 cursor-pointer">
            <Checkbox
              checked={Boolean(settings?.events?.order_refunded)}
              onCheckedChange={(c) => {
                const updated = {
                  ...settings,
                  events: { ...settings.events, order_refunded: Boolean(c) },
                }
                setSettings(updated)
                handleSaveSettings(updated)
              }}
            />
            <div>
              <p className="text-xs font-semibold text-ink">Order Refunded</p>
              <p className="text-[11px] text-cocoa-light">Notify customer and staff upon processed refunds.</p>
            </div>
          </label>
        </div>
      </section>

      {/* SECTION 5: Live Test Notification Panel */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-6">
        <h2 className="font-display text-2xl text-ink">5. Test Dispatch Actions</h2>
        <p className="text-xs text-cocoa-light">
          Verify email delivery and WhatsApp automation by dispatching test notifications to target destinations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Test Email */}
          <form onSubmit={handleSendTestEmail} className="p-4 bg-sand/20 border border-ink/10 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gold-dark" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                Send Test Email
              </h3>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-semibold text-ink/70">
                Destination Email
              </Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="staff@thretha.in"
                className="bg-cream rounded-none text-xs border-ink/20"
                required
              />
            </div>

            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-cocoa">
                <input
                  type="radio"
                  name="emailType"
                  checked={testEmailType === 'customer'}
                  onChange={() => setTestEmailType('customer')}
                />
                Customer Receipt
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-cocoa">
                <input
                  type="radio"
                  name="emailType"
                  checked={testEmailType === 'sales'}
                  onChange={() => setTestEmailType('sales')}
                />
                Sales Alert
              </label>
            </div>

            <Button
              type="submit"
              disabled={testEmailSending}
              className="w-full rounded-none bg-ink text-cream text-[11px] uppercase tracking-wider py-4"
            >
              {testEmailSending ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Dispatching…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Send className="h-3 w-3" /> Send Test Email
                </span>
              )}
            </Button>

            {testEmailResult && (
              <div
                className={cn(
                  'p-2.5 text-xs flex items-center gap-1.5 border',
                  testEmailResult.success
                    ? 'bg-moss-light/20 border-moss/30 text-moss'
                    : 'bg-coral-light/20 border-coral/30 text-coral'
                )}
              >
                {testEmailResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                <span>{testEmailResult.message}</span>
              </div>
            )}
          </form>

          {/* Test WhatsApp */}
          <form onSubmit={handleSendTestWhatsApp} className="p-4 bg-sand/20 border border-ink/10 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gold-dark" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                Send Test WhatsApp
              </h3>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase font-semibold text-ink/70">
                Destination Phone (with Country Code)
              </Label>
              <Input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="bg-cream rounded-none text-xs border-ink/20"
                required
              />
            </div>

            <p className="text-[11px] text-cocoa-light">
              Sends an automated test message to verify WhatsApp provider connectivity.
            </p>

            <Button
              type="submit"
              disabled={testWhatsAppSending}
              className="w-full rounded-none bg-ink text-cream text-[11px] uppercase tracking-wider py-4"
            >
              {testWhatsAppSending ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Dispatching…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Send className="h-3 w-3" /> Send Test WhatsApp
                </span>
              )}
            </Button>

            {testWhatsAppResult && (
              <div
                className={cn(
                  'p-2.5 text-xs flex items-center gap-1.5 border',
                  testWhatsAppResult.success
                    ? 'bg-moss-light/20 border-moss/30 text-moss'
                    : 'bg-coral-light/20 border-coral/30 text-coral'
                )}
              >
                {testWhatsAppResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                <span>{testWhatsAppResult.message}</span>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* SECTION 6: Notification Dispatch History Logs */}
      <section className="border border-ink/10 bg-cream p-6 paper-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gold-dark" />
            <h2 className="font-display text-2xl text-ink">6. Recent Dispatch Logs</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadLogs}
            disabled={logsLoading}
            className="text-xs uppercase tracking-wider rounded-none"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', logsLoading && 'animate-spin')} /> Refresh
          </Button>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-ink/15 text-xs text-cocoa-light bg-sand/20">
            No notification dispatch logs recorded yet. Logs will appear here as orders are placed or verified.
          </div>
        ) : (
          <div className="overflow-x-auto border border-ink/10 max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-sand/40 border-b border-ink/10 text-[10px] uppercase tracking-wider text-ink/70 font-semibold sticky top-0 bg-paper">
                <tr>
                  <th className="p-2.5">Time</th>
                  <th className="p-2.5">Order</th>
                  <th className="p-2.5">Channel</th>
                  <th className="p-2.5">Recipient</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-sand/20 transition-colors">
                    <td className="p-2.5 text-[11px] text-cocoa whitespace-nowrap">
                      {new Date(log.created_at || log.sent_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-ink font-semibold">
                      {log.order_number || log.order_id?.slice(0, 8)}
                    </td>
                    <td className="p-2.5 text-[11px] text-cocoa">
                      {log.channel === 'EMAIL' ? (
                        <span className="inline-flex items-center gap-1 text-ink">
                          <Mail className="h-3 w-3 text-gold-dark" /> Email
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-moss">
                          <MessageSquare className="h-3 w-3" /> WhatsApp
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-[11px] font-mono text-cocoa truncate max-w-[150px]">
                      {log.recipient}
                    </td>
                    <td className="p-2.5 text-[10px] uppercase text-cocoa-light font-semibold">
                      {log.recipient_type || 'SALES'}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-none',
                          log.status === 'SENT'
                            ? 'bg-moss-light/30 text-moss border border-moss/30'
                            : 'bg-coral-light/20 text-coral border border-coral/30'
                        )}
                      >
                        {log.status === 'SENT' ? <Check className="h-2 w-2" /> : <X className="h-2 w-2" />}
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recipient Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-paper border border-ink/20 rounded-none p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-ink">
              {editingRecipient ? 'Edit' : 'Add'} Sales {recipientType === 'email' ? 'Email' : 'WhatsApp'} Recipient
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveRecipient} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink/80">
                Staff Name <span className="text-coral">*</span>
              </Label>
              <Input
                value={recipientForm.name}
                onChange={(e) => setRecipientForm({ ...recipientForm, name: e.target.value })}
                placeholder="e.g. Rahul / Concierge Lead"
                className="bg-cream rounded-none text-xs border-ink/20"
                required
              />
              {formErrors.name && (
                <p className="text-[11px] text-coral font-medium">{formErrors.name}</p>
              )}
            </div>

            {recipientType === 'email' ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink/80">
                  Email Address <span className="text-coral">*</span>
                </Label>
                <Input
                  type="email"
                  value={recipientForm.email}
                  onChange={(e) => setRecipientForm({ ...recipientForm, email: e.target.value })}
                  placeholder="e.g. rahul@thretha.in"
                  className="bg-cream rounded-none text-xs border-ink/20"
                  required
                />
                {formErrors.email && (
                  <p className="text-[11px] text-coral font-medium">{formErrors.email}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink/80">
                  WhatsApp Number (with country code) <span className="text-coral">*</span>
                </Label>
                <Input
                  type="tel"
                  value={recipientForm.phone}
                  onChange={(e) => setRecipientForm({ ...recipientForm, phone: e.target.value })}
                  placeholder="e.g. +91 98765 43210"
                  className="bg-cream rounded-none text-xs border-ink/20"
                  required
                />
                {formErrors.phone && (
                  <p className="text-[11px] text-coral font-medium">{formErrors.phone}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="recipient-active-toggle"
                checked={recipientForm.active}
                onCheckedChange={(c) => setRecipientForm({ ...recipientForm, active: Boolean(c) })}
              />
              <Label htmlFor="recipient-active-toggle" className="text-xs text-ink font-medium cursor-pointer">
                Recipient is active and should receive notifications
              </Label>
            </div>

            {formErrors.general && (
              <p className="text-xs text-coral font-medium">{formErrors.general}</p>
            )}

            <DialogFooter className="pt-4 border-t border-ink/10">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-none text-xs uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={modalSaving}
                className="rounded-none bg-ink text-cream text-xs uppercase tracking-wider px-6"
              >
                {modalSaving ? 'Saving…' : 'Save Recipient'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
