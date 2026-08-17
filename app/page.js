'use client'

import { useEffect, useState } from 'react'
import Store from '@/components/tc/store'
import Admin from '@/components/tc/admin'
import VisitorTracker from '@/components/tc/VisitorTracker'

function App() {
  const [path, setPath] = useState('/')

  useEffect(() => {
    setPath(window.location.pathname || '/')
    const onPop = () => setPath(window.location.pathname || '/')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (to) => {
    if (to.startsWith('/#')) {
      // in-page anchor on home
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/')
        setPath('/')
      }
      setTimeout(() => {
        const el = document.getElementById(to.slice(2))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 50)
      return
    }
    window.history.pushState({}, '', to)
    setPath(to)
  }

  if (path.startsWith('/admin')) return <Admin navigate={navigate} />

return (
  <>
    <VisitorTracker />
    <Store path={path} navigate={navigate} />
  </>
)
}

export default App
