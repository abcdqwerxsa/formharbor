import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { logout } from '#/server/auth/functions'
import { getCurrentOrg } from '#/server/auth/org-middleware'
import { useState, useEffect } from 'react'
import type { OrgMembership } from '#/server/org'

export const Route = createFileRoute('/_authenticated/app')({ component: AppHome })

function AppHome() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const [org, setOrg] = useState<OrgMembership | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)

  // Fetch the user's current org once on mount. This is scoped to /app so the
  // (possibly DB-writing) ensureOrgForUser call only runs here, not on every
  // guarded route.
  useEffect(() => {
    let alive = true
    getCurrentOrg()
      .then((o: OrgMembership | null) => { if (alive) setOrg(o) })
      .catch((e: unknown) => { if (alive) setOrgError(e instanceof Error ? e.message : 'Could not load org') })
    return () => { alive = false }
  }, [])

  async function onLogout() {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <p className="island-kicker mb-2">FormHarbor</p>
        <h1 className="demo-title mb-3">Signed in</h1>
        <p className="demo-muted mb-2 text-sm">You are {user.email}.</p>

        {orgError ? (
          <p className="mb-6 text-sm text-red-600">{orgError}</p>
        ) : org ? (
          <div className="mb-6">
            <p className="text-sm">
              <span className="font-medium">{org.name}</span>
              {' '}·{' '}
              <span className="demo-muted">{org.role}</span>
            </p>
            <p className="demo-muted mt-3 text-sm">Forms (none yet — M1b)</p>
          </div>
        ) : (
          <p className="demo-muted mb-6 text-sm">Loading org…</p>
        )}

        <button className="demo-button" onClick={onLogout}>Sign out</button>
      </section>
    </main>
  )
}
