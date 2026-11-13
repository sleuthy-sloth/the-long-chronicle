import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
const base = process.env.VITE_BASE || '/'
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'The Long Chronicle',
        short_name: 'Chronicle',
        description: 'Offline-first companion for playing Thousand Year Old Vampire: memories, journal, character and chronicle. No account, no cloud.',
        theme_color: '#2b2118',
        background_color: '#f4eedd',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
    })
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { target: 'es2020', sourcemap: true }
})
