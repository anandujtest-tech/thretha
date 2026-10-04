import { v4 as uuidv4 } from 'uuid'
import { validateAndCalculateCombo } from './combos.js'

/**
 * Normalizes a coupon code: trimmed and uppercase.
 */
export function normalizeCouponCode(code) {
  if (!code || typeof code !== 'string') return ''
  return code.trim().toUpperCase()
}

/**
 * Seeds default coupons and free delivery rules if they don't exist yet.
 */
export async function ensurePromotionsSeeded(database) {
  const couponsCol = database.collection('coupons')
  const freeRulesCol = database.collection('free_delivery_rules')

  // Create indexes
  try {
    await couponsCol.createIndex({ code: 1 }, { unique: true })
    await database.collection('coupon_usages').createIndex({ couponId: 1, email: 1, phone: 1, userId: 1 })
    await database.collection('coupon_usages').createIndex({ orderId: 1 }, { unique: true })
  } catch (err) {
    // Indexes might already exist
  }

  const existingCouponsCount = await couponsCol.countDocuments({})
  if (existingCouponsCount === 0) {
    const now = new Date()
    const defaultCoupons = [
      {
        id: uuidv4(),
        code: 'THRETHA10',
        description: '10% off on orders above ₹1,499 (Max discount ₹500)',
        discountType: 'percentage',
        discountValue: 10,
        minOrderValue: 1499,
        maxDiscount: 500,
        usageLimit: null,
        usageCount: 0,
        perCustomerLimit: null,
        startAt: null,
        expiresAt: null,
        firstOrderOnly: false,
        appliesTo: 'all',
        categoryIds: [],
        productIds: [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuidv4(),
        code: 'FESTIVE15',
        description: '15% festive discount on orders above ₹2,999 (Max discount ₹1,000)',
        discountType: 'percentage',
        discountValue: 15,
        minOrderValue: 2999,
        maxDiscount: 1000,
        usageLimit: null,
        usageCount: 0,
        perCustomerLimit: null,
        startAt: null,
        expiresAt: null,
        firstOrderOnly: false,
        appliesTo: 'all',
        categoryIds: [],
        productIds: [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: uuidv4(),
        code: 'ATELIER200',
        description: 'Flat ₹200 off on atelier collection above ₹1,999',
        discountType: 'fixed',
        discountValue: 200,
        minOrderValue: 1999,
        maxDiscount: null,
        usageLimit: null,
        usageCount: 0,
        perCustomerLimit: null,
        startAt: null,
        expiresAt: null,
        firstOrderOnly: false,
        appliesTo: 'all',
        categoryIds: [],
        productIds: [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]
    await couponsCol.insertMany(defaultCoupons)
  }

  const existingRulesCount = await freeRulesCol.countDocuments({})
  if (existingRulesCount === 0) {
    const now = new Date()
    const defaultRule = {
      id: uuidv4(),
      name: 'Free Pan-India Express Delivery above ₹2,999',
      minOrderValue: 2999,
      maxOrderValue: null,
      appliesTo: 'all',
      categoryIds: [],
      productIds: [],
      couponCode: null,
      startAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
    await freeRulesCol.insertOne(defaultRule)
  }
}

/**
 * Validates a coupon or free delivery promotion code against current cart items, subtotal, and customer context.
 */
export async function validateCoupon({
  database,
  couponCode,
  subtotal,
  verifiedItems = [],
  customer = null,
  userId = null,
}) {
  const cleanCode = normalizeCouponCode(couponCode)
  if (!cleanCode) {
    return { valid: false, error: 'Coupon code is required.' }
  }

  const now = new Date()

  // 1. First, search coupons collection
  const coupon = await database.collection('coupons').findOne({
    code: cleanCode,
  })

  if (coupon) {
    if (!coupon.isActive) {
      return { valid: false, error: 'This coupon has been disabled.' }
    }

    if (coupon.startAt && new Date(coupon.startAt) > now) {
      return { valid: false, error: 'This coupon is not yet active.' }
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
      return { valid: false, error: 'Coupon has expired.' }
    }

    if (
      coupon.usageLimit !== null &&
      coupon.usageLimit !== undefined &&
      coupon.usageCount >= coupon.usageLimit
    ) {
      return { valid: false, error: 'This coupon has reached its usage limit.' }
    }

    // Check per-customer limit if configured
    const custEmail = (customer?.email || '').trim().toLowerCase()
    const custPhone = (customer?.phone || customer?.whatsapp || '').replace(/[^0-9]/g, '')

    if (coupon.perCustomerLimit && (userId || custEmail || custPhone)) {
      const queryConditions = []
      if (userId) queryConditions.push({ userId })
      if (custEmail) queryConditions.push({ email: custEmail })
      if (custPhone) queryConditions.push({ phone: custPhone })

      const usageCountForCustomer = await database.collection('coupon_usages').countDocuments({
        couponId: coupon.id,
        $or: queryConditions,
      })

      if (usageCountForCustomer >= coupon.perCustomerLimit) {
        return {
          valid: false,
          error: `This coupon has reached your limit of ${coupon.perCustomerLimit} usage(s).`,
        }
      }
    }

    // Check first-order only requirement
    if (coupon.firstOrderOnly) {
      const orderQuery = []
      if (userId) orderQuery.push({ 'user.id': userId })
      if (custEmail) orderQuery.push({ 'customer.email': custEmail })
      if (custPhone) {
        orderQuery.push({ 'customer.phone': { $regex: custPhone } })
        orderQuery.push({ 'customer.whatsapp': { $regex: custPhone } })
      }

      if (orderQuery.length > 0) {
        const pastOrders = await database.collection('orders').countDocuments({
          $or: orderQuery,
          payment_status: { $in: ['PAID', 'CONFIRMED'] },
        })
        if (pastOrders > 0) {
          return { valid: false, error: 'This coupon is valid for first orders only.' }
        }
      }
    }

    // Calculate applicable subtotal based on scope (all / categories / products)
    let applicableSubtotal = 0
    let matchedItemsCount = 0

    if (coupon.appliesTo === 'categories' && Array.isArray(coupon.categoryIds) && coupon.categoryIds.length > 0) {
      const categorySet = new Set(coupon.categoryIds)
      for (const it of verifiedItems) {
        if (it.allow_coupons === false) continue

        if (it.is_combo && Array.isArray(it.components)) {
          const hasMatchingComp = it.components.some((c) => categorySet.has(c.category_id))
          if (hasMatchingComp) {
            applicableSubtotal += it.price * it.quantity
            matchedItemsCount++
          }
        } else if (categorySet.has(it.category_id)) {
          applicableSubtotal += it.price * it.quantity
          matchedItemsCount++
        }
      }
      if (matchedItemsCount === 0 && verifiedItems.length > 0) {
        return {
          valid: false,
          error: 'This coupon applies only to specific categories not in your bag.',
        }
      }
    } else if (coupon.appliesTo === 'products' && Array.isArray(coupon.productIds) && coupon.productIds.length > 0) {
      const productSet = new Set(coupon.productIds)
      for (const it of verifiedItems) {
        if (it.allow_coupons === false) continue

        if (it.is_combo && Array.isArray(it.components)) {
          const hasMatchingComp = it.components.some((c) => productSet.has(c.product_id))
          if (hasMatchingComp) {
            applicableSubtotal += it.price * it.quantity
            matchedItemsCount++
          }
        } else if (productSet.has(it.product_id)) {
          applicableSubtotal += it.price * it.quantity
          matchedItemsCount++
        }
      }
      if (matchedItemsCount === 0 && verifiedItems.length > 0) {
        return {
          valid: false,
          error: 'This coupon applies only to specific products not in your bag.',
        }
      }
    } else {
      // Entire store (excluding combos with allow_coupons = false)
      for (const it of verifiedItems) {
        if (it.allow_coupons === false) continue
        applicableSubtotal += it.price * it.quantity
        matchedItemsCount++
      }

      if (matchedItemsCount === 0 && verifiedItems.length > 0) {
        return {
          valid: false,
          error: 'Coupons cannot be applied to the curated combos in your bag.',
        }
      }
    }

    // Check minimum order value against applicable subtotal (or whole cart subtotal)
    const minOrder = Number(coupon.minOrderValue) || 0
    if (applicableSubtotal < minOrder) {
      return {
        valid: false,
        error: `Minimum order value is ₹${minOrder.toLocaleString('en-IN')}.`,
      }
    }

    // Calculate discount amount
    let discountAmount = 0
    if (coupon.discountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, Number(coupon.discountValue) || 0))
      discountAmount = Math.round((applicableSubtotal * pct) / 100)
      if (coupon.maxDiscount && coupon.maxDiscount > 0) {
        discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount))
      }
    } else {
      // Fixed amount
      discountAmount = Math.min(Number(coupon.discountValue) || 0, applicableSubtotal)
    }

    // Never exceed applicable subtotal
    discountAmount = Math.max(0, Math.min(discountAmount, subtotal))

    return {
      valid: true,
      type: 'coupon',
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: 'coupon',
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minOrderValue: coupon.minOrderValue,
        description: coupon.description,
        appliesTo: coupon.appliesTo,
      },
      discountAmount,
    }
  }

  // 2. If NO coupon document exists with that code, check free_delivery_rules
  const freeRule = await database.collection('free_delivery_rules').findOne({
    $or: [
      { couponCode: cleanCode },
      { couponCode: { $regex: new RegExp(`^${cleanCode}$`, 'i') } },
    ],
  })

  if (freeRule) {
    if (!freeRule.isActive) {
      return { valid: false, error: 'This promotion is no longer active.' }
    }

    if (freeRule.startAt && new Date(freeRule.startAt) > now) {
      return { valid: false, error: 'This promotion is not yet active.' }
    }

    if (freeRule.expiresAt && new Date(freeRule.expiresAt) < now) {
      return { valid: false, error: 'This promotion has expired.' }
    }

    // Scope check
    if (freeRule.appliesTo === 'categories' && Array.isArray(freeRule.categoryIds) && freeRule.categoryIds.length > 0) {
      const catSet = new Set(freeRule.categoryIds)
      const hasMatch = verifiedItems.some((it) => catSet.has(it.category_id))
      if (!hasMatch && verifiedItems.length > 0) {
        return {
          valid: false,
          error: 'This free-delivery offer applies only to specific categories not in your bag.',
        }
      }
    } else if (freeRule.appliesTo === 'products' && Array.isArray(freeRule.productIds) && freeRule.productIds.length > 0) {
      const prodSet = new Set(freeRule.productIds)
      const hasMatch = verifiedItems.some((it) => prodSet.has(it.product_id))
      if (!hasMatch && verifiedItems.length > 0) {
        return {
          valid: false,
          error: 'This free-delivery offer applies only to specific products not in your bag.',
        }
      }
    }

    const minOrder = Number(freeRule.minOrderValue) || 0
    if (subtotal < minOrder) {
      return {
        valid: false,
        error: `Minimum order value for this offer is ₹${minOrder.toLocaleString('en-IN')}.`,
      }
    }

    if (freeRule.maxOrderValue && subtotal > freeRule.maxOrderValue) {
      return {
        valid: false,
        error: `Maximum order value for this offer is ₹${freeRule.maxOrderValue.toLocaleString('en-IN')}.`,
      }
    }

    return {
      valid: true,
      type: 'free_delivery',
      coupon: {
        id: freeRule.id,
        code: cleanCode,
        type: 'free_delivery',
        discountType: 'free_delivery',
        discountValue: 0,
        minOrderValue: freeRule.minOrderValue || 0,
        name: freeRule.name || 'Free Delivery',
        description: freeRule.name || 'Free Delivery Promotion',
        isFreeShipping: true,
        shippingCharge: 0,
      },
      discountAmount: 0,
      freeDeliveryRule: freeRule,
    }
  }

  // 3. Neither coupon nor free delivery trigger code matched
  return { valid: false, error: 'Coupon code is invalid.' }
}

/**
 * Authoritative Server-Side Shipping Calculation Engine.
 * Shared across cart preview, checkout, order creation, Cashfree payments, and WhatsApp concierge.
 *
 * Rules Precedence:
 * 1. Delivery Disabled (delivery_enabled === false) -> shipping = 0, reason = "DELIVERY_DISABLED"
 * 2. Explicit Free Delivery Promotion / Coupon / Rule -> shipping = 0, reason = "PROMOTION"
 * 3. Global Free Delivery Threshold Reached (enabled !== false && subtotal >= threshold) -> shipping = 0, reason = "FREE_DELIVERY_THRESHOLD"
 * 4. Otherwise -> shipping = configured delivery_charge, reason = "STANDARD"
 */
export function calculateShipping({
  subtotal = 0,
  settings = null,
  appliedPromotion = null,
  freeDeliveryRule = null,
}) {
  const shippingSettings = settings?.shipping || {}
  const deliveryEnabled = shippingSettings.delivery_enabled !== false
  const defaultCharge = Math.max(
    0,
    shippingSettings.delivery_charge !== undefined && shippingSettings.delivery_charge !== null
      ? Number(shippingSettings.delivery_charge) || 0
      : 80
  )
  const freeThresholdEnabled = shippingSettings.free_delivery_threshold_enabled !== false
  const freeThreshold = Math.max(
    0,
    shippingSettings.free_shipping_threshold !== undefined && shippingSettings.free_shipping_threshold !== null
      ? Number(shippingSettings.free_shipping_threshold) || 0
      : 2999
  )
  const deliveryTimeframe = shippingSettings.delivery_timeframe || '5–7 working days'

  // Snapshot of active rules to persist on orders
  const snapshot = {
    delivery_enabled: deliveryEnabled,
    delivery_charge: defaultCharge,
    free_shipping_threshold: freeThreshold,
    free_delivery_threshold_enabled: freeThresholdEnabled,
    delivery_timeframe: deliveryTimeframe,
    default_courier: shippingSettings.default_courier || '',
  }

  // 1. If delivery is disabled globally
  if (!deliveryEnabled) {
    return {
      shipping: 0,
      standardShipping: defaultCharge,
      isFreeShipping: true,
      shippingReason: 'DELIVERY_DISABLED',
      description: 'Free Shipping (Delivery Disabled)',
      threshold: freeThreshold,
      thresholdEnabled: freeThresholdEnabled,
      remainingForFreeShipping: 0,
      snapshot,
    }
  }

  // 2. Explicit promotion / coupon / free delivery rule
  if (
    appliedPromotion?.type === 'free_delivery' ||
    appliedPromotion?.isFreeShipping === true ||
    freeDeliveryRule?.isFreeDelivery === true
  ) {
    const isPromoCode = Boolean(appliedPromotion?.code || freeDeliveryRule?.hasTriggerCode)
    const isCustomPromoRule = Boolean(
      freeDeliveryRule?.isPromotional ||
      (freeDeliveryRule?.threshold !== undefined && freeDeliveryRule.threshold < freeThreshold)
    )

    const promoReason = (isPromoCode || isCustomPromoRule || subtotal < freeThreshold)
      ? 'PROMOTION'
      : (freeThresholdEnabled && subtotal >= freeThreshold ? 'FREE_DELIVERY_THRESHOLD' : 'PROMOTION')

    const promoName = appliedPromotion?.name || freeDeliveryRule?.name || 'Free Delivery Promotion'

    return {
      shipping: 0,
      standardShipping: defaultCharge,
      isFreeShipping: true,
      shippingReason: promoReason,
      description: promoReason === 'FREE_DELIVERY_THRESHOLD'
        ? `Free Pan-India Delivery on orders above ₹${freeThreshold.toLocaleString('en-IN')}`
        : promoName,
      threshold: freeThreshold,
      thresholdEnabled: freeThresholdEnabled,
      remainingForFreeShipping: 0,
      snapshot,
    }
  }

  // 3. Global free delivery threshold (based on merchandise subtotal)
  if (freeThresholdEnabled && (subtotal >= freeThreshold || subtotal === 0)) {
    return {
      shipping: 0,
      standardShipping: defaultCharge,
      isFreeShipping: true,
      shippingReason: 'FREE_DELIVERY_THRESHOLD',
      description: `Free Pan-India Delivery on orders above ₹${freeThreshold.toLocaleString('en-IN')}`,
      threshold: freeThreshold,
      thresholdEnabled: freeThresholdEnabled,
      remainingForFreeShipping: 0,
      snapshot,
    }
  }

  // 4. Standard shipping charge
  const remaining = freeThresholdEnabled ? Math.max(0, freeThreshold - subtotal) : 0
  return {
    shipping: defaultCharge,
    standardShipping: defaultCharge,
    isFreeShipping: defaultCharge === 0,
    shippingReason: defaultCharge === 0 ? 'ZERO_CHARGE_CONFIGURED' : 'STANDARD',
    description: defaultCharge === 0 ? 'Free Shipping' : `Standard Delivery (${deliveryTimeframe})`,
    threshold: freeThreshold,
    thresholdEnabled: freeThresholdEnabled,
    remainingForFreeShipping: remaining,
    snapshot,
  }
}

/**
 * Evaluates Free Delivery rules against subtotal and cart items.
 */
export async function evaluateFreeDeliveryRules({
  database,
  subtotal,
  verifiedItems = [],
  couponCode = null,
  settings = null,
}) {
  const cleanCode = normalizeCouponCode(couponCode)
  const now = new Date()

  // 1. Check custom free delivery rules in database
  const rules = await database
    .collection('free_delivery_rules')
    .find({ isActive: true })
    .toArray()

  let matchedRule = null
  for (const rule of rules) {
    if (rule.startAt && new Date(rule.startAt) > now) continue
    if (rule.expiresAt && new Date(rule.expiresAt) < now) continue

    const ruleCode = normalizeCouponCode(rule.couponCode)

    // If rule requires a trigger code:
    if (ruleCode) {
      // Must match provided couponCode
      if (cleanCode !== ruleCode) continue
    }

    // Min order check
    if (rule.minOrderValue !== null && rule.minOrderValue !== undefined) {
      if (subtotal < rule.minOrderValue) continue
    }

    // Max order check
    if (rule.maxOrderValue !== null && rule.maxOrderValue !== undefined) {
      if (subtotal > rule.maxOrderValue) continue
    }

    // Scope check
    if (rule.appliesTo === 'categories' && Array.isArray(rule.categoryIds) && rule.categoryIds.length > 0) {
      const catSet = new Set(rule.categoryIds)
      const hasMatch = verifiedItems.some((it) => catSet.has(it.category_id))
      if (!hasMatch && verifiedItems.length > 0) continue
    } else if (rule.appliesTo === 'products' && Array.isArray(rule.productIds) && rule.productIds.length > 0) {
      const prodSet = new Set(rule.productIds)
      const hasMatch = verifiedItems.some((it) => prodSet.has(it.product_id))
      if (!hasMatch && verifiedItems.length > 0) continue
    }

    const isPromotional = Boolean(
      ruleCode ||
      (rule.appliesTo && rule.appliesTo !== 'all') ||
      rule.startAt ||
      rule.expiresAt
    )

    matchedRule = {
      isFreeDelivery: true,
      isPromotional,
      name: rule.name || 'Free Delivery Rule Unlocked',
      threshold: rule.minOrderValue || 0,
      rule,
    }
    break
  }

  const shippingCalc = calculateShipping({
    subtotal,
    settings,
    freeDeliveryRule: matchedRule,
  })

  return {
    isFreeDelivery: shippingCalc.isFreeShipping,
    shippingCharge: shippingCalc.shipping,
    standardShipping: shippingCalc.standardShipping,
    reason: shippingCalc.description,
    shippingReason: shippingCalc.shippingReason,
    threshold: shippingCalc.threshold,
    thresholdEnabled: shippingCalc.thresholdEnabled,
    remainingForFreeShipping: shippingCalc.remainingForFreeShipping,
    snapshot: shippingCalc.snapshot,
    rule: matchedRule?.rule || null,
  }
}

/**
 * Authoritative Server-Side Order & Promotion Calculation Engine.
 * Reusable across checkout preview, coupon validation, order creation, and Cashfree payment generation.
 */
export async function calculateOrderPricing({
  database,
  items = [],
  couponCode = null,
  customer = null,
  userId = null,
}) {
  await ensurePromotionsSeeded(database)

  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      error: 'Shopping bag is empty.',
      items: [],
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
    }
  }

  // 1. Authoritative Server Verification of items, prices & stock from database
  let subtotal = 0
  const verifiedItems = []

  for (const item of items) {
    if (item.is_combo) {
      // Authoritative validation of combo package and its component slots
      const comboId = item.combo_id || item.product_id || item.id
      const comboSelections = item.components || item.selections || []
      const comboQty = Math.max(1, Math.floor(Number(item.quantity) || 1))

      const comboValidation = await validateAndCalculateCombo({
        database,
        comboId,
        selections: comboSelections,
        quantity: comboQty,
      })

      if (!comboValidation.success) {
        return {
          success: false,
          error: comboValidation.error || 'Invalid combo selection.',
        }
      }

      const comboPrice = comboValidation.pricing.combo_price
      const regularPrice = comboValidation.pricing.regular_price
      const originalPrice = comboValidation.pricing.original_price
      const savingsPerUnit = comboValidation.pricing.savings_per_unit
      const totalSavings = comboValidation.pricing.total_savings
      const allowCoupons = comboValidation.pricing.allow_coupons

      subtotal += comboValidation.pricing.total_price

      verifiedItems.push({
        is_combo: true,
        combo_id: comboValidation.combo.id,
        combo_slug: comboValidation.combo.slug,
        combo_name: comboValidation.combo.name,
        customer_title: comboValidation.combo.customer_title,
        product_name: `${comboValidation.combo.name} (Curated Combo)`,
        price: comboPrice,
        regular_price: regularPrice,
        original_price: originalPrice,
        savings: savingsPerUnit,
        total_savings: totalSavings,
        allow_coupons: allowCoupons,
        quantity: comboQty,
        image: comboValidation.combo.image,
        components: comboValidation.verifiedComponents,
      })
      continue
    }

    const productId = String(item.product_id || item.id)
    const product = await database.collection('products').findOne({ id: productId })

    if (!product) {
      return {
        success: false,
        error: `Product not found: ${item.product_name || productId}`,
      }
    }

    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1))
    const availableStock = Math.max(0, Number(product.stock ?? 0))

    if (availableStock < qty) {
      return {
        success: false,
        error: `Insufficient stock for "${product.name}". Only ${availableStock} piece(s) available in atelier.`,
      }
    }

    const unitPrice = Math.max(0, Number(product.discount_price || product.price) || 0)
    const originalPrice = Math.max(0, Number(product.price) || unitPrice)
    subtotal += unitPrice * qty

    verifiedItems.push({
      product_id: product.id,
      product_name: product.name,
      slug: product.slug || '',
      sku: product.sku || 'TC-PIECE',
      category_id: product.category_id || null,
      category_name: product.category_name || '',
      size: item.size || (product.sizes?.[0]?.size || 'Free Size'),
      colour: product.colour || '',
      quantity: qty,
      price: unitPrice,
      original_price: originalPrice,
      image: product.media?.find((m) => m.is_primary)?.url || product.media?.[0]?.url || '',
    })
  }

  // 2. Authoritative Promotion Validation (Coupons & Free Delivery Trigger Codes)
  let discount = 0
  let appliedPromotion = null
  let couponError = null

  if (couponCode) {
    const promoValidation = await validateCoupon({
      database,
      couponCode,
      subtotal,
      verifiedItems,
      customer,
      userId,
    })

    if (promoValidation.valid) {
      discount = promoValidation.discountAmount || 0
      appliedPromotion = {
        id: promoValidation.coupon.id,
        code: promoValidation.coupon.code,
        type: promoValidation.type || (promoValidation.coupon.discountType === 'free_delivery' ? 'free_delivery' : 'coupon'),
        discountType: promoValidation.coupon.discountType,
        discountValue: promoValidation.coupon.discountValue || 0,
        discountAmount: discount,
        name: promoValidation.coupon.name || null,
        description: promoValidation.coupon.description || null,
        isFreeShipping: promoValidation.coupon.isFreeShipping || false,
      }
    } else {
      couponError = promoValidation.error
    }
  }

  // 3. Authoritative Shipping & Free Delivery Rule Evaluation
  const settings = await database.collection('settings').findOne({ id: 'global' })
  const deliveryEval = await evaluateFreeDeliveryRules({
    database,
    subtotal,
    verifiedItems,
    couponCode: appliedPromotion?.code || (couponCode ? normalizeCouponCode(couponCode) : null),
    settings,
  })

  const shippingCalc = calculateShipping({
    subtotal,
    settings,
    appliedPromotion,
    freeDeliveryRule: deliveryEval.isFreeDelivery ? deliveryEval : null,
  })

  const shipping = shippingCalc.shipping
  const isFreeShipping = shippingCalc.isFreeShipping

  // 4. Final Non-Negative Total Calculation
  const total = Math.max(0, subtotal - discount + shipping)

  return {
    success: true,
    items: verifiedItems,
    subtotal,
    discount,
    shipping,
    total,
    isFreeShipping,
    shippingReason: shippingCalc.shippingReason,
    freeShippingThreshold: shippingCalc.threshold,
    remainingForFreeShipping: shippingCalc.remainingForFreeShipping,
    shipping_rule_snapshot: shippingCalc.snapshot,
    freeDeliveryReason: isFreeShipping
      ? (appliedPromotion?.type === 'free_delivery' ? (appliedPromotion.name || 'Free Delivery Promotion') : shippingCalc.description)
      : null,
    appliedCoupon: appliedPromotion,
    appliedPromotion,
    couponError,
  }
}

/**
 * Atomically records coupon/promotion usage upon confirmed payment/order creation.
 * Prevents race conditions and guarantees idempotency.
 */
export async function recordCouponUsage({
  database,
  couponCode,
  orderId,
  orderNumber,
  customer = {},
  userId = null,
  discountAmount = 0,
}) {
  const cleanCode = normalizeCouponCode(couponCode)
  if (!cleanCode) return { success: false, reason: 'NO_COUPON' }

  // Check if this order already consumed the promotion (webhook idempotency guard)
  const existingUsage = await database.collection('coupon_usages').findOne({ orderId })
  if (existingUsage) {
    return { success: true, idempotent: true }
  }

  const custEmail = (customer?.email || '').trim().toLowerCase()
  const custPhone = (customer?.phone || customer?.whatsapp || '').replace(/[^0-9]/g, '')

  const coupon = await database.collection('coupons').findOne({ code: cleanCode })

  if (coupon) {
    // Atomic conditional update to increment usage count without exceeding usage limit
    const updateRes = await database.collection('coupons').updateOne(
      {
        code: cleanCode,
        $or: [
          { usageLimit: null },
          { usageLimit: { $exists: false } },
          { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
        ],
      },
      {
        $inc: { usageCount: 1 },
        $set: { updatedAt: new Date() },
      }
    )

    if (updateRes.matchedCount === 0) {
      return { success: false, reason: 'USAGE_LIMIT_EXCEEDED' }
    }

    try {
      await database.collection('coupon_usages').insertOne({
        id: uuidv4(),
        couponId: coupon.id,
        couponCode: cleanCode,
        type: 'coupon',
        orderId,
        orderNumber,
        userId: userId || null,
        customerName: customer?.name || customer?.fullName || 'Customer',
        email: custEmail || null,
        phone: custPhone || null,
        discountAmount,
        createdAt: new Date(),
      })
    } catch (err) {
      // If unique index on orderId prevented duplicate insert
    }

    return { success: true }
  }

  // Check if it's a free delivery rule
  const freeRule = await database.collection('free_delivery_rules').findOne({
    $or: [
      { couponCode: cleanCode },
      { couponCode: { $regex: new RegExp(`^${cleanCode}$`, 'i') } },
    ],
  })

  if (freeRule) {
    try {
      await database.collection('coupon_usages').insertOne({
        id: uuidv4(),
        couponId: freeRule.id,
        couponCode: cleanCode,
        type: 'free_delivery',
        orderId,
        orderNumber,
        userId: userId || null,
        customerName: customer?.name || customer?.fullName || 'Customer',
        email: custEmail || null,
        phone: custPhone || null,
        discountAmount: discountAmount || 0,
        createdAt: new Date(),
      })
    } catch (err) {
      // If duplicate insert
    }
    return { success: true }
  }

  return { success: false, reason: 'COUPON_NOT_FOUND' }
}

/**
 * Atomically reverts coupon/promotion usage upon order cancellation.
 * Idempotently decrements usage count and removes usage log.
 */
export async function revertCouponUsage({ database, orderId, couponCode = null }) {
  if (!database || !orderId) return { success: false, error: 'Database and orderId required' }

  try {
    const usage = await database.collection('coupon_usages').findOne({ orderId })
    const targetCode = normalizeCouponCode(couponCode || usage?.couponCode)

    if (usage?.couponId || targetCode) {
      await database.collection('coupons').updateOne(
        {
          $or: [
            { id: usage?.couponId },
            { code: targetCode },
          ],
          usageCount: { $gt: 0 },
        },
        {
          $inc: { usageCount: -1 },
          $set: { updatedAt: new Date() },
        }
      )
    }

    if (usage) {
      await database.collection('coupon_usages').deleteOne({ orderId })
    }

    return { success: true, reverted: Boolean(usage) }
  } catch (err) {
    console.error('[Promotions:RevertUsage] Error:', err.message)
    return { success: false, error: err.message }
  }
}

