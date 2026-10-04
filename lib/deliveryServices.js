// Keep external tracking destinations centralized and limited to known courier
// sites. Custom courier names never become arbitrary links.
export const DELIVERY_SERVICE_CONFIG = [
  { id: 'india-post', value: 'India Post', displayName: 'India Post', label: 'India Post', trackingUrl: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx' },
  { id: 'dtdc', value: 'DTDC', displayName: 'DTDC', label: 'DTDC', trackingUrl: 'https://www.dtdc.com/track-your-shipment/' },
  { id: 'delhivery', value: 'Delhivery', displayName: 'Delhivery', label: 'Delhivery', trackingUrl: 'https://www.delhivery.com/tracking' },
  { id: 'blue-dart', value: 'Blue Dart', displayName: 'Blue Dart', label: 'Blue Dart', trackingUrl: 'https://www.bluedart.com/track-trace' },
]

export const DELIVERY_SERVICES = DELIVERY_SERVICE_CONFIG.map(({ value, label }) => ({ value, label }))

export const INDIA_POST_TRACKING_URL = DELIVERY_SERVICE_CONFIG[0].trackingUrl

export function isIndiaPost(courier) {
  return typeof courier === 'string' && courier.trim().toLowerCase() === 'india post'
}

export function deliveryServiceLabel(courier) {
  return typeof courier === 'string' && courier.trim() ? courier.trim() : 'Not assigned yet'
}

export function deliveryServiceConfig(courier) {
  if (typeof courier !== 'string') return null
  const normalized = courier.trim().toLowerCase()
  return DELIVERY_SERVICE_CONFIG.find(service =>
    service.id === normalized || service.value.toLowerCase() === normalized || service.displayName.toLowerCase() === normalized
  ) || null
}

export function deliveryTrackingUrl(courier) {
  return deliveryServiceConfig(courier)?.trackingUrl || null
}

export function validateShippingUpdate(body, existingOrder) {
  const fields = {}
  if (body.courier !== undefined) {
    if (typeof body.courier !== 'string' || !body.courier.trim() || body.courier.trim().length > 80 || /[\r\n\t]/.test(body.courier)) {
      return { error: 'Select a valid delivery service.' }
    }
    fields.courier = body.courier.trim()
  }
  if (body.tracking_number !== undefined) {
    if (typeof body.tracking_number !== 'string' || body.tracking_number.trim().length > 80 || /[\r\n\t]/.test(body.tracking_number)) {
      return { error: 'Enter a valid tracking ID (up to 80 characters).' }
    }
    fields.tracking_number = body.tracking_number.trim() || null
  }
  if (fields.courier && fields.courier !== (existingOrder.courier || null) && existingOrder.tracking_number &&
      (body.tracking_number === undefined || fields.tracking_number === existingOrder.tracking_number)) {
    return { error: 'Enter the new service tracking ID, or explicitly clear the previous one.' }
  }
  return { fields }
}
