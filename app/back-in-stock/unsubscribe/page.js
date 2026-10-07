'use client'

import { useEffect, useState } from 'react'
import StoreLayout from '@/components/tc/StoreLayout'
import { api } from '@/lib/tc'

export default function BackInStockUnsubscribePage() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Checking your stock alert link…')

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || ''
    setToken(value)
    window.history.replaceState(null, '', '/back-in-stock/unsubscribe')
    if (!value) {
      setStatus('error')
      setMessage('This unsubscribe link is missing its confirmation token.')
      return
    }
    api(`/back-in-stock/unsubscribe?token=${encodeURIComponent(value)}`)
      .then(() => { setStatus('ready'); setMessage('Confirm if you want to stop this back-in-stock alert.') })
      .catch((error) => { setStatus('error'); setMessage(error.message || 'This unsubscribe link is invalid or has expired.') })
  }, [])

  const unsubscribe = async () => {
    setStatus('saving')
    setMessage('Unsubscribing…')
    try {
      await api('/back-in-stock/unsubscribe', { method: 'POST', body: { token } })
      setStatus('done')
      setMessage('This back-in-stock alert has been unsubscribed.')
    } catch (error) {
      setStatus('error')
      setMessage(error.message || 'This unsubscribe link is invalid or has expired.')
    }
  }

  return <StoreLayout>
    <main className="container max-w-xl py-20 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mango-dark">Thretha stock alerts</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Unsubscribe</h1>
      <p role={status === 'error' ? 'alert' : 'status'} className={`mt-4 text-sm ${status === 'error' ? 'text-coral' : 'text-cocoa'}`}>{message}</p>
      {status === 'ready' && <button type="button" onClick={unsubscribe} className="mt-7 min-h-11 bg-ink px-6 text-xs font-bold uppercase tracking-wider text-cream">Confirm Unsubscribe</button>}
    </main>
  </StoreLayout>
}
