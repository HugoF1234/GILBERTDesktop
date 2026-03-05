import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND_URL = 'https://gilbert-assistant.ovh'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          // MUI
          if (id.includes('node_modules/@mui/')) {
            return 'vendor-mui';
          }
          // TipTap / ProseMirror
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror')) {
            return 'vendor-tiptap';
          }
          // Framer Motion
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-animation';
          }
          // PDF/Export utilities
          if (id.includes('node_modules/jspdf') ||
              id.includes('node_modules/html2canvas') ||
              id.includes('node_modules/dompurify') ||
              id.includes('node_modules/showdown')) {
            return 'vendor-export';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      // Routes API simples - pas de conflit avec le frontend
      '/api': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/auth': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/health': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/uploads': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/simple': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/profile': { target: BACKEND_URL, changeOrigin: true, secure: true },
      '/recordings': { target: BACKEND_URL, changeOrigin: true, secure: true },

      // /meetings - proxy les appels API, pas la navigation
      '/meetings': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) {
            return req.url
          }
          return null
        },
      },

      // /admin - même logique
      '/admin': {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) {
            return req.url
          }
          return null
        },
      },
    },
  },
})
