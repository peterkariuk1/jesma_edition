import fs from 'node:fs'
import path from 'node:path'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const PDFJS_DIR = path.resolve(import.meta.dirname, 'node_modules/pdfjs-dist')
const PDFJS_DATA = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

const MIME: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.icc': 'application/vnd.iccprofile',
}

/**
 * PDF.js loads fonts, character maps and image decoders at runtime.
 * Serve them from node_modules in development and copy them to dist/pdfjs/ for production.
 */
function pdfjsRuntimeData(): Plugin {
  return {
    name: 'examsecure:pdfjs-runtime-data',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const file = path.resolve(PDFJS_DIR, rel)
        const top = rel.split('/')[0]
        if (!file.startsWith(PDFJS_DIR + path.sep) || !PDFJS_DATA.includes(top) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next()
        }
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const dir of PDFJS_DATA) {
        const abs = path.join(PDFJS_DIR, dir)
        if (!fs.existsSync(abs)) continue
        for (const name of fs.readdirSync(abs)) {
          const file = path.join(abs, name)
          if (!fs.statSync(file).isFile()) continue
          this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: fs.readFileSync(file) })
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), pdfjsRuntimeData()],
  server: {
    host: true, // reachable from phones/tablets on the same network during development
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
})
