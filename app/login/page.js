'use client'

import { Suspense } from 'react'
import StoreLayout from '@/components/tc/StoreLayout'
import LoginPage from '@/components/tc/LoginPage'

export default function LoginRoute() {
  return (
    <StoreLayout>
      <Suspense fallback={
        <div className="container py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          <p className="mt-4 text-xs font-sans uppercase tracking-widest text-cocoa">
            Loading authentication…
          </p>
        </div>
      }>
        <LoginPage />
      </Suspense>
    </StoreLayout>
  )
}

