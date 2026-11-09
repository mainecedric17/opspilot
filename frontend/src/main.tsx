
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Session } from '@supabase/supabase-js'

import App from './App'
import AuthPage from './components/AuthPage'
import { supabase } from './lib/supabaseClient'

import './index.css'

function AuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return

        setSession(nextSession)
        setLoading(false)
      }
    )

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return

        if (error) {
          console.error('Failed to restore session:', error.message)
          setSession(null)
        } else {
          setSession(data.session)
        }

        setLoading(false)
      })
      .catch(error => {
        if (!active) return

        console.error('Session initialization failed:', error)
        setSession(null)
        setLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b101b',
          color: '#c5b5ff',
          fontFamily: 'inherit'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '26px',
              fontWeight: 800,
              marginBottom: '10px'
            }}
          >
            OpsPilot
          </div>

          <p
            style={{
              fontSize: '14px',
              color: '#9ba6bf'
            }}
          >
            Checking your session...
          </p>
        </div>
      </main>
    )
  }

  if (!session) {
    return <AuthPage />
  }

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>
)
