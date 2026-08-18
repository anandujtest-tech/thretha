'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Menu, X, Instagram, Search, ArrowRight, ArrowUpRight, Minus, Plus, ChevronLeft, ChevronRight, Home as HomeIcon, ShoppingBag, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api, inr, getWishlist, toggleWishlist, inWishlist } from '@/lib/tc'

const WA = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M17.5 14.4c-.3-.15-1.7-.83-1.97-.93-.26-.1-.46-.15-.65.15s-.74.92-.9 1.11c-.17.2-.33.22-.62.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.34.44-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.65-1.57-.9-2.15-.24-.57-.48-.49-.65-.5l-.56-.01c-.2 0-.5.07-.77.37-.26.3-1 .98-1 2.4 0 1.4 1.03 2.76 1.17 2.95.15.2 2.02 3.08 4.9 4.32.68.3 1.22.47 1.63.6.69.22 1.31.19 1.8.12.55-.08 1.7-.7 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.2-.56-.35zM12 2a10 10 0 00-8.6 15.06L2 22l5.06-1.33A10 10 0 1012 2z"/>
  </svg>
)

function Annotation({ children, className }) {
  return <span className={cn('font-hand text-brown/80', className)}>{children}</span>
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <div>
      <Label className="text-xs text-ink/60">{label}</Label>
      <Input value={value ?? ''} onChange={onChange} className="mt-1 rounded-none" {...rest} />
    </div>
  )
}

function Badgey({ children, className }) {
  return (
    <span className={cn('inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase bg-ink text-cream', className)}>
      {children}
    </span>
  )
}

/* ---------------- Product Card ---------------- */
function ProductCard({ p, navigate, settings, rotate = 'rotate-0' }) {
  const [saved, setSaved] = useState(false)
  const [hover, setHover] = useState(false)
  useEffect(() => { setSaved(inWishlist(p.slug)) }, [p.slug])
 const media = p.media || []

const images = media.filter((m) => m.type !== 'video')

const primary = images.find((m) => m.is_primary) || images[0]
const secondary = images.find((m) => m !== primary)
  const soldOut = p.stock <= 0
  const price = p.discount_price || p.price
  const threshold = settings?.low_stock_threshold ?? 3
  const low = !soldOut && p.stock <= threshold

  return (
    <div className={cn('group cursor-pointer transition-transform duration-500', rotate, 'hover:rotate-0')}
      onClick={() => navigate(`/product/${p.slug}`)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative overflow-hidden bg-beige/40 aspect-[4/5] rounded-sm paper-card">
        {primary && (
          <img src={(hover && secondary ? secondary.url : primary.url)} alt={p.name}
            className={cn('h-full w-full object-cover transition-transform duration-700', hover && 'scale-105', soldOut && 'grayscale opacity-70')} />
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {p.new_arrival && !soldOut && <Badgey>New ✦</Badgey>}
          {soldOut && <Badgey className="bg-brown">Sold Out</Badgey>}
          {low && <Badgey className="bg-rose text-ink">Only {p.stock} left</Badgey>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setSaved(toggleWishlist(p.slug).includes(p.slug)) }}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-cream/80 backdrop-blur transition hover:scale-110">
          <Heart className={cn('h-4 w-4', saved ? 'fill-rose text-rose' : 'text-ink')} />
        </button>
      </div>
      <div className="mt-3 px-0.5">
        <p className="text-[11px] uppercase tracking-wider text-brown/70">{p.category_name}</p>
        <h3 className="font-display text-xl leading-tight text-ink">{p.name}</h3>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-ink">{inr(price)}</span>
          {p.discount_price && <span className="text-xs text-muted-foreground line-through">{inr(p.price)}</span>}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Header ---------------- */
function Header({ navigate, settings, wishCount, cartCount }) {
  const [open, setOpen] = useState(false)

  const links = [
    ['Shop', '/shop'],
    ['Collections', '/collections'],
    ['New Arrivals', '/new-arrivals'],
    ['About', '/#about'],
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
      <div className="container flex items-center justify-between py-3">

        {/* Mobile Menu */}
        <div className="flex items-center gap-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button aria-label="Menu">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>

            <SheetContent side="left" className="bg-paper">
              <SheetHeader>
                <SheetTitle className="font-display text-2xl">
                  Thretha Couture
                </SheetTitle>
              </SheetHeader>

              <nav className="mt-6 flex flex-col gap-4">
                {links.map(([label, href]) => (
                  <button
                    key={label}
                    className="text-left font-display text-2xl text-ink"
                    onClick={() => {
                      setOpen(false)
                      navigate(href)
                    }}
                  >
                    {label}
                  </button>
                ))}

                <a
                  href={settings?.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-2 text-sm"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2"
        >
          {settings?.logo_url ? (
            <img
              src={settings.logo_url}
              alt="Thretha Couture"
              className="h-12 w-auto rounded-sm object-contain md:h-14"
            />
          ) : (
            <span className="font-display text-2xl leading-none tracking-wide text-ink md:text-3xl">
              THRETHA
              <span className="block text-[10px] tracking-[0.4em] text-brown md:ml-2 md:inline md:text-sm">
                COUTURE
              </span>
            </span>
          )}
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-7 md:flex">
          {links.slice(0, 3).map(([label, href]) => (
            <button
              key={label}
              onClick={() => navigate(href)}
              className="text-sm uppercase tracking-wider text-ink/80 transition hover:text-ink"
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Header Actions */}
        <div className="flex items-center gap-3">

          {/* Cart — ONLY ONE */}
          <button
            onClick={() => navigate('/cart')}
            aria-label="Cart"
            className="relative"
          >
            <ShoppingBag className="h-5 w-5" />

            {cartCount > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-rose text-[9px] text-ink">
                {cartCount}
              </span>
            )}
          </button>

          {/* Search */}
          <button
            onClick={() => navigate('/shop')}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Wishlist */}
          <button
            onClick={() => navigate('/wishlist')}
            aria-label="Wishlist"
            className="relative"
          >
            <Heart className="h-5 w-5" />

            {wishCount > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 w-4 place-items-center rounded-full bg-rose text-[9px] text-ink">
                {wishCount}
              </span>
            )}
          </button>

        </div>
      </div>
    </header>
  )
}

/* ---------------- Footer ---------------- */
function Footer({ navigate, settings }) {
  const waUrl = `https://wa.me/${(settings?.whatsapp || '').replace(/[^0-9]/g, '')}`
  return (
    <footer className="mt-24 border-t border-ink/10 bg-cream/60">
      <div className="container grid gap-10 py-14 md:grid-cols-4">
        <div>
          {settings?.logo_url
            ? <img src={settings.logo_url} alt="Thretha Couture" className="h-24 w-24 rounded-md object-contain" />
            : <h3 className="font-display text-3xl leading-none">THRETHA<br />COUTURE</h3>}
          <p className="mt-4 max-w-xs text-sm text-brown">A little wardrobe of things worth wearing.</p>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-ink/60">Shop</p>
          <ul className="space-y-2 text-sm">
            <li><button onClick={() => navigate('/category/sarees')}>Sarees</button></li>
            <li><button onClick={() => navigate('/category/crop-tops')}>Crop Tops</button></li>
            <li><button onClick={() => navigate('/new-arrivals')}>New Arrivals</button></li>
            <li><button onClick={() => navigate('/shop')}>All Collection</button></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-ink/60">Connect</p>
          <ul className="space-y-2 text-sm">
            <li><a href={settings?.instagram} target="_blank" rel="noreferrer">Instagram</a></li>
            <li><a href={waUrl} target="_blank" rel="noreferrer">WhatsApp</a></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-widest text-ink/60">Help</p>
          <ul className="space-y-2 text-sm text-brown">
            <li>{settings?.shipping?.delivery_timeframe || 'Shipping'}</li>
            <li>{settings?.shipping?.return_policy || 'Returns'}</li>
            <li>{settings?.email}</li>
          </ul>
        </div>
      </div>
      <div className="container pb-8 text-xs text-ink/50">© {new Date().getFullYear()} Thretha Couture</div>
    </footer>
  )
}

/* ---------------- Mobile bottom nav + floating WA ---------------- */
function MobileNav({ navigate, settings, path }) {
  const waUrl = `https://wa.me/${(settings?.whatsapp || '').replace(/[^0-9]/g, '')}`
  const items = [
    ['Home', HomeIcon, '/'],
    ['Shop', ShoppingBag, '/shop'],
    ['New', Sparkles, '/new-arrivals'],
    ['Saved', Heart, '/wishlist'],
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map(([l, Icon, h]) => (
          <button key={l} onClick={() => navigate(h)} className={cn('flex flex-col items-center gap-0.5 py-2 text-[10px]', path === h ? 'text-ink' : 'text-ink/50')}>
            <Icon className="h-4 w-4" />{l}
          </button>
        ))}
        <a href={waUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-green-700">
          <WA className="h-4 w-4" />WhatsApp
        </a>
      </div>
    </nav>
  )
}
function FloatingWA({ settings }) {
  const waUrl = `https://wa.me/${(settings?.whatsapp || '').replace(/[^0-9]/g, '')}`
  return (
    <a href={waUrl} target="_blank" rel="noreferrer"
      className="fixed bottom-20 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 md:bottom-6">
      <WA className="h-6 w-6" />
    </a>
  )
}

/* ---------------- Hero ---------------- */
function Hero({ navigate, settings }) {
  const imgs = settings?.hero?.images || []
  const [i, setI] = useState(0)
  useEffect(() => {
    if (imgs.length < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % imgs.length), 5000)
    return () => clearInterval(t)
  }, [imgs.length])
  return (
    <section className="container grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
      <div className="animate-fade-up">
        <Annotation className="text-xl">little things we love ↗</Annotation>
        <h1 className="mt-3 font-display text-6xl leading-[0.9] text-ink md:text-8xl">{settings?.hero?.title || 'THRETHA COUTURE'}</h1>
        <p className="mt-6 max-w-sm font-display text-2xl text-brown md:text-3xl">{settings?.hero?.subtitle || 'A wardrobe worth getting dressed for.'}</p>
        <Annotation className="mt-4 block text-lg">{settings?.hero?.annotation || 'made for your next occasion'} ✦</Annotation>
        <Button onClick={() => navigate('/shop')} className="mt-7 rounded-none bg-ink px-8 py-6 text-xs uppercase tracking-[0.25em] text-cream hover:bg-brown">
          {settings?.hero?.cta || 'Explore Collection'}
        </Button>
      </div>
      <div className="relative">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-beige paper-card rotate-1">
          {imgs.map((src, idx) => (
            <img key={idx} src={src} alt="Thretha Couture" className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-1000', idx === i ? 'opacity-100' : 'opacity-0')} />
          ))}
        </div>
        {imgs.length > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {imgs.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)} className={cn('h-1.5 rounded-full transition-all', idx === i ? 'w-6 bg-ink' : 'w-1.5 bg-ink/30')} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------- Home ---------------- */
function Home({ navigate, settings }) {
  const [latest, setLatest] = useState([])
  const [cats, setCats] = useState([])
  useEffect(() => {
    api('/products?sort=newest').then((d) => setLatest(d.slice(0, 6))).catch(() => {})
    api('/categories').then(setCats).catch(() => {})
  }, [])

  return (
    <div>
      <Hero navigate={navigate} settings={settings} />

      {/* Latest drop */}
      <section className="container py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-4xl text-ink md:text-5xl">The Latest Drop</h2>
            <Annotation className="text-lg">fresh from our little wardrobe</Annotation>
          </div>
          <button onClick={() => navigate('/new-arrivals')} className="hidden items-center gap-1 text-sm uppercase tracking-wider md:flex">View all <ArrowRight className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar md:grid md:grid-cols-4 md:gap-6 md:overflow-visible">
          {latest.map((p, idx) => (
            <div key={p.id} className="w-[60vw] shrink-0 md:w-auto">
              <ProductCard p={p} navigate={navigate} settings={settings} rotate={idx % 2 ? 'rotate-1' : '-rotate-1'} />
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="container py-12">
        <h2 className="mb-8 font-display text-4xl text-ink md:text-5xl">Explore the Wardrobe</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {cats.map((c, idx) => (
            <button key={c.id} onClick={() => navigate(`/category/${c.slug}`)}
              className={cn('group relative overflow-hidden rounded-sm bg-beige paper-card', idx % 2 ? 'md:mt-10' : '')}>
              <div className="aspect-[16/11] overflow-hidden">
                <img src={c.image} alt={c.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/50 to-transparent p-6 text-left text-cream">
                <h3 className="font-display text-4xl">{c.name}</h3>
                <span className="mt-1 flex items-center gap-1 text-sm">Explore the edit <ArrowRight className="h-4 w-4" /></span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Saree edit */}
      <section className="container grid items-center gap-8 py-14 md:grid-cols-2">
        <div className="overflow-hidden rounded-sm bg-beige paper-card -rotate-1">
          <img
  src={settings?.saree_edit_image}
  alt={settings?.saree_edit_alt || 'The Saree Edit'}
  className="aspect-[4/5] w-full object-cover"
/>
        </div>
        <div>
          <Annotation className="text-lg">the saree edit ✦</Annotation>
          <h2 className="mt-2 font-display text-5xl text-ink">The Saree Edit</h2>
          <p className="mt-4 max-w-md text-brown">Draped for celebrations, slow mornings and everything in between.</p>
          <Button onClick={() => navigate('/category/sarees')} className="mt-6 rounded-none bg-ink px-8 py-6 text-xs uppercase tracking-[0.25em] text-cream hover:bg-brown">Explore Sarees</Button>
        </div>
      </section>

      {/* Instagram */}
      <section className="container py-12" id="instagram">
        <div className="mb-6 text-center">
          <h2 className="font-display text-4xl text-ink md:text-5xl">From Our Instagram</h2>
          <a href={settings?.instagram} target="_blank" rel="noreferrer" className="text-brown">@thretha_couture</a>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {(settings?.instagram_gallery || []).map((src, idx) => (
            <a key={idx} href={settings?.instagram} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-sm bg-beige">
              <img src={src} alt="instagram" className="h-full w-full object-cover transition group-hover:scale-105" />
              <span className="absolute inset-0 grid place-items-center bg-ink/0 text-cream opacity-0 transition group-hover:bg-ink/30 group-hover:opacity-100"><Instagram className="h-5 w-5" /></span>
            </a>
          ))}
        </div>
        <div className="mt-6 text-center">
          <a href={settings?.instagram} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-none border-ink px-8 text-xs uppercase tracking-widest">Follow Us →</Button></a>
        </div>
      </section>

      {/* Brand story */}
      <section className="container grid items-center gap-8 py-14 md:grid-cols-2" id="about">
        <div>
          <Annotation className="text-lg">a little about us</Annotation>
          <h2 className="mt-2 font-display text-5xl text-ink">A Little About Thretha</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-brown">{settings?.brand_story}</p>
        </div>
        <div className="overflow-hidden rounded-sm bg-beige paper-card rotate-1">
          <img src={settings?.brand_story_image} alt="Thretha Couture" className="aspect-[4/5] w-full object-cover" />
        </div>
      </section>
    </div>
  )
}
/* ---------------- Collections page ---------------- */
function Collections({ navigate, settings }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="container py-14 md:py-20">
      <div className="mb-10 md:mb-14">
        <p className="mb-3 text-xs uppercase tracking-[0.25em] text-brown">
          Thretha Couture
        </p>

        <h1 className="font-display text-5xl leading-none text-ink md:text-6xl">
          Explore the Wardrobe
        </h1>

        <p className="mt-4 max-w-xl text-sm leading-6 text-brown md:text-base">
          Discover thoughtfully chosen pieces for every mood, moment and
          occasion.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-ink/50">
          Loading collections…
        </div>
      ) : categories.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-display text-3xl text-ink">
            No collections yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {categories.map((category) => {
            const image =
              category.image ||
              category.image_url ||
              '/api/media/file/seed-04.jpg'

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/category/${category.slug}`)}
                className="group relative aspect-[4/3] overflow-hidden rounded-sm bg-cream text-left"
              >
                <img
                  src={image}
                  alt={category.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                  <h2 className="font-display text-3xl text-white md:text-4xl">
                    {category.name}
                  </h2>

                  <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                    <span>Explore the edit</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
/* ---------------- Product Grid page ---------------- */
function ProductGrid({ navigate, settings, path }) {
  const isNew = path === '/new-arrivals'
  const catSlug = path.startsWith('/category/') ? path.split('/')[2] : null
  const [products, setProducts] = useState([])
  const [cat, setCat] = useState(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState({ availability: '', size: '', colour: '' })
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (catSlug) sp.set('category', catSlug)
    if (isNew) sp.set('new', 'true')
    if (q) sp.set('search', q)
    if (sort) sp.set('sort', sort)
    if (filters.availability) sp.set('availability', filters.availability)
    if (filters.size) sp.set('size', filters.size)
    if (filters.colour) sp.set('colour', filters.colour)
    api(`/products?${sp.toString()}`).then((d) => { setProducts(d); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [path, sort, filters])
  useEffect(() => { if (catSlug) api('/categories').then((cs) => setCat(cs.find((c) => c.slug === catSlug))).catch(() => {}) }, [catSlug])

  const title = isNew ? 'Just Dropped' : cat ? cat.name : 'The Collection'
  const sub = isNew ? 'Fresh from our little wardrobe.' : cat ? cat.description : 'Beautiful pieces, chosen for you.'

  const FilterControls = () => (
    <div className="space-y-5">
      <div>
        <Label className="text-xs uppercase tracking-widest text-ink/60">Availability</Label>
        <Select value={filters.availability || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, availability: v === 'all' ? '' : v }))}>
          <SelectTrigger className="mt-1 rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="in">In stock</SelectItem></SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-widest text-ink/60">Size</Label>
        <Select value={filters.size || 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, size: v === 'all' ? '' : v }))}>
          <SelectTrigger className="mt-1 rounded-none"><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            {['XS','S','M','L','XL','Free Size'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-widest text-ink/60">Colour</Label>
        <Input value={filters.colour} onChange={(e) => setFilters((f) => ({ ...f, colour: e.target.value }))} placeholder="e.g. Rose" className="mt-1 rounded-none" />
      </div>
    </div>
  )

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="font-display text-5xl text-ink md:text-6xl">{title}</h1>
        <p className="mt-2 text-brown">{sub}</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-ink/50">{products.length} pieces</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); load() }} className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sarees, crop tops, colours…" className="rounded-none pl-9" />
        </form>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[170px] rounded-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price_asc">Price: Low → High</SelectItem>
            <SelectItem value="price_desc">Price: High → Low</SelectItem>
            <SelectItem value="featured">Featured</SelectItem>
          </SelectContent>
        </Select>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" className="rounded-none md:hidden">Filters</Button></SheetTrigger>
          <SheetContent side="bottom" className="bg-paper">
            <SheetHeader><SheetTitle className="font-display text-2xl">Filters</SheetTitle></SheetHeader>
            <div className="mt-4"><FilterControls /></div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-52 shrink-0 md:block"><FilterControls /></aside>
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-sm bg-beige/50" />)}</div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-3xl text-ink">We couldn't find that one.</p>
              <Annotation className="text-lg">try another word</Annotation>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-12">
              {products.map((p, idx) => (
                <ProductCard key={p.id} p={p} navigate={navigate} settings={settings} rotate={idx % 3 === 0 ? '-rotate-1' : idx % 3 === 1 ? 'rotate-1' : 'rotate-0'} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Product Detail ---------------- */
function ProductDetail({ navigate, settings, slug, addToCart }) {  const [p, setP] = useState(null)
  const [err, setErr] = useState(false)
  const [active, setActive] = useState(0)
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [orderOpen, setOrderOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setErr(false); setP(null)
    api(`/product/${slug}`).catch(() => api(`/products/${slug}`)).then((d) => {
      setP(d); setSaved(inWishlist(d.slug))
      const first = (d.sizes || []).find((s) => s.available)
      setSize(first?.size || '')
    }).catch(() => setErr(true))
  }, [slug])

  if (err) return (
    <div className="container py-24 text-center">
      <p className="font-display text-4xl text-ink">This piece has found a new home.</p>
      <p className="mt-2 text-brown">Have a look at the latest collection instead.</p>
      <Button onClick={() => navigate('/shop')} className="mt-6 rounded-none bg-ink text-cream">Back to the collection →</Button>
    </div>
  )
  if (!p) return <div className="container py-24 text-center text-brown">Loading…</div>

  const media = p.media || []
  const soldOut = p.stock <= 0
  const price = p.discount_price || p.price
  const threshold = settings?.low_stock_threshold ?? 3
  const isFreeSize = p.sizes?.length === 1 && p.sizes[0].size === 'Free Size'

  return (
    <div className="container py-8">
      <button onClick={() => navigate('/shop')} className="mb-4 flex items-center gap-1 text-sm text-brown"><ChevronLeft className="h-4 w-4" /> back to the edit</button>
      <div className="grid gap-10 md:grid-cols-2">
        {/* Media */}
        <div>
          <div className="relative overflow-hidden rounded-sm bg-beige paper-card aspect-[4/5]">
            {media[active]?.type === 'video'
              ? <video src={media[active].url} controls className="h-full w-full object-cover" />
              : <img src={media[active]?.url} alt={p.name} className="h-full w-full object-cover" />}
            {media.length > 1 && (
              <>
                <button onClick={() => setActive((a) => (a - 1 + media.length) % media.length)} className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-cream/80"><ChevronLeft className="h-5 w-5" /></button>
                <button onClick={() => setActive((a) => (a + 1) % media.length)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-cream/80"><ChevronRight className="h-5 w-5" /></button>
              </>
            )}
          </div>
          {media.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
            {media.map((m, idx) => (
  <button
    key={m.id || idx}
    onClick={() => setActive(idx)}
    className={cn(
      'relative h-20 w-16 shrink-0 overflow-hidden rounded-sm border-2',
      idx === active ? 'border-ink' : 'border-transparent'
    )}
  >
    {m.type === 'video' ? (
      <>
        <video
          src={m.url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />

        <span className="absolute inset-0 grid place-items-center bg-ink/20">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-cream/90 text-ink">
            ▶
          </span>
        </span>
      </>
    ) : (
      <img
        src={m.url}
        alt={p.name}
        className="h-full w-full object-cover"
      />
    )}
  </button>
))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <p className="text-xs uppercase tracking-widest text-brown">{p.category_name}</p>
          <h1 className="mt-1 font-display text-5xl leading-tight text-ink">{p.name}</h1>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-2xl text-ink">{inr(price)}</span>
            {p.discount_price && <span className="text-muted-foreground line-through">{inr(p.price)}</span>}
          </div>
          {p.new_arrival && <Annotation className="mt-1 block">just dropped ✦</Annotation>}
          <p className="mt-4 max-w-md leading-relaxed text-brown">{p.description}</p>

          <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm">
            {[['Category', p.category_name], ['Fabric', p.fabric], ['Colour', p.colour], ['Material', p.material], ['Pattern', p.pattern]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-ink/50">{k}</dt><dd className="text-ink">{v}</dd></div>
            ))}
          </dl>

          {/* Size */}
          {p.sizes?.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-widest text-ink/60">{isFreeSize ? 'Free Size' : 'Select Size'}</p>
              {!isFreeSize && (
                <div className="flex flex-wrap gap-2">
                  {p.sizes.map((s) => (
                    <button key={s.size} disabled={!s.available} onClick={() => setSize(s.size)}
                      className={cn('h-11 min-w-11 border px-3 text-sm', size === s.size ? 'border-ink bg-ink text-cream' : 'border-ink/30', !s.available && 'cursor-not-allowed opacity-30 line-through')}>
                      {s.size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quantity */}
          {!soldOut && (
            <div className="mt-6 flex items-center gap-4">
              <span className="text-xs uppercase tracking-widest text-ink/60">Quantity</span>
              <div className="flex items-center border border-ink/30">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-10 place-items-center"><Minus className="h-4 w-4" /></button>
                <span className="w-10 text-center">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(p.stock, q + 1))} className="grid h-10 w-10 place-items-center"><Plus className="h-4 w-4" /></button>
              </div>
              {p.stock <= threshold && <span className="text-sm text-rose">Only {p.stock} left</span>}
            </div>
          )}

          {/* CTA */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {soldOut ? (
              <Button disabled className="rounded-none bg-ink/40 px-10 py-6 text-xs uppercase tracking-[0.25em] text-cream">Sold Out</Button>
            ) : (
              <Button
  onClick={() =>
    addToCart(
      p,
      qty,
      size || (p.sizes?.[0]?.size || 'Free Size')
    )
  }
  className="rounded-none bg-ink px-10 py-6 text-xs uppercase tracking-[0.25em] text-cream"
>
  Add to Cart
  <ShoppingBag className="ml-2 h-4 w-4" />
</Button>
            )}
            <Button variant="outline" onClick={() => setSaved(toggleWishlist(p.slug).includes(p.slug))} className="rounded-none border-ink px-8 py-6 text-xs uppercase tracking-widest">
              <Heart className={cn('mr-2 h-4 w-4', saved && 'fill-rose text-rose')} /> Save for later
            </Button>
          </div>
        </div>
      </div>

      <OrderDialog open={orderOpen} onOpenChange={setOrderOpen} product={p} size={size || (p.sizes?.[0]?.size || 'Free Size')} qty={qty} settings={settings} />
    </div>
  )
}

/* ---------------- Order Dialog ---------------- */
function OrderDialog({ open, onOpenChange, product, size, qty, settings }) {
  const [form, setForm] = useState({ name: '', whatsapp: '', phone: '', house: '', street: '', city: '', district: '', state: 'Kerala', pincode: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const price = product?.discount_price || product?.price
  const total = price * qty

  const submit = async () => {
    setError('')
    if (!form.name || !form.whatsapp) { setError('Please add your name and WhatsApp number.'); return }
    setSubmitting(true)
    try {
      const res = await api('/orders', { method: 'POST', body: { customer: form, item: { product_id: product.id, size, quantity: qty } } })
      window.open(res.whatsapp.url, '_blank')
      onOpenChange(false)
    } catch (e) { setError(e.message) } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-paper sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-3xl">Let's make it yours</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-widest text-ink/60">Personal information</p>
          <Field label="Full Name" value={form.name} onChange={set('name')} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="WhatsApp Number" value={form.whatsapp} onChange={set('whatsapp')} />
            <Field label="Phone Number" value={form.phone} onChange={set('phone')} />
          </div>
          <p className="pt-2 text-xs uppercase tracking-widest text-ink/60">Delivery information</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="House / Building" value={form.house} onChange={set('house')} />
            <Field label="Street / Locality" value={form.street} onChange={set('street')} />
            <Field label="City" value={form.city} onChange={set('city')} />
            <Field label="District" value={form.district} onChange={set('district')} />
            <Field label="State" value={form.state} onChange={set('state')} />
            <Field label="PIN Code" value={form.pincode} onChange={set('pincode')} />
          </div>

          <div className="mt-2 border border-ink/15 bg-cream/60 p-4">
            <p className="mb-2 text-xs uppercase tracking-widest text-ink/60">Your selection</p>
            <div className="flex justify-between text-sm"><span>{product?.name}</span><span>{inr(price)}</span></div>
            <p className="text-xs text-ink/50">Size: {size} · Qty: {qty} · Code: {product?.sku}</p>
            <div className="mt-2 flex justify-between border-t border-ink/10 pt-2 text-sm font-medium"><span>Total</span><span>{inr(total)}</span></div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={submitting} className="w-full rounded-none bg-[#25D366] py-6 text-xs uppercase tracking-[0.25em] text-white hover:bg-[#1eb457]">
            {submitting ? 'Saving…' : 'Continue on WhatsApp →'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
/* ---------------- Cart ---------------- */
function Cart({
  navigate,
  settings,
  cart,
  updateCartQuantity,
  removeFromCart,
  cartTotal,
}) {
  const waNumber = (settings?.whatsapp || '').replace(/[^0-9]/g, '')

  const orderOnWhatsApp = () => {
    if (!cart.length || !waNumber) return

const lines = cart.map((item, index) => {
  const itemTotal = item.price * item.quantity

  return [
    `*${index + 1}. ${item.product_name}*`,
    `   Size: ${item.size || 'Free Size'}`,
    `   Colour: ${item.colour || '—'}`,
    `   Quantity: ${item.quantity}`,
    `   Price: ${inr(item.price)}`,
    `   Subtotal: ${inr(itemTotal)}`,
    '',
  ].join('\n')
})

 const message = [
  '✨ *THRETHA COUTURE — ORDER REQUEST*',
  '',
  'Hello Thretha Couture! 👋',
  '',
  '*I would like to order the following items:*',
  '',
  ...lines,
  '',
  '━━━━━━━━━━━━━━━━━━━━',
  `*TOTAL: ${inr(cartTotal)}*`,
  '━━━━━━━━━━━━━━━━━━━━',
  '',
  'Please confirm availability and order details.',
].join('\n')

    window.open(
      `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`,
      '_blank'
    )
  }

  if (cart.length === 0) {
    return (
      <main className="container py-20 text-center">
        <ShoppingBag className="mx-auto h-10 w-10 text-ink/30" />

        <h1 className="mt-5 font-display text-4xl text-ink">
          Your bag is empty
        </h1>

        <p className="mt-3 text-sm text-brown">
          Discover something beautiful for your wardrobe.
        </p>

        <Button
          onClick={() => navigate('/collections')}
          className="mt-7 rounded-none bg-ink px-8 py-6 text-xs uppercase tracking-[0.2em] text-cream"
        >
          Explore Collections
        </Button>
      </main>
    )
  }

  return (
    <main className="container py-10 md:py-16">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-brown">
          Thretha Couture
        </p>

        <h1 className="mt-2 font-display text-5xl text-ink md:text-6xl">
          Your Bag
        </h1>

        <p className="mt-3 text-sm text-brown">
          Review your selected pieces before ordering.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {cart.map((item) => (
            <div
              key={`${item.product_id}-${item.size}`}
              className="flex gap-4 border-b border-ink/10 pb-5"
            >
              <button
                type="button"
                onClick={() => navigate(`/product/${item.slug}`)}
                className="h-32 w-24 shrink-0 overflow-hidden bg-cream"
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.product_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-ink/30">
                    No image
                  </div>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => navigate(`/product/${item.slug}`)}
                  className="text-left font-display text-2xl text-ink"
                >
                  {item.product_name}
                </button>

                <p className="mt-1 text-sm text-brown">
                  {item.size || 'Free Size'}
                  {item.colour ? ` · ${item.colour}` : ''}
                </p>

                <p className="mt-2 text-sm text-ink">
                  {inr(item.price)}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center border border-ink/20">
                    <button
                      type="button"
                      onClick={() =>
                        updateCartQuantity(
                          item.product_id,
                          item.size,
                          item.quantity - 1
                        )
                      }
                      className="grid h-9 w-9 place-items-center"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    <span className="w-9 text-center text-sm">
                      {item.quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        updateCartQuantity(
                          item.product_id,
                          item.size,
                          item.quantity + 1
                        )
                      }
                      className="grid h-9 w-9 place-items-center"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      removeFromCart(item.product_id, item.size)
                    }
                    className="text-xs uppercase tracking-wider text-ink/50 underline underline-offset-4"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="hidden text-right sm:block">
                <p className="text-sm text-ink">
                  {inr(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <aside className="h-fit border border-ink/10 bg-cream p-6">
          <h2 className="font-display text-2xl text-ink">
            Order Summary
          </h2>

          <div className="mt-6 flex items-center justify-between border-b border-ink/10 pb-4 text-sm">
            <span className="text-brown">Subtotal</span>
            <span className="text-ink">{inr(cartTotal)}</span>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-brown">Shipping</span>
            <span className="text-brown">
              {settings?.shipping?.delivery_charges || 'Calculated separately'}
            </span>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="font-display text-xl">Total</span>
            <span className="text-xl text-ink">{inr(cartTotal)}</span>
          </div>

          <Button
            onClick={orderOnWhatsApp}
            className="mt-7 w-full rounded-none bg-[#25D366] py-6 text-xs uppercase tracking-[0.2em] text-white hover:bg-[#1eb457]"
          >
            Order All on WhatsApp
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/shop')}
            className="mt-3 w-full rounded-none border-ink py-6 text-xs uppercase tracking-[0.2em]"
          >
            Continue Shopping
          </Button>
        </aside>
      </div>
    </main>
  )
}
/* ---------------- Wishlist ---------------- */
function Wishlist({ navigate, settings }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const slugs = getWishlist()
    if (!slugs.length) { setLoading(false); return }
    Promise.all(slugs.map((s) => api(`/products/${s}`).catch(() => null))).then((res) => {
      setItems(res.filter(Boolean)); setLoading(false)
    })
  }, [])
  if (loading) return <div className="container py-24 text-center text-brown">Loading…</div>
  if (!items.length) return (
    <div className="container py-24 text-center">
      <Heart className="mx-auto h-10 w-10 text-rose" />
      <p className="mt-4 font-display text-4xl text-ink">Nothing saved yet.</p>
      <Annotation className="text-lg">see something you love? keep it here ♡</Annotation>
      <div className="mt-6"><Button onClick={() => navigate('/shop')} className="rounded-none bg-ink text-cream">Explore the edit</Button></div>
    </div>
  )
  return (
    <div className="container py-8">
      <h1 className="mb-6 font-display text-5xl text-ink">Saved for later</h1>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
        {items.map((p, idx) => <ProductCard key={p.id} p={p} navigate={navigate} settings={settings} rotate={idx % 2 ? 'rotate-1' : '-rotate-1'} />)}
      </div>
    </div>
  )
}

//* ---------------- Store shell ---------------- */
export default function Store({ path, navigate }) {
  const [settings, setSettings] = useState(null)
  const [wishCount, setWishCount] = useState(0)
  const [cart, setCart] = useState([])

  // Load cart from localStorage
  useEffect(() => {
    try {
      const savedCart = JSON.parse(
        localStorage.getItem('thretha_cart') || '[]'
      )

      if (Array.isArray(savedCart)) {
        setCart(savedCart)
      }
    } catch {
      setCart([])
    }
  }, [])

  // Save cart whenever it changes
  useEffect(() => {
    localStorage.setItem(
      'thretha_cart',
      JSON.stringify(cart)
    )
  }, [cart])

  // Add product to cart
  const addToCart = (product, quantity = 1, size = null) => {
    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.product_id === product.id &&
          item.size === size
      )

      // Already in cart:
      // Do NOT increase quantity when Add to Cart
      // is clicked again.
      if (existingIndex >= 0) {
        return current
      }

      // Get the correct product image from media
      const primaryImage =
        product.media?.find((m) => m.is_primary)?.url ||
        product.media?.find((m) => m.type !== 'video')?.url ||
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
          size,
          colour: product.colour,
          quantity,
        },
      ]
    })
  }

  // Update quantity from Cart page
  const updateCartQuantity = (
    productId,
    size,
    quantity
  ) => {
    // Remove item if quantity reaches zero
    if (quantity <= 0) {
      setCart((current) =>
        current.filter(
          (item) =>
            !(
              item.product_id === productId &&
              item.size === size
            )
        )
      )

      return
    }

    setCart((current) =>
      current.map((item) =>
        item.product_id === productId &&
        item.size === size
          ? {
              ...item,
              quantity,
            }
          : item
      )
    )
  }

  // Remove complete item from cart
  const removeFromCart = (
    productId,
    size
  ) => {
    setCart((current) =>
      current.filter(
        (item) =>
          !(
            item.product_id === productId &&
            item.size === size
          )
      )
    )
  }

  // Total number of products in cart
  const cartCount = cart.reduce(
    (total, item) =>
      total + item.quantity,
    0
  )

  // Total cart price
  const cartTotal = cart.reduce(
    (total, item) =>
      total +
      item.price * item.quantity,
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

    window.addEventListener(
      'tc-wishlist',
      updateWishlistCount
    )

    return () => {
      window.removeEventListener(
        'tc-wishlist',
        updateWishlistCount
      )
    }
  }, [])

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])

  let view

  if (path === '/') {
    view = (
      <Home
        navigate={navigate}
        settings={settings}
      />
    )
  } else if (path === '/collections') {
    view = (
      <Collections
        navigate={navigate}
        settings={settings}
      />
    )
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
      <Cart
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
      <Wishlist
        navigate={navigate}
        settings={settings}
      />
    )
  } else {
    view = (
      <div className="container py-24 text-center">
        <p className="font-display text-5xl text-ink">
          This page wandered off somewhere.
        </p>

        <Button
          onClick={() => navigate('/')}
          className="mt-6 rounded-none bg-ink text-cream"
        >
          Back to the collection →
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Header
        navigate={navigate}
        settings={settings}
        wishCount={wishCount}
        cartCount={cartCount}
      />

      <main className="animate-fade-in">
        {view}
      </main>

      <Footer
        navigate={navigate}
        settings={settings}
      />

      <MobileNav
        navigate={navigate}
        path={path}
        settings={settings}
      />
    </div>
  )
}
