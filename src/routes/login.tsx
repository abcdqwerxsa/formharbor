import { useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { login } from '#/server/auth/functions'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login({ data: { email, password } })
      navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4 text-center">Sign in</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input className="demo-input" type="email" required placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="demo-input" type="password" required placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="demo-button" type="submit">Sign in</button>
        </form>
        <p className="demo-muted mt-4 text-center text-sm">
          No account? <Link to="/register" className="text-[var(--lagoon-deep)] underline">Register</Link>
        </p>
      </section>
    </main>
  )
}
