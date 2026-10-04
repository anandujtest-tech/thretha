'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Camera,
  Upload,
  X,
  RefreshCw,
  Trash2,
  ShoppingBag,
  Check,
  AlertCircle,
  Shield,
  Layers,
  ArrowRight,
  ChevronRight,
  Info,
} from 'lucide-react'
import { api } from '@/lib/tc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function VirtualTryOnModal({
  isOpen,
  onClose,
  mode = 'single', // 'single' | 'combo'
  product,
  selectedColour,
  selectedSize,
  onColourChange,
  onSizeChange,
  combo,
  comboSelections,
  onAddToCart,
  settings,
}) {
  const [step, setStep] = useState('upload') // 'upload' | 'preview' | 'generating' | 'result' | 'error'
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null)
  const [generatedResult, setGeneratedResult] = useState(null)
  const [generatedColour, setGeneratedColour] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [addedToCartSuccess, setAddedToCartSuccess] = useState(false)
  const [disclaimer, setDisclaimer] = useState(
    settings?.disclaimer_text || 'Virtual try-on is an AI-generated preview and may not represent exact fit.'
  )

  const cameraInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    if (settings?.disclaimer_text) setDisclaimer(settings.disclaimer_text)
  }, [settings?.disclaimer_text])

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Track tryon_open analytics
      api('/tryon/analytics', {
        method: 'POST',
        body: {
          event: 'tryon_open',
          product_id: product?.id,
          combo_slug: combo?.slug,
          colour: selectedColour,
          size: selectedSize,
        },
      }).catch(() => {})
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, product, combo, selectedColour, selectedSize])

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
    }
  }, [photoPreviewUrl])

  if (!isOpen) return null

  // File selection handler
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMessage('')

    // Validate type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage('Please upload a JPG, PNG, or WebP photograph.')
      return
    }

    // Validate size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image size is too large. Please upload a photo under 10MB.')
      return
    }

    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl)
    }

    const previewUrl = URL.createObjectURL(file)
    setPhotoFile(file)
    setPhotoPreviewUrl(previewUrl)
    setStep('preview')

    // Track photo uploaded analytics
    api('/tryon/analytics', {
      method: 'POST',
      body: {
        event: 'tryon_photo_uploaded',
        product_id: product?.id,
        combo_slug: combo?.slug,
      },
    }).catch(() => {})
  }

  // Delete / Reset Photo
  const handleDeletePhoto = () => {
    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl)
    }
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    setGeneratedResult(null)
    setStep('upload')
    setErrorMessage('')
  }

  // Generate Virtual Try-On
  const handleGenerate = async () => {
    if (!photoFile) {
      setErrorMessage('Please choose or take a photo first.')
      return
    }

    setIsGenerating(true)
    setStep('generating')
    setErrorMessage('')

    const controller = new AbortController()
    abortControllerRef.current = controller

    const startTime = Date.now()
    console.log('[TRYON CLIENT] generation started', { mode, product: product?.name || combo?.name })

    try {
      const formData = new FormData()
      formData.append('person_image', photoFile)
      formData.append('mode', mode)

      if (mode === 'combo') {
        formData.append('combo_slug', combo?.slug || combo?.id || '')
        formData.append('selections', JSON.stringify(comboSelections || {}))
      } else {
        formData.append('product_id', String(product?.id || product?.slug || ''))
        formData.append('colour', selectedColour || '')
        formData.append('size', selectedSize || '')
      }

      const res = await api('/tryon/generate', {
        method: 'POST',
        body: formData,
        isFormData: true,
        signal: controller.signal,
      })

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      console.log('[TRYON CLIENT] response received', {
        elapsedSeconds: elapsed,
        success: res?.success,
        provider: res?.provider,
        hasImageUrl: Boolean(res?.image_url),
        imageUrlPrefix: res?.image_url ? res.image_url.slice(0, 60) + '...' : null,
      })

      if ((res?.success && res?.image_url) || res?.image_url) {
        setGeneratedResult(res)
        setGeneratedColour(selectedColour)
        if (res.disclaimer) setDisclaimer(res.disclaimer)
        setStep('result')
        setIsGenerating(false)
        return
      } else {
        throw new Error(res?.message || "We couldn't create your try-on right now.")
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[TRYON CLIENT] generation cancelled by user')
        setStep('preview')
        return
      }
      console.error('[TRYON CLIENT] generation failed', { message: err.message, code: err.code })
      setErrorMessage(
        err.message || "We couldn't create your try-on right now. Please try again with another photo."
      )
      setStep('error')
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }

  // Cancel generation
  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsGenerating(false)
    setStep('preview')
  }

  // Add to bag from try-on
  const handleAddToBagClick = async () => {
    if (onAddToCart) {
      await onAddToCart()
      setAddedToCartSuccess(true)

      // Track analytics
      api('/tryon/analytics', {
        method: 'POST',
        body: {
          event: 'tryon_add_to_cart',
          product_id: product?.id,
          combo_slug: combo?.slug,
          colour: selectedColour,
          size: selectedSize,
        },
      }).catch(() => {})

      setTimeout(() => {
        setAddedToCartSuccess(false)
      }, 3000)
    }
  }

  // Available colours and sizes for quick switching
  const explicitSizes = (product?.sizes || []).filter((s) => s && s.size && s.available !== false)
  const productColours = Array.isArray(product?.colours)
    ? product.colours
    : product?.colour
    ? [product.colour]
    : []

  const price = mode === 'combo'
    ? Number(combo?.combo_price || combo?.price || 0)
    : Number(product?.discount_price || product?.price || 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tryon-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-ink/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-full sm:max-w-3xl lg:max-w-4xl bg-paper border-0 sm:border border-ink/15 shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90dvh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10 bg-cream shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-gold-light/40 border border-gold-dark/30 flex items-center justify-center text-gold-dark">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="tryon-modal-title"
                className="font-display text-lg sm:text-xl text-ink leading-tight font-normal"
              >
                {mode === 'combo' ? 'Try The Complete Look ✦' : 'Try It On ✦'}
              </h2>
              <p className="text-[10px] sm:text-[11px] text-cocoa uppercase tracking-widest font-sans font-medium">
                AI Atelier Preview · @thretha_couture
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Try-On Experience"
            className="p-2 text-cocoa hover:text-ink hover:bg-sand/40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Piece / Outfit Summary Bar ── */}
        <div className="px-5 py-2.5 bg-sand/30 border-b border-ink/10 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-ink truncate">
              {mode === 'combo' ? combo?.name || 'Curated Ensemble' : product?.name}
            </span>
            {selectedColour && selectedColour !== 'Standard' && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 bg-paper border border-ink/10 text-cocoa shrink-0">
                {selectedColour}
              </span>
            )}
            {selectedSize && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 bg-paper border border-ink/10 text-cocoa shrink-0">
                {selectedSize}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-ink text-xs sm:text-sm">
              ₹{price.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold hidden sm:inline-block">
              Free Delivery
            </span>
          </div>
        </div>

        {/* ── Modal Content Body ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Privacy Note Banner */}
          {settings?.show_privacy_notice !== false && <div className="flex items-center gap-2 px-3.5 py-2 bg-sand/20 border border-ink/8 text-[11px] text-cocoa">
            <Shield className="h-3.5 w-3.5 text-gold-dark shrink-0" />
            <span className="leading-snug">
              <strong>Your privacy matters:</strong> Your photo is used only to generate your virtual try-on and is never stored permanently or shared publicly.
            </span>
          </div>}

          {/* ── STEP 1: UPLOAD / TAKE PHOTO ── */}
          {step === 'upload' && (
            <div className="space-y-6 py-2">
              <div className="text-center max-w-md mx-auto space-y-2">
                <h3 className="font-display text-xl sm:text-2xl text-ink font-normal">
                  Upload Your Photograph
                </h3>
                <p className="text-xs text-cocoa leading-relaxed font-sans">
                  For the most flattering and accurate preview, take or upload a clear full-body photo with good lighting and minimal obstruction.
                </p>
              </div>

              {/* Upload Actions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                {/* Take Photo CTA */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center p-6 sm:p-8 bg-cream border-2 border-dashed border-ink/20 hover:border-gold-dark hover:bg-gold-light/10 transition-all min-h-[140px] text-center"
                >
                  <div className="h-12 w-12 rounded-full bg-sand/60 group-hover:bg-gold-dark group-hover:text-cream text-ink flex items-center justify-center transition-colors mb-3">
                    <Camera className="h-6 w-6" />
                  </div>
                  <span className="text-xs uppercase font-bold tracking-widest text-ink group-hover:text-gold-dark">
                    Take Photo
                  </span>
                  <span className="text-[10px] text-cocoa mt-1">Use your device camera</span>
                </button>

                {/* Upload Photo CTA */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center p-6 sm:p-8 bg-cream border-2 border-dashed border-ink/20 hover:border-gold-dark hover:bg-gold-light/10 transition-all min-h-[140px] text-center"
                >
                  <div className="h-12 w-12 rounded-full bg-sand/60 group-hover:bg-gold-dark group-hover:text-cream text-ink flex items-center justify-center transition-colors mb-3">
                    <Upload className="h-6 w-6" />
                  </div>
                  <span className="text-xs uppercase font-bold tracking-widest text-ink group-hover:text-gold-dark">
                    Upload Photo
                  </span>
                  <span className="text-[10px] text-cocoa mt-1">JPG, PNG, or WebP up to 10MB</span>
                </button>
              </div>

              {/* Hidden File Inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              {errorMessage && (
                <div className="p-3 bg-coral-light/20 border border-coral/30 text-coral text-xs flex items-center gap-2 max-w-lg mx-auto">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: PREVIEW PHOTO BEFORE GENERATING ── */}
          {step === 'preview' && photoPreviewUrl && (
            <div className="space-y-5 max-w-lg mx-auto">
              <div className="text-center space-y-1">
                <h3 className="font-display text-xl text-ink">Confirm Your Photo</h3>
                <p className="text-xs text-cocoa">
                  Ready to try on <span className="font-semibold text-ink">{product?.name || combo?.name}</span>.
                </p>
              </div>

              <div className="relative aspect-[3/4] max-h-[380px] w-full bg-sand/40 border border-ink/15 overflow-hidden mx-auto">
                <img
                  src={photoPreviewUrl}
                  alt="Customer photograph preview"
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleGenerate}
                  className="flex-1 rounded-none bg-ink text-cream hover:bg-gold-dark py-6 text-xs uppercase tracking-[0.2em] font-semibold min-h-[48px] shadow-md flex items-center justify-center gap-2"
                >
                  <Sparkles className="h-4 w-4 text-gold-light" />
                  <span>Use This Photo</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeletePhoto}
                  className="rounded-none py-6 text-xs uppercase tracking-wider font-semibold border-ink/20 min-h-[48px]"
                >
                  Choose Another
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: GENERATING STATE (Luxury Thretha Animation) ── */}
          {step === 'generating' && (
            <div className="py-16 text-center space-y-6 max-w-md mx-auto">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-gold-dark/30 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-gold-dark border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-gold-dark">
                  <Sparkles className="h-8 w-8 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-dark">
                  Creating Your Look
                </p>
                <h3 className="font-display text-2xl text-ink font-normal">
                  Draping Thretha Atelier Piece…
                </h3>
                <p className="text-xs text-cocoa leading-relaxed">
                  Our virtual try-on engine is styling your photograph with the selected cut and drape.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelGeneration}
                className="rounded-none text-xs border-ink/20 text-cocoa hover:text-ink mt-4"
              >
                Cancel
              </Button>
            </div>
          )}

          {/* ── STEP 4: RESULT SCREEN ── */}
          {step === 'result' && generatedResult && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Try-On Generated Image */}
              <div className="lg:col-span-7 space-y-2">
                <div className="relative aspect-[3/4] max-h-[500px] w-full bg-sand/30 border border-ink/15 overflow-hidden shadow-xs">
                  <img
                    src={generatedResult.image_url}
                    alt={`Try on result for ${product?.name || combo?.name}`}
                    className="h-full w-full object-contain"
                    onLoad={() => {
                      console.log('[TRYON CLIENT] image loaded successfully', { provider: generatedResult?.provider, isMock: generatedResult?.is_mock })
                    }}
                    onError={(e) => {
                      console.error('[TRYON CLIENT] Image failed to render:', e.type)
                      setErrorMessage('The generated preview could not be displayed. Please try again.')
                      setStep('error')
                    }}
                  />
                  {generatedResult.is_mock && (
                    <div className="absolute top-2.5 left-2.5 bg-ink/80 backdrop-blur-xs text-cream px-2 py-0.5 text-[9px] uppercase font-mono tracking-wider">
                      Development Preview Mode
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-cocoa/70 italic text-center font-sans">
                  {disclaimer}
                </p>
              </div>

              {/* Right Column: Styling Controls & Add to Bag */}
              <div className="lg:col-span-5 space-y-5 bg-cream p-4 sm:p-5 border border-ink/10">
                <div className="space-y-1 border-b border-ink/10 pb-3">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-cocoa">
                    {mode === 'combo' ? 'Curated Look Piece' : 'Selected Atelier Piece'}
                  </span>
                  <h3 className="font-display text-xl text-ink font-normal">
                    {product?.name || combo?.name}
                  </h3>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-base font-bold text-ink">
                      ₹{price.toLocaleString('en-IN')}
                    </span>
                    {product?.discount_price && product?.price && (
                      <span className="text-xs text-cocoa-light line-through">
                        ₹{Number(product.price).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Interactive Colour Switcher with Cost-Protected Regeneration */}
                {mode === 'single' && productColours.length > 1 && onColourChange && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink block">
                      Colour: <span className="font-normal text-cocoa">{selectedColour}</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {productColours.map((c) => {
                        const isSel = selectedColour?.toLowerCase() === c.toLowerCase()
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => onColourChange(c)}
                            className={cn(
                              'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded-xs transition-all',
                              isSel
                                ? 'bg-ink text-cream border-ink shadow-xs'
                                : 'bg-paper text-ink border-ink/20 hover:border-gold-dark'
                            )}
                          >
                            {c}
                          </button>
                        )
                      })}
                    </div>

                    {/* Cost Protection: Require explicit click to generate new colour */}
                    {selectedColour &&
                      generatedColour &&
                      selectedColour.toLowerCase() !== generatedColour.toLowerCase() && (
                        <Button
                          type="button"
                          onClick={handleGenerate}
                          className="w-full rounded-none bg-gold-dark text-cream hover:bg-ink text-xs uppercase tracking-wider py-4 mt-2 flex items-center justify-center gap-2 shadow-xs transition-colors"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Try {selectedColour} ✦</span>
                        </Button>
                      )}
                  </div>
                )}

                {/* Interactive Size Switcher */}
                {mode === 'single' && explicitSizes.length > 1 && onSizeChange && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink block">
                      Size: <span className="font-normal text-cocoa">{selectedSize}</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {explicitSizes.map((s) => {
                        const isSel = selectedSize?.toLowerCase() === s.size.toLowerCase()
                        return (
                          <button
                            key={s.size}
                            type="button"
                            onClick={() => onSizeChange(s.size)}
                            className={cn(
                              'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded-xs transition-all',
                              isSel
                                ? 'bg-ink text-cream border-ink shadow-xs'
                                : 'bg-paper text-ink border-ink/20 hover:border-gold-dark'
                            )}
                          >
                            {s.size}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2.5 pt-2">
                  <Button
                    type="button"
                    onClick={handleAddToBagClick}
                    className={cn(
                      'w-full rounded-none py-6 text-xs uppercase tracking-[0.22em] font-semibold min-h-[50px] shadow-md transition-all',
                      addedToCartSuccess
                        ? 'bg-emerald-800 text-cream'
                        : 'bg-ink text-cream hover:bg-gold-dark'
                    )}
                  >
                    {addedToCartSuccess ? (
                      <span className="flex items-center gap-2 animate-fade-in">
                        <Check className="h-4 w-4 text-emerald-300" />
                        <span>Added to Shopping Bag</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4" />
                        <span>Add This Look to Bag</span>
                      </span>
                    )}
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setStep('preview')}
                      className="rounded-none text-xs border-ink/20 py-5"
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                      <span>Try Another Photo</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeletePhoto}
                      className="rounded-none text-xs text-coral hover:bg-coral-light/20 border-coral/30 py-5"
                    >
                      <Trash2 className="h-3 w-3 mr-1.5" />
                      <span>Delete Photo</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: ERROR STATE ── */}
          {step === 'error' && (
            <div className="py-12 text-center space-y-5 max-w-md mx-auto">
              <div className="h-14 w-14 rounded-full bg-coral-light/30 text-coral flex items-center justify-center mx-auto border border-coral/30">
                <AlertCircle className="h-7 w-7" />
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-xl text-ink font-normal">
                  We Couldn&apos;t Create Your Try-On
                </h3>
                <p className="text-xs text-cocoa leading-relaxed">
                  {errorMessage || 'Something went wrong while processing your virtual try-on. Please try again with a different photo.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button
                  type="button"
                  onClick={handleGenerate}
                  className="rounded-none bg-ink text-cream hover:bg-gold-dark text-xs uppercase tracking-wider font-semibold px-6 py-5"
                >
                  Try Again
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeletePhoto}
                  className="rounded-none border-ink/20 text-xs uppercase tracking-wider font-semibold px-6 py-5"
                >
                  Choose Another Photo
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Sticky Footer (Safe Area Aware) ── */}
        <div className="px-5 py-3 border-t border-ink/10 bg-cream/80 flex items-center justify-between text-xs text-cocoa shrink-0 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center gap-1.5 text-[11px] text-cocoa">
            <Info className="h-3 w-3 text-gold-dark" />
            <span>AI Virtual Try-On · Thretha Couture</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-ink hover:text-gold-dark underline uppercase tracking-wider p-1"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
