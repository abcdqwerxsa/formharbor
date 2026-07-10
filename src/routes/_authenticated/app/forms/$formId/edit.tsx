import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getOrgForm, updateOrgForm, deleteOrgForm } from '#/server/forms/functions'
import { FIELD_TYPES } from '#/forms/schema'
import type { Field, FormStatus } from '#/forms/schema'

export const Route = createFileRoute('/_authenticated/app/forms/$formId/edit')({
  component: FormEditor,
})

const STATUSES: FormStatus[] = ['DRAFT', 'OPEN', 'CLOSED']

function newField(): Field {
  return { id: `f_${crypto.randomUUID()}`, type: 'text', label: '', required: false }
}

function FormEditor() {
  const { formId } = Route.useParams()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState<FormStatus>('DRAFT')
  const [fields, setFields] = useState<Field[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    getOrgForm({ data: { formId } })
      .then((f) => {
        if (!alive) return
        if (!f) { navigate({ to: '/app/forms' }); return }
        setName(f.name); setSlug(f.slug); setStatus(f.status); setFields(f.fields)
      })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load form') })
    return () => { alive = false }
  }, [formId])

  function update(id: string, patch: Partial<Field>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  function remove(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    setFields((fs) => {
      const i = fs.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= fs.length) return fs
      const copy = fs.slice()
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  async function onSave() {
    setErr(null); setSaved(false)
    try {
      await updateOrgForm({ data: { formId, name, fields, status, settings: {} } })
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
    }
  }

  async function onDelete() {
    if (!confirm('Delete this form? This cannot be undone.')) return
    try {
      await deleteOrgForm({ data: { formId } })
      navigate({ to: '/app/forms' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="demo-title">Edit form</h1>
          <select className="demo-input" value={status} onChange={(e) => setStatus(e.target.value as FormStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p className="demo-muted mb-1 text-xs">slug: {slug}</p>

        <label className="mb-4 block text-sm">
          Name
          <input className="demo-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Fields</h2>
          <button className="demo-button" type="button" onClick={() => setFields((fs) => [...fs, newField()])}>+ Add field</button>
        </div>

        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="rounded border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select className="demo-input" value={f.type} onChange={(e) => update(f.id, { type: e.target.value as Field['type'] })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="demo-input min-w-[12rem] flex-1" placeholder="Label" value={f.label} onChange={(e) => update(f.id, { label: e.target.value })} />
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => update(f.id, { required: e.target.checked })} /> required</label>
                <button type="button" className="demo-button" disabled={i === 0} onClick={() => move(f.id, -1)}>↑</button>
                <button type="button" className="demo-button" disabled={i === fields.length - 1} onClick={() => move(f.id, 1)}>↓</button>
                <button type="button" className="demo-button" onClick={() => remove(f.id)}>Remove</button>
              </div>
              <input className="demo-input mt-2" placeholder="Help text (optional)" value={f.help ?? ''} onChange={(e) => update(f.id, { help: e.target.value || undefined })} />
              <input className="demo-input mt-2" placeholder="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => update(f.id, { placeholder: e.target.value || undefined })} />
              {(f.type === 'select' || f.type === 'radio' || f.type === 'checkbox') && (
                <input
                  className="demo-input mt-2"
                  placeholder="Options, comma-separated"
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) => update(f.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              )}
            </li>
          ))}
        </ul>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
        {saved && <p className="mt-4 text-sm text-green-600">Saved.</p>}

        <div className="mt-6 flex items-center gap-3">
          <button className="demo-button" type="button" onClick={onSave}>Save</button>
          <button className="demo-button" type="button" onClick={onDelete}>Delete form</button>
          <Link to="/app/forms/$formId/submissions" params={{ formId }} className="text-sm text-[var(--lagoon-deep)] underline">Submissions</Link>
        </div>
      </section>
    </main>
  )
}
