import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { createOrgForm } from '#/server/forms/functions'

export const Route = createFileRoute('/_authenticated/app/forms/new')({
  component: NewForm,
})

function NewForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const form = await createOrgForm({ data: { name } })
      navigate({ to: '/app/forms/$formId/edit', params: { formId: form.id } })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create form')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4">New form</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input className="demo-input" required placeholder="Form name"
            value={name} onChange={(e) => setName(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="demo-button" type="submit">Create</button>
        </form>
      </section>
    </main>
  )
}
