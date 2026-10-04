'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/tc'
import ComboBuilder from '@/components/tc/ComboBuilder'
import ErrorBoundary from '@/components/tc/ErrorBoundary'

export default function ComboDetailPage({ initialCombo, slug: serverSlug }) {
  const params = useParams()
  const router = useRouter()
  const slug = serverSlug || params?.slug

  const [combo, setCombo] = useState(initialCombo || null)
  const [loading, setLoading] = useState(!initialCombo)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug || initialCombo) return
    setLoading(true)
    api(`/combos/${slug}`)
      .then((data) => {
        if (data?.error) {
          setError(data.error?.message || data.error || 'Failed to load curated ensemble.')
        } else {
          setCombo(data)
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load curated combo')
      })
      .finally(() => setLoading(false))
  }, [slug, initialCombo])

  if (loading) {
    return (
      <div className="min-h-screen bg-paper py-32 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mango border-t-transparent" />
        <p className="mt-4 text-xs uppercase tracking-widest text-cocoa">
          Preparing Curated Ensemble…
        </p>
      </div>
    )
  }

  if (error || !combo) {
    return (
      <div className="min-h-screen bg-paper px-4 py-24 text-center">
        <div className="mx-auto max-w-md border border-dashed border-ink/20 bg-cream p-12 space-y-4">
          <Sparkles className="mx-auto h-8 w-8 text-mango-dark opacity-60" />
          <h1 className="font-display text-2xl text-ink font-normal">Combo Unavailable</h1>
          <p className="text-xs text-cocoa">
            {error || 'The requested curated combo could not be found or has expired.'}
          </p>
          <Link href="/combos" className="inline-block pt-2">
            <Button className="rounded-none bg-ink px-6 py-2 text-xs uppercase tracking-widest text-cream">
              Browse All Combos
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary sectionName="Curated Ensemble Builder">
      <ComboBuilder combo={combo} />
    </ErrorBoundary>
  )
}

