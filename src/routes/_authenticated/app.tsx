import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { logout } from '#/server/auth/functions'

export const Route = createFileRoute('/_authenticated/app')({ component: AppHome })

function AppHome() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()

  async function onLogout() {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <p className="island-kicker mb-2">FormHarbor</p>
        <h1 className="demo-title mb-3">Signed in</h1>
        <p className="demo-muted mb-6 text-sm">You are {user.email}.</p>
        <button className="demo-button" onClick={onLogout}>Sign out</button>
      </section>
    </main>
  )
}
