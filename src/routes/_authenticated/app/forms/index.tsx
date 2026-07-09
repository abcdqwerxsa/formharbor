import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listOrgForms } from '#/server/forms/functions'

export const Route = createFileRoute('/_authenticated/app/forms/')({
  component: FormsList,
})

function FormsList() {
  const [forms, setForms] = useState<Awaited<ReturnType<typeof listOrgForms>>>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listOrgForms()
      .then((f) => { if (alive) setForms(f) })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load forms') })
    return () => { alive = false }
  }, [])

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="demo-title">Forms</h1>
          <Link to="/app/forms/new" className="demo-button">New form</Link>
        </div>
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : forms.length === 0 ? (
          <p className="demo-muted text-sm">No forms yet. Create your first.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded border border-[var(--line)] px-3 py-2">
                <span className="font-medium">{f.name}</span>
                <span className="flex items-center gap-3">
                  <span className="demo-muted text-xs uppercase">{f.status}</span>
                  <Link to="/app/forms/$formId/edit" params={{ formId: f.id }} className="text-sm text-[var(--lagoon-deep)] underline">Edit</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="demo-muted mt-6 text-sm"><Link to="/app" className="underline">← Back to app</Link></p>
      </section>
    </main>
  )
}
