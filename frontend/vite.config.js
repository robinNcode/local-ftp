import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/upload": "http://localhost:6060",
      "/files": "http://localhost:6060",
      "/download": "http://localhost:6060",
      "/delete": "http://localhost:6060",
    },
  },
})
