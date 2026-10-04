import { v4 as uuidv4 } from 'uuid'

/**
 * Normalizes and slugifies a string.
 */
export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/**
 * Ensures default curated combos are seeded in the database if the combos collection is empty.
 */
export async function ensureCombosSeeded(database) {
  const collection = database.collection('combos')
  const now = new Date()

  // Fetch categories & products to seed realistic slots
  const categories = await database.collection('categories').find({ active: true }).toArray()
  const sareesCat = categories.find((c) => c.slug === 'sarees') || categories[0]
  const cropsCat = categories.find((c) => c.slug === 'crop-tops') || categories[1] || categories[0]

  const products = await database.collection('products').find({ active: true }).toArray()
  const sampleSaree = products.find((p) => p.category_id === sareesCat?.id) || products[0]
  const sampleCrop = products.find((p) => p.category_id === cropsCat?.id) || products[1] || products[0]

  const seedCombos = [
    {
      id: uuidv4(),
      name: 'Atelier Saree & Crop Blouse Curated Ensemble',
      customer_title: 'Pick 1 Saree + Pick 1 Crop Top for ₹3,499',
      slug: 'saree-crop-blouse-curated-ensemble',
      description: 'Pair an ethereal handcrafted saree with a contemporary tailored crop blouse for a quintessential modern celebration look.',
      image: sareesCat?.image || '/api/media/file/seed-01.jpg',
      media: [
        {
          id: uuidv4(),
          type: 'image',
          url: sareesCat?.image || '/api/media/file/seed-01.jpg',
          display_order: 0,
          is_primary: true,
        },
      ],
      type: 'PICK_AND_CHOOSE', // FIXED | PICK_AND_CHOOSE | BUY_X_FOR_Y | MULTI_CATEGORY | CURATED_OUTFIT
      pricing_method: 'fixed_price', // fixed_price | percentage_discount | flat_discount
      combo_price: 3499,
      discount_value: 0,
      min_value: 0,
      max_discount: null,
      allow_coupons: true,
      start_date: null,
      expiry_date: null,
      active: true,
      display_order: 1,
      slots: [
        {
          id: 'slot_saree',
          name: 'Choose your Handcrafted Saree',
          required: true,
          quantity: 1,
          min_quantity: 1,
          max_quantity: 1,
          source_type: 'category', // category | product_list | any | fixed_product
          category_id: sareesCat ? String(sareesCat.id) : null,
          category_name: sareesCat ? sareesCat.name : 'Sarees',
          category_slug: sareesCat ? sareesCat.slug : 'sarees',
          product_ids: [],
          excluded_product_ids: [],
        },
        {
          id: 'slot_crop',
          name: 'Choose your Crop Blouse',
          required: true,
          quantity: 1,
          min_quantity: 1,
          max_quantity: 1,
          source_type: 'category',
          category_id: cropsCat ? String(cropsCat.id) : null,
          category_name: cropsCat ? cropsCat.name : 'Crop Tops',
          category_slug: cropsCat ? cropsCat.slug : 'crop-tops',
          product_ids: [],
          excluded_product_ids: [],
        },
      ],
      stats: {
        added_to_cart_count: 0,
        times_purchased: 0,
        units_sold: 0,
        revenue_generated: 0,
        total_savings: 0,
        popular_products: {},
      },
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      name: 'Double Crop Top Everyday Duo',
      customer_title: 'Pick Any 2 Crop Tops for ₹1,999',
      slug: 'double-crop-top-everyday-duo',
      description: 'Select two of your favourite silhouette crop tops designed for breathable, effortless styling.',
      image: cropsCat?.image || '/api/media/file/seed-07.jpg',
      media: [
        {
          id: uuidv4(),
          type: 'image',
          url: cropsCat?.image || '/api/media/file/seed-07.jpg',
          display_order: 0,
          is_primary: true,
        },
      ],
      type: 'BUY_X_FOR_Y',
      pricing_method: 'fixed_price',
      combo_price: 1999,
      discount_value: 0,
      min_value: 0,
      max_discount: null,
      allow_coupons: true,
      start_date: null,
      expiry_date: null,
      active: true,
      display_order: 2,
      slots: [
        {
          id: 'slot_crop_1',
          name: 'Choose First Crop Top',
          required: true,
          quantity: 1,
          min_quantity: 1,
          max_quantity: 1,
          source_type: 'category',
          category_id: cropsCat ? String(cropsCat.id) : null,
          category_name: cropsCat ? cropsCat.name : 'Crop Tops',
          category_slug: cropsCat ? cropsCat.slug : 'crop-tops',
          product_ids: [],
          excluded_product_ids: [],
        },
        {
          id: 'slot_crop_2',
          name: 'Choose Second Crop Top',
          required: true,
          quantity: 1,
          min_quantity: 1,
          max_quantity: 1,
          source_type: 'category',
          category_id: cropsCat ? String(cropsCat.id) : null,
          category_name: cropsCat ? cropsCat.name : 'Crop Tops',
          category_slug: cropsCat ? cropsCat.slug : 'crop-tops',
          product_ids: [],
          excluded_product_ids: [],
        },
      ],
      stats: {
        added_to_cart_count: 0,
        times_purchased: 0,
        units_sold: 0,
        revenue_generated: 0,
        total_savings: 0,
        popular_products: {},
      },
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      name: 'Summer Crop & Handloom Trousers Set',
      customer_title: 'Complete 2-Piece Curated Look for ₹2,499',
      slug: 'summer-crop-and-handloom-trousers-set',
      description: 'A hand-coordinated 2-piece outfit featuring our breathable crop silhouette paired with bespoke trousers. Select your individual colour and size variants for each piece.',
      image: sampleCrop?.media?.[0]?.url || '/api/media/file/seed-07.jpg',
      media: [
        {
          id: uuidv4(),
          type: 'image',
          url: sampleCrop?.media?.[0]?.url || '/api/media/file/seed-07.jpg',
          display_order: 0,
          is_primary: true,
        },
        {
          id: uuidv4(),
          type: 'image',
          url: sampleSaree?.media?.[0]?.url || '/api/media/file/seed-01.jpg',
          display_order: 1,
          is_primary: false,
        },
      ],
      type: 'CURATED_OUTFIT',
      pricing_method: 'fixed_price',
      combo_price: 2499,
      discount_value: 0,
      min_value: 0,
      max_discount: null,
      allow_coupons: true,
      start_date: null,
      expiry_date: null,
      active: true,
      display_order: 3,
      slots: [
        {
          id: 'outfit_comp_1',
          name: 'Handloom Crop Top',
          required: true,
          quantity: 1,
          source_type: 'fixed_product',
          product_id: sampleCrop ? String(sampleCrop.id) : null,
          product_name: sampleCrop ? sampleCrop.name : 'Crop Top',
        },
        {
          id: 'outfit_comp_2',
          name: 'Handcrafted Drape Trousers',
          required: true,
          quantity: 1,
          source_type: 'fixed_product',
          product_id: sampleSaree ? String(sampleSaree.id) : null,
          product_name: sampleSaree ? sampleSaree.name : 'Drape Piece',
        },
      ],
      stats: {
        added_to_cart_count: 0,
        times_purchased: 0,
        units_sold: 0,
        revenue_generated: 0,
        total_savings: 0,
        popular_products: {},
      },
      created_at: now,
      updated_at: now,
    },
  ]

  for (const seed of seedCombos) {
    const existing = await collection.findOne({ slug: seed.slug })
    if (!existing) {
      await collection.insertOne(seed)
    } else if (!existing.slots || existing.slots.length === 0) {
      await collection.updateOne({ _id: existing._id }, { $set: { slots: seed.slots, type: seed.type } })
    }
  }

  // Backward compatibility migration: strip any legacy hard-coded allowed_colours
  try {
    await collection.updateMany(
      { 'slots.allowed_colours': { $exists: true } },
      { $unset: { 'slots.$[].allowed_colours': '' } }
    )
  } catch {
    // ignore if un-migrated
  }
}

/**
 * Evaluates whether a combo is currently active and within valid date ranges.
 */
export function isComboActive(combo) {
  if (!combo || combo.active === false) return false

  const now = new Date()
  if (combo.start_date && new Date(combo.start_date) > now) return false
  if (combo.expiry_date && new Date(combo.expiry_date) < now) return false

  return true
}

/**
 * Authoritatively extracts the list of available colour variants directly from a product document.
 * The product is the single source of truth for its colours.
 */
export function extractProductColours(product) {
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

/**
 * Normalizes and validates slot definitions submitted from the admin combo creator / editor.
 * Ensures that CURATED_OUTFIT or fixed_product slots contain valid, existing product references.
 */
export async function normalizeAndValidateAdminSlots({ database, comboType, slots }) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return { valid: false, error: 'At least one component or selection slot is required in a combo' }
  }

  const normalizedSlots = []
  for (let idx = 0; idx < slots.length; idx++) {
    const s = slots[idx]
    const slotIdx = idx + 1
    const slotName = String(s.name || `Component ${slotIdx}`).trim()
    const sourceType = ['fixed_product', 'category', 'product_list', 'any'].includes(s.source_type)
      ? s.source_type
      : (comboType === 'CURATED_OUTFIT' ? 'fixed_product' : 'category')

    let productId = s.product_id ? String(s.product_id).trim() : null
    let productName = s.product_name ? String(s.product_name).trim() : ''
    let productSlug = s.product_slug ? String(s.product_slug).trim() : ''

    // If source_type is fixed_product or comboType is CURATED_OUTFIT
    if (sourceType === 'fixed_product' || comboType === 'CURATED_OUTFIT') {
      if (!productId) {
        return {
          valid: false,
          error: `Please select an exact product for Component #${slotIdx} (${slotName}).`,
        }
      }

      // Verify referenced product exists in database
      const product = await database.collection('products').findOne({ id: productId })
      if (!product) {
        return {
          valid: false,
          error: `Referenced product for Component #${slotIdx} (${slotName}) was not found in the atelier catalog (product_id: "${productId}").`,
        }
      }

      productName = product.name || productName
      productSlug = product.slug || productSlug
    }

    normalizedSlots.push({
      id: s.id || `slot_${slotIdx}_${uuidv4().slice(0, 6)}`,
      name: slotName,
      required: s.required !== false,
      quantity: Math.max(1, Number(s.quantity) || 1),
      min_quantity: Math.max(1, Number(s.min_quantity) || 1),
      max_quantity: Math.max(1, Number(s.max_quantity) || 1),
      source_type: sourceType,
      product_id: productId,
      product_name: productName,
      product_slug: productSlug,
      category_id: s.category_id ? String(s.category_id).trim() : null,
      category_name: s.category_name || '',
      category_slug: s.category_slug || '',
      product_ids: Array.isArray(s.product_ids) ? s.product_ids.map(String) : [],
      excluded_product_ids: Array.isArray(s.excluded_product_ids) ? s.excluded_product_ids.map(String) : [],
    })
  }

  return { valid: true, slots: normalizedSlots }
}

/**
 * Populates eligible products for all slots in a combo for public browsing / builder.
 */
export async function populateComboSlots({ database, combo }) {
  if (!combo || !Array.isArray(combo.slots)) return combo

  const populatedSlots = await Promise.all(
    combo.slots.map(async (slot) => {
      let query = { active: { $ne: false } }

      if (slot.source_type === 'fixed_product' || slot.product_id) {
        const pid = String(slot.product_id || (Array.isArray(slot.product_ids) ? slot.product_ids[0] : ''))
        query.id = pid
      } else if (slot.source_type === 'category') {
        if (slot.category_id) {
          query.category_id = slot.category_id
        } else if (slot.category_slug) {
          const cat = await database.collection('categories').findOne({ slug: slot.category_slug })
          if (cat) query.category_id = cat.id
        }
      } else if (slot.source_type === 'product_list') {
        const pids = Array.isArray(slot.product_ids) ? slot.product_ids : []
        query.id = { $in: pids }
      }

      if (Array.isArray(slot.excluded_product_ids) && slot.excluded_product_ids.length > 0) {
        query.id = { ...(query.id || {}), $nin: slot.excluded_product_ids }
      }

      const products = await database
        .collection('products')
        .find(query)
        .sort({ display_order: 1, created_at: -1 })
        .toArray()

      // Map clean product cards for frontend selection
      const cleanProducts = products.map((p) => {
        const primaryImage =
          p.media?.find((m) => m.is_primary)?.url ||
          p.media?.find((m) => m.type !== 'video')?.url ||
          p.media?.[0]?.url ||
          p.image ||
          ''

        const unitPrice = Math.max(0, Number(p.discount_price || p.price) || 0)
        const originalPrice = Math.max(0, Number(p.price) || unitPrice)

        // Determine available colours directly from the product
        const productColours = extractProductColours(p)

        return {
          id: String(p.id),
          name: p.name,
          slug: p.slug,
          sku: p.sku || 'TC-PIECE',
          category_id: p.category_id,
          category_name: p.category_name,
          price: unitPrice,
          original_price: originalPrice,
          discount_price: p.discount_price,
          stock: Math.max(0, Number(p.stock ?? 0)),
          sizes: Array.isArray(p.sizes) && p.sizes.length > 0
            ? p.sizes
            : [{ size: 'Free Size', available: true, stock: p.stock || 1 }],
          colour: p.colour || '',
          colours: productColours,
          fabric: p.fabric || '',
          image: primaryImage,
          media: p.media || [],
        }
      })

      const primaryProduct = cleanProducts[0] || null

      return {
        ...slot,
        product: primaryProduct,
        eligible_products: cleanProducts,
        allowed_colours: extractProductColours(primaryProduct),
        allowed_sizes: primaryProduct?.sizes || [{ size: 'Free Size', available: true, stock: 1 }],
      }
    })
  )

  return {
    ...combo,
    slots: populatedSlots,
  }
}

/**
 * Authoritative Server-Side Combo Validator & Pricing Calculator.
 *
 * Checks:
 * 1. Combo exists and is active within start/expiry dates.
 * 2. All required slots have valid selections.
 * 3. Each selected product exists in database, is active, and matches slot source/category/restrictions.
 * 4. Each selected product has sufficient stock for the requested combo quantity.
 * 5. Selected variant/size exists on the product.
 * 6. Calculates authoritative regular price, combo price, discount amount, and savings.
 */
export async function validateAndCalculateCombo({
  database,
  comboId,
  selections = [],
  quantity = 1,
}) {
  await ensureCombosSeeded(database)

  const cleanComboId = String(comboId || '').trim()
  if (!cleanComboId) {
    return { success: false, error: 'Combo ID is required.' }
  }

  const combo = await database.collection('combos').findOne({
    $or: [{ id: cleanComboId }, { slug: cleanComboId }],
  })

  if (!combo) {
    return { success: false, error: 'Curated combo not found.' }
  }

  const globalSettings = await database.collection('settings').findOne({ id: 'global' })
  if (globalSettings && globalSettings.combos_enabled === false) {
    return {
      success: false,
      error: 'Curated Combos & Ensembles are currently disabled by the atelier.',
    }
  }

  if (!isComboActive(combo)) {
    return {
      success: false,
      error: `The combo "${combo.name}" is currently inactive or has expired.`,
    }
  }

  const comboQty = Math.max(1, Math.floor(Number(quantity) || 1))
  const slots = Array.isArray(combo.slots) ? combo.slots : []

  // Organize selections by slot_id
  const selectionsMap = new Map()
  for (const sel of selections) {
    if (sel && sel.slot_id) {
      selectionsMap.set(String(sel.slot_id), sel)
    }
  }

  const verifiedComponents = []
  let totalRegularSum = 0
  let totalOriginalSum = 0

  for (const slot of slots) {
    const isRequired = slot.required !== false
    const selection = selectionsMap.get(String(slot.id))

    if (isRequired && (!selection || !selection.product_id)) {
      return {
        success: false,
        error: `Please complete the selection for "${slot.name || 'Required Slot'}".`,
        slotId: slot.id,
      }
    }

    if (selection && selection.product_id) {
      const productId = String(selection.product_id).trim()
      const product = await database.collection('products').findOne({ id: productId })

      if (!product || product.active === false) {
        return {
          success: false,
          error: `Selected piece for "${slot.name}" is no longer available.`,
          slotId: slot.id,
        }
      }

      // Verify fixed product match if slot is fixed_product
      if ((slot.source_type === 'fixed_product' || slot.product_id) && slot.product_id) {
        if (String(product.id) !== String(slot.product_id)) {
          return {
            success: false,
            error: `"${product.name}" does not match the configured piece for "${slot.name}".`,
            slotId: slot.id,
          }
        }
      }

      // Verify category match if source_type is category
      if (slot.source_type === 'category' && slot.category_id) {
        if (String(product.category_id) !== String(slot.category_id)) {
          return {
            success: false,
            error: `"${product.name}" does not belong to the category configured for "${slot.name}".`,
            slotId: slot.id,
          }
        }
      }

      // Verify product restriction if source_type is product_list
      if (slot.source_type === 'product_list' && Array.isArray(slot.product_ids) && slot.product_ids.length > 0) {
        if (!slot.product_ids.includes(product.id)) {
          return {
            success: false,
            error: `"${product.name}" is not an eligible option for "${slot.name}".`,
            slotId: slot.id,
          }
        }
      }

      // Verify excluded products
      if (Array.isArray(slot.excluded_product_ids) && slot.excluded_product_ids.includes(product.id)) {
        return {
          success: false,
          error: `"${product.name}" cannot be used in this combo slot.`,
          slotId: slot.id,
        }
      }

      // Verify stock
      const compQty = Math.max(1, Math.floor(Number(slot.quantity || selection.quantity || 1)))
      const totalNeededStock = compQty * comboQty
      const availableStock = Math.max(0, Number(product.stock ?? 0))

      if (availableStock < totalNeededStock) {
        return {
          success: false,
          error: `Insufficient atelier stock for "${product.name}". Only ${availableStock} piece(s) available.`,
          slotId: slot.id,
          productId: product.id,
        }
      }

      // Colour / Variant verification: STRICTLY DERIVED FROM LIVE PRODUCT DOCUMENT
      const productColours = extractProductColours(product)

      let chosenColour = selection.colour ? String(selection.colour).trim() : ''
      if (!chosenColour) {
        chosenColour = productColours[0] || 'Standard'
      } else {
        // Authoritative check that the requested colour belongs to this product
        const hasColour = productColours.some(
          (c) => c.toLowerCase() === chosenColour.toLowerCase()
        )
        if (!hasColour && productColours.length > 0 && productColours[0] !== 'Standard') {
          return {
            success: false,
            error: `Colour "${chosenColour}" is not available for "${product.name}". Available colours: ${productColours.join(', ')}.`,
            slotId: slot.id,
            productId: product.id,
          }
        }
      }

      // Size / Variant verification
      let chosenSize = selection.size ? String(selection.size).trim() : ''
      if (!chosenSize) {
        chosenSize = product.sizes?.[0]?.size || 'Free Size'
      } else {
        if (Array.isArray(product.sizes) && product.sizes.length > 0) {
          const matchedSize = product.sizes.find((s) => s.size === chosenSize)
          if (!matchedSize || matchedSize.available === false) {
            return {
              success: false,
              error: `Size "${chosenSize}" for "${product.name}" is out of stock.`,
              slotId: slot.id,
              productId: product.id,
            }
          }
          if (matchedSize && matchedSize.stock !== undefined && Number(matchedSize.stock) < totalNeededStock) {
            return {
              success: false,
              error: `Size "${chosenSize}" for "${product.name}" is out of stock.`,
              slotId: slot.id,
              productId: product.id,
            }
          }
        }
      }

      const unitPrice = Math.max(0, Number(product.discount_price || product.price) || 0)
      const originalPrice = Math.max(0, Number(product.price) || unitPrice)

      totalRegularSum += unitPrice * compQty
      totalOriginalSum += originalPrice * compQty

      const primaryImage =
        product.media?.find((m) => m.is_primary)?.url ||
        product.media?.find((m) => m.type !== 'video')?.url ||
        product.media?.[0]?.url ||
        product.image ||
        ''

      verifiedComponents.push({
        slot_id: slot.id,
        slot_name: slot.name,
        product_id: String(product.id),
        product_name: product.name,
        slug: product.slug,
        sku: product.sku || 'TC-PIECE',
        category_id: product.category_id,
        category_name: product.category_name,
        size: chosenSize,
        colour: chosenColour,
        price: unitPrice,
        original_price: originalPrice,
        image: primaryImage,
        quantity: compQty,
      })
    }
  }

  // Authoritative Combo Pricing Calculation
  let comboUnitPrice = 0
  const pricingMethod = combo.pricing_method || 'fixed_price'

  if (pricingMethod === 'fixed_price') {
    comboUnitPrice = Math.max(0, Number(combo.combo_price) || 0)
  } else if (pricingMethod === 'percentage_discount') {
    const pct = Math.max(0, Math.min(100, Number(combo.discount_value) || 0))
    let discount = Math.round((totalRegularSum * pct) / 100)
    if (combo.max_discount && Number(combo.max_discount) > 0) {
      discount = Math.min(discount, Number(combo.max_discount))
    }
    comboUnitPrice = Math.max(0, totalRegularSum - discount)
  } else if (pricingMethod === 'flat_discount') {
    const flat = Math.max(0, Number(combo.discount_value) || 0)
    comboUnitPrice = Math.max(0, totalRegularSum - flat)
  } else {
    comboUnitPrice = Math.max(0, Number(combo.combo_price) || totalRegularSum)
  }

  const regularPrice = totalRegularSum
  const originalPrice = totalOriginalSum
  const savings = Math.max(0, regularPrice - comboUnitPrice)
  const totalComboPrice = comboUnitPrice * comboQty

  const primaryComboImage =
    combo.media?.find((m) => m.is_primary)?.url ||
    combo.image ||
    verifiedComponents[0]?.image ||
    ''

  return {
    success: true,
    combo: {
      id: combo.id,
      slug: combo.slug,
      name: combo.name,
      customer_title: combo.customer_title || combo.name,
      description: combo.description || '',
      type: combo.type,
      allow_coupons: combo.allow_coupons !== false,
      image: primaryComboImage,
    },
    verifiedComponents,
    quantity: comboQty,
    pricing: {
      regular_price: regularPrice,
      original_price: originalPrice,
      combo_price: comboUnitPrice,
      savings_per_unit: savings,
      total_savings: savings * comboQty,
      unit_price: comboUnitPrice,
      total_price: totalComboPrice,
      allow_coupons: combo.allow_coupons !== false,
    },
  }
}

/**
 * Atomically increments performance stats for a combo upon successful order placement.
 */
export async function recordComboSaleStats({
  database,
  comboId,
  comboQuantity = 1,
  revenue = 0,
  savings = 0,
  componentProductIds = [],
}) {
  if (!comboId) return

  const qty = Math.max(1, Number(comboQuantity) || 1)
  const rev = Math.max(0, Number(revenue) || 0)
  const sav = Math.max(0, Number(savings) || 0)

  const incObj = {
    'stats.times_purchased': 1,
    'stats.units_sold': qty,
    'stats.revenue_generated': rev,
    'stats.total_savings': sav,
  }

  for (const pid of componentProductIds) {
    if (pid) {
      incObj[`stats.popular_products.${pid}`] = (incObj[`stats.popular_products.${pid}`] || 0) + qty
    }
  }

  await database.collection('combos').updateOne(
    { id: comboId },
    {
      $inc: incObj,
      $set: { updated_at: new Date() },
    }
  )
}

