'use client'

import { Suspense } from 'react'
import StoreLayout from '@/components/tc/StoreLayout'
import AccountDashboard from '@/components/tc/AccountDashboard'
import ErrorBoundary from '@/components/tc/ErrorBoundary'

export default function AccountRoute() {
  return (
    <StoreLayout>
      <ErrorBoundary sectionName="Account Dashboard">
        <Suspense fallback={
          <div className="container py-24 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            <p className="mt-4 text-xs font-sans uppercase tracking-widest text-cocoa">
              Loading your account…
            </p>
          </div>
        }>
          <AccountDashboard />
        </Suspense>
      </ErrorBoundary>
    </StoreLayout>
  )
}

