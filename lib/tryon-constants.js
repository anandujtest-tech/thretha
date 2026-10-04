/**
 * Standard Supported Garment Types for Thretha Couture Virtual Try-On
 */
export const GARMENT_TYPES = [
  'Top',
  'Shirt',
  'T-shirt',
  'Blouse',
  'Crop Top',
  'Dress',
  'Pants',
  'Trousers',
  'Skirt',
  'Saree',
  'Set',
  'Outerwear',
  'Other',
]

/**
 * Default Virtual Try-On Settings
 */
export const DEFAULT_TRYON_SETTINGS = {
  enabled: true,
  product_tryon_enabled: true,
  combo_tryon_enabled: true,
  allow_guests: true,
  max_generations_per_session: 2,
  max_generations_per_user_day: 5,
  show_privacy_notice: true,
  provider: 'pixelapi', // 'pixelapi' | 'gemini' | 'qwen' | 'fashn' | 'replicate' | 'segmind' | 'mock'
  model_name: 'virtual-tryon',
  disclaimer_text: 'Virtual try-on is an AI-generated preview and may not represent exact fit.',
  last_status: 'IDLE', // 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR'
  last_error_message: null,
}

