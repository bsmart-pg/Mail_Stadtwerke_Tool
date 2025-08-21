import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    open: false,
    https: false,
  },
  build: {
    // baut ohne Downleveling – TLA bleibt erhalten
    target: 'esnext',
  },
  esbuild: {
    target: 'esnext',
    // sag esbuild explizit, dass TLA ok ist
    supported: { 'top-level-await': true },
  },
})

