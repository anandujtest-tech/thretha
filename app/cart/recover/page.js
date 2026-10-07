'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import StoreLayout from '@/components/tc/StoreLayout'
import { useCart } from '@/components/tc/CartContext'
import { api } from '@/lib/tc'

export default function RecoverCartPage() {
  const { isLoaded, restoreCartItems } = useCart()
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Checking the signed cart recovery link…')

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '')
  }, [])

  useEffect(() => {
    if (!isLoaded || !token) return
    let active = true
    api('/abandoned-cart/recover', { method: 'POST', body: { token } }).then((result) => {
      if (!active) return
      const count = restoreCartItems(result.items)
      setStatus('done')
      setMessage(count ? 'Your available pieces have been restored to your bag.' : 'No available pieces remain in this saved bag.')
      window.history.replaceState(null, '', '/cart/recover')
    }).catch((error) => {
      if (!active) return
      setStatus('error')
      setMessage(error.message || 'This cart recovery link is invalid or has expired.')
      window.history.replaceState(null, '', '/cart/recover')
    })
    return () => { active = false }
  }, [isLoaded, token, restoreCartItems])

  useEffect(() => {
    if (isLoaded && !token && status === 'loading') {
      setStatus('error')
      setMessage('This cart recovery link is missing its signed token.')
    }
  }, [isLoaded, token, status])

  return <StoreLayout>
    <main className="container max-w-xl py-20 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mango-dark">Your Thretha bag</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Restore your bag</h1>
      <p role={status === 'error' ? 'alert' : 'status'} className={`mt-4 text-sm ${status === 'error' ? 'text-coral' : 'text-cocoa'}`}>{message}</p>
      {status === 'done' && <Link href="/cart" className="mt-7 inline-flex min-h-11 items-center justify-center bg-ink px-6 text-xs font-bold uppercase tracking-wider text-cream">View your bag</Link>}
    </main>
  </StoreLayout>
}
