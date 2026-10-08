'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { auth } from '@/lib/tc'
import { uploadMediaFile } from '@/lib/mediaUpload'
import { validateCampaignImage } from '@/lib/adminCampaignImage'

export default function CampaignImageUpload({ value, onChange, folder, previewClassName, onUploadStart, onUploadEnd }) {
  const input = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [uploadedUrl, setUploadedUrl] = useState('')

  const upload = async (file) => {
    if (!file || uploading) return
    setError(''); setUploadedUrl('')
    let started = false
    try {
      await validateCampaignImage(file)
      started = true
      setUploading(true); setProgress(0); onUploadStart?.()
      const result = await uploadMediaFile(file, { token: auth.get(), folder, onProgress: setProgress })
      if (result.type !== 'image') throw new Error('Cloudinary returned an unexpected media type.')
      onChange(result.url)
      setUploadedUrl(result.url)
    } catch (cause) {
      setError(cause.message || 'Upload failed. Please try again.')
    } finally {
      if (input.current) input.current.value = ''
      setUploading(false); setProgress(0)
      if (started) onUploadEnd?.()
    }
  }

  return <div className="space-y-2">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} aria-label="Choose image to upload" />
    <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="inline-flex min-h-10 items-center gap-2 border border-ink/20 bg-cream px-3 text-[11px] font-semibold text-ink disabled:opacity-50"><Upload size={14} />{uploading ? `Uploading… ${progress}%` : value ? 'Replace Image' : 'Upload Image'}</button>
    {uploading && <progress value={progress} max="100" aria-label="Image upload progress" className="block h-2 w-48 max-w-full" />}
    {error && <p role="alert" className="text-xs text-coral">{error}</p>}
    {uploadedUrl && uploadedUrl === value && <p role="status" className="text-xs text-emerald-800">Image uploaded ✓</p>}
    <p className="text-[11px] text-cocoa">or paste an image URL</p>
    {value && <div className="space-y-2"><img src={value} alt="Campaign image preview" className={previewClassName} /><button type="button" disabled={uploading} onClick={() => { onChange(''); setUploadedUrl(''); setError('') }} className="block text-xs text-coral underline disabled:opacity-50">Remove image</button></div>}
  </div>
}
