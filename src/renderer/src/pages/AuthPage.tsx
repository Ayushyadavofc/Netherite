import { useState } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/stores/authStore'

type AuthMode = 'login' | 'register'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function AuthPage() {
  const { login, register } = useAuthStore((state) => ({
    login: state.login,
    register: state.register
  }))

  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (isSubmitting) return

    setError('')
    setIsSubmitting(true)

    try {
      if (mode === 'register') {
        await register(email, password, name)
      } else {
        await login(email, password)
      }
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          mode === 'register' ? 'Could not create your account.' : 'Could not sign you in.'
        )
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleMode = () => {
    setMode((currentMode) => (currentMode === 'login' ? 'register' : 'login'))
    setError('')
  }

  const canSubmit =
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    (mode === 'login' || name.trim().length > 0)

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050303] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,107,43,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(153,27,27,0.22),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30" />

      <div className="relative w-full max-w-md border border-[#3a2119] bg-[#0a0808] shadow-[12px_12px_0_0_rgba(122,24,24,0.55)]">
        <div className="border-b border-[#3a2119] px-6 py-5">
          <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.35em] text-[#ff6b2b]">
            Netherite Access
          </p>
          <h1 className="text-3xl font-black uppercase tracking-[0.08em] text-[#fff1e8]">
            {mode === 'login' ? 'Enter The Forge' : 'Claim Your Vault'}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[#b8a39a]">
            {mode === 'login'
              ? 'Sign in to sync your vault, settings, and snapshots.'
              : 'Create your account to start building your second brain in the dark.'}
          </p>
        </div>

        <div className="space-y-5 px-6 py-6">
          {mode === 'register' && (
            <div>
              <label className="mb-2 block text-[0.65rem] font-black uppercase tracking-[0.28em] text-[#7d5f56]">
                Name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Netherite Smith"
                className="w-full border border-[#2a1a16] bg-[#120d0d] px-4 py-3 text-sm font-medium text-white outline-none transition-all placeholder:text-[#5f4a45] focus:border-[#ff5625] focus:shadow-[0_0_0_1px_rgba(255,86,37,0.3)]"
              />
            </div>
          )}

          <div>
            <label className="mb-2 block text-[0.65rem] font-black uppercase tracking-[0.28em] text-[#7d5f56]">
              Email
            </label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@netherite.app"
              className="w-full border border-[#2a1a16] bg-[#120d0d] px-4 py-3 text-sm font-medium text-white outline-none transition-all placeholder:text-[#5f4a45] focus:border-[#ff5625] focus:shadow-[0_0_0_1px_rgba(255,86,37,0.3)]"
            />
          </div>

          <div>
            <label className="mb-2 block text-[0.65rem] font-black uppercase tracking-[0.28em] text-[#7d5f56]">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  void handleSubmit()
                }
              }}
              placeholder="********"
              className="w-full border border-[#2a1a16] bg-[#120d0d] px-4 py-3 text-sm font-medium text-white outline-none transition-all placeholder:text-[#5f4a45] focus:border-[#ff5625] focus:shadow-[0_0_0_1px_rgba(255,86,37,0.3)]"
            />
          </div>

          {error && (
            <div className="border border-[#6b1f1f] bg-[rgba(107,31,31,0.22)] px-4 py-3 text-sm font-medium text-[#ffb4a8]">
              {error}
            </div>
          )}

          <div
            onClick={() => {
              if (canSubmit) {
                void handleSubmit()
              }
            }}
            className={`flex min-h-14 items-center justify-center border px-4 text-sm font-black uppercase tracking-[0.28em] transition-all ${
              canSubmit && !isSubmitting
                ? 'cursor-pointer border-[#ff5625] bg-[#ff5625] text-[#120806] shadow-[6px_6px_0_0_rgba(122,24,24,0.45)] hover:bg-[#ff6b2b] hover:border-[#ff6b2b]'
                : 'cursor-not-allowed border-[#3a2119] bg-[#1a1211] text-[#6d5650]'
            }`}
            role="button"
            tabIndex={canSubmit ? 0 : -1}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && canSubmit) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
            aria-disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-3">
                <Spinner className="size-4 text-[#120806]" />
                {mode === 'login' ? 'Signing In' : 'Creating Account'}
              </span>
            ) : (
              <span>{mode === 'login' ? 'Login' : 'Register'}</span>
            )}
          </div>
        </div>

        <div className="border-t border-[#3a2119] bg-[#080606] px-6 py-5 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-[#7d5f56]">
            {mode === 'login' ? 'Need an account?' : 'Already forged an account?'}
          </p>
          <button
            type="button"
            onClick={handleToggleMode}
            className="mt-3 text-sm font-black uppercase tracking-[0.24em] text-[#ffb77d] transition-colors hover:text-[#fff1e8]"
          >
            {mode === 'login' ? 'Switch To Register' : 'Switch To Login'}
          </button>
        </div>
      </div>
    </div>
  )
}
