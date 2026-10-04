'use client'

import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { getColourData } from '@/lib/colours'
import { cn } from '@/lib/utils'

/**
 * Reusable visual colour swatch picker component with inventory availability support.
 *
 * @param {Object} props
 * @param {string[]} props.colours - Array of colour names (e.g. ["Rose", "Ivory White", "Onyx Black"])
 * @param {string} props.selectedColour - Currently selected colour name
 * @param {Function} props.onSelectColour - Callback when a swatch is clicked: (colourName) => void
 * @param {string[]|Function} [props.availableColours] - Array/Set of available colour names, or predicate fn `(name) => boolean`
 * @param {string} [props.label] - Optional section label (defaults to "Colour")
 * @param {string} [props.size] - Swatch size: "sm" | "md" | "lg" (defaults to "md")
 * @param {boolean} [props.showLabel] - Whether to show the "Colour: Name" header
 */
export default function ColourSwatchPicker({
  colours = [],
  selectedColour = '',
  onSelectColour,
  availableColours,
  label = 'Colour',
  size = 'md',
  showLabel = true,
  className,
}) {
  const [hoveredColour, setHoveredColour] = useState(null)

  if (!Array.isArray(colours) || colours.length === 0) {
    return null
  }

  // Dimension settings
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8 sm:h-9 sm:w-9',
    lg: 'h-9 w-9 sm:h-10 sm:w-10',
  }

  const checkAvailability = (colName) => {
    if (!availableColours) return true
    if (typeof availableColours === 'function') return availableColours(colName)
    if (Array.isArray(availableColours) || availableColours instanceof Set) {
      const cleanName = String(colName || '').trim().toLowerCase()
      const list = Array.isArray(availableColours) ? availableColours : Array.from(availableColours)
      return list.some((c) => String(c).trim().toLowerCase() === cleanName)
    }
    return true
  }

  const activeDisplay = hoveredColour || selectedColour || colours[0]

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cocoa-light">
            {label}:
          </span>
          <span className="text-xs font-semibold text-ink transition-colors">
            {activeDisplay}
            {selectedColour && !checkAvailability(selectedColour) && (
              <span className="ml-2 text-[10px] font-bold text-coral uppercase tracking-wider">
                (Out of Stock)
              </span>
            )}
          </span>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label={`${label} options`}
        className="flex flex-wrap items-center gap-2.5 sm:gap-3 py-1"
      >
        {colours.map((colName, idx) => {
          const colourData = getColourData(colName)
          const isSelected =
            String(selectedColour || '').trim().toLowerCase() ===
            String(colName || '').trim().toLowerCase()

          const isAvailable = checkAvailability(colName)
          const isGradient = String(colourData.hex).startsWith('linear-gradient')

          return (
            <div key={idx} className="relative group/swatch">
              <button
                type="button"
                role="radio"
                disabled={!isAvailable}
                aria-disabled={!isAvailable}
                aria-checked={isSelected}
                aria-label={`Select colour ${colName}${!isAvailable ? ' (Out of stock)' : ''}`}
                title={!isAvailable ? `${colName} (Out of Stock)` : colName}
                onClick={() => {
                  if (isAvailable && onSelectColour) {
                    onSelectColour(colName)
                  }
                }}
                onMouseEnter={() => setHoveredColour(colName)}
                onMouseLeave={() => setHoveredColour(null)}
                className={cn(
                  'relative grid place-items-center rounded-full transition-all duration-200 outline-hidden',
                  'focus-visible:ring-2 focus-visible:ring-mango-dark focus-visible:ring-offset-2',
                  sizeClasses[size] || sizeClasses.md,
                  !isAvailable
                    ? 'opacity-35 cursor-not-allowed grayscale-30 ring-1 ring-ink/10'
                    : isSelected
                    ? 'ring-2 ring-mango-dark ring-offset-2 ring-offset-paper scale-105 shadow-sm'
                    : 'ring-1 ring-ink/15 hover:ring-ink/40 hover:scale-105'
                )}
                style={{
                  background: isGradient ? colourData.hex : colourData.hex,
                }}
              >
                {/* Subtle inner border for light colors (e.g. White, Ivory, Cream) */}
                {colourData.border && (
                  <span className="absolute inset-0 rounded-full border border-ink/20 pointer-events-none" />
                )}

                {/* Diagonal Out-Of-Stock Slash Indicator */}
                {!isAvailable && (
                  <span className="absolute inset-0 grid place-items-center pointer-events-none overflow-hidden rounded-full">
                    <span className="w-[140%] h-[1.5px] bg-ink/70 -rotate-45 block shadow-2xs" />
                  </span>
                )}

                {/* Selection Checkmark / Indicator */}
                {isSelected && isAvailable && (
                  <span
                    className={cn(
                      'grid h-4 w-4 place-items-center rounded-full shadow-xs',
                      colourData.isLight
                        ? 'bg-ink text-cream'
                        : 'bg-cream text-ink'
                    )}
                  >
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                )}
              </button>

              {/* Accessible Floating Hover Tooltip */}
              <div
                role="tooltip"
                className={cn(
                  'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20',
                  'opacity-0 group-hover/swatch:opacity-100 transition-opacity duration-150',
                  'whitespace-nowrap px-2 py-0.5 text-[10px] font-medium text-cream bg-[#141312] shadow-md border border-white/10'
                )}
              >
                {colName} {!isAvailable && '(Out of stock)'}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-[#141312]" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
