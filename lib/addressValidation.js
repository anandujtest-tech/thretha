// Centralized Production Address Validation Library for Thretha Couture

export const INDIAN_STATES = [
  'Kerala',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]

/**
 * Normalizes repeated whitespace and trims a string.
 */
export function normalizeSpaces(str) {
  if (typeof str !== 'string') return ''
  return str.replace(/\s+/g, ' ').trim()
}

/**
 * Validates Full Name for customer & recipient fields.
 */
export function validateFullName(rawName) {
  const name = normalizeSpaces(rawName)
  if (!name) {
    return { isValid: false, error: 'Please enter your full name.', value: '' }
  }
  if (name.length < 2) {
    return { isValid: false, error: 'Name must be at least 2 characters.', value: name }
  }
  if (name.length > 100) {
    return { isValid: false, error: 'Name cannot exceed 100 characters.', value: name }
  }
  // Reject strings containing only digits or punctuation
  if (/^[\d\s\-_!@#$%^&*(),.?":{}|<>+=/\\[\]~`]+$/.test(name)) {
    return { isValid: false, error: 'Please enter a valid name containing letters.', value: name }
  }
  // Must contain at least one letter
  if (!/[a-zA-Z\u00C0-\u024F\u0900-\u0D7F]/.test(name)) {
    return { isValid: false, error: 'Please enter a valid name.', value: name }
  }
  return { isValid: true, error: null, value: name }
}

/**
 * Validates Indian Mobile Phone Number (+91 optional, 10 digits).
 */
export function validatePhone(rawPhone) {
  const str = String(rawPhone || '').trim()
  if (!str) {
    return { isValid: false, error: 'Enter a valid 10-digit mobile number.', value: '' }
  }

  // Remove spaces, hyphens, brackets, dots
  let cleaned = str.replace(/[\s\-\(\)\.]/g, '')

  // Handle +91, 91, or leading 0 prefix for Indian mobile numbers
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3)
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2)
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1)
  }

  // Validate 10 digits starting with 6, 7, 8, or 9
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, error: null, value: cleaned }
  }

  return { isValid: false, error: 'Enter a valid 10-digit mobile number.', value: str }
}

/**
 * Validates Address Line 1 (House No / Flat / Building / Floor).
 */
export function validateAddressLine1(rawLine1) {
  const line1 = normalizeSpaces(rawLine1)
  if (!line1) {
    return { isValid: false, error: 'Please enter your house/building address.', value: '' }
  }
  if (line1.length < 3) {
    return { isValid: false, error: 'Address must be at least 3 characters.', value: line1 }
  }
  if (line1.length > 200) {
    return { isValid: false, error: 'Address cannot exceed 200 characters.', value: line1 }
  }
  if (!/[a-zA-Z0-9]/.test(line1)) {
    return { isValid: false, error: 'Please enter a valid house or building name.', value: line1 }
  }
  return { isValid: true, error: null, value: line1 }
}

/**
 * Validates Address Line 2 / Street / Locality / Landmark (Optional).
 */
export function validateAddressLine2(rawLine2) {
  const line2 = normalizeSpaces(rawLine2)
  if (line2.length > 200) {
    return { isValid: false, error: 'Locality cannot exceed 200 characters.', value: line2 }
  }
  return { isValid: true, error: null, value: line2 }
}

/**
 * Validates City / Town.
 */
export function validateCity(rawCity) {
  const city = normalizeSpaces(rawCity)
  if (!city) {
    return { isValid: false, error: 'Please enter your city.', value: '' }
  }
  if (city.length < 2) {
    return { isValid: false, error: 'City name must be at least 2 characters.', value: city }
  }
  if (city.length > 100) {
    return { isValid: false, error: 'City cannot exceed 100 characters.', value: city }
  }
  if (!/[a-zA-Z]/.test(city)) {
    return { isValid: false, error: 'Please enter a valid city name.', value: city }
  }
  return { isValid: true, error: null, value: city }
}

/**
 * Validates District (Optional or Required depending on form mode).
 */
export function validateDistrict(rawDistrict, isRequired = false) {
  const district = normalizeSpaces(rawDistrict)
  if (isRequired && !district) {
    return { isValid: false, error: 'Please enter your district.', value: '' }
  }
  if (district && district.length > 100) {
    return { isValid: false, error: 'District cannot exceed 100 characters.', value: district }
  }
  return { isValid: true, error: null, value: district }
}

/**
 * Validates State / Union Territory.
 */
export function validateState(rawState) {
  const state = normalizeSpaces(rawState)
  if (!state) {
    return { isValid: false, error: 'Please select your state.', value: 'Kerala' }
  }
  if (state.length < 2 || state.length > 100) {
    return { isValid: false, error: 'Please select a valid state.', value: state }
  }
  return { isValid: true, error: null, value: state }
}

/**
 * Validates 6-Digit Indian PIN Code / Postal Code.
 */
export function validatePostalCode(rawPin, country = 'India') {
  const pin = String(rawPin || '').replace(/\s+/g, '')
  if (!pin) {
    return { isValid: false, error: 'Enter a valid 6-digit PIN code.', value: '' }
  }

  // India PIN code: exactly 6 digits
  if (country.toLowerCase() === 'india' || !country) {
    if (/^\d{6}$/.test(pin) && !pin.startsWith('0')) {
      return { isValid: true, error: null, value: pin }
    }
    return { isValid: false, error: 'Enter a valid 6-digit PIN code.', value: pin }
  }

  // International fallback (alphanumeric 3-10 chars)
  if (/^[A-Za-z0-9\- ]{3,10}$/.test(pin)) {
    return { isValid: true, error: null, value: pin }
  }
  return { isValid: false, error: 'Enter a valid postal code.', value: pin }
}

/**
 * Validates Optional Email Address.
 */
export function validateEmail(rawEmail, isRequired = false) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!email) {
    if (isRequired) {
      return { isValid: false, error: 'Please enter your email address.', value: '' }
    }
    return { isValid: true, error: null, value: '' }
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 150) {
    return { isValid: true, error: null, value: email }
  }
  return { isValid: false, error: 'Please enter a valid email address.', value: email }
}

/**
 * Comprehensive Address Payload Validator.
 * Supports both saved address schema (fullName, addressLine1, postalCode)
 * and order checkout schema (name, house, street, pincode, whatsapp).
 */
export function validateAddress(payload, options = {}) {
  if (!payload || typeof payload !== 'object') {
    return {
      isValid: false,
      errors: { general: 'Invalid address payload.' },
      sanitized: {},
    }
  }

  const errors = {}
  const sanitized = {}

  // 1. Full Name
  const nameVal = validateFullName(payload.fullName || payload.name)
  if (!nameVal.isValid) {
    errors.fullName = nameVal.error
    errors.name = nameVal.error
  } else {
    sanitized.fullName = nameVal.value
    sanitized.name = nameVal.value
  }

  // 2. Phone / WhatsApp
  const phoneVal = validatePhone(payload.phone || payload.whatsapp)
  if (!phoneVal.isValid) {
    errors.phone = phoneVal.error
    errors.whatsapp = phoneVal.error
  } else {
    sanitized.phone = phoneVal.value
    sanitized.whatsapp = phoneVal.value
  }

  // Optional Alternate Phone
  if (payload.alternatePhone || (payload.phone && payload.whatsapp && payload.phone !== payload.whatsapp)) {
    const alt = payload.alternatePhone || payload.phone
    const altVal = validatePhone(alt)
    if (altVal.isValid) {
      sanitized.alternatePhone = altVal.value
    }
  }

  // Optional Email
  const emailVal = validateEmail(payload.email, Boolean(options.requireEmail))
  if (!emailVal.isValid) {
    errors.email = emailVal.error
  } else if (emailVal.value) {
    sanitized.email = emailVal.value
  }

  // 3. Address Line 1 (House / Flat / Building)
  const line1Val = validateAddressLine1(payload.addressLine1 || payload.house)
  if (!line1Val.isValid) {
    errors.addressLine1 = line1Val.error
    errors.house = line1Val.error
  } else {
    sanitized.addressLine1 = line1Val.value
    sanitized.house = line1Val.value
  }

  // 4. Address Line 2 (Street / Locality / Landmark)
  const line2Val = validateAddressLine2(payload.addressLine2 || payload.street)
  if (!line2Val.isValid) {
    errors.addressLine2 = line2Val.error
    errors.street = line2Val.error
  } else {
    sanitized.addressLine2 = line2Val.value
    sanitized.street = line2Val.value
  }

  // 5. City
  const cityVal = validateCity(payload.city)
  if (!cityVal.isValid) {
    errors.city = cityVal.error
  } else {
    sanitized.city = cityVal.value
  }

  // 6. District
  const districtVal = validateDistrict(payload.district, Boolean(options.requireDistrict))
  if (!districtVal.isValid) {
    errors.district = districtVal.error
  } else {
    sanitized.district = districtVal.value
  }

  // 7. State
  const stateVal = validateState(payload.state)
  if (!stateVal.isValid) {
    errors.state = stateVal.error
  } else {
    sanitized.state = stateVal.value
  }

  // 8. Postal Code / PIN Code
  const pinVal = validatePostalCode(payload.postalCode || payload.pincode, payload.country || 'India')
  if (!pinVal.isValid) {
    errors.postalCode = pinVal.error
    errors.pincode = pinVal.error
  } else {
    sanitized.postalCode = pinVal.value
    sanitized.pincode = pinVal.value
  }

  // Metadata / Flags
  sanitized.country = payload.country ? normalizeSpaces(payload.country) : 'India'
  sanitized.label = payload.label ? normalizeSpaces(payload.label) : 'Home'
  sanitized.isDefault = Boolean(payload.isDefault)

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized,
  }
}

