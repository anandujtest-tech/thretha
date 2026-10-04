'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles,
  RefreshCw,
  Check,
  AlertCircle,
  Shield,
  Layers,
  Settings2,
  TrendingUp,
  ShoppingBag,
  Activity,
  Zap,
} from 'lucide-react'
import { api } from '@/lib/tc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { GARMENT_TYPES } from '@/lib/tryon-constants'
import { broadcastStorefrontSettingsChanged } from '@/lib/storefrontEvents'

export default function TryOnSettingsManager({ token }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  const [settings, setSettings] = useState({
    enabled: true,
    product_tryon_enabled: true,
    combo_tryon_enabled: true,
    allow_guests: true,
    max_generations_per_session: 3,
    max_generations_per_user_day: 5,
    show_privacy_notice: true,
    provider: 'fashn',
    model_name: 'idm-vton',
    disclaimer_text: 'Virtual try-on is an AI-generated preview and may not represent exact fit.',
  })

  const [providerStatus, setProviderStatus] = useState('IDLE')
  const [providerMessage, setProviderMessage] = useState(null)
  const [analytics, setAnalytics] = useState(null)

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const data = await api('/admin/tryon/dashboard', { token })
      if (data?.settings) {
        setSettings(data.settings)
      }
      if (data?.provider_status) {
        setProviderStatus(data.provider_status)
      }
      if (data?.provider_message) {
        setProviderMessage(data.provider_message)
      }
      if (data?.analytics) {
        setAnalytics(data.analytics)
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to load Virtual Try-On configuration.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboard()
    }
  }, [token])

  const handleTestConnection = async () => {
    try {
      setTesting(true)
      setFeedback({ type: '', message: '' })
      const res = await api('/admin/tryon/test-connection', {
        method: 'POST',
        token,
        body: { provider: settings.provider },
      })

      if (res?.ok) {
        setProviderStatus(res.status || 'CONNECTED')
        setProviderMessage(res.message || 'Connection verified.')
        setFeedback({
          type: 'success',
          message: `Provider status: ${res.status}. ${res.message || 'Ready for virtual try-on requests.'}`,
        })
      } else {
        setProviderStatus(res.status || 'ERROR')
        setProviderMessage(res.message || 'Connection failed.')
        setFeedback({
          type: 'error',
          message: res.message || 'Provider connection test failed.',
        })
      }
    } catch (err) {
      setProviderStatus('ERROR')
      setFeedback({
        type: 'error',
        message: err.message || 'Connection test failed.',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault()
    try {
      setSaving(true)
      setFeedback({ type: '', message: '' })

      const res = await api('/admin/tryon/settings', {
        method: 'PUT',
        token,
        body: settings,
      })

      if (res?.settings) {
        setSettings(res.settings)
      }
      broadcastStorefrontSettingsChanged('tryon')
      if (res?.provider_status) {
        setProviderStatus(res.provider_status)
      }

      setFeedback({
        type: 'success',
        message: 'Virtual Try-On settings saved successfully.',
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save settings.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border border-ink/10 bg-cream p-6 paper-card space-y-6">
      {/* ── 1. Header & Master Toggle ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-gold-dark" />
            <h2 className="font-display text-2xl text-ink">7. AI Virtual Try-On (Try It On ✦)</h2>
          </div>
          <p className="text-xs text-cocoa leading-relaxed max-w-xl">
            Configure AI-powered virtual try-on for products and curated ensembles. Allows customers to upload photos and visualize Thretha atelier pieces styled on themselves.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              settings.enabled
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-sand/60 text-cocoa border border-ink/15'
            )}
          >
            {settings.enabled ? 'Enabled (ON)' : 'Disabled (OFF)'}
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Toggle AI Virtual Try-On"
            onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-gold-dark',
              settings.enabled ? 'bg-gold-dark' : 'bg-ink/20'
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform shadow-xs',
                settings.enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback.message && (
        <div
          className={cn(
            'p-3.5 text-xs flex items-center justify-between gap-3 border',
            feedback.type === 'error'
              ? 'bg-coral-light/20 border-coral/30 text-coral'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <Check className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-[11px] font-semibold underline uppercase tracking-wider hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 2. Analytics Overview Cards ── */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-paper p-4 border border-ink/10">
          <div>
            <span className="text-[10px] uppercase font-mono text-cocoa-light block">Today&apos;s Attempts</span>
            <span className="text-xl font-bold font-display text-ink">{analytics.todayAttempts || 0}</span>
          </div>
          <div className="border-l border-ink/10 pl-3">
            <span className="text-[10px] uppercase font-mono text-cocoa-light block">Successful</span>
            <span className="text-xl font-bold font-display text-emerald-800">{analytics.todaySuccess || 0}</span>
          </div>
          <div className="border-l border-ink/10 pl-3">
            <span className="text-[10px] uppercase font-mono text-cocoa-light block">Added to Bag</span>
            <span className="text-xl font-bold font-display text-ink">{analytics.todayAddToCart || 0}</span>
          </div>
          <div className="border-l border-ink/10 pl-3">
            <span className="text-[10px] uppercase font-mono text-cocoa-light block">Try-On Conversion</span>
            <span className="text-xl font-bold font-display text-gold-dark">{analytics.conversionRate || 0}%</span>
          </div>
        </div>
      )}

      {/* ── 3. Configuration Form ── */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Row 1: Feature Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-ink/10 pb-5 text-xs">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.product_tryon_enabled !== false}
              onChange={(e) => setSettings((s) => ({ ...s, product_tryon_enabled: e.target.checked }))}
              className="accent-gold-dark h-4 w-4"
            />
            <span className="font-medium text-ink">Enable on Single Products</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.combo_tryon_enabled !== false}
              onChange={(e) => setSettings((s) => ({ ...s, combo_tryon_enabled: e.target.checked }))}
              className="accent-gold-dark h-4 w-4"
            />
            <span className="font-medium text-ink">Enable on Combos &amp; Ensembles</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.allow_guests !== false}
              onChange={(e) => setSettings((s) => ({ ...s, allow_guests: e.target.checked }))}
              className="accent-gold-dark h-4 w-4"
            />
            <span className="font-medium text-ink">Allow Guest Customer Try-Ons</span>
          </label>
        </div>

        {/* Row 2: Rate Limits & Quotas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Max Try-Ons Per Guest Session
            </Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={settings.max_generations_per_session || 3}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  max_generations_per_session: Number(e.target.value) || 3,
                }))
              }
              className="rounded-none bg-paper border-ink/20 font-mono text-xs"
            />
            <p className="text-[11px] text-cocoa-light">
              Limits AI cost by restricting non-authenticated guests per browsing session.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Max Try-Ons Per User / Day
            </Label>
            <Input
              type="number"
              min="1"
              max="50"
              value={settings.max_generations_per_user_day || 5}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  max_generations_per_user_day: Number(e.target.value) || 5,
                }))
              }
              className="rounded-none bg-paper border-ink/20 font-mono text-xs"
            />
            <p className="text-[11px] text-cocoa-light">
              Daily quota for logged-in authenticated customers.
            </p>
          </div>
        </div>

        {/* Row 3: Provider Selection & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-ink/10 pt-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              AI Try-On Provider
            </Label>
            <select
              value={settings.provider || 'pixelapi'}
              onChange={(e) => setSettings((s) => ({ ...s, provider: e.target.value }))}
              className="w-full h-10 px-3 bg-paper border border-ink/20 text-xs font-sans rounded-none outline-hidden"
            >
              <option value="pixelapi">PixelAPI (Official Virtual Try-On API)</option>
              <option value="gemini">Google Gemini (Free-Tier AI Try-On)</option>
              <option value="qwen">Qwen — Alibaba DashScope (Experimental AI Try-On)</option>
              <option value="fashn">FASHN.ai (Fashion Try-On API)</option>
              <option value="replicate">Replicate (IDM-VTON / Kolors)</option>
              <option value="segmind">Segmind (IDM-VTON REST API)</option>
              <option value="mock">Development Mock Adapter (Offline Test Mode)</option>
            </select>
            <p className="text-[11px] text-cocoa-light">
              Pluggable server-side provider. Configure via <code className="font-mono">PIXELAPI_API_KEY</code>, <code className="font-mono">GEMINI_API_KEY</code>, or <code className="font-mono">QWEN_API_KEY</code>.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Provider Connection Status
            </Label>
            <div className="flex items-center gap-3 pt-1">
              <span
                className={cn(
                  'px-2.5 py-1 text-xs font-mono font-bold uppercase tracking-wider border',
                  providerStatus === 'CONNECTED'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : providerStatus === 'DEVELOPMENT_MOCK'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                )}
              >
                ● {providerStatus}
              </span>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing}
                className="rounded-none text-xs flex items-center gap-1.5 border-ink/20"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', testing && 'animate-spin')} />
                <span>{testing ? 'Testing…' : 'Test Connection'}</span>
              </Button>
            </div>
            {providerMessage && (
              <p className="text-[11px] text-cocoa-light mt-1">{providerMessage}</p>
            )}
          </div>
        </div>

        {/* Row 4: Custom Disclaimer & Privacy Notice */}
        <div className="space-y-4 border-t border-ink/10 pt-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-ink/70">
              Customer Disclaimer Text
            </Label>
            <Input
              value={settings.disclaimer_text}
              onChange={(e) => setSettings((s) => ({ ...s, disclaimer_text: e.target.value }))}
              className="rounded-none bg-paper border-ink/20 text-xs"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={settings.show_privacy_notice !== false}
              onChange={(e) => setSettings((s) => ({ ...s, show_privacy_notice: e.target.checked }))}
              className="accent-gold-dark h-4 w-4"
            />
            <span className="text-ink font-medium">
              Display prominent customer privacy &amp; ephemeral photo retention guarantee
            </span>
          </label>
        </div>

        {/* Save CTA */}
        <div className="flex justify-end pt-4 border-t border-ink/10">
          <Button
            type="submit"
            disabled={saving}
            className="rounded-none bg-ink text-cream hover:bg-gold-dark text-xs uppercase tracking-wider font-semibold px-6 py-5"
          >
            {saving ? 'Saving Settings…' : 'Save Try-On Settings'}
          </Button>
        </div>
      </form>
    </section>
  )
}
