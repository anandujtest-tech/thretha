'use client'

import AdminView from '@/components/tc/admin'
import ErrorBoundary from '@/components/tc/ErrorBoundary'

export default function AdminPage() {
  return (
    <ErrorBoundary sectionName="Admin Workspace">
      <AdminView />
    </ErrorBoundary>
  )
}

