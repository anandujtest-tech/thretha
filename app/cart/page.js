'use client'

import StoreLayout from '@/components/tc/StoreLayout'
import CartPage from '@/components/tc/CartPage'
import ErrorBoundary from '@/components/tc/ErrorBoundary'

export default function CartRoute() {
  return (
    <StoreLayout>
      <ErrorBoundary sectionName="Shopping Bag">
        <CartPage />
      </ErrorBoundary>
    </StoreLayout>
  )
}

