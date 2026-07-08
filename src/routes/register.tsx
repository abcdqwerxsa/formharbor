import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { register } from '#/server/auth/functions'

export const Route = createFileRoute('/register')({ component: RegisterPage })

function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await register({ data: { email, password } })
      navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4 text-center">Create account</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input className="demo-input" type="email" required placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="demo-input" type="password" required placeholder="Password (min 8)" minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="demo-button" type="submit">Register</button>
        </form>
        <p className="demo-muted mt-4 text-center text-sm">
          Have an account? <Link to="/login" className="text-[var(--lagoon-deep)] underline">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
