import { defineConfig, type Plugin } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// Dedicated vitest config. The app's vite.config.ts enables the Cloudflare
// plugin's custom `ssr` environment, which makes vitest 4 fail with
// "depsOptimizer is required in dev mode". For unit/integration tests we only
// need path resolution, so we use a minimal config here instead of extending
// vite.config.ts.
const srcDir = fileURLToPath(new URL('./src/', import.meta.url))

// The generated Prisma client (`runtime=workerd`, Prisma 7.x) dynamically
// imports its WASM query compiler as `./query_compiler_fast_bg.wasm?module`.
// The `?module` suffix is the Cloudflare/Workers convention handled by
// `@cloudflare/vite-plugin`'s `ssr` environment — which this minimal config
// intentionally does NOT load. Under plain Node vitest that import is
// unresolved. This plugin intercepts `*.wasm?module` and returns the compiled
// `WebAssembly.Module` as the default export (the shape Prisma's
// `getQueryCompilerWasmModule` expects).
function wasmModulePlugin(): Plugin {
  return {
    name: 'wasm-module-loader',
    enforce: 'pre',
    resolveId(source, importer) {
      if (typeof source !== 'string' || !source.endsWith('.wasm?module')) return null
      // Resolve the wasm path relative to the importing file so we read the
      // right bytes (the id is `./query_compiler_fast_bg.wasm?module`, relative
      // to the generated client dir, not cwd).
      const dir = importer ? fileURLToPath(new URL('.', `file://${importer}`)) : process.cwd()
      const abs = fileURLToPath(new URL(source.replace(/\.wasm\?module$/, '.wasm'), `file://${dir}`))
      return `\0wasm:${abs}`
    },
    async load(id) {
      if (!id.startsWith('\0wasm:')) return null
      const filePath = id.replace('\0wasm:', '')
      // Embed bytes base64 and decode+compile at runtime so the default export
      // is a true WebAssembly.Module.
      const b64 = readFileSync(filePath).toString('base64')
      return [
        `const b64 = ${JSON.stringify(b64)}`,
        `function dec(b){const s=atob(b);const n=s.length;const out=new Uint8Array(n);for(let i=0;i<n;i++)out[i]=s.charCodeAt(i);return out}`,
        `let _m;export default _m ||= await WebAssembly.compile(dec(b64))`,
      ].join('\n')
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '#': srcDir,
      '@': srcDir,
    },
  },
  plugins: [wasmModulePlugin()],
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['src/**/*.test.ts'],
    // Disable file parallelism: against remote CockroachDB, parallel test files
    // hit a read-after-write FK race (Session_userId_fkey violated) when one
    // file's session cleanup runs concurrently with another's insert.
    fileParallelism: false,
    testTimeout: 30_000, // remote CockroachDB is slow on cold connections
  },
})
