'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Upload } from 'lucide-react'
import { api, auth } from '@/lib/tc'
import { uploadMediaFile } from '@/lib/mediaUpload'
import { broadcastStorefrontSettingsChanged } from '@/lib/storefrontEvents'
import { Switch } from '@/components/ui/switch'

function slugFromName(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54).replace(/-$/g, '')
}

export default function OccasionsManager() {
  const token = auth.get()
  const fileRef = useRef(null)
  const [occasions, setOccasions] = useState([])
  const [products, setProducts] = useState([])
  const [savedOrder, setSavedOrder] = useState('')
  const [draft, setDraft] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    api('/admin/occasions', { token })
      .then((result) => {
        if (!active) return
        setOccasions(result.occasions || [])
        setProducts(result.products || [])
        setSavedOrder((result.occasions || []).map((item) => item.slug).join('|'))
      })
      .catch((cause) => { if (active) setError(cause.message || 'Could not load occasions.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const saveList = async (next) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await api('/admin/occasions', { method: 'PUT', token, body: { occasions: next } })
      setOccasions(result.occasions || [])
      setSavedOrder((result.occasions || []).map((item) => item.slug).join('|'))
      broadcastStorefrontSettingsChanged('homepage')
      setMessage('Shop by Occasion saved.')
      return true
    } catch (cause) {
      setError(cause.message || 'Could not save occasions.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const openNew = () => {
    setError('')
    setProductSearch('')
    setDraft({ slug: '', name: '', image: null, active: true, deleted: false, product_ids: [] })
  }

  const openEdit = (item) => {
    setError('')
    setProductSearch('')
    setDraft({ ...item, product_ids: [...item.product_ids] })
  }

  const upload = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return }
    setError('')
    setUploading(true)
    setProgress(0)
    try {
      const result = await uploadMediaFile(file, { token, folder: 'occasions', onProgress: setProgress })
      if (result.type !== 'image') throw new Error('Choose an image file.')
      setDraft((current) => current ? { ...current, image: result.url } : current)
    } catch (cause) {
      setError(cause.message || 'Cover upload failed. The previous image is still saved.')
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const saveDraft = async () => {
    if (!draft || saving || uploading) return
    const name = draft.name.trim()
    if (!name || name.length > 50) { setError('Enter a name of up to 50 characters.'); return }
    if (!draft.slug && !draft.image) { setError('Upload a cover image before creating an occasion.'); return }
    let slug = draft.slug
    if (!slug) {
      const base = slugFromName(name)
      if (!base) { setError('Use a name that can form a valid URL key.'); return }
      slug = base
      let suffix = 2
      while (occasions.some((item) => item.slug === slug)) slug = `${base}-${suffix++}`
    }
    const item = { ...draft, id: slug, slug, name }
    const next = draft.slug
      ? occasions.map((occasion) => occasion.slug === slug ? item : occasion)
      : [...occasions, item]
    if (await saveList(next)) setDraft(null)
  }

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?\n\nThis removes the occasion from the homepage. Products assigned to it will NOT be deleted.`)) return
    await saveList([
      ...occasions.filter((occasion) => occasion.slug !== item.slug),
      { ...item, active: false, deleted: true },
    ])
  }

  const move = (slug, direction) => {
    const visible = occasions.filter((item) => !item.deleted)
    const index = visible.findIndex((item) => item.slug === slug)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= visible.length) return
    setOccasions((current) => {
      const next = current.filter((item) => !item.deleted)
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return [...next, ...current.filter((item) => item.deleted)]
    })
    setMessage('')
  }

  const shown = occasions.filter((item) => !item.deleted)
  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.sku || ''}`.toLowerCase().includes(productSearch.toLowerCase()))
  const orderChanged = occasions.map((item) => item.slug).join('|') !== savedOrder

  return <div className="max-w-4xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-5">
      <div>
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold-dark">Storefront Configuration</span>
        <h1 className="mt-1 font-display text-4xl text-ink">Shop by Occasion</h1>
        <p className="mt-2 text-sm text-cocoa">Create collections, choose their covers and products, and set their order.</p>
      </div>
      <button type="button" onClick={openNew} disabled={loading || saving || uploading} className="flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-semibold uppercase tracking-wider text-cream disabled:opacity-50"><Plus size={16} /> Add Occasion</button>
    </div>

    {error && <p role="alert" className="border border-coral/30 bg-coral-light/15 p-3 text-sm text-coral">{error}</p>}
    {message && <p role="status" className="text-sm text-cocoa">{message}</p>}
    {loading ? <p className="text-sm text-cocoa">Loading occasions…</p> : <>
      {!shown.some((item) => item.active) && <p className="border border-ink/10 bg-cream p-6 text-sm text-cocoa">No active occasions are shown on the homepage. Add or activate one to show the section.</p>}
      <div className="space-y-2">
        {shown.map((item) => {
          const index = shown.findIndex((occasion) => occasion.slug === item.slug)
          return <div key={item.slug} className="flex min-w-0 flex-wrap items-center gap-3 border border-ink/10 bg-cream p-3 sm:flex-nowrap">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-sand/30">{item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0 flex-1"><p className="truncate font-display text-xl text-ink">{item.name}</p><p className="text-xs text-cocoa">{item.active ? 'Active' : 'Inactive'} · {item.product_ids.length} products</p></div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Move ${item.name} up`} disabled={saving || index === 0} onClick={() => move(item.slug, -1)} className="grid h-10 w-10 place-items-center border border-ink/10 text-ink disabled:opacity-30"><ArrowUp size={16} /></button>
              <button type="button" aria-label={`Move ${item.name} down`} disabled={saving || index === shown.length - 1} onClick={() => move(item.slug, 1)} className="grid h-10 w-10 place-items-center border border-ink/10 text-ink disabled:opacity-30"><ArrowDown size={16} /></button>
              <button type="button" disabled={saving} onClick={() => openEdit(item)} className="min-h-10 px-2 text-xs font-semibold uppercase text-ink disabled:opacity-50">Edit</button>
              <button type="button" disabled={saving} onClick={() => remove(item)} className="min-h-10 px-2 text-xs font-semibold uppercase text-coral disabled:opacity-50">Delete</button>
            </div>
          </div>
        })}
      </div>
      <button type="button" disabled={!orderChanged || saving} onClick={() => saveList(occasions)} className="min-h-11 border border-ink/20 px-5 text-xs font-semibold uppercase tracking-wider text-ink disabled:opacity-40">{saving ? 'Saving…' : 'Save order'}</button>
    </>}

    {draft && <div className="space-y-5 border border-ink/15 bg-cream p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3"><h2 className="font-display text-2xl text-ink">{draft.slug ? `Edit ${draft.name}` : 'Create Occasion'}</h2><button type="button" onClick={() => setDraft(null)} disabled={uploading || saving} className="text-xs uppercase text-cocoa">Cancel</button></div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink">Name<input value={draft.name} maxLength={50} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 block min-h-11 w-full border border-ink/20 bg-paper px-3 text-sm font-normal normal-case tracking-normal" placeholder="e.g. College Wear" /></label>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink">Cover Image</p>
        {draft.image && <img src={draft.image} alt={`${draft.name || 'Occasion'} cover preview`} className="my-3 h-28 w-28 rounded-full object-cover" />}
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
        <button type="button" disabled={uploading || saving} onClick={() => fileRef.current?.click()} className="mt-2 flex min-h-11 items-center gap-2 border border-ink/20 px-4 text-xs font-semibold uppercase text-ink disabled:opacity-50"><Upload size={15} /> {uploading ? `Uploading ${progress}%` : draft.image ? 'Replace image' : 'Upload image'}</button>
        <p className="mt-2 text-xs text-cocoa">Images upload directly to Cloudinary. The current cover stays in place until a replacement succeeds.</p>
      </div>
      <div className="flex items-center gap-3"><Switch checked={draft.active} onCheckedChange={(active) => setDraft((current) => ({ ...current, active }))} aria-label="Occasion active" /><span className="text-sm text-ink">{draft.active ? 'Active' : 'Inactive'}</span></div>
      <div className="space-y-3 border-t border-ink/10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink">Products ({draft.product_ids.length} selected)</p>
        <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products by name or SKU" className="min-h-11 w-full border border-ink/20 bg-paper px-3 text-sm" />
        <div className="max-h-64 space-y-1 overflow-y-auto border border-ink/10 p-2">
          {filteredProducts.map((product) => <label key={product.id} className="flex min-h-10 items-center gap-2 px-2 text-sm text-ink hover:bg-sand/20"><input type="checkbox" checked={draft.product_ids.includes(product.id)} onChange={(event) => setDraft((current) => ({ ...current, product_ids: event.target.checked ? [...current.product_ids, product.id] : current.product_ids.filter((id) => id !== product.id) }))} /><span className="min-w-0 flex-1 truncate">{product.name}</span><span className="shrink-0 text-xs text-cocoa">{product.sku || ''}</span></label>)}
          {!filteredProducts.length && <p className="p-2 text-xs text-cocoa">No matching products.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-3"><button type="button" onClick={() => setDraft(null)} disabled={saving || uploading} className="min-h-11 px-4 text-xs uppercase text-cocoa">Cancel</button><button type="button" onClick={saveDraft} disabled={saving || uploading} className="min-h-11 bg-ink px-5 text-xs font-semibold uppercase text-cream disabled:opacity-50">{saving ? 'Saving…' : draft.slug ? 'Save occasion' : 'Create'}</button></div>
    </div>}
  </div>
}
