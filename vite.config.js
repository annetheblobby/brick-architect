import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { meshApi } from './server/mesh-plugin.js'

export default defineConfig({
  plugins: [react(), meshApi()],
  server: { port: 5173, strictPort: false },
})
