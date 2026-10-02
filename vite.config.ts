import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// IMPORTANTE: 'base' debe coincidir con el nombre del repositorio en GitHub.
export default defineConfig({
  base: '/cuaderno-docente/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cuaderno docente',
        short_name: 'Cuaderno',
        start_url: '/cuaderno-docente/',
        scope: '/cuaderno-docente/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2d4a7a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
});
