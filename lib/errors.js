import crypto from 'node:crypto'

/**
 * Standard Application Error Codes
 */
export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  INVALID_VARIANT: 'INVALID_VARIANT',
  INVALID_COUPON: 'INVALID_COUPON',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_LIMIT_REACHED: 'COUPON_LIMIT_REACHED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_VERIFICATION_PENDING: 'PAYMENT_VERIFICATION_PENDING',
  ORDER_CREATION_FAILED: 'ORDER_CREATION_FAILED',
  ORDER_ALREADY_CANCELLED: 'ORDER_ALREADY_CANCELLED',
  REFUND_FAILED: 'REFUND_FAILED',
  COMBO_UNAVAILABLE: 'COMBO_UNAVAILABLE',
  COMBO_INVALID_VARIANT: 'COMBO_INVALID_VARIANT',
  SHIPPING_CALCULATION_FAILED: 'SHIPPING_CALCULATION_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  OAUTH_ERROR: 'OAUTH_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INSTAGRAM_API_ERROR: 'INSTAGRAM_API_ERROR',
  INSTAGRAM_AUTH_ERROR: 'INSTAGRAM_AUTH_ERROR',
  INSTAGRAM_RATE_LIMITED: 'INSTAGRAM_RATE_LIMITED',
  INSTAGRAM_CONFIGURATION_ERROR: 'INSTAGRAM_CONFIGURATION_ERROR',
  INSTAGRAM_MEDIA_FETCH_FAILED: 'INSTAGRAM_MEDIA_FETCH_FAILED',
  TRYON_NOT_CONFIGURED: 'TRYON_NOT_CONFIGURED',
  TRYON_PROVIDER_ERROR: 'TRYON_PROVIDER_ERROR',
  TRYON_PROVIDER_TIMEOUT: 'TRYON_PROVIDER_TIMEOUT',
  TRYON_INVALID_IMAGE: 'TRYON_INVALID_IMAGE',
  TRYON_INVALID_PRODUCT: 'TRYON_INVALID_PRODUCT',
  TRYON_INVALID_VARIANT: 'TRYON_INVALID_VARIANT',
  TRYON_RATE_LIMITED: 'TRYON_RATE_LIMITED',
  TRYON_GENERATION_FAILED: 'TRYON_GENERATION_FAILED',
  TRYON_UNAVAILABLE: 'TRYON_UNAVAILABLE',
  TRYON_UNSUPPORTED_GARMENT: 'TRYON_UNSUPPORTED_GARMENT',
  PIXELAPI_CONFIGURATION_ERROR: 'PIXELAPI_CONFIGURATION_ERROR',
  PIXELAPI_AUTH_ERROR: 'PIXELAPI_AUTH_ERROR',
  PIXELAPI_RATE_LIMITED: 'PIXELAPI_RATE_LIMITED',
  PIXELAPI_INVALID_IMAGE: 'PIXELAPI_INVALID_IMAGE',
  PIXELAPI_INVALID_GARMENT: 'PIXELAPI_INVALID_GARMENT',
  PIXELAPI_JOB_FAILED: 'PIXELAPI_JOB_FAILED',
  PIXELAPI_TIMEOUT: 'PIXELAPI_TIMEOUT',
  PIXELAPI_NETWORK_ERROR: 'PIXELAPI_NETWORK_ERROR',
  GEMINI_CONFIGURATION_ERROR: 'GEMINI_CONFIGURATION_ERROR',
  GEMINI_AUTH_ERROR: 'GEMINI_AUTH_ERROR',
  GEMINI_RATE_LIMITED: 'GEMINI_RATE_LIMITED',
  GEMINI_INVALID_IMAGE: 'GEMINI_INVALID_IMAGE',
  GEMINI_GENERATION_FAILED: 'GEMINI_GENERATION_FAILED',
  GEMINI_TIMEOUT: 'GEMINI_TIMEOUT',
  QWEN_CONFIGURATION_ERROR: 'QWEN_CONFIGURATION_ERROR',
  QWEN_AUTH_ERROR: 'QWEN_AUTH_ERROR',
  QWEN_RATE_LIMITED: 'QWEN_RATE_LIMITED',
  QWEN_INVALID_IMAGE: 'QWEN_INVALID_IMAGE',
  QWEN_GENERATION_FAILED: 'QWEN_GENERATION_FAILED',
  QWEN_TIMEOUT: 'QWEN_TIMEOUT',
}

/**
 * Default Customer-Facing Friendly Messages
 */
const DEFAULT_CUSTOMER_MESSAGES = {
  [ERROR_CODES.AUTH_REQUIRED]: 'Please sign in to continue.',
  [ERROR_CODES.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ERROR_CODES.NOT_FOUND]: 'The requested piece or resource could not be found.',
  [ERROR_CODES.VALIDATION_ERROR]: 'Please check the information provided and try again.',
  [ERROR_CODES.OUT_OF_STOCK]: 'This piece is currently out of stock. Please choose another option.',
  [ERROR_CODES.INVALID_VARIANT]: 'The selected size or colour combination is no longer available.',
  [ERROR_CODES.INVALID_COUPON]: 'This coupon code is invalid. Please verify and try again.',
  [ERROR_CODES.COUPON_EXPIRED]: 'This coupon code has expired.',
  [ERROR_CODES.COUPON_LIMIT_REACHED]: 'This coupon code has reached its usage limit.',
  [ERROR_CODES.PAYMENT_FAILED]: 'We could not complete your payment. Please try again or use another payment method.',
  [ERROR_CODES.PAYMENT_CANCELLED]: 'Payment was cancelled. You can retry whenever you are ready.',
  [ERROR_CODES.PAYMENT_VERIFICATION_FAILED]: 'We could not complete payment verification. If funds were deducted, please contact concierge support.',
  [ERROR_CODES.PAYMENT_VERIFICATION_PENDING]: "Payment received. We're currently confirming your order with the bank.",
  [ERROR_CODES.ORDER_CREATION_FAILED]: 'We could not create your order. Please try again.',
  [ERROR_CODES.ORDER_ALREADY_CANCELLED]: 'This order has already been cancelled.',
  [ERROR_CODES.REFUND_FAILED]: 'We could not initiate the refund automatically. Our concierge team has been notified.',
  [ERROR_CODES.COMBO_UNAVAILABLE]: 'One or more pieces in this curated ensemble are currently unavailable.',
  [ERROR_CODES.COMBO_INVALID_VARIANT]: 'The selected variant for one of the ensemble pieces is out of stock.',
  [ERROR_CODES.SHIPPING_CALCULATION_FAILED]: 'We could not calculate delivery charges. Please try again.',
  [ERROR_CODES.NETWORK_ERROR]: 'Unable to connect right now. Please check your internet connection and try again.',
  [ERROR_CODES.INTERNAL_ERROR]: 'Something went wrong. Please try again. If the problem continues, contact us.',
  [ERROR_CODES.OAUTH_ERROR]: 'Google sign-in could not be completed. Please try again or use standard email login.',
  [ERROR_CODES.RATE_LIMITED]: 'Too many requests. Please slow down and try again shortly.',
  [ERROR_CODES.INSTAGRAM_API_ERROR]: 'Unable to load live Instagram feed right now. Displaying curated editorial gallery.',
  [ERROR_CODES.INSTAGRAM_AUTH_ERROR]: 'Instagram authentication failed. Please check configured access credentials in settings.',
  [ERROR_CODES.INSTAGRAM_RATE_LIMITED]: 'Instagram API rate limit reached. Serving cached feed.',
  [ERROR_CODES.INSTAGRAM_CONFIGURATION_ERROR]: 'Instagram feed configuration is incomplete or missing account ID.',
  [ERROR_CODES.INSTAGRAM_MEDIA_FETCH_FAILED]: 'Unable to retrieve media from Instagram. Displaying cached editorial lookbook.',
  [ERROR_CODES.TRYON_NOT_CONFIGURED]: 'Virtual Try-On is currently undergoing maintenance. Please try again soon.',
  [ERROR_CODES.TRYON_PROVIDER_ERROR]: "We couldn't create your try-on right now. Please try again with another photo.",
  [ERROR_CODES.TRYON_PROVIDER_TIMEOUT]: 'The try-on preview took longer than expected. Please try again.',
  [ERROR_CODES.TRYON_INVALID_IMAGE]: 'Please upload a clear, well-lit photo of yourself (JPG, PNG, or WebP).',
  [ERROR_CODES.TRYON_INVALID_PRODUCT]: 'Virtual try-on is not available for this piece.',
  [ERROR_CODES.TRYON_INVALID_VARIANT]: 'The selected size or colour for try-on is currently unavailable.',
  [ERROR_CODES.TRYON_RATE_LIMITED]: "You've reached today's virtual try-on limit. Please try again tomorrow.",
  [ERROR_CODES.TRYON_GENERATION_FAILED]: "We couldn't create your try-on right now. Please try again.",
  [ERROR_CODES.TRYON_UNAVAILABLE]: "Virtual try-on isn't available for this combination yet.",
  [ERROR_CODES.TRYON_UNSUPPORTED_GARMENT]: 'Virtual try-on is not currently supported for this piece category.',
  [ERROR_CODES.PIXELAPI_CONFIGURATION_ERROR]: 'Virtual Try-On service configuration is incomplete.',
  [ERROR_CODES.PIXELAPI_AUTH_ERROR]: 'Try-On service authentication failed.',
  [ERROR_CODES.PIXELAPI_RATE_LIMITED]: 'Try-On service is very busy right now. Please try again in a few moments.',
  [ERROR_CODES.PIXELAPI_INVALID_IMAGE]: "We couldn't process this photo. Please choose another photo.",
  [ERROR_CODES.PIXELAPI_INVALID_GARMENT]: 'Virtual try-on is not available for this garment type.',
  [ERROR_CODES.PIXELAPI_JOB_FAILED]: "This garment/photo combination couldn't be processed.",
  [ERROR_CODES.PIXELAPI_TIMEOUT]: 'The try-on is taking too long. Please try again.',
  [ERROR_CODES.PIXELAPI_NETWORK_ERROR]: 'Unable to connect to the try-on service. Please check your internet connection and try again.',
  [ERROR_CODES.GEMINI_CONFIGURATION_ERROR]: 'Gemini Virtual Try-On configuration is incomplete.',
  [ERROR_CODES.GEMINI_AUTH_ERROR]: 'Gemini API authentication failed. Please check GEMINI_API_KEY in server configuration.',
  [ERROR_CODES.GEMINI_RATE_LIMITED]: 'Gemini AI Try-On service is currently busy or free tier limit reached. Please try again shortly.',
  [ERROR_CODES.GEMINI_INVALID_IMAGE]: 'Unable to process the photo with Gemini. Please try a different clear photograph.',
  [ERROR_CODES.GEMINI_GENERATION_FAILED]: "We couldn't generate the preview with Gemini. Please try again.",
  [ERROR_CODES.GEMINI_TIMEOUT]: 'Gemini generation took longer than expected. Please try again.',
  [ERROR_CODES.QWEN_CONFIGURATION_ERROR]: 'Qwen AI Try-On configuration is incomplete. Please set QWEN_API_KEY.',
  [ERROR_CODES.QWEN_AUTH_ERROR]: 'Qwen API authentication failed. Please check QWEN_API_KEY in server configuration.',
  [ERROR_CODES.QWEN_RATE_LIMITED]: 'Qwen AI Try-On service is currently busy or free-tier quota reached. Please try again shortly.',
  [ERROR_CODES.QWEN_INVALID_IMAGE]: "We couldn't process this photo with Qwen. Please try a different clear photograph.",
  [ERROR_CODES.QWEN_GENERATION_FAILED]: "We couldn't generate the preview with Qwen AI. Please try again.",
  [ERROR_CODES.QWEN_TIMEOUT]: 'Qwen AI generation took longer than expected. Please try again.',
}

/**
 * Generates a unique, non-sensitive correlation ID for tracing.
 * Format: TRT-XXXXXXXX
 */
export function generateCorrelationId() {
  try {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase()
    return `TRT-${hex}`
  } catch {
    const rand = Math.random().toString(36).substring(2, 10).toUpperCase()
    return `TRT-${rand}`
  }
}

/**
 * Sensitive fields to redact from logs and customer payloads
 */
const SENSITIVE_KEY_REGEX = /password|token|secret|auth|credential|cf_secret|client_secret|jwt|key|hash|cvv|card|pixelapi|fashn/i

/**
 * Deeply scrubs sensitive keys from objects for safe logging
 */
export function scrubSecrets(value, depth = 0) {
  if (depth > 5) return '[Max Depth]'
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map((item) => scrubSecrets(item, depth + 1))
  }

  const sanitized = {}
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      sanitized[k] = '[REDACTED]'
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = scrubSecrets(v, depth + 1)
    } else {
      sanitized[k] = v
    }
  }
  return sanitized
}

/**
 * Sanitizes technical error messages to prevent leaking stack traces, file paths, or DB errors.
 */
export function sanitizeErrorMessage(rawMessage, fallbackCode = ERROR_CODES.INTERNAL_ERROR) {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return DEFAULT_CUSTOMER_MESSAGES[fallbackCode] || DEFAULT_CUSTOMER_MESSAGES[ERROR_CODES.INTERNAL_ERROR]
  }

  const msg = rawMessage.trim()

  // Detect technical or stack trace patterns
  const isTechnical =
    msg.includes('MongoServerError') ||
    msg.includes('ReferenceError') ||
    msg.includes('TypeError') ||
    msg.includes('SyntaxError') ||
    msg.includes('MongoNotConnectedError') ||
    msg.includes('duplicate key') ||
    msg.includes('E11000') ||
    msg.includes('node_modules') ||
    msg.includes('at ') ||
    msg.includes('.js:') ||
    msg.includes('jwt expired') ||
    msg.includes('secretOrPrivateKey') ||
    msg.includes('Cashfree') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT')

  if (isTechnical) {
    if (msg.includes('E11000') || msg.includes('duplicate key')) {
      return 'An account or record with this information already exists.'
    }
    if (msg.includes('jwt expired') || msg.includes('invalid token')) {
      return 'Your session has expired. Please sign in again.'
    }
    return DEFAULT_CUSTOMER_MESSAGES[fallbackCode] || DEFAULT_CUSTOMER_MESSAGES[ERROR_CODES.INTERNAL_ERROR]
  }

  return msg
}

/**
 * Resolves a customer-facing friendly message from an error code or message.
 */
export function getCustomerFacingMessage(code, rawMessage = null) {
  if (rawMessage) {
    const sanitized = sanitizeErrorMessage(rawMessage, code)
    if (sanitized && sanitized !== DEFAULT_CUSTOMER_MESSAGES[ERROR_CODES.INTERNAL_ERROR]) {
      return sanitized
    }
  }
  return DEFAULT_CUSTOMER_MESSAGES[code] || DEFAULT_CUSTOMER_MESSAGES[ERROR_CODES.INTERNAL_ERROR]
}

/**
 * Structured Safe Server Logger
 */
export const logger = {
  error: ({ requestId, route, method, code, message, error, context = {} }) => {
    const correlationId = requestId || 'TRT-UNKNOWN'
    const scrubbedContext = scrubSecrets(context)
    const errStack = error?.stack || (error instanceof Error ? error.stack : undefined)

    console.error(
      JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        requestId: correlationId,
        route: route || null,
        method: method || null,
        code: code || ERROR_CODES.INTERNAL_ERROR,
        message: message || error?.message || 'Unexpected server error',
        context: scrubbedContext,
        stack: errStack ? errStack.split('\n').slice(0, 8).join('\n') : undefined,
      })
    )
  },

  warn: ({ requestId, route, method, code, message, context = {} }) => {
    const correlationId = requestId || 'TRT-UNKNOWN'
    console.warn(
      JSON.stringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        requestId: correlationId,
        route: route || null,
        method: method || null,
        code: code || 'WARNING',
        message,
        context: scrubSecrets(context),
      })
    )
  },

  info: ({ requestId, route, method, message, context = {} }) => {
    const correlationId = requestId || 'TRT-UNKNOWN'
    console.log(
      JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        requestId: correlationId,
        route: route || null,
        method: method || null,
        message,
        context: scrubSecrets(context),
      })
    )
  },
}

