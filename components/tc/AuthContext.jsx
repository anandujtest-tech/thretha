'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, getWishlist } from '@/lib/tc'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 1. Initial Session Check
  const refreshUser = useCallback(async () => {
    try {
      const res = await api('/auth/session')
      if (res?.authenticated && res?.user) {
        setUser(res.user)
        return res.user
      } else {
        setUser(null)
        return null
      }
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  // 2. Synchronize guest wishlist to database on successful authentication
  const syncGuestWishlist = async () => {
    try {
      const localSlugs = getWishlist()
      if (localSlugs.length > 0) {
        await api('/account/wishlist', {
          method: 'POST',
          body: { slugs: localSlugs },
        })
      }
    } catch (err) {
      console.warn('[Auth:Wishlist] Failed to merge guest wishlist:', err)
    }
  }

  // 3. Email OTP Request
  const sendOtp = async (email) => {
    const res = await api('/auth/email/send-otp', {
      method: 'POST',
      body: { email },
    })
    return res
  }

  // 4. Email OTP Verification & Login
  const verifyOtp = async (email, otp) => {
    const res = await api('/auth/email/verify-otp', {
      method: 'POST',
      body: { email, otp },
    })
    if (res?.ok && res?.user) {
      setUser(res.user)
      await syncGuestWishlist()
    }
    return res
  }

  // 5. Google Sign-In URL
  const getGoogleAuthUrl = async (redirectTo = '/account') => {
    const res = await api(`/auth/google/url?redirect_to=${encodeURIComponent(redirectTo)}`)
    return res
  }

  // 6. Customer Logout
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      // Continue client cleanup regardless of network error
    }
    setUser(null)
  }

  // 7. Update Profile
  const updateProfile = async (data) => {
    const res = await api('/account/profile', {
      method: 'PATCH',
      body: data,
    })
    if (res?.ok && res?.user) {
      setUser(res.user)
    }
    return res
  }

  // 8. Delete Account
  const deleteAccount = async () => {
    const res = await api('/account', { method: 'DELETE' })
    if (res?.ok) {
      setUser(null)
    }
    return res
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        refreshUser,
        sendOtp,
        verifyOtp,
        getGoogleAuthUrl,
        logout,
        updateProfile,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

