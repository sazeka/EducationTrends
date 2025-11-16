// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/EducationTrends/',     
  server: { proxy: { '/api': 'http://localhost:5174' } } // dev only
})
