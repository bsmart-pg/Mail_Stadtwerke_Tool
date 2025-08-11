import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    open: false,
    // https: {
    //   // For development with custom certificate
    //   // Uncomment and provide paths to your cert files:
    //   // cert: './path/to/cert.pem',
    //   // key: './path/to/key.pem'
    // },
    // // Force HTTPS redirect in development
    // strictPort: true,
  },
}) 