'use client'

import { useState, useEffect } from 'react'
import {
  Instagram,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Video,
  Layers,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Clock,
  Settings2,
  Plus,
  Trash2,
  Edit2,
  ShoppingBag,
  X,
  Upload,
  Smartphone,
  Monitor,
} from 'lucide-react'
import { api } from '@/lib/tc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const EXPECTED_HANDLE = 'thretha_couture'
const OFFICIAL_PROFILE_URL = 'https://www.instagram.com/thretha_couture/'

export default function InstagramFeedManager({ token, initialSettings, onSettingsChange }) {
  const [settings, setSettings] = useState(
    initialSettings?.instagram_feed || {
      enabled: true,
      source: 'manual', // 'manual' | 'meta'
      username: EXPECTED_HANDLE,
      posts_to_display: 6,
      auto_refresh: true,
      refresh_interval_minutes: 30,
      open_in_new_tab: true,
      show_captions: false,
      show_username: true,
      enable_videos: true,
      feed_mode: 'latest',
      last_sync_at: null,
      last_sync_status: 'IDLE',
      last_error_message: null,
    }
  )

  const [connectionStatus, setConnectionStatus] = useState('NOT_CONFIGURED')
  const [accountIdMasked, setAccountIdMasked] = useState(null)
  const [manualPosts, setManualPosts] = useState([])
  const [metaPosts, setMetaPosts] = useState([])
  const [availableProducts, setAvailableProducts] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [activeTab, setActiveTab] = useState('manual') // 'manual' | 'meta' | 'settings' | 'preview'
  const [previewDevice, setPreviewDevice] = useState('desktop') // 'desktop' | 'mobile'

  // Modal states for Manual Post Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPostId, setEditingPostId] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [postToDelete, setPostToDelete] = useState(null)

  const [formData, setFormData] = useState({
    permalink: '',
    media_url: '',
    thumbnail_url: '',
    caption: '',
    post_date: new Date().toISOString().slice(0, 10),
    display_order: 1,
    is_hidden: false,
    open_in_new_tab: true,
    is_video: false,
    linked_product_ids: [],
  })

  // Load feed from admin API
  const loadFeed = async () => {
    try {
      setLoading(true)
      const data = await api('/admin/instagram/feed', { token })
      if (data?.settings) {
        setSettings(data.settings)
      }
      if (data?.connection_status) {
        setConnectionStatus(data.connection_status)
      }
      if (data?.account_id_masked) {
        setAccountIdMasked(data.account_id_masked)
      }
      if (Array.isArray(data?.manual_posts)) {
        setManualPosts(data.manual_posts)
      }
      if (Array.isArray(data?.meta_posts)) {
        setMetaPosts(data.meta_posts)
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to load Instagram Lookbook data.',
      })
    } finally {
      setLoading(false)
    }
  }

  // Load store products for linking
  const loadProducts = async () => {
    try {
      const res = await api('/products')
      if (Array.isArray(res)) {
        setAvailableProducts(res)
      } else if (Array.isArray(res?.products)) {
        setAvailableProducts(res.products)
      }
    } catch {
      // Non-blocking
    }
  }

  useEffect(() => {
    if (token) {
      loadFeed()
      loadProducts()
    }
  }, [token])

  // Sync / Refresh on demand (Meta API)
  const handleRefreshMeta = async () => {
    try {
      setRefreshing(true)
      setFeedback({ type: '', message: '' })
      const res = await api('/admin/instagram/refresh', {
        method: 'POST',
        token,
      })

      if (res?.meta_posts) {
        setMetaPosts(res.meta_posts)
      }
      if (res?.settings) {
        setSettings(res.settings)
      }
      if (res?.connection_status) {
        setConnectionStatus(res.connection_status)
      }

      if (res?.syncResult?.synced) {
        const count = res.syncResult.count ?? res?.meta_posts?.length ?? 0
        setFeedback({
          type: 'success',
          message: `Live Meta Instagram feed updated successfully. ${count} real posts imported from @${EXPECTED_HANDLE}.`,
        })
      } else if (res?.syncResult?.status === 'NOT_CONFIGURED') {
        setFeedback({
          type: 'error',
          message: 'Live Instagram is not connected yet. Please configure INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID in environment.',
        })
      } else if (res?.syncResult?.error) {
        setFeedback({
          type: 'error',
          message: res.syncResult.error,
        })
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to sync with Meta Graph API.',
      })
    } finally {
      setRefreshing(false)
    }
  }

  // Open Add Post Modal
  const openAddModal = () => {
    setEditingPostId(null)
    setFormData({
      permalink: '',
      media_url: '',
      thumbnail_url: '',
      caption: '',
      post_date: new Date().toISOString().slice(0, 10),
      display_order: (manualPosts.length || 0) + 1,
      is_hidden: false,
      open_in_new_tab: true,
      is_video: false,
      linked_product_ids: [],
    })
    setIsModalOpen(true)
  }

  // Open Edit Post Modal
  const openEditModal = (post) => {
    setEditingPostId(post.id)
    setFormData({
      permalink: post.permalink || '',
      media_url: post.media_url || '',
      thumbnail_url: post.thumbnail_url || post.media_url || '',
      caption: post.caption || '',
      post_date: post.post_date ? post.post_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      display_order: Number(post.display_order) || 1,
      is_hidden: Boolean(post.is_hidden),
      open_in_new_tab: post.open_in_new_tab !== false,
      is_video: Boolean(post.is_video),
      linked_product_ids: Array.isArray(post.linked_product_ids) ? post.linked_product_ids : [],
    })
    setIsModalOpen(true)
  }

  // Image upload handler
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingImage(true)
      const data = new FormData()
      data.append('file', file)
      data.append('folder', 'instagram')

      const res = await api('/admin/media', {
        method: 'POST',
        token,
        body: data,
        isFormData: true,
      })

      if (res?.url) {
        setFormData((prev) => ({
          ...prev,
          media_url: res.url,
          thumbnail_url: res.url,
          is_video: (file.type || '').startsWith('video'),
        }))
        setFeedback({
          type: 'success',
          message: 'Image uploaded successfully.',
        })
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Image upload failed. Please try again.',
      })
    } finally {
      setUploadingImage(false)
    }
  }

  // Save Manual Post (Create or Update)
  const handleSaveManualPost = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback({ type: '', message: '' })

    try {
      if (!formData.permalink.trim()) {
        throw new Error('Please enter a valid Instagram post URL (e.g. https://www.instagram.com/p/... or /reel/...).')
      }
      if (!formData.media_url.trim()) {
        throw new Error('Please upload an image for this Instagram post.')
      }

      if (editingPostId) {
        // Update
        const res = await api('/admin/instagram/manual-post', {
          method: 'PUT',
          token,
          body: {
            id: editingPostId,
            ...formData,
          },
        })
        if (res?.adminFeed?.manual_posts) {
          setManualPosts(res.adminFeed.manual_posts)
        }
        setFeedback({
          type: 'success',
          message: 'Manual Instagram post updated successfully.',
        })
      } else {
        // Create
        const res = await api('/admin/instagram/manual-post', {
          method: 'POST',
          token,
          body: formData,
        })
        if (res?.adminFeed?.manual_posts) {
          setManualPosts(res.adminFeed.manual_posts)
        }
        setFeedback({
          type: 'success',
          message: 'Manual Instagram post added successfully.',
        })
      }

      setIsModalOpen(false)
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save Instagram post.',
      })
    } finally {
      setSaving(false)
    }
  }

  // Delete Manual Post
  const handleDeleteManualPost = async (postId) => {
    try {
      setFeedback({ type: '', message: '' })
      const res = await api(`/admin/instagram/manual-post?id=${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        token,
      })
      if (res?.adminFeed?.manual_posts) {
        setManualPosts(res.adminFeed.manual_posts)
      } else {
        setManualPosts((prev) => prev.filter((p) => p.id !== postId))
      }
      setPostToDelete(null)
      setFeedback({
        type: 'success',
        message: 'Instagram post deleted successfully.',
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to delete post.',
      })
    }
  }

  // Toggle Visibility for a post (Manual or Meta)
  const handleToggleVisibility = async (post, currentList, setList) => {
    const nextHidden = !post.is_hidden
    setList((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, is_hidden: nextHidden } : p))
    )

    try {
      await api('/admin/instagram/posts', {
        method: 'PUT',
        token,
        body: {
          updates: [{ id: post.id, is_hidden: nextHidden }],
        },
      })
      setFeedback({
        type: 'success',
        message: nextHidden ? 'Post hidden from storefront.' : 'Post visible on storefront.',
      })
    } catch (err) {
      setList((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, is_hidden: post.is_hidden } : p))
      )
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to update post visibility.',
      })
    }
  }

  // Reorder posts (Move Up / Move Down)
  const handleMovePost = async (index, direction, currentList, setList) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= currentList.length) return

    const newList = [...currentList]
    const temp = newList[index]
    newList[index] = newList[targetIndex]
    newList[targetIndex] = temp

    const updates = newList.map((p, idx) => ({
      id: p.id,
      display_order: idx + 1,
    }))

    setList(newList.map((p, idx) => ({ ...p, display_order: idx + 1 })))

    try {
      await api('/admin/instagram/posts', {
        method: 'PUT',
        token,
        body: { updates },
      })
      setFeedback({
        type: 'success',
        message: 'Post order updated successfully.',
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to reorder posts.',
      })
    }
  }

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      setFeedback({ type: '', message: '' })

      const normalized = {
        ...settings,
        username: EXPECTED_HANDLE,
      }

      await api('/admin/settings', {
        method: 'PUT',
        token,
        body: {
          instagram_feed: normalized,
        },
      })

      setSettings(normalized)
      if (onSettingsChange) {
        onSettingsChange(normalized)
      }

      setFeedback({
        type: 'success',
        message: 'Instagram Lookbook settings saved successfully.',
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

  // Determine active posts for preview
  const activePostList = settings.source === 'manual' ? manualPosts : metaPosts
  const visiblePreviewPosts = activePostList
    .filter((p) => !p.is_hidden)
    .filter((p) => (settings.enable_videos ? true : !p.is_video))
    .slice(0, settings.posts_to_display || 6)

  return (
    <div className="space-y-6">
      {/* ── 1. Master Header & Lookbook ON/OFF Toggle ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Instagram className="h-5 w-5 text-gold-dark" />
            <h2 className="font-display text-2xl text-ink">6. Instagram Feed &amp; Lookbook</h2>
          </div>
          <p className="text-xs text-cocoa leading-relaxed max-w-xl">
            Hybrid Instagram Lookbook for <span className="font-semibold text-ink">@{EXPECTED_HANDLE}</span>. Choose between manual post creation or live automated Meta API synchronization.
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
            {settings.enabled ? 'Lookbook Active on Storefront' : 'Lookbook Disabled'}
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            aria-label="Toggle Instagram Lookbook"
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

      {/* ── 2. Content Source Selector & Status Overview ── */}
      <div className="bg-sand/30 border border-ink/10 p-4 space-y-4">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wider text-ink block mb-2">
            Content Source
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option A: Manual Posts */}
            <label
              className={cn(
                'flex items-start gap-3 p-3.5 border cursor-pointer transition-all',
                settings.source === 'manual'
                  ? 'bg-paper border-gold-dark shadow-xs ring-1 ring-gold-dark/30'
                  : 'bg-sand/20 border-ink/15 hover:bg-sand/40'
              )}
            >
              <input
                type="radio"
                name="instagram_source"
                value="manual"
                checked={settings.source === 'manual'}
                onChange={() => setSettings((s) => ({ ...s, source: 'manual' }))}
                className="mt-0.5 accent-gold-dark h-4 w-4"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink">Manual Instagram Posts</span>
                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold">
                    Recommended (No Meta Keys Required)
                  </span>
                </div>
                <p className="text-[11px] text-cocoa leading-relaxed">
                  Add posts immediately by copying any Instagram post URL, uploading the photo, and optionally linking store products.
                </p>
              </div>
            </label>

            {/* Option B: Live Meta API */}
            <label
              className={cn(
                'flex items-start gap-3 p-3.5 border cursor-pointer transition-all',
                settings.source === 'meta'
                  ? 'bg-paper border-gold-dark shadow-xs ring-1 ring-gold-dark/30'
                  : 'bg-sand/20 border-ink/15 hover:bg-sand/40'
              )}
            >
              <input
                type="radio"
                name="instagram_source"
                value="meta"
                checked={settings.source === 'meta'}
                onChange={() => setSettings((s) => ({ ...s, source: 'meta' }))}
                className="mt-0.5 accent-gold-dark h-4 w-4"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink">Live Instagram / Meta API</span>
                  <span className={cn(
                    'text-[9px] font-mono uppercase px-1.5 py-0.5 font-semibold',
                    connectionStatus === 'CONNECTED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  )}>
                    {connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <p className="text-[11px] text-cocoa leading-relaxed">
                  Direct official Meta Graph API sync for @{EXPECTED_HANDLE}. Requires configured access token and account ID.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Live Overview Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-ink/10 text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-cocoa font-mono text-[10px] uppercase block">Active Content Source</span>
              <span className="font-bold text-ink uppercase tracking-wider">
                {settings.source === 'manual' ? 'Manual Posts' : 'Live Meta API'}
              </span>
            </div>

            <div className="border-l border-ink/10 pl-4">
              <span className="text-cocoa font-mono text-[10px] uppercase block">Manual Posts</span>
              <span className="font-mono font-bold text-ink">
                {manualPosts.filter((p) => !p.is_hidden).length} Active / {manualPosts.length} Total
              </span>
            </div>

            <div className="border-l border-ink/10 pl-4">
              <span className="text-cocoa font-mono text-[10px] uppercase block">Live Meta Status</span>
              <span className="font-mono font-bold text-ink">
                {connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'NOT CONNECTED'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveSettings}
              disabled={saving}
              className="rounded-none bg-ink text-cream hover:bg-terracotta text-xs uppercase tracking-wider font-semibold px-4"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
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

      {/* ── 3. Navigation Tabs ── */}
      <div className="flex border-b border-ink/10 gap-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={cn(
            'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-[2px] flex items-center gap-1.5',
            activeTab === 'manual'
              ? 'border-gold-dark text-ink font-semibold bg-sand/20'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Manual Posts ({manualPosts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('meta')}
          className={cn(
            'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-[2px] flex items-center gap-1.5',
            activeTab === 'meta'
              ? 'border-gold-dark text-ink font-semibold bg-sand/20'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Instagram className="h-3.5 w-3.5" />
          <span>Live Meta API ({metaPosts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={cn(
            'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-[2px] flex items-center gap-1.5',
            activeTab === 'settings'
              ? 'border-gold-dark text-ink font-semibold bg-sand/20'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Feed Configuration</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={cn(
            'px-4 py-2.5 font-medium transition-colors border-b-2 -mb-[2px] flex items-center gap-1.5',
            activeTab === 'preview'
              ? 'border-gold-dark text-ink font-semibold bg-sand/20'
              : 'border-transparent text-cocoa hover:text-ink'
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Storefront Preview ({visiblePreviewPosts.length} Displayed)</span>
        </button>
      </div>

      {/* ── TAB 1: MANUAL POSTS TAB ── */}
      {activeTab === 'manual' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-paper p-3 border border-ink/10">
            <div className="text-xs text-cocoa">
              <p>
                Showing <span className="font-semibold text-ink">{manualPosts.length}</span> manual posts.
                Top <span className="font-semibold text-ink">{settings.posts_to_display || 6}</span> active posts will be featured on the storefront.
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={openAddModal}
              className="rounded-none bg-ink text-cream hover:bg-terracotta text-xs flex items-center gap-2 font-semibold"
            >
              <Plus className="h-4 w-4" />
              <span>Add Instagram Post</span>
            </Button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-cocoa flex flex-col items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-gold-dark" />
              <span>Loading manual posts…</span>
            </div>
          ) : manualPosts.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-ink/15 rounded-sm bg-sand/15 p-8 space-y-3">
              <Instagram className="h-8 w-8 text-gold-dark/60 mx-auto" />
              <p className="text-sm font-semibold text-ink">No manual Instagram posts added yet.</p>
              <p className="text-xs text-cocoa max-w-md mx-auto leading-relaxed">
                Click &ldquo;Add Instagram Post&rdquo; to paste an Instagram URL (`https://www.instagram.com/p/...`), upload an image, and link store products.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={openAddModal}
                className="mt-2 rounded-none bg-ink text-cream hover:bg-terracotta text-xs"
              >
                + Add First Instagram Post
              </Button>
            </div>
          ) : (
            <div className="border border-ink/10 bg-paper divide-y divide-ink/10">
              {manualPosts.map((post, idx) => {
                const isFirst = idx === 0
                const isLast = idx === manualPosts.length - 1
                const linkedCount = Array.isArray(post.linked_product_ids) ? post.linked_product_ids.length : 0

                return (
                  <div
                    key={post.id || idx}
                    className={cn(
                      'p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors',
                      post.is_hidden ? 'bg-sand/30 opacity-70' : 'hover:bg-sand/10'
                    )}
                  >
                    {/* Media Thumbnail & Meta Info */}
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <div className="relative h-16 w-16 sm:h-18 sm:w-18 shrink-0 bg-sand/50 border border-ink/15 overflow-hidden">
                        <img
                          src={post.thumbnail_url || post.media_url}
                          alt={post.caption || 'Manual Post'}
                          className="h-full w-full object-cover"
                        />
                        {post.is_video && (
                          <div className="absolute bottom-1 right-1 bg-black/60 text-white px-1 py-0.5 text-[8px] rounded-xs">
                            <Video className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-ink">
                            #{post.display_order || idx + 1}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-sand text-cocoa border border-ink/10">
                            MANUAL
                          </span>
                          {post.is_hidden ? (
                            <span className="text-[10px] uppercase font-bold text-coral bg-coral-light/20 px-1.5 py-0.5 border border-coral/30">
                              Hidden
                            </span>
                          ) : idx < (settings.posts_to_display || 6) ? (
                            <span className="text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 border border-emerald-300">
                              Live on Storefront
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase text-cocoa-light bg-sand/40 px-1.5 py-0.5">
                              In Queue
                            </span>
                          )}
                          {linkedCount > 0 && (
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-gold/15 text-gold-dark border border-gold/30 flex items-center gap-1">
                              <ShoppingBag className="h-2.5 w-2.5" />
                              <span>{linkedCount} Linked Product(s)</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-ink/80 line-clamp-2 leading-snug font-sans">
                          {post.caption || <span className="italic text-cocoa-light">No caption provided.</span>}
                        </p>

                        <div className="flex items-center gap-3 text-[10px] text-cocoa-light font-mono">
                          {post.post_date && (
                            <span>{new Date(post.post_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          )}
                          {post.permalink && (
                            <a
                              href={post.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gold-dark hover:underline flex items-center gap-0.5 font-sans"
                            >
                              <span>{post.permalink}</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Order Controls & Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <div className="flex items-center border border-ink/15 bg-sand/30">
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => handleMovePost(idx, 'up', manualPosts, setManualPosts)}
                          aria-label="Move post up"
                          className="p-1.5 hover:bg-sand text-cocoa hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <div className="h-4 w-px bg-ink/15" />
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => handleMovePost(idx, 'down', manualPosts, setManualPosts)}
                          aria-label="Move post down"
                          className="p-1.5 hover:bg-sand text-cocoa hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(post)}
                        className="rounded-none text-xs flex items-center gap-1 border-ink/15"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleVisibility(post, manualPosts, setManualPosts)}
                        className={cn(
                          'rounded-none text-xs flex items-center gap-1',
                          post.is_hidden
                            ? 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                            : 'border-ink/15 text-cocoa hover:text-coral hover:border-coral/40'
                        )}
                      >
                        {post.is_hidden ? (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Show</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>Hide</span>
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPostToDelete(post)}
                        className="rounded-none text-xs text-coral hover:bg-coral-light/20 border-coral/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: LIVE META API TAB ── */}
      {activeTab === 'meta' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-paper p-3 border border-ink/10">
            <div className="text-xs text-cocoa">
              <p>
                Connected to <span className="font-bold text-ink">@{EXPECTED_HANDLE}</span> via Meta Graph API.
                Status: <span className="font-semibold uppercase">{connectionStatus}</span>
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleRefreshMeta}
              disabled={refreshing || loading}
              className="rounded-none bg-sand border border-ink/15 text-ink hover:bg-gold-light/40 text-xs flex items-center gap-2 font-medium"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Fetching live posts…' : 'Refresh Instagram'}
            </Button>
          </div>

          {connectionStatus !== 'CONNECTED' && (
            <div className="bg-amber-50 border border-amber-200/80 p-4 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <p className="font-semibold">Live Instagram is not connected yet.</p>
                <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
                  Meta Developer setup is currently in progress. You can use <code className="font-bold">Manual Instagram Posts</code> mode to curate the storefront lookbook immediately.
                </p>
              </div>
            </div>
          )}

          {metaPosts.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-ink/15 rounded-sm bg-sand/15 p-8 space-y-2">
              <Instagram className="h-8 w-8 text-gold-dark/60 mx-auto" />
              <p className="text-sm font-semibold text-ink">No Meta API posts cached.</p>
              <p className="text-xs text-cocoa">
                Configure Meta credentials and click &ldquo;Refresh Instagram&rdquo; when available.
              </p>
            </div>
          ) : (
            <div className="border border-ink/10 bg-paper divide-y divide-ink/10">
              {metaPosts.map((post, idx) => (
                <div
                  key={post.id || idx}
                  className="p-3 sm:p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-14 w-14 shrink-0 bg-sand/50 overflow-hidden border border-ink/10">
                      <img
                        src={post.thumbnail_url || post.media_url}
                        alt="Meta post"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">#{post.display_order || idx + 1}</span>
                        <span className="text-[10px] font-mono px-1 py-0.5 bg-sand text-cocoa">META_API</span>
                      </div>
                      <p className="text-xs text-ink/80 line-clamp-1">{post.caption || 'No caption'}</p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleVisibility(post, metaPosts, setMetaPosts)}
                    className="rounded-none text-xs"
                  >
                    {post.is_hidden ? 'Show' : 'Hide'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: CONFIGURATION SETTINGS ── */}
      {activeTab === 'settings' && (
        <div className="border border-ink/10 bg-paper p-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                Instagram Handle
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-cocoa-light font-mono text-xs">@</span>
                <Input
                  value={EXPECTED_HANDLE}
                  disabled
                  className="pl-7 rounded-none bg-sand/30 border-ink/20 font-mono text-xs text-ink"
                />
              </div>
              <p className="text-[11px] text-cocoa-light">
                Connected exclusively to <code className="font-mono font-bold">@{EXPECTED_HANDLE}</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                Posts To Display on Storefront
              </Label>
              <Input
                type="number"
                min="3"
                max="12"
                value={settings.posts_to_display || 6}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    posts_to_display: Math.max(3, Math.min(12, Number(e.target.value) || 6)),
                  }))
                }
                className="rounded-none bg-sand/10 border-ink/20 font-mono text-xs"
              />
              <p className="text-[11px] text-cocoa-light">
                Number of curated posts visible in the homepage lookbook (3 to 12).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-ink/10 pt-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                Feed Mode
              </Label>
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="feed_mode"
                    value="latest"
                    checked={settings.feed_mode !== 'editorial'}
                    onChange={() => setSettings((s) => ({ ...s, feed_mode: 'latest' }))}
                    className="accent-gold-dark"
                  />
                  <span>Latest Posts (Chronological)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="feed_mode"
                    value="editorial"
                    checked={settings.feed_mode === 'editorial'}
                    onChange={() => setSettings((s) => ({ ...s, feed_mode: 'editorial' }))}
                    className="accent-gold-dark"
                  />
                  <span>Editorial Selection (Manual Order)</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                Auto-Refresh Interval (Minutes)
              </Label>
              <Input
                type="number"
                min="5"
                max="1440"
                value={settings.refresh_interval_minutes || 30}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    refresh_interval_minutes: Math.max(5, Math.min(1440, Number(e.target.value) || 30)),
                  }))
                }
                className="rounded-none bg-sand/10 border-ink/20 font-mono text-xs"
              />
              <p className="text-[11px] text-cocoa-light">
                Cache duration before requesting updated media from Meta API (when in Meta mode).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-ink/10 pt-5 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.open_in_new_tab !== false}
                onChange={(e) => setSettings((s) => ({ ...s, open_in_new_tab: e.target.checked }))}
                className="accent-gold-dark h-4 w-4"
              />
              <span>Open posts in new tab</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enable_videos !== false}
                onChange={(e) => setSettings((s) => ({ ...s, enable_videos: e.target.checked }))}
                className="accent-gold-dark h-4 w-4"
              />
              <span>Include video / Reel posts</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(settings.show_captions)}
                onChange={(e) => setSettings((s) => ({ ...s, show_captions: e.target.checked }))}
                className="accent-gold-dark h-4 w-4"
              />
              <span>Show captions on hover</span>
            </label>
          </div>

          <div className="flex justify-end pt-4 border-t border-ink/10">
            <Button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              className="rounded-none bg-ink text-cream hover:bg-terracotta text-xs uppercase tracking-wider font-semibold px-6"
            >
              {saving ? 'Saving Settings…' : 'Save Feed Settings'}
            </Button>
          </div>
        </div>
      )}

      {/* ── TAB 4: STOREFRONT PREVIEW (Desktop & Mobile) ── */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          <div className="p-3 bg-sand/30 border border-ink/10 text-xs text-cocoa flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">Active Source Preview:</span>
              <span className="font-bold uppercase font-mono px-2 py-0.5 bg-sand text-ink border border-ink/10">
                {settings.source === 'manual' ? 'Manual Posts' : 'Live Meta API'}
              </span>
              <span>({visiblePreviewPosts.length} posts visible)</span>
            </div>

            {/* Device Switcher */}
            <div className="flex items-center gap-1 border border-ink/15 bg-paper p-0.5">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={cn(
                  'px-2.5 py-1 text-xs flex items-center gap-1 transition-colors',
                  previewDevice === 'desktop' ? 'bg-ink text-cream' : 'text-cocoa hover:text-ink'
                )}
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={cn(
                  'px-2.5 py-1 text-xs flex items-center gap-1 transition-colors',
                  previewDevice === 'mobile' ? 'bg-ink text-cream' : 'text-cocoa hover:text-ink'
                )}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Mobile</span>
              </button>
            </div>
          </div>

          {visiblePreviewPosts.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-ink/15 rounded-sm bg-sand/15 p-8 space-y-3">
              <Instagram className="h-8 w-8 text-gold-dark/60 mx-auto" />
              <p className="text-sm font-semibold text-ink">No active posts to preview for {settings.source === 'manual' ? 'Manual Mode' : 'Meta Mode'}.</p>
              <p className="text-xs text-cocoa max-w-sm mx-auto">
                Add manual posts or configure Meta API credentials to see the lookbook live preview.
              </p>
            </div>
          ) : (
            <div className={cn(
              'border border-ink/15 bg-paper mx-auto transition-all',
              previewDevice === 'mobile' ? 'max-w-[400px] p-4 shadow-xl' : 'w-full p-6 sm:p-8'
            )}>
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-cocoa/70 font-sans font-semibold mb-1">
                    The Thretha Look
                  </p>
                  <h3 className={cn(
                    'font-display text-ink font-normal',
                    previewDevice === 'mobile' ? 'text-xl' : 'text-2xl sm:text-3xl'
                  )}>
                    Follow The Journey
                  </h3>
                </div>

                <div className="inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold uppercase tracking-[0.18em] text-ink border-b border-ink/30 pb-0.5">
                  <Instagram className="h-3.5 w-3.5 text-gold-dark" />
                  <span>@{EXPECTED_HANDLE}</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </div>
              </div>

              <div className={cn(
                'grid gap-2.5 auto-rows-[minmax(100px,1fr)]',
                previewDevice === 'mobile'
                  ? 'grid-cols-2'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1.3fr]'
              )}>
                {visiblePreviewPosts.map((post, i) => {
                  const isTall = previewDevice === 'desktop' && (i === 0 || i === 3)
                  const hasProducts = Array.isArray(post.linked_products) && post.linked_products.length > 0

                  return (
                    <div
                      key={post.id || i}
                      className={cn(
                        'group relative overflow-hidden bg-sand/40 border border-ink/10 block aspect-square',
                        isTall ? 'lg:row-span-2 lg:aspect-auto' : ''
                      )}
                    >
                      <img
                        src={post.thumbnail_url || post.media_url}
                        alt={post.caption || 'Lookbook piece'}
                        className="absolute inset-0 h-full w-full object-cover object-center"
                      />
                      {post.is_video && (
                        <div className="absolute top-2.5 right-2.5 bg-black/40 text-white p-1 rounded-full pointer-events-none">
                          <Video className="h-3 w-3" />
                        </div>
                      )}
                      {hasProducts && (
                        <div className="absolute bottom-2 left-2 z-10">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ink/80 text-cream text-[9px] uppercase font-semibold">
                            <ShoppingBag className="h-2.5 w-2.5 text-gold-light" />
                            <span>Shop Look</span>
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-ink/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center text-cream p-3 text-center">
                        <Instagram className="h-5 w-5 text-gold-light mb-1" />
                        <span className="text-[9px] uppercase tracking-widest font-semibold text-cream">
                          {post.is_video ? 'Watch on Instagram' : 'View on Instagram'}
                        </span>
                        {settings.show_captions && post.caption && (
                          <p className="text-[10px] line-clamp-2 mt-1 text-cream/90 font-light max-w-[180px]">
                            {post.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4. ADD / EDIT MANUAL POST MODAL ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="relative w-full max-w-xl bg-paper border border-ink/15 shadow-2xl p-6 sm:p-8 space-y-5 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Instagram className="h-5 w-5 text-gold-dark" />
                <h3 className="font-display text-xl text-ink">
                  {editingPostId ? 'Edit Manual Instagram Post' : 'Add Manual Instagram Post'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-cocoa hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualPost} className="space-y-4 text-xs">
              {/* Field 1: Instagram Post URL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-ink flex items-center gap-1">
                  <span>Instagram Post URL</span>
                  <span className="text-coral">*</span>
                </Label>
                <Input
                  required
                  placeholder="https://www.instagram.com/p/DBxyz123/ or /reel/..."
                  value={formData.permalink}
                  onChange={(e) => setFormData({ ...formData, permalink: e.target.value })}
                  className="rounded-none bg-sand/10 border-ink/20 font-mono text-xs"
                />
                <p className="text-[11px] text-cocoa-light">
                  Direct Instagram post or Reel link destination. Must begin with <code className="font-mono">https://www.instagram.com/p/</code> or <code className="font-mono">/reel/</code>.
                </p>
              </div>

              {/* Field 2: Image Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-ink flex items-center gap-1">
                  <span>Post Image</span>
                  <span className="text-coral">*</span>
                </Label>

                <div className="flex items-center gap-4">
                  {formData.media_url ? (
                    <div className="relative h-20 w-20 shrink-0 bg-sand/40 border border-ink/15 overflow-hidden">
                      <img
                        src={formData.media_url}
                        alt="Uploaded preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-20 w-20 shrink-0 bg-sand/30 border border-dashed border-ink/20 flex flex-col items-center justify-center text-cocoa-light">
                      <ImageIcon className="h-6 w-6 opacity-60" />
                      <span className="text-[9px] mt-1">No Image</span>
                    </div>
                  )}

                  <div className="space-y-2 flex-1">
                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-sand border border-ink/15 text-ink hover:bg-gold-light/40 cursor-pointer font-medium">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploadingImage ? 'Uploading Image…' : 'Upload Image File'}</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-cocoa-light font-mono">Or paste URL:</span>
                      <Input
                        placeholder="/api/media/file/... or https://..."
                        value={formData.media_url}
                        onChange={(e) => setFormData({ ...formData, media_url: e.target.value, thumbnail_url: e.target.value })}
                        className="rounded-none bg-sand/10 border-ink/20 font-mono text-[11px] h-7"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Field 3: Caption */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                  Caption / Description
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Kasavu weaves and golden embroidery from the atelier..."
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  className="rounded-none bg-sand/10 border-ink/20 text-xs font-sans"
                />
              </div>

              {/* Field 4 & 5: Post Date & Display Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                    Post Date
                  </Label>
                  <Input
                    type="date"
                    value={formData.post_date}
                    onChange={(e) => setFormData({ ...formData, post_date: e.target.value })}
                    className="rounded-none bg-sand/10 border-ink/20 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-ink">
                    Display Order
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) || 1 })}
                    className="rounded-none bg-sand/10 border-ink/20 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Field 6 & 7: Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-ink/10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!formData.is_hidden}
                    onChange={(e) => setFormData({ ...formData, is_hidden: !e.target.checked })}
                    className="accent-gold-dark h-4 w-4"
                  />
                  <span>Show on storefront</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.open_in_new_tab}
                    onChange={(e) => setFormData({ ...formData, open_in_new_tab: e.target.checked })}
                    className="accent-gold-dark h-4 w-4"
                  />
                  <span>Open Instagram in new tab</span>
                </label>
              </div>

              {/* Field 8: Link Products (Shop This Look) */}
              <div className="space-y-2 pt-3 border-t border-ink/10">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-ink flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5 text-gold-dark" />
                    <span>Link Products (Shop This Look)</span>
                  </Label>
                  <span className="text-[11px] text-cocoa font-mono">
                    {formData.linked_product_ids.length} selected
                  </span>
                </div>

                {/* Selected Products Badges */}
                {formData.linked_product_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-sand/30 border border-ink/10">
                    {formData.linked_product_ids.map((id) => {
                      const prod = availableProducts.find((p) => String(p.id) === String(id))
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-paper border border-ink/15 text-xs text-ink shadow-2xs"
                        >
                          <span>{prod?.name || id}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                linked_product_ids: formData.linked_product_ids.filter((x) => x !== id),
                              })
                            }
                            className="text-cocoa hover:text-coral"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Product Dropdown Selector */}
                <select
                  onChange={(e) => {
                    const val = e.target.value
                    if (val && !formData.linked_product_ids.includes(val)) {
                      setFormData({
                        ...formData,
                        linked_product_ids: [...formData.linked_product_ids, val],
                      })
                    }
                    e.target.value = ''
                  }}
                  className="w-full h-9 px-3 bg-sand/10 border border-ink/20 text-xs font-sans outline-hidden"
                >
                  <option value="">+ Select a store product to link…</option>
                  {availableProducts
                    .filter((p) => !formData.linked_product_ids.includes(String(p.id)))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — ₹{p.price}
                      </option>
                    ))}
                </select>
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-ink/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-none text-xs"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={saving || uploadingImage}
                  className="rounded-none bg-ink text-cream hover:bg-terracotta text-xs uppercase tracking-wider font-semibold px-6"
                >
                  {saving ? 'Saving…' : editingPostId ? 'Update Post' : 'Save Post'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. DELETE CONFIRMATION MODAL ── */}
      {postToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setPostToDelete(null)}
        >
          <div
            className="relative w-full max-w-sm bg-paper border border-ink/15 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-coral">
              <Trash2 className="h-5 w-5" />
              <h3 className="font-display text-lg text-ink">Delete Instagram Post?</h3>
            </div>

            <p className="text-xs text-cocoa leading-relaxed">
              Are you sure you want to permanently delete this manual Instagram post? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPostToDelete(null)}
                className="rounded-none text-xs"
              >
                Cancel
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleDeleteManualPost(postToDelete.id)}
                className="rounded-none bg-coral text-white hover:bg-coral/90 text-xs font-semibold"
              >
                Delete Post
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
