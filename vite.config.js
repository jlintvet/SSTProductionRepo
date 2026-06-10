import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(__dirname, "src/public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
