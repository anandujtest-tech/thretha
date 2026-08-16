'use client'

import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, Package, FolderTree, ShoppingBag, Settings as SettingsIcon,
LogOut, Plus, Trash2, Copy, Upload, X, Star, Sparkles, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api, inr, auth } from '@/lib/tc'

const STATUSES = ['NEW', 'WHATSAPP CONTACTED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED']
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size']

/* --------- Media uploader --------- */
function Uploader({ token, label = 'Upload media', multiple = false, onDone }) {
  const ref = useRef()
  const [busy, setBusy] = useState(false)
  const handle = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(true)
    for (const file of files) {
      const fd = new FormData(); fd.append('file', file)
      try { const res = await api('/admin/media', { method: 'POST', body: fd, token }); onDone(res) } catch (err) { alert(err.message) }
    }
    setBusy(false); if (ref.current) ref.current.value = ''
  }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*,video/*" multiple={multiple} onChange={handle} className="hidden" />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()} className="rounded-none">
        <Upload className="mr-2 h-4 w-4" />{busy ? 'Uploading…' : label}
      </Button>
    </div>
  )
}

function AField({ label, value, onChange, ...rest }) {
  return (
    <div>
      <Label className="text-xs text-ink/60">{label}</Label>
      <Input value={value ?? ''} onChange={onChange} className="mt-1 rounded-none" {...rest} />
    </div>
  )
}

/* --------- Login --------- */
function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@threthacouture.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true)
    try { const res = await api('/admin/login', { method: 'POST', body: { email, password } }); auth.set(res.token); onLogin() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl leading-none text-ink">THRETHA<br />COUTURE</h1>
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-brown">Admin Panel</p>
        </div>
        <div className="space-y-4 border border-ink/10 bg-cream p-6 paper-card">
          <div><Label className="text-xs text-ink/60">Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 rounded-none" /></div>
          <div><Label className="text-xs text-ink/60">Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 rounded-none" /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy} className="w-full rounded-none bg-ink py-6 text-xs uppercase tracking-[0.25em] text-cream">{busy ? 'Signing in…' : 'Sign In'}</Button>
        </div>
      </form>
    </div>
  )
}
/* --------- Change Password --------- */
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
        body: {
          currentPassword,
          newPassword,
        },
      })

      setMessage('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          <h2 className="font-display text-3xl text-ink">
            Change Password
          </h2>
        </div>

        <p className="mt-2 text-sm text-brown">
          Update the password used to access the admin panel.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 border border-ink/10 bg-cream p-6 paper-card"
      >
        <div>
          <Label className="text-xs text-ink/60">
            Current Password
          </Label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 rounded-none"
            autoComplete="current-password"
            required
          />
        </div>

        <div>
          <Label className="text-xs text-ink/60">
            New Password
          </Label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 rounded-none"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="mt-1 text-xs text-brown">
            Minimum 8 characters.
          </p>
        </div>

        <div>
          <Label className="text-xs text-ink/60">
            Confirm New Password
          </Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 rounded-none"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">
            {error}
          </p>
        )}

        {message && (
          <p className="text-sm text-green-700">
            {message}
          </p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="rounded-none bg-ink text-cream"
        >
          {busy ? 'Changing…' : 'Change Password'}
        </Button>
      </form>
    </div>
  )
}
/* --------- Dashboard --------- */
function Dashboard() {
  const token = auth.get()
  const [s, setS] = useState(null)
  useEffect(() => { api('/admin/stats', { token }).then(setS).catch(() => {}) }, [])
  if (!s) return <p className="text-brown">Loading…</p>
  const cards = [['Products', s.products], ['Categories', s.categories], ['Orders', s.orders], ['Low Stock', s.low_stock_count]]
  return (
    <div>
      <h1 className="font-display text-4xl text-ink">Good morning ✦</h1>
      <p className="text-brown">Thretha Couture</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map(([l, v]) => (
          <div key={l} className="border border-ink/10 bg-cream p-5 paper-card">
            <p className="text-3xl font-display text-ink">{v}</p>
            <p className="text-xs uppercase tracking-widest text-ink/50">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="border border-ink/10 bg-cream p-5">
          <h2 className="mb-3 font-display text-2xl">Recent Orders</h2>
          {s.recent_orders.length === 0 ? <p className="text-sm text-ink/50">No orders yet.</p> : s.recent_orders.map((o) => (
            <div key={o.id} className="flex justify-between border-b border-ink/5 py-2 text-sm">
              <span>{o.order_number} · {o.customer?.name}</span><span className="text-ink/60">{o.status}</span>
            </div>
          ))}
        </div>
        <div className="border border-ink/10 bg-cream p-5">
          <h2 className="mb-3 font-display text-2xl">Low Stock</h2>
          {s.low_stock.length === 0 ? <p className="text-sm text-ink/50">All good.</p> : s.low_stock.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-ink/5 py-2 text-sm">
              <span>{p.name}</span><span className={cn(p.stock === 0 ? 'text-destructive' : 'text-rose')}>{p.stock} left</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------- Product editor --------- */
function ProductEditor({ token, product, categories, onClose, onSaved }) {
  const [f, setF] = useState(() => product || {
    name: '', sku: '', category_id: categories[0]?.id || '', description: '',
    price: '', discount_price: '', fabric: '', colour: '', material: '', pattern: '', care_instructions: '',
    stock: 0, sizes: [], media: [], featured: false, new_arrival: false, best_seller: false, active: true,
  })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const [busy, setBusy] = useState(false)

  const toggleSize = (size) => {
    const exists = (f.sizes || []).find((s) => s.size === size)
    if (exists) set('sizes', f.sizes.filter((s) => s.size !== size))
    else set('sizes', [...(f.sizes || []), { size, available: true, stock: 1 }])
  }
  const addMedia = (m) => set('media', [...(f.media || []), { ...m, id: crypto.randomUUID(), is_primary: (f.media || []).length === 0, display_order: (f.media || []).length }])
  const removeMedia = (id) => set('media', f.media.filter((m) => m.id !== id))
  const makePrimary = (id) => set('media', f.media.map((m) => ({ ...m, is_primary: m.id === id })))

  const save = async () => {
    setBusy(true)
    try {
      if (product?.id) await api(`/admin/products/${product.id}`, { method: 'PUT', body: f, token })
      else await api('/admin/products', { method: 'POST', body: f, token })
      onSaved()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  const setV = (k) => (e) => set(k, e.target.value)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-paper">
        <DialogHeader><DialogTitle className="font-display text-3xl">{product?.id ? 'Edit Product' : 'Add Product'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <AField label="Product name" value={f.name} onChange={setV('name')} />
            <AField label="Product code" value={f.sku} onChange={setV('sku')} placeholder="TC-SR-000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-ink/60">Category</Label>
              <Select value={f.category_id || ''} onValueChange={(v) => set('category_id', v)}>
                <SelectTrigger className="mt-1 rounded-none"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <AField label="Stock quantity" value={f.stock} onChange={setV('stock')} type="number" />
          </div>
          <div><Label className="text-xs text-ink/60">Description</Label><Textarea value={f.description || ''} onChange={(e) => set('description', e.target.value)} className="mt-1 rounded-none" /></div>
          <div className="grid grid-cols-2 gap-3">
            <AField label="Price" value={f.price} onChange={setV('price')} type="number" />
            <AField label="Discount price (optional)" value={f.discount_price} onChange={setV('discount_price')} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AField label="Fabric" value={f.fabric} onChange={setV('fabric')} />
            <AField label="Colour" value={f.colour} onChange={setV('colour')} />
            <AField label="Material" value={f.material} onChange={setV('material')} />
            <AField label="Pattern" value={f.pattern} onChange={setV('pattern')} />
          </div>
          <div><Label className="text-xs text-ink/60">Care instructions</Label><Textarea value={f.care_instructions || ''} onChange={(e) => set('care_instructions', e.target.value)} className="mt-1 rounded-none" /></div>

          {/* Sizes */}
          <div>
            <Label className="text-xs text-ink/60">Sizes</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  className={cn('border px-3 py-1.5 text-sm', (f.sizes || []).find((x) => x.size === s) ? 'border-ink bg-ink text-cream' : 'border-ink/30')}>{s}</button>
              ))}
            </div>
          </div>

          {/* Media */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs text-ink/60">Media (images / video)</Label>
              <Uploader token={token} multiple label="Upload" onDone={addMedia} />
            </div>
            <div className="flex flex-wrap gap-3">
              {(f.media || []).map((m) => (
                <div key={m.id} className="relative h-24 w-20 overflow-hidden border border-ink/15">
                  {m.type === 'video' ? <video src={m.url} className="h-full w-full object-cover" /> : <img src={m.url} className="h-full w-full object-cover" />}
                  <button onClick={() => removeMedia(m.id)} className="absolute right-0 top-0 bg-ink/70 p-0.5 text-cream"><X className="h-3 w-3" /></button>
                  <button onClick={() => makePrimary(m.id)} className={cn('absolute bottom-0 left-0 bg-ink/70 p-0.5', m.is_primary ? 'text-rose' : 'text-cream')}><Star className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div className="flex flex-wrap gap-5">
            {[['active', 'Active'], ['new_arrival', 'New Arrival'], ['featured', 'Featured'], ['best_seller', 'Best Seller']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={!!f[k]} onCheckedChange={(v) => set(k, !!v)} /> {l}</label>
            ))}
          </div>

          <Button onClick={save} disabled={busy} className="w-full rounded-none bg-ink py-6 text-xs uppercase tracking-widest text-cream">{busy ? 'Saving…' : 'Save Product'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* --------- Products --------- */
function Products() {
  const token = auth.get()
  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const load = () => api('/admin/products', { token }).then(setList)
  useEffect(() => { load(); api('/admin/categories', { token }).then(setCats) }, [])
  const filtered = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()))

  const del = async (id) => { if (confirm('Delete this product?')) { await api(`/admin/products/${id}`, { method: 'DELETE', token }); load() } }
  const dup = async (id) => { await api(`/admin/products/${id}/duplicate`, { method: 'POST', token }); load() }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-4xl text-ink">Products</h1>
        <Button onClick={() => setEditing({})} className="rounded-none bg-ink text-cream"><Plus className="mr-1 h-4 w-4" /> Add Product</Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="mb-4 max-w-xs rounded-none" />
      <div className="overflow-x-auto border border-ink/10 bg-cream">
        <table className="w-full text-sm">
          <thead className="bg-beige/50 text-left text-xs uppercase tracking-wider text-ink/60">
            <tr>{['Image', 'Product', 'Category', 'Price', 'Stock', 'Status', ''].map((h) => <th key={h} className="p-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-ink/5">
                <td className="p-3"><img src={p.media?.[0]?.url} className="h-12 w-10 object-cover" /></td>
                <td className="p-3">{p.name}<div className="text-xs text-ink/40">{p.sku}</div></td>
                <td className="p-3">{p.category_name}</td>
                <td className="p-3">{inr(p.discount_price || p.price)}</td>
                <td className="p-3">{p.stock}</td>
                <td className="p-3">{p.stock <= 0 ? <span className="text-destructive">Sold Out</span> : p.active ? 'Active' : 'Draft'}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(p)} className="text-brown underline">Edit</button>
                    <button onClick={() => dup(p.id)} title="Duplicate"><Copy className="h-4 w-4" /></button>
                    <button onClick={() => del(p.id)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ProductEditor token={token} product={editing.id ? editing : null} categories={cats} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

/* --------- Categories --------- */
function Categories() {
  const token = auth.get()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const load = () => api('/admin/categories', { token }).then(setList)
  useEffect(() => { load() }, [])
  const del = async (id) => { if (confirm('Delete category?')) { await api(`/admin/categories/${id}`, { method: 'DELETE', token }); load() } }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-4xl text-ink">Categories</h1>
        <Button onClick={() => setEditing({ name: '', description: '', image: '', active: true })} className="rounded-none bg-ink text-cream"><Plus className="mr-1 h-4 w-4" /> Add Category</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {list.map((c) => (
          <div key={c.id} className="border border-ink/10 bg-cream p-4">
            {c.image && <img src={c.image} className="mb-2 aspect-video w-full object-cover" />}
            <h3 className="font-display text-2xl">{c.name}</h3>
            <p className="text-sm text-ink/60">{c.description}</p>
            <div className="mt-2 flex gap-3 text-sm">
              <button onClick={() => setEditing(c)} className="text-brown underline">Edit</button>
              <button onClick={() => del(c.id)} className="text-destructive">Delete</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <CategoryEditor token={token} cat={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}
function CategoryEditor({ token, cat, onClose, onSaved }) {
  const [f, setF] = useState(cat)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const save = async () => {
    try {
      if (cat.id) await api(`/admin/categories/${cat.id}`, { method: 'PUT', body: f, token })
      else await api('/admin/categories', { method: 'POST', body: f, token })
      onSaved()
    } catch (e) { alert(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-paper">
        <DialogHeader><DialogTitle className="font-display text-3xl">{cat.id ? 'Edit' : 'Add'} Category</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs text-ink/60">Name</Label><Input value={f.name || ''} onChange={(e) => set('name', e.target.value)} className="mt-1 rounded-none" /></div>
          <div><Label className="text-xs text-ink/60">Description</Label><Textarea value={f.description || ''} onChange={(e) => set('description', e.target.value)} className="mt-1 rounded-none" /></div>
          <div className="flex items-center gap-3">
            {f.image && <img src={f.image} className="h-16 w-24 object-cover" />}
            <Uploader token={token} label="Upload image" onDone={(m) => set('image', m.url)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.active} onCheckedChange={(v) => set('active', !!v)} /> Active</label>
          <Button onClick={save} className="w-full rounded-none bg-ink py-5 text-xs uppercase tracking-widest text-cream">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* --------- Orders --------- */
function Orders() {
  const token = auth.get()
  const [list, setList] = useState([])
  const load = () => api('/admin/orders', { token }).then(setList)
  useEffect(() => { load() }, [])
  const setStatus = async (id, status) => { await api(`/admin/orders/${id}`, { method: 'PUT', body: { status }, token }); load() }
  return (
    <div>
      <h1 className="mb-4 font-display text-4xl text-ink">Orders</h1>
      {list.length === 0 ? <p className="text-ink/50">No orders yet.</p> : (
        <div className="space-y-3">
          {list.map((o) => (
            <div key={o.id} className="border border-ink/10 bg-cream p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl">{o.order_number}</p>
                  <p className="text-sm text-ink/60">{o.customer?.name} · {o.customer?.whatsapp || o.customer?.phone}</p>
                  <p className="text-sm">{o.items?.[0]?.product_name} · Size {o.items?.[0]?.size} · Qty {o.items?.[0]?.quantity}</p>
                  <p className="text-xs text-ink/40">{[o.customer?.house, o.customer?.city, o.customer?.district, o.customer?.state, o.customer?.pincode].filter(Boolean).join(', ')}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{inr(o.total)}</p>
                  <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                    <SelectTrigger className="mt-1 w-[190px] rounded-none"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------- Settings --------- */
/* --------- Settings --------- */
function SettingsPage() {
  const token = auth.get()
  const [f, setF] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api('/admin/settings', { token }).then(setF)
  }, [])

  if (!f) return <p className="text-brown">Loading…</p>

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const setHero = (k, v) =>
    setF((s) => ({
      ...s,
      hero: { ...s.hero, [k]: v },
    }))

  const setShip = (k, v) =>
    setF((s) => ({
      ...s,
      shipping: { ...s.shipping, [k]: v },
    }))

  const save = async () => {
    await api('/admin/settings', {
      method: 'PUT',
      body: f,
      token,
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const setV = (k) => (e) => set(k, e.target.value)

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="font-display text-4xl text-ink">Settings</h1>

      {/* Business */}
      <section className="border border-ink/10 bg-cream p-5">
        <h2 className="mb-4 font-display text-2xl">Business</h2>

        <div className="grid grid-cols-2 gap-3">
          <AField
            label="Brand Name"
            value={f.brand_name}
            onChange={setV('brand_name')}
          />

          <AField
            label="Instagram URL"
            value={f.instagram}
            onChange={setV('instagram')}
          />

          <AField
            label="WhatsApp Number (with country code)"
            value={f.whatsapp}
            onChange={setV('whatsapp')}
          />

          <AField
            label="Phone"
            value={f.phone}
            onChange={setV('phone')}
          />

          <AField
            label="Email"
            value={f.email}
            onChange={setV('email')}
          />

          <AField
            label="Business Address"
            value={f.address}
            onChange={setV('address')}
          />

          <div>
            <Label className="text-xs text-ink/60">
              Low stock threshold
            </Label>

            <Input
              type="number"
              value={f.low_stock_threshold ?? 3}
              onChange={(e) =>
                set('low_stock_threshold', Number(e.target.value))
              }
              className="mt-1 rounded-none"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-ink/60">Logo</span>

          {f.logo_url && (
            <img
              src={f.logo_url}
              className="h-10 object-contain"
            />
          )}

          <Uploader
            token={token}
            label="Upload logo"
            onDone={(m) => set('logo_url', m.url)}
          />

          {f.logo_url && (
            <button
              onClick={() => set('logo_url', '')}
              className="text-xs text-destructive"
            >
              Remove
            </button>
          )}
        </div>
      </section>

      {/* Homepage Hero */}
      <section className="border border-ink/10 bg-cream p-5">
        <h2 className="mb-4 font-display text-2xl">
          Homepage Hero
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs text-ink/60">
              Title
            </Label>

            <Input
              value={f.hero?.title || ''}
              onChange={(e) =>
                setHero('title', e.target.value)
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div className="col-span-2">
            <Label className="text-xs text-ink/60">
              Subtitle
            </Label>

            <Input
              value={f.hero?.subtitle || ''}
              onChange={(e) =>
                setHero('subtitle', e.target.value)
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div>
            <Label className="text-xs text-ink/60">
              Annotation
            </Label>

            <Input
              value={f.hero?.annotation || ''}
              onChange={(e) =>
                setHero('annotation', e.target.value)
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div>
            <Label className="text-xs text-ink/60">
              CTA text
            </Label>

            <Input
              value={f.hero?.cta || ''}
              onChange={(e) =>
                setHero('cta', e.target.value)
              }
              className="mt-1 rounded-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-ink/60">
              Hero images (carousel)
            </span>

            <Uploader
              token={token}
              multiple
              label="Add image"
              onDone={(m) =>
                setHero('images', [
                  ...(f.hero?.images || []),
                  m.url,
                ])
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(f.hero?.images || []).map((src, i) => (
              <div
                key={i}
                className="relative h-24 w-20 overflow-hidden border border-ink/15"
              >
                <img
                  src={src}
                  className="h-full w-full object-cover"
                />

                <button
                  onClick={() =>
                    setHero(
                      'images',
                      f.hero.images.filter(
                        (_, x) => x !== i
                      )
                    )
                  }
                  className="absolute right-0 top-0 bg-ink/70 p-0.5 text-cream"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand Story & Instagram */}
      <section className="border border-ink/10 bg-cream p-5">
        <h2 className="mb-4 font-display text-2xl">
          Brand Story & Instagram
        </h2>

        <Label className="text-xs text-ink/60">
          Brand story
        </Label>

        <Textarea
          value={f.brand_story || ''}
          onChange={(e) =>
            set('brand_story', e.target.value)
          }
          className="mt-1 rounded-none"
        />

        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-ink/60">
            Story image
          </span>

          {f.brand_story_image && (
            <img
              src={f.brand_story_image}
              className="h-16 w-12 object-cover"
            />
          )}

          <Uploader
            token={token}
            label="Upload"
            onDone={(m) =>
              set('brand_story_image', m.url)
            }
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-ink/60">
              Instagram gallery
            </span>

            <Uploader
              token={token}
              multiple
              label="Add image"
              onDone={(m) =>
                set('instagram_gallery', [
                  ...(f.instagram_gallery || []),
                  m.url,
                ])
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(f.instagram_gallery || []).map((src, i) => (
              <div
                key={i}
                className="relative h-20 w-20 overflow-hidden border border-ink/15"
              >
                <img
                  src={src}
                  className="h-full w-full object-cover"
                />

                <button
                  onClick={() =>
                    set(
                      'instagram_gallery',
                      f.instagram_gallery.filter(
                        (_, x) => x !== i
                      )
                    )
                  }
                  className="absolute right-0 top-0 bg-ink/70 p-0.5 text-cream"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Shipping */}
      <section className="border border-ink/10 bg-cream p-5">
        <h2 className="mb-4 font-display text-2xl">
          Shipping
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs text-ink/60">
              Delivery timeframe
            </Label>

            <Input
              value={f.shipping?.delivery_timeframe || ''}
              onChange={(e) =>
                setShip(
                  'delivery_timeframe',
                  e.target.value
                )
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div>
            <Label className="text-xs text-ink/60">
              Delivery charges
            </Label>

            <Input
              value={f.shipping?.delivery_charges || ''}
              onChange={(e) =>
                setShip(
                  'delivery_charges',
                  e.target.value
                )
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div>
            <Label className="text-xs text-ink/60">
              Free shipping threshold
            </Label>

            <Input
              type="number"
              value={f.shipping?.free_shipping_threshold || 0}
              onChange={(e) =>
                setShip(
                  'free_shipping_threshold',
                  Number(e.target.value)
                )
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div>
            <Label className="text-xs text-ink/60">
              Return policy
            </Label>

            <Input
              value={f.shipping?.return_policy || ''}
              onChange={(e) =>
                setShip(
                  'return_policy',
                  e.target.value
                )
              }
              className="mt-1 rounded-none"
            />
          </div>

          <div>
            <Label className="text-xs text-ink/60">
              Exchange policy
            </Label>

            <Input
              value={f.shipping?.exchange_policy || ''}
              onChange={(e) =>
                setShip(
                  'exchange_policy',
                  e.target.value
                )
              }
              className="mt-1 rounded-none"
            />
          </div>
        </div>
      </section>

      {/* Admin Security */}
      <section className="border border-ink/10 bg-cream p-5">
        <ChangePassword />
      </section>

      {/* Save Settings */}
      <div className="flex items-center gap-4">
        <Button
          onClick={save}
          className="rounded-none bg-ink px-10 py-6 text-xs uppercase tracking-widest text-cream"
        >
          Save Settings
        </Button>

        {saved && (
          <span className="text-sm text-green-700">
            Saved ✓
          </span>
        )}
      </div>
    </div>
  )
}/* --------- Admin shell --------- */
export default function Admin({ navigate }) {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState('dashboard')
  useEffect(() => {
    const t = auth.get()
    if (!t) { setChecking(false); return }
    api('/admin/me', { token: t }).then(() => { setAuthed(true); setChecking(false) }).catch(() => { auth.clear(); setChecking(false) })
  }, [])
  if (checking) return <div className="grid min-h-screen place-items-center bg-paper text-brown">Loading…</div>
  if (!authed) return <Login onLogin={() => setAuthed(true)} />

  const nav = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['products', 'Products', Package],
    ['categories', 'Categories', FolderTree],
    ['orders', 'Orders', ShoppingBag],
    ['settings', 'Settings', SettingsIcon],
  ]
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-ink/10 bg-cream p-4 md:flex">
        <h1 className="mb-6 font-display text-2xl leading-none">THRETHA<br /><span className="text-xs tracking-widest text-brown">COUTURE · ADMIN</span></h1>
        <nav className="flex-1 space-y-1">
          {nav.map(([id, l, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={cn('flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm', tab === id ? 'bg-ink text-cream' : 'text-ink/70 hover:bg-beige/60')}>
              <Icon className="h-4 w-4" />{l}
            </button>
          ))}
        </nav>
        <button onClick={() => navigate('/')} className="mb-2 flex items-center gap-2 px-3 py-2 text-sm text-brown"><Sparkles className="h-4 w-4" /> View site</button>
        <button onClick={() => { auth.clear(); setAuthed(false) }} className="flex items-center gap-2 px-3 py-2 text-sm text-destructive"><LogOut className="h-4 w-4" /> Sign out</button>
      </aside>

      {/* mobile top nav */}
      <div className="fixed left-0 right-0 top-0 z-30 flex gap-1 overflow-x-auto border-b border-ink/10 bg-cream p-2 hide-scrollbar md:hidden">
        {nav.map(([id, l]) => <button key={id} onClick={() => setTab(id)} className={cn('shrink-0 rounded-sm px-3 py-1.5 text-xs', tab === id ? 'bg-ink text-cream' : 'text-ink/60')}>{l}</button>)}
        <button onClick={() => { auth.clear(); setAuthed(false) }} className="shrink-0 px-3 py-1.5 text-xs text-destructive">Exit</button>
      </div>

      <main className="flex-1 p-6 pt-16 md:pt-6">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'products' && <Products />}
        {tab === 'categories' && <Categories />}
        {tab === 'orders' && <Orders />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
