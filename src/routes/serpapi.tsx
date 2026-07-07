import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { searchGoogle  } from '#/server/serpapi'
import type {SerpResult} from '#/server/serpapi';

export const Route = createFileRoute('/serpapi')({ component: SerpApiPage })

function SerpApiPage() {
  const [query, setQuery] = useState('TanStack Start')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [results, setResults] = useState<SerpResult[]>([])

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotConfigured(false)
    try {
      const res = await searchGoogle({ data: { query } })
      if (!res.configured) {
        setNotConfigured(true)
        setError(res.error)
        setResults([])
      } else {
        setResults(res.results)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-3xl">
        <p className="island-kicker mb-2">Search API</p>
        <h1 className="demo-title mb-3">SerpAPI (server-side)</h1>
        <p className="demo-muted mb-6 text-sm">
          Calls the official <code>serpapi</code> package from a TanStack Start
          server function (engine: <code>google</code>). The API key never reaches
          the browser; results are normalized into app-owned types.
        </p>

        <form onSubmit={runSearch} className="mb-6 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search query…"
            className="demo-input min-w-0 flex-1"
          />
          <button type="submit" className="demo-button whitespace-nowrap" disabled={loading}>
            {loading ? 'Searching…' : 'Search Google'}
          </button>
        </form>

        {notConfigured && (
          <div className="demo-card mb-6 text-sm">
            <strong>Not configured.</strong> {error}
          </div>
        )}
        {error && !notConfigured && (
          <div className="demo-card mb-6 text-sm text-red-600">{error}</div>
        )}

        <ol className="space-y-3">
          {results.map((r) => (
            <li key={`${r.position}-${r.link}`} className="demo-list-item">
              <a
                href={r.link}
                target="_blank"
                rel="noreferrer"
                className="block font-medium text-[var(--lagoon-deep)] no-underline hover:underline"
              >
                {r.position}. {r.title || r.link}
              </a>
              {r.snippet && <p className="demo-muted mt-1 text-sm">{r.snippet}</p>}
              <p className="demo-muted mt-1 break-all text-xs">{r.link}</p>
            </li>
          ))}
          {!loading && results.length === 0 && !notConfigured && !error && (
            <li className="demo-list-item demo-muted text-center">
              No results yet — run a search.
            </li>
          )}
        </ol>
      </section>
    </main>
  )
}
