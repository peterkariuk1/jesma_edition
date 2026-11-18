import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const API_TARGET = `http://localhost:${process.env.PORT ?? 3001}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  server: {
    host: true, // reachable from pupil devices on the local network during development
    proxy: {
      '/api': API_TARGET,
      '/pdfjs': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
})
