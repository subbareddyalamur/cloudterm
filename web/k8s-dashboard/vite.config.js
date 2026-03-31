import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/k8s/',
  server: {
    port: 5174,
    proxy: {
      '/api/k8s': 'http://localhost:8080',
      '/ws/k8s': { target: 'ws://localhost:8080', ws: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
