
import { useState, type FormEvent } from 'react'
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './AuthPage.css'

type AuthMode = 'login' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isLogin = mode === 'login'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const normalizedEmail = email.trim().toLowerCase()

      if (isLogin) {
        const { error: authError } =
          await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password
          })

        if (authError) {
          throw authError
        }
      } else {
        const normalizedName = fullName.trim().replace(/\s+/g, ' ')

        if (normalizedName.length < 2) {
          throw new Error(
            'Please enter your full name.'
          )
        }

        if (normalizedName.length > 100) {
          throw new Error(
            'Full name must be 100 characters or fewer.'
          )
        }

        const { data, error: authError } =
          await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                full_name: normalizedName
              }
            }
          })

        if (authError) {
          throw authError
        }

        if (!data.session) {
          setMessage(
            'Account request received. Check your email for a confirmation link before signing in.'
          )
        } else {
          setMessage('Account created successfully.')
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setMessage('')
    setPassword('')
    setShowPassword(false)
  }

  return (
    <main className="op-auth-page">
      <section className="op-auth-brand-panel">
        <div className="op-auth-brand">
          <div className="op-auth-logo">
            <Zap size={26} fill="currentColor" />
          </div>

          <div>
            <strong>OpsPilot</strong>
            <span>AI Operations Platform</span>
          </div>
        </div>

        <div className="op-auth-brand-content">
          <div className="op-auth-eyebrow">
            <Sparkles size={16} />
            SMARTER OPERATIONS
          </div>

          <h1>
            Your workspace.
            <br />
            <span>Under control.</span>
          </h1>

          <p>
            Manage tasks, review AI-powered proposals, and automate
            your business workflows from one connected workspace.
          </p>

          <div className="op-auth-features">
            <div>
              <ShieldCheck size={19} />
              Human-reviewed AI actions
            </div>

            <div>
              <Sparkles size={19} />
              Intelligent task proposals
            </div>

            <div>
              <LockKeyhole size={19} />
              Account-based sign-in
            </div>
          </div>
        </div>

        <div className="op-auth-brand-footer">
          OpsPilot · Development environment
        </div>
      </section>

      <section className="op-auth-form-panel">
        <div className="op-auth-form-container">
          <div className="op-auth-mobile-brand">
            <Zap size={22} fill="currentColor" />
            <strong>OpsPilot</strong>
          </div>

          <div className="op-auth-form-heading">
            <div className="op-auth-form-icon">
              <LockKeyhole size={22} />
            </div>

            <h2>
              {isLogin
                ? 'Welcome back'
                : 'Create your account'}
            </h2>

            <p>
              {isLogin
                ? 'Sign in to continue to your OpsPilot workspace.'
                : 'Get started with your OpsPilot account.'}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="op-auth-form"
          >
            {!isLogin && (
              <>
                <label htmlFor="op-auth-full-name">
                  Full name
                </label>

                <div className="op-auth-input-wrap">
                  <UserRound size={18} />

                  <input
                    id="op-auth-full-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={event =>
                      setFullName(event.target.value)
                    }
                    minLength={2}
                    maxLength={100}
                    required
                    disabled={loading}
                  />
                </div>
              </>
            )}

            <label htmlFor="op-auth-email">
              Email address
            </label>

            <div className="op-auth-input-wrap">
              <Mail size={18} />

              <input
                id="op-auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={event =>
                  setEmail(event.target.value)
                }
                required
                disabled={loading}
              />
            </div>

            <label htmlFor="op-auth-password">
              Password
            </label>

            <div className="op-auth-input-wrap">
              <LockKeyhole size={18} />

              <input
                id="op-auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  isLogin
                    ? 'current-password'
                    : 'new-password'
                }
                placeholder="Enter your password"
                value={password}
                onChange={event =>
                  setPassword(event.target.value)
                }
                minLength={6}
                required
                disabled={loading}
              />

              <button
                type="button"
                className="op-auth-password-toggle"
                onClick={() =>
                  setShowPassword(value => !value)
                }
                aria-label={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
                disabled={loading}
              >
                {showPassword
                  ? <EyeOff size={18} />
                  : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <div
                className="op-auth-feedback op-auth-error"
                role="alert"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                className="op-auth-feedback op-auth-success"
                role="status"
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              className="op-auth-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    size={18}
                    className="op-auth-spinner"
                  />
                  Please wait...
                </>
              ) : (
                isLogin
                  ? 'Sign in'
                  : 'Create account'
              )}
            </button>
          </form>

          <p className="op-auth-switch">
            {isLogin
              ? "Don't have an account?"
              : 'Already have an account?'}{' '}

            <button
              type="button"
              onClick={() =>
                switchMode(
                  isLogin ? 'signup' : 'login'
                )
              }
              disabled={loading}
            >
              {isLogin
                ? 'Create one'
                : 'Sign in'}
            </button>
          </p>

          <p className="op-auth-security-note">
            <LockKeyhole size={14} />
            Authentication powered by Supabase
          </p>
        </div>
      </section>
    </main>
  )
}
