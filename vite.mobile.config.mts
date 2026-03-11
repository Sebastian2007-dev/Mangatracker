import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  build: {
    outDir: resolve('dist-mobile'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve('src/renderer/index.mobile.html') }
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  plugins: [vue(), tailwindcss()],
  define: {
    IS_MOBILE: JSON.stringify(true)
  }
})
