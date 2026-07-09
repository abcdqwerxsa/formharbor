import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { getPublicForm, submitSubmission } from '#/server/submissions/public'
import type { Field } from '#/forms/schema'

export const Route = createFileRoute('/f/$orgSlug/$formSlug')({
  loader: async ({ params }) => {
    const form = await getPublicForm({
      data: { orgSlug: params.orgSlug, formSlug: params.formSlug },
    })
    if (!form) throw notFound()
    return { form }
  },
  component: PublicForm,
})

const INPUT_TYPE: Record<string, string> = {
  text: 'text',
  email: 'email',
  number: 'number',
  date: 'date',
}

function PublicForm() {
  const { form } = Route.useLoaderData()
  const { orgSlug, formSlug } = Route.useParams()
  const [values, setValues] = useState<Record<string, string | string[]>>({})
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function setField(id: string, v: string | string[]) {
    setValues((s) => ({ ...s, [id]: v }))
  }
  function toggleOption(id: string, opt: string, checked: boolean) {
    setValues((s) => {
      const cur = s[id]
      const prev = Array.isArray(cur) ? cur : []
      const next = checked ? [...prev, opt] : prev.filter((o) => o !== opt)
      return { ...s, [id]: next }
    })
  }

  // Indexed access on `values` can be undefined at runtime; narrow explicitly
  // (TS without noUncheckedIndexedAccess treats it as always defined, which
  // trips @typescript-eslint/no-unnecessary-condition on `??`/`as`).
  const str = (id: string) => {
    const v = values[id]
    return typeof v === 'string' ? v : ''
  }
  const arr = (id: string) => {
    const v = values[id]
    return Array.isArray(v) ? v : []
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      await submitSubmission({ data: { orgSlug, formSlug, values } })
      setDone(true)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Submission failed')
    }
  }

  if (done) {
    return (
      <main className="demo-page demo-center">
        <section className="demo-panel w-full max-w-md">
          <h1 className="demo-title mb-2">Thank you</h1>
          <p className="demo-muted text-sm">Your response was recorded.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-md">
        <h1 className="demo-title mb-4">{form.name}</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {form.fields.map((f: Field) => (
            <label key={f.id} className="flex flex-col gap-1 text-sm">
              <span>
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </span>
              {f.help && <span className="demo-muted text-xs">{f.help}</span>}
              {f.type === 'textarea' ? (
                <textarea
                  className="demo-input"
                  placeholder={f.placeholder}
                  required={f.required}
                  value={str(f.id)}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              ) : f.type === 'select' ? (
                <select
                  className="demo-input"
                  required={f.required}
                  value={str(f.id)}
                  onChange={(e) => setField(f.id, e.target.value)}
                >
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'radio' ? (
                <span className="flex flex-col gap-1">
                  {(f.options ?? []).map((o) => (
                    <label key={o} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={f.id}
                        required={f.required}
                        checked={str(f.id) === o}
                        onChange={() => setField(f.id, o)}
                      />
                      {o}
                    </label>
                  ))}
                </span>
              ) : f.type === 'checkbox' ? (
                <span className="flex flex-col gap-1">
                  {(f.options ?? []).map((o) => (
                    <label key={o} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        value={o}
                        checked={arr(f.id).includes(o)}
                        onChange={(e) => toggleOption(f.id, o, e.target.checked)}
                      />
                      {o}
                    </label>
                  ))}
                </span>
              ) : (
                <input
                  className="demo-input"
                  type={INPUT_TYPE[f.type] ?? 'text'}
                  placeholder={f.placeholder}
                  required={f.required}
                  value={str(f.id)}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              )}
            </label>
          ))}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="demo-button" type="submit">Submit</button>
        </form>
      </section>
    </main>
  )
}
