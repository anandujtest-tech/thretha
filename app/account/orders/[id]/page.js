'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import StoreLayout from '@/components/tc/StoreLayout'
import OrderDetailPage from '@/components/tc/OrderDetailPage'

export default function OrderDetailRoute() {
  const params = useParams()
  const orderId = params?.id

  return (
    <StoreLayout>
      <Suspense fallback={
        <div className="container py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          <p className="mt-4 text-xs font-sans uppercase tracking-widest text-cocoa">
            Loading order details…
          </p>
        </div>
      }>
        <OrderDetailPage orderId={orderId} />
      </Suspense>
    </StoreLayout>
  )
}

