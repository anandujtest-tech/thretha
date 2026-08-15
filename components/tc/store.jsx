/* ---------------- Product Detail ---------------- */
function ProductDetail({ navigate, settings, slug }) {
  const [p, setP] = useState(null)
  const [err, setErr] = useState(false)
  const [active, setActive] = useState(0)
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [orderOpen, setOrderOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setErr(false)
    setP(null)
    setActive(0)

    api(`/product/${slug}`)
      .catch(() => api(`/products/${slug}`))
      .then((d) => {
        setP(d)
        setSaved(inWishlist(d.slug))

        const first = (d.sizes || []).find((s) => s.available)
        setSize(first?.size || '')
      })
      .catch(() => setErr(true))
  }, [slug])

  if (err) {
    return (
      <div className="container py-24 text-center">
        <p className="font-display text-4xl text-ink">
          This piece has found a new home.
        </p>

        <p className="mt-2 text-brown">
          Have a look at the latest collection instead.
        </p>

        <Button
          onClick={() => navigate('/shop')}
          className="mt-6 rounded-none bg-ink text-cream"
        >
          Back to the collection →
        </Button>
      </div>
    )
  }

  if (!p) {
    return (
      <div className="container py-24 text-center text-brown">
        Loading…
      </div>
    )
  }

  const media = Array.isArray(p.media) ? p.media : []

  /*
   * IMPORTANT:
   * Always put the product's primary image first.
   * This makes the product detail page behave the same way
   * as the product cards on the shop page.
   */
  const primaryIndex = media.findIndex((m) => m?.is_primary)

  const orderedMedia =
    primaryIndex > 0
      ? [
          media[primaryIndex],
          ...media.filter((_, index) => index !== primaryIndex),
        ]
      : media

  const soldOut = p.stock <= 0
  const price = p.discount_price || p.price
  const threshold = settings?.low_stock_threshold ?? 3
  const isFreeSize =
    p.sizes?.length === 1 && p.sizes[0].size === 'Free Size'

  return (
    <div className="container py-8">
      <button
        onClick={() => navigate('/shop')}
        className="mb-4 flex items-center gap-1 text-sm text-brown"
      >
        <ChevronLeft className="h-4 w-4" />
        back to the edit
      </button>

      <div className="grid gap-10 md:grid-cols-2">

        {/* ---------------- Media ---------------- */}
        <div>
          <div className="relative overflow-hidden rounded-sm bg-beige paper-card aspect-[4/5]">

            {orderedMedia[active]?.type === 'video' ? (
              <video
                src={orderedMedia[active]?.url}
                controls
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={orderedMedia[active]?.url}
                alt={p.name}
                className="h-full w-full object-cover"
              />
            )}

            {orderedMedia.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setActive(
                      (a) =>
                        (a - 1 + orderedMedia.length) %
                        orderedMedia.length
                    )
                  }
                  className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-cream/80"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={() =>
                    setActive(
                      (a) =>
                        (a + 1) %
                        orderedMedia.length
                    )
                  }
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-cream/80"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {orderedMedia.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
              {orderedMedia.map((m, idx) => (
                <button
                  key={m.id || idx}
                  onClick={() => setActive(idx)}
                  className={cn(
                    'h-20 w-16 shrink-0 overflow-hidden rounded-sm border-2',
                    idx === active
                      ? 'border-ink'
                      : 'border-transparent'
                  )}
                >
                  {m?.type === 'video' ? (
                    <video
                      src={m.url}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={m?.url}
                      alt={`${p.name} ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- Product Info ---------------- */}
        <div>
          <p className="text-xs uppercase tracking-widest text-brown">
            {p.category_name}
          </p>

          <h1 className="mt-1 font-display text-5xl leading-tight text-ink">
            {p.name}
          </h1>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-2xl text-ink">
              {inr(price)}
            </span>

            {p.discount_price && (
              <span className="text-muted-foreground line-through">
                {inr(p.price)}
              </span>
            )}
          </div>

          {p.new_arrival && (
            <Annotation className="mt-1 block">
              just dropped ✦
            </Annotation>
          )}

          <p className="mt-4 max-w-md leading-relaxed text-brown">
            {p.description}
          </p>

          {/* Product details */}
          <dl className="mt-6 grid grid-cols-2 gap-y-3 text-sm">
            {[
              ['Category', p.category_name],
              ['Fabric', p.fabric],
              ['Colour', p.colour],
              ['Material', p.material],
              ['Pattern', p.pattern],
            ]
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-ink/50">
                    {key}
                  </dt>

                  <dd className="text-ink">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>

          {/* ---------------- Size ---------------- */}
          {p.sizes?.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-widest text-ink/60">
                {isFreeSize ? 'Free Size' : 'Select Size'}
              </p>

              {!isFreeSize && (
                <div className="flex flex-wrap gap-2">
                  {p.sizes.map((s) => (
                    <button
                      key={s.size}
                      disabled={!s.available}
                      onClick={() => setSize(s.size)}
                      className={cn(
                        'h-11 min-w-11 border px-3 text-sm',
                        size === s.size
                          ? 'border-ink bg-ink text-cream'
                          : 'border-ink/30',
                        !s.available &&
                          'cursor-not-allowed opacity-30 line-through'
                      )}
                    >
                      {s.size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------------- Quantity ---------------- */}
          {!soldOut && (
            <div className="mt-6 flex items-center gap-4">
              <span className="text-xs uppercase tracking-widest text-ink/60">
                Quantity
              </span>

              <div className="flex items-center border border-ink/30">
                <button
                  onClick={() =>
                    setQty((q) => Math.max(1, q - 1))
                  }
                  className="grid h-10 w-10 place-items-center"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <span className="w-10 text-center">
                  {qty}
                </span>

                <button
                  onClick={() =>
                    setQty((q) =>
                      Math.min(p.stock, q + 1)
                    )
                  }
                  className="grid h-10 w-10 place-items-center"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {p.stock <= threshold && (
                <span className="text-sm text-rose">
                  Only {p.stock} left
                </span>
              )}
            </div>
          )}

          {/* ---------------- CTA ---------------- */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {soldOut ? (
              <Button
                disabled
                className="rounded-none bg-ink/40 px-10 py-6 text-xs uppercase tracking-[0.25em] text-cream"
              >
                Sold Out
              </Button>
            ) : (
              <Button
                onClick={() => setOrderOpen(true)}
                className="rounded-none bg-[#25D366] px-10 py-6 text-xs uppercase tracking-[0.25em] text-white hover:bg-[#1eb457]"
              >
                Order on WhatsApp
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() =>
                setSaved(
                  toggleWishlist(p.slug).includes(p.slug)
                )
              }
              className="rounded-none border-ink px-8 py-6 text-xs uppercase tracking-widest"
            >
              <Heart
                className={cn(
                  'mr-2 h-4 w-4',
                  saved && 'fill-rose text-rose'
                )}
              />

              Save for later
            </Button>
          </div>
        </div>
      </div>

      {/* ---------------- Order Dialog ---------------- */}
      <OrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        product={p}
        size={size || (p.sizes?.[0]?.size || 'Free Size')}
        qty={qty}
        settings={settings}
      />
    </div>
  )
}
