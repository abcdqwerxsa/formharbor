import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import neon from './neon-vite-plugin.ts'
import { cloudflare } from '@cloudflare/vite-plugin'

// Prisma workerd client imports `./query_compiler_fast_bg.wasm?module` (the
// Cloudflare/Workers wasm-module convention). Resolve it to the compiled
// WebAssembly.Module so vite/rolldown can bundle it (same approach as the
// wasmModulePlugin in vitest.config.ts).
function wasmModulePlugin(): Plugin {
  return {
    name: 'wasm-module-loader',
    enforce: 'pre',
    resolveId(source, importer) {
      if (typeof source !== 'string' || !source.endsWith('.wasm?module')) return null
      const dir = importer
        ? fileURLToPath(new URL('.', `file://${importer}`))
        : process.cwd()
      const abs = fileURLToPath(
        new URL(source.replace(/\.wasm\?module$/, '.wasm'), `file://${dir}`),
      )
      return `\0wasm:${abs}`
    },
    async load(id) {
      if (!id.startsWith('\0wasm:')) return null
      const filePath = id.replace('\0wasm:', '')
      const b64 = readFileSync(filePath).toString('base64')
      return [
        `const b64 = ${JSON.stringify(b64)}`,
        `function dec(b){const s=atob(b);const n=s.length;const out=new Uint8Array(n);for(let i=0;i<n;i++)out[i]=s.charCodeAt(i);return out}`,
        `let _m;export default _m ||= await WebAssembly.compile(dec(b64))`,
      ].join('\n')
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    wasmModulePlugin(),
    devtools(),
    neon,
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
