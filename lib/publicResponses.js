import { publicCustomer } from './auth.js'
import { normalizeInstagramSettings } from './instagram.js'
import { normalizeOccasions, DEFAULT_OCCASIONS } from './occasions.js'
import { DEFAULT_HOMEPAGE_CONTENT } from './homepageContent.js'
import { normalizeHomeSectionOrder, normalizeHomeSectionVisibility } from './homeLayout.js'

function pick(source, fields) {
  if (!source || typeof source !== 'object') return {}
  return Object.fromEntries(fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]))
}

const mediaFields = ['id', 'type', 'url', 'thumbnail_url', 'is_primary', 'display_order', 'alt']
const sizeFields = ['size', 'stock', 'available']
export function publicOccasion(occasion) {
  return pick(occasion, ['id', 'slug', 'name', 'image', 'active'])
}
const productFields = [
  'id', 'slug', 'name', 'sku', 'category_id', 'category_name', 'description',
  'price', 'original_price', 'discount_price', 'fabric', 'colour', 'colours', 'material', 'pattern',
  'care_instructions', 'stock', 'image', 'occasion_slugs', 'featured',
  'new_arrival', 'best_seller', 'active', 'created_at', 'updated_at', 'ai_tryon_enabled',
]

export function publicProduct(product) {
  if (!product) return null
  return {
    ...pick(product, productFields),
    colours: Array.isArray(product.colours)
      ? product.colours.map((colour) => typeof colour === 'string' ? colour : pick(colour, ['name', 'colour'])).filter(Boolean)
      : [],
    occasion_slugs: Array.isArray(product.occasion_slugs)
      ? product.occasion_slugs.filter((slug) => typeof slug === 'string') : [],
    media: Array.isArray(product.media) ? product.media.map((entry) => pick(entry, mediaFields)) : [],
    sizes: Array.isArray(product.sizes)
      ? product.sizes.map((entry) => typeof entry === 'string' ? entry : pick(entry, sizeFields))
      : [],
  }
}

const comboFields = [
  'id', 'slug', 'name', 'customer_title', 'description', 'image', 'type',
  'pricing_method', 'combo_price', 'discount_value', 'min_value',
  'max_discount', 'allow_coupons', 'active', 'display_order',
  'start_date', 'expiry_date', 'created_at', 'updated_at',
]
const slotFields = [
  'id', 'name', 'required', 'quantity', 'min_quantity', 'max_quantity',
  'source_type', 'product_id', 'product_name', 'product_slug', 'category_id',
  'category_name', 'category_slug',
]

export function publicCombo(combo) {
  if (!combo) return null
  return {
    ...pick(combo, comboFields),
    media: Array.isArray(combo.media) ? combo.media.map((entry) => pick(entry, mediaFields)) : [],
    slots: Array.isArray(combo.slots) ? combo.slots.map((slot) => ({
      ...pick(slot, slotFields),
      product: publicProduct(slot.product),
      eligible_products: Array.isArray(slot.eligible_products) ? slot.eligible_products.map(publicProduct) : [],
      allowed_colours: Array.isArray(slot.allowed_colours) ? slot.allowed_colours.filter((colour) => typeof colour === 'string') : [],
      allowed_sizes: Array.isArray(slot.allowed_sizes)
        ? slot.allowed_sizes.map((entry) => typeof entry === 'string' ? entry : pick(entry, sizeFields))
        : [],
    })) : [],
  }
}

export function publicSettings(settings) {
  const s = settings || {}
  const shipping = s.shipping || {}
  const deliveryCharge = shipping.delivery_charge !== undefined && shipping.delivery_charge !== null
    ? Math.max(0, Number(shipping.delivery_charge) || 0) : 80
  const freeThreshold = shipping.free_shipping_threshold !== undefined && shipping.free_shipping_threshold !== null
    ? Math.max(0, Number(shipping.free_shipping_threshold) || 0) : 2999
  const instagram = normalizeInstagramSettings(s.instagram_feed)
  const content = s.homepage_content || {}
  return {
    ...Object.fromEntries(Object.entries(pick(s, [
      'brand_name', 'instagram', 'whatsapp', 'phone', 'email', 'address', 'logo_url',
      'combos_enabled', 'low_stock_threshold', 'saree_edit_image', 'brand_story',
      'brand_story_image', 'final_cta_image', 'campaign_image', 'ask_visitor_location',
    ])).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))),
    instagram_gallery: Array.isArray(s.instagram_gallery) ? s.instagram_gallery.filter((url) => typeof url === 'string') : [],
    hero: {
      ...pick(s.hero, ['title', 'kicker', 'subtitle', 'annotation', 'cta', 'cta_link']),
      images: Array.isArray(s.hero?.images) ? s.hero.images.filter((url) => typeof url === 'string') : [],
    },
    homepage_content: {
      ...Object.fromEntries(Object.keys(DEFAULT_HOMEPAGE_CONTENT)
        .filter((key) => typeof content[key] === 'string').map((key) => [key, content[key]])),
      section_order: normalizeHomeSectionOrder(content.section_order),
      section_visibility: normalizeHomeSectionVisibility(content.section_visibility),
    },
    shipping: {
      delivery_enabled: shipping.delivery_enabled !== false,
      delivery_charge: deliveryCharge,
      free_shipping_threshold: freeThreshold,
      free_delivery_threshold_enabled: shipping.free_delivery_threshold_enabled !== false,
      delivery_timeframe: shipping.delivery_timeframe || '5–7 working days',
      default_courier: shipping.default_courier || '',
      delivery_charges: shipping.delivery_charges || `Flat ₹${deliveryCharge}. Free above ₹${freeThreshold.toLocaleString('en-IN')}.`,
      return_policy: shipping.return_policy || 'Easy 3-day return on unworn pieces with tags.',
      exchange_policy: shipping.exchange_policy || 'Size exchange available within 5 days.',
    },
    instagram_feed: pick(instagram, [
      'enabled', 'username', 'posts_to_display', 'open_in_new_tab',
      'show_captions', 'show_username', 'enable_videos', 'feed_mode',
    ]),
    pwa: { install_prompt_enabled: s.pwa?.install_prompt_enabled !== false },
    reviews: { enabled: s.reviews?.enabled !== false },
    shop_by_occasion: {
      enabled: s.shop_by_occasion?.enabled !== false,
      occasions: normalizeOccasions(s.shop_by_occasion?.occasions ?? DEFAULT_OCCASIONS).map(publicOccasion),
    },
    checkout: {
      pay_online_enabled: s.checkout?.pay_online_enabled !== false,
      whatsapp_order_enabled: s.checkout?.whatsapp_order_enabled !== false,
    },
  }
}

export const publicProfile = publicCustomer

export function publicAddress(address) {
  if (!address) return null
  return pick(address, [
    'id', 'label', 'fullName', 'phone', 'addressLine1', 'addressLine2',
    'city', 'district', 'state', 'country', 'postalCode', 'isDefault',
  ])
}

const itemFields = [
  'product_id', 'product_name', 'sku', 'slug', 'image', 'size', 'colour',
  'quantity', 'price', 'savings', 'is_combo', 'combo_name', 'customer_title',
]
const componentFields = ['product_name', 'size', 'quantity']

function publicOrderItem(item) {
  return {
    ...pick(item, itemFields),
    components: Array.isArray(item?.components) ? item.components.map((entry) => pick(entry, componentFields)) : [],
    cancellation: pick(item?.cancellation, ['status', 'refund_status', 'amount']),
  }
}

export function publicOrderListItem(order) {
  if (!order) return null
  return {
    ...pick(order, ['id', 'order_number', 'status', 'payment_status', 'payment_method', 'created_at', 'total', 'refund_status']),
    items: Array.isArray(order.items) ? order.items.map(publicOrderItem) : [],
    refund: pick(order.refund, ['status', 'amount']),
    payment: pick(order.payment, ['refund_status']),
  }
}

export function publicOrder(order) {
  if (!order) return null
  return {
    ...pick(order, [
      'id', 'order_number', 'status', 'payment_status', 'payment_method',
      'created_at', 'updated_at', 'cancelled_at', 'cancellation_reason',
      'subtotal', 'discount', 'shipping', 'total', 'courier', 'tracking_number',
      'estimated_delivery', 'refund_status', 'refund_amount', 'payment_id',
    ]),
    items: Array.isArray(order.items) ? order.items.map(publicOrderItem) : [],
    customer: {
      ...pick(order.customer, [
        'name', 'fullName', 'house', 'street', 'addressLine1', 'addressLine2',
        'city', 'district', 'state', 'pincode', 'postalCode', 'country',
        'phone', 'whatsapp', 'email',
      ]),
      name: order.customer?.name || order.customer?.fullName || '',
      house: order.customer?.house || order.customer?.addressLine1 || '',
      street: order.customer?.street || order.customer?.addressLine2 || '',
      pincode: order.customer?.pincode || order.customer?.postalCode || '',
    },
    refund: pick(order.refund, ['status', 'amount', 'partial_amount_total', 'cf_refund_id']),
    payment: pick(order.payment, [
      'status', 'cashfree_payment_id', 'failure_reason', 'refund_status',
      'refund_amount', 'cashfree_refund_id',
    ]),
  }
}

export function validateProfilePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid profile update.' }
  const allowed = new Set(['name', 'phone', 'image'])
  if (Object.keys(body).some((key) => !allowed.has(key))) return { error: 'Unsupported profile field.' }
  const update = {}
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'Enter a valid name.' }
    update.name = body.name.trim()
  }
  if (Object.hasOwn(body, 'phone')) {
    if (typeof body.phone !== 'string') return { error: 'Enter a valid phone number.' }
    update.phone = body.phone.trim()
  }
  if (Object.hasOwn(body, 'image')) {
    if (body.image !== null) {
      let validImage = false
      try {
        const imageUrl = new URL(body.image)
        validImage = typeof body.image === 'string' && imageUrl.protocol === 'https:' &&
          imageUrl.hostname === 'res.cloudinary.com' && !imageUrl.username && !imageUrl.password &&
          /^\/[a-z0-9_-]+\/image\/upload\/.+/i.test(imageUrl.pathname)
      } catch {}
      if (!validImage) return { error: 'Profile image must be a secure Cloudinary image URL.' }
    }
    update.image = body.image
  }
  if (!Object.keys(update).length) return { error: 'No supported profile fields were provided.' }
  return { update }
}
