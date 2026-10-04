'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Ruler, Sparkles, Check } from 'lucide-react'

export default function SizeGuideModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-paper p-6 sm:p-8 sm:max-w-xl border border-ink/15">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-mango-light text-mango-dark">
              <Ruler className="h-4 w-4" />
            </span>
            <p className="text-[10px] uppercase tracking-[0.25em] text-mango-dark font-semibold">
              Atelier Fit & Silhouette Guide
            </p>
          </div>
          <DialogTitle className="mt-1 font-display text-3xl text-ink">
            Find Your Perfect Size
          </DialogTitle>
          <DialogDescription className="text-xs text-cocoa">
            Detailed measurement charts in inches and centimeters for sarees, blouses, and tops.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-8 text-xs">
          {/* Crop Tops / Blouses Chart */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-ink/10 pb-2">
              <h3 className="font-display text-xl text-ink font-semibold">
                Crop Tops & Contemporary Blouses
              </h3>
              <span className="text-[11px] text-cocoa-light font-mono">(Inches)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-sand/40 uppercase tracking-wider text-[10px] text-cocoa">
                  <tr>
                    <th className="p-2.5">Size</th>
                    <th className="p-2.5">Bust</th>
                    <th className="p-2.5">Waist</th>
                    <th className="p-2.5">Shoulder</th>
                    <th className="p-2.5">Length</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 text-ink">
                  <tr className="hover:bg-sand/20">
                    <td className="p-2.5 font-bold text-coral-dark">XS</td>
                    <td className="p-2.5">32"</td>
                    <td className="p-2.5">26"</td>
                    <td className="p-2.5">13.5"</td>
                    <td className="p-2.5">14.5"</td>
                  </tr>
                  <tr className="hover:bg-sand/20">
                    <td className="p-2.5 font-bold text-coral-dark">S</td>
                    <td className="p-2.5">34"</td>
                    <td className="p-2.5">28"</td>
                    <td className="p-2.5">14.0"</td>
                    <td className="p-2.5">15.0"</td>
                  </tr>
                  <tr className="hover:bg-sand/20 bg-mango-light/20">
                    <td className="p-2.5 font-bold text-coral-dark">M</td>
                    <td className="p-2.5">36"</td>
                    <td className="p-2.5">30"</td>
                    <td className="p-2.5">14.5"</td>
                    <td className="p-2.5">15.5"</td>
                  </tr>
                  <tr className="hover:bg-sand/20">
                    <td className="p-2.5 font-bold text-coral-dark">L</td>
                    <td className="p-2.5">38"</td>
                    <td className="p-2.5">32"</td>
                    <td className="p-2.5">15.0"</td>
                    <td className="p-2.5">16.0"</td>
                  </tr>
                  <tr className="hover:bg-sand/20">
                    <td className="p-2.5 font-bold text-coral-dark">XL</td>
                    <td className="p-2.5">40"</td>
                    <td className="p-2.5">34"</td>
                    <td className="p-2.5">15.5"</td>
                    <td className="p-2.5">16.5"</td>
                  </tr>
                  <tr className="hover:bg-sand/20">
                    <td className="p-2.5 font-bold text-coral-dark">XXL</td>
                    <td className="p-2.5">42"</td>
                    <td className="p-2.5">36"</td>
                    <td className="p-2.5">16.0"</td>
                    <td className="p-2.5">17.0"</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Saree Dimensions & Fit */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-ink/10 pb-2">
              <h3 className="font-display text-xl text-ink font-semibold">
                Sarees & Drapes (Free Size)
              </h3>
              <span className="text-[11px] text-cocoa-light font-mono">(Meters)</span>
            </div>

            <div className="space-y-2.5 text-cocoa leading-relaxed bg-cream p-4 border border-ink/10 rounded-sm">
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                <p>
                  <strong>Length:</strong> Standard 5.5 meters (approx. 6 yards) drape suitable for all traditional and contemporary draping styles.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                <p>
                  <strong>Blouse Piece:</strong> Included 0.8 meter running unstitched blouse fabric matching the saree body & pallu.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                <p>
                  <strong>Width / Fall:</strong> 44–46 inches standard height with pre-tucked woven fall borders.
                </p>
              </div>
            </div>
          </div>

          {/* Measuring Tips */}
          <div className="rounded-sm bg-sand/30 p-4 border border-ink/10">
            <h4 className="font-semibold uppercase tracking-wider text-ink text-[11px] flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3.5 w-3.5 text-mango" /> Atelier Measuring Tips
            </h4>
            <p className="text-cocoa leading-relaxed">
              Measure around the fullest part of your bust while wearing your regular bra. For waist, measure around the narrowest part of your natural waistline. If you fall between sizes, we recommend sizing up for a relaxed fit.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

