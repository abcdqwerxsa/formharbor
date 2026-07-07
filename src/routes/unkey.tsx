import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { verifyApiKey  } from '#/server/unkey'
import type {UnkeyVerifyResult} from '#/server/unkey';

export const Route = createFileRoute('/unkey')({ component: UnkeyPage })

function UnkeyPage() {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UnkeyVerifyResult | null>(null)

  async function runVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await verifyApiKey({ data: { key } })
      setResult(res)
    } catch (err) {
      setResult({
        configured: true,
        valid: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-xl">
        <p className="island-kicker mb-2">API Keys</p>
        <h1 className="demo-title mb-3">Unkey (API key verification)</h1>
        <p className="demo-muted mb-6 text-sm">
          Verifies a key server-side with <code>@unkey/api</code>{' '}
          (<code>unkey.keys.verify</code>). The root key stays server-side; the
          browser only sees the normalized result.
        </p>

        <form onSubmit={runVerify} className="mb-6 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Key to verify…"
            className="demo-input min-w-0 flex-1"
          />
          <button type="submit" className="demo-button whitespace-nowrap" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        {result && (
          <div className="demo-card text-sm">
            <div className="mb-1">
              <span className="font-semibold">Configured:</span>{' '}
              {result.configured ? 'yes' : 'no'}
            </div>
            <div className="mb-1">
              <span className="font-semibold">Valid:</span>{' '}
              {result.valid ? 'yes ✅' : 'no ❌'}
            </div>
            {result.detail && (
              <div className="demo-muted break-words">
                <span className="font-semibold text-[var(--sea-ink)]">Detail:</span>{' '}
                {result.detail}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
