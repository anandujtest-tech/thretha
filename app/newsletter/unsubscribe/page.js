'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StoreLayout from '@/components/tc/StoreLayout'
import { api } from '@/lib/tc'

export default function NewsletterUnsubscribePage() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('ready')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '')
  }, [])

  const unsubscribe = async () => {
    setStatus('working')
    setMessage('')
    try {
      const result = await api('/newsletter/unsubscribe', { method: 'POST', body: { token } })
      setStatus('done')
      setMessage(result.message || 'You have been unsubscribed from The Thretha Edit.')
    } catch (error) {
      setStatus('error')
      setMessage(error.message || 'This unsubscribe link is invalid or has expired.')
    }
  }

  return <StoreLayout>
    <main className="container max-w-xl py-20 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mango-dark">The Thretha Edit</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Manage your newsletter</h1>
      {status === 'ready' && <><p className="mt-4 text-sm text-cocoa">Confirm below to stop receiving newsletter emails.</p><button disabled={!token} onClick={unsubscribe} className="mt-7 min-h-11 bg-ink px-6 text-xs font-bold uppercase tracking-wider text-cream disabled:opacity-50">Unsubscribe</button>{!token && <p className="mt-3 text-xs text-coral">This link is missing its confirmation token.</p>}</>}
      {status === 'working' && <p className="mt-5 text-sm text-cocoa">Updating your subscription…</p>}
      {(status === 'done' || status === 'error') && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-5 text-sm ${status === 'error' ? 'text-coral' : 'text-emerald-800'}`}>{message}</p>}
      <Link href="/" className="mt-8 inline-block text-xs underline underline-offset-4">Return to Thretha</Link>
    </main>
  </StoreLayout>
}
