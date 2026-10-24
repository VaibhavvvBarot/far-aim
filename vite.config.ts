import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/far-aim/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,json,webp,png,woff2}'],
        globIgnores: ['ort/**', 'bench/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'FAR/AIM',
        short_name: 'FAR/AIM',
        description: 'Personal FAR/AIM reader: daily updates, offline, highlights',
        start_url: '/far-aim/',
        scope: '/far-aim/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f5f6f2',
        theme_color: '#f5f6f2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: { target: 'safari15', chunkSizeWarningLimit: 800 },
  worker: { format: 'es' },
});
