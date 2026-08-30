import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/CSV/**', '**/scripts/**'],
    },
  },
  optimizeDeps: {
    include: ['xlsx'],
  },
  build: {
    commonjsOptions: {
      include: [/xlsx/, /node_modules/],
    },
  },
})
