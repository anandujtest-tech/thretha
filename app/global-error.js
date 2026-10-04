'use client'

import React, { useEffect } from 'react'

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Global Error Boundary Caught:', error?.message || error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#FAF8F5', fontFamily: 'serif', color: '#1B1714' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center', background: '#F5F0EB', border: '1px solid rgba(27,23,20,0.12)', padding: '36px' }}>
            <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.25em', color: '#6E6259', margin: '0 0 8px' }}>
              Thretha Couture
            </p>
            <h1 style={{ fontSize: '28px', fontWeight: '400', margin: '0 0 12px', color: '#1B1714' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#6E6259', margin: '0 0 24px' }}>
              We experienced a temporary issue. Please try reloading the atelier or return to the main entrance.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => reset()}
                style={{
                  backgroundColor: '#1B1714',
                  color: '#FAF8F5',
                  border: 'none',
                  padding: '12px 24px',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  display: 'inline-block',
                  border: '1px solid rgba(27,23,20,0.2)',
                  color: '#1B1714',
                  padding: '12px 24px',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  textDecoration: 'none',
                  fontWeight: '500',
                }}
              >
                Return Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

