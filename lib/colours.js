/**
 * Centralized Colour Swatch & Palette Dictionary for Thretha Couture.
 *
 * Maps fashion, apparel, and textile colour names to precise hex/CSS values,
 * brightness classifications (for contrast checks), and fallback handling.
 */

export const COLOUR_PALETTE = {
  // Whites, Creams & Lights
  'white': { hex: '#FFFFFF', isLight: true, border: true },
  'pure white': { hex: '#FFFFFF', isLight: true, border: true },
  'off white': { hex: '#FAF9F6', isLight: true, border: true },
  'ivory': { hex: '#FFFFF0', isLight: true, border: true },
  'ivory white': { hex: '#FAF8F2', isLight: true, border: true },
  'cream': { hex: '#FFFDD0', isLight: true, border: true },
  'vanilla': { hex: '#F3E5AB', isLight: true, border: true },
  'champagne': { hex: '#F7E7CE', isLight: true, border: true },
  'linen': { hex: '#FAF0E6', isLight: true, border: true },
  'chalk': { hex: '#FBFAF5', isLight: true, border: true },

  // Neutrals, Beiges & Earth Tones
  'beige': { hex: '#E6D7C3', isLight: true, border: false },
  'natural beige': { hex: '#E2D5C4', isLight: true, border: false },
  'sand': { hex: '#C2B280', isLight: false, border: false },
  'taupe': { hex: '#8B8589', isLight: false, border: false },
  'khaki': { hex: '#C3B091', isLight: false, border: false },
  'camel': { hex: '#C19A6B', isLight: false, border: false },
  'tan': { hex: '#D2B48C', isLight: true, border: false },
  'brown': { hex: '#5C4033', isLight: false, border: false },
  'chocolate': { hex: '#3D2314', isLight: false, border: false },
  'coffee': { hex: '#4A2E18', isLight: false, border: false },
  'mocha': { hex: '#583F30', isLight: false, border: false },
  'cinnamon': { hex: '#7B3F00', isLight: false, border: false },

  // Blacks & Greys
  'black': { hex: '#141414', isLight: false, border: false },
  'onyx black': { hex: '#18181B', isLight: false, border: false },
  'jet black': { hex: '#0F0F10', isLight: false, border: false },
  'charcoal': { hex: '#374151', isLight: false, border: false },
  'grey': { hex: '#6B7280', isLight: false, border: false },
  'gray': { hex: '#6B7280', isLight: false, border: false },
  'light grey': { hex: '#D1D5DB', isLight: true, border: true },
  'silver': { hex: '#C0C0C0', isLight: true, border: true },
  'slate': { hex: '#475569', isLight: false, border: false },
  'ash': { hex: '#B2BEB5', isLight: true, border: false },

  // Pinks & Roses
  'rose': { hex: '#C9828C', isLight: false, border: false },
  'dusty rose': { hex: '#B76E79', isLight: false, border: false },
  'blush': { hex: '#DE98AB', isLight: false, border: false },
  'blush pink': { hex: '#F4C2C2', isLight: true, border: false },
  'pink': { hex: '#F472B6', isLight: false, border: false },
  'baby pink': { hex: '#FBCFE8', isLight: true, border: true },
  'magenta': { hex: '#BE185D', isLight: false, border: false },
  'fuchsia': { hex: '#C026D3', isLight: false, border: false },
  'coral': { hex: '#E06D53', isLight: false, border: false },
  'peach': { hex: '#FFCBA4', isLight: true, border: false },
  'salmon': { hex: '#FA8072', isLight: false, border: false },

  // Reds & Maroons
  'red': { hex: '#B91C1C', isLight: false, border: false },
  'crimson': { hex: '#991B1B', isLight: false, border: false },
  'ruby': { hex: '#A81C2B', isLight: false, border: false },
  'maroon': { hex: '#800020', isLight: false, border: false },
  'burgundy': { hex: '#5C1D24', isLight: false, border: false },
  'wine': { hex: '#58111A', isLight: false, border: false },
  'terracotta': { hex: '#C85A32', isLight: false, border: false },
  'rust': { hex: '#B45309', isLight: false, border: false },
  'brick': { hex: '#8B3120', isLight: false, border: false },

  // Yellows & Golds
  'marigold': { hex: '#EAA221', isLight: false, border: false },
  'mustard': { hex: '#D97706', isLight: false, border: false },
  'turmeric': { hex: '#E5A93B', isLight: false, border: false },
  'yellow': { hex: '#EAB308', isLight: true, border: false },
  'lemon': { hex: '#FEF08A', isLight: true, border: true },
  'gold': { hex: '#D4AF37', isLight: false, border: false },
  'antique gold': { hex: '#C5A059', isLight: false, border: false },
  'rose gold': { hex: '#B76E79', isLight: false, border: false },
  'metallic gold': { hex: '#DAA520', isLight: false, border: false },
  'bronze': { hex: '#CD7F32', isLight: false, border: false },
  'copper': { hex: '#B87333', isLight: false, border: false },

  // Greens
  'green': { hex: '#15803D', isLight: false, border: false },
  'emerald': { hex: '#065F46', isLight: false, border: false },
  'emerald green': { hex: '#047857', isLight: false, border: false },
  'bottle green': { hex: '#1B4D3E', isLight: false, border: false },
  'forest green': { hex: '#14532D', isLight: false, border: false },
  'olive': { hex: '#556B2F', isLight: false, border: false },
  'olive green': { hex: '#6B8E23', isLight: false, border: false },
  'sage': { hex: '#9CAF88', isLight: true, border: false },
  'mint': { hex: '#86EFAC', isLight: true, border: true },
  'pista': { hex: '#93C572', isLight: true, border: false },
  'pistachio': { hex: '#93C572', isLight: true, border: false },
  'moss green': { hex: '#4A5D4E', isLight: false, border: false },

  // Blues
  'blue': { hex: '#1D4ED8', isLight: false, border: false },
  'royal blue': { hex: '#1E3A8A', isLight: false, border: false },
  'navy': { hex: '#0F172A', isLight: false, border: false },
  'navy blue': { hex: '#0B132B', isLight: false, border: false },
  'indigo': { hex: '#3730A3', isLight: false, border: false },
  'sky blue': { hex: '#38BDF8', isLight: true, border: false },
  'powder blue': { hex: '#BAE6FD', isLight: true, border: true },
  'teal': { hex: '#0D9488', isLight: false, border: false },
  'turquoise': { hex: '#06B6D4', isLight: false, border: false },
  'peacock': { hex: '#004953', isLight: false, border: false },

  // Purples & Violets
  'purple': { hex: '#6B21A8', isLight: false, border: false },
  'violet': { hex: '#7C3AED', isLight: false, border: false },
  'lavender': { hex: '#DDD6FE', isLight: true, border: true },
  'lilac': { hex: '#C8A2C8', isLight: true, border: false },
  'plum': { hex: '#4C1D95', isLight: false, border: false },
  'mauve': { hex: '#915F6D', isLight: false, border: false },
  'amethyst': { hex: '#704278', isLight: false, border: false },

  // Fallbacks & Defaults
  'standard': { hex: '#78716C', isLight: false, border: false },
  'multi': { hex: 'linear-gradient(135deg, #E11D48 0%, #EAB308 50%, #2563EB 100%)', isLight: false, border: false },
  'multicolor': { hex: 'linear-gradient(135deg, #E11D48 0%, #EAB308 50%, #2563EB 100%)', isLight: false, border: false },
  'printed': { hex: 'linear-gradient(135deg, #D4AF37 0%, #18181B 100%)', isLight: false, border: false },
}

/**
 * Resolves colour name to swatch styling data.
 *
 * @param {string} colourName - Name of the colour (e.g. "Ivory White", "Onyx Black")
 * @returns {{ name: string, hex: string, isLight: boolean, border: boolean }}
 */
export function getColourData(colourName) {
  if (!colourName || typeof colourName !== 'string') {
    return {
      name: 'Standard',
      hex: '#78716C',
      isLight: false,
      border: false,
    }
  }

  const cleanName = colourName.trim()
  const lower = cleanName.toLowerCase()

  // 1. Direct exact match
  if (COLOUR_PALETTE[lower]) {
    return {
      name: cleanName,
      ...COLOUR_PALETTE[lower],
    }
  }

  // 2. Hex code passed directly (e.g. "#D4AF37")
  if (/^#([0-9A-F]{3}){1,2}$/i.test(cleanName)) {
    return {
      name: cleanName,
      hex: cleanName,
      isLight: false,
      border: false,
    }
  }

  // 3. Substring keyword search
  for (const [key, value] of Object.entries(COLOUR_PALETTE)) {
    if (lower.includes(key) || key.includes(lower)) {
      return {
        name: cleanName,
        ...value,
      }
    }
  }

  // 4. Token match against words in colour name
  const words = lower.split(/[\s\-_/]+/)
  for (const w of words) {
    if (COLOUR_PALETTE[w]) {
      return {
        name: cleanName,
        ...COLOUR_PALETTE[w],
      }
    }
  }

  // 5. Safe neutral fallback for unknown artisanal colours
  return {
    name: cleanName,
    hex: '#A8A29E',
    isLight: true,
    border: true,
  }
}

