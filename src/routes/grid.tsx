import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'
import type { ColDef } from 'ag-grid-community'

// AG Grid v33+ Theming API: styling is applied via the `theme` prop — no CSS file
// imports (importing ag-grid.css + ag-theme-quartz.css together with the Theming
// API triggers AG Grid error #239). ag-grid-enterprise is intentionally NOT
// installed — Community only, no license key.
ModuleRegistry.registerModules([AllCommunityModule])

type Integration = {
  partner: string
  category: string
  package: string
  status: 'Configured' | 'Demo' | 'Add-on' | 'TODO'
}

// Real, on-theme row data: the partners this project represents.
const rowData: Integration[] = [
  { partner: 'Cloudflare', category: 'Deployment', package: 'wrangler.jsonc, @cloudflare/vite-plugin', status: 'Configured' },
  { partner: 'AG Grid', category: 'Data Grid', package: 'ag-grid-community / ag-grid-react', status: 'Demo' },
  { partner: 'SerpAPI', category: 'Search API', package: 'serpapi (server fn, engine: google)', status: 'Demo' },
  { partner: 'WorkOS', category: 'Auth', package: '@workos-inc/authkit-react', status: 'Add-on' },
  { partner: 'Sentry', category: 'Monitoring', package: '@sentry/tanstackstart-react', status: 'Add-on' },
  { partner: 'Prisma', category: 'ORM', package: '@prisma/client (adapter-pg)', status: 'Add-on' },
  { partner: 'Neon', category: 'Database', package: '@neondatabase/serverless', status: 'Add-on' },
  { partner: 'Electric', category: 'Sync', package: 'platform-level stub', status: 'TODO' },
  { partner: 'Unkey', category: 'API Keys', package: '@unkey/api (keys.verify)', status: 'Demo' },
]

const columnDefs: ColDef<Integration>[] = [
  { field: 'partner', headerName: 'Partner' },
  { field: 'category', headerName: 'Category' },
  { field: 'package', headerName: 'Package / Path' },
  { field: 'status', headerName: 'Status', width: 130 },
]

// AG Grid is a client/DOM-heavy component, so this route renders client-only
// (same pattern as src/routes/demo/workos.tsx).
export const Route = createFileRoute('/grid')({ ssr: false, component: GridPage })

function GridPage() {
  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, flex: 1, minWidth: 120 }),
    [],
  )

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-5xl">
        <p className="island-kicker mb-2">Data Grid</p>
        <h1 className="demo-title mb-3">AG Grid Community Demo</h1>
        <p className="demo-muted mb-6 text-sm">
          Rendered with <code>ag-grid-react</code> + <code>ag-grid-community</code>{' '}
          (no Enterprise, no license key), styled via the v33+ Theming API. Sort,
          filter, and paginate the partner integrations this project ships with.
        </p>

        {/* Explicit container height — AG Grid needs a bounded height to render rows. */}
        <div style={{ height: 520, width: '100%' }}>
          <AgGridReact<Integration>
            theme={themeQuartz}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            pagination
            paginationPageSize={20}
          />
        </div>
      </section>
    </main>
  )
}
