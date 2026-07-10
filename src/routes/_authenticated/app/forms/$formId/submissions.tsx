import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listOrgFormSubmissions } from '#/server/submissions/functions'

export const Route = createFileRoute('/_authenticated/app/forms/$formId/submissions')({
  component: SubmissionsBrowse,
})

function SubmissionsBrowse() {
  const { formId } = Route.useParams()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listOrgFormSubmissions>>>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listOrgFormSubmissions({ data: { formId } })
      .then((r) => { if (alive) setRows(r) })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load submissions') })
    return () => { alive = false }
  }, [formId])

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-3xl">
        <h1 className="demo-title mb-4">Submissions</h1>
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : rows.length === 0 ? (
          <p className="demo-muted text-sm">No submissions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1">Created</th>
                <th className="py-1">IP</th>
                <th className="py-1">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)] align-top">
                  <td className="py-1 pr-2">{new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-1 pr-2">{r.ip ?? '—'}</td>
                  <td className="py-1"><code className="text-xs">{JSON.stringify(r.data)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="demo-muted mt-6 text-sm">
          <Link to="/app/forms/$formId/edit" params={{ formId }} className="underline">← Back to edit</Link>
        </p>
      </section>
    </main>
  )
}
