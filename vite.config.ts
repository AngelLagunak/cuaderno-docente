import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Política de seguridad de contenido de la app publicada: solo se ejecuta el código propio y solo se conecta con el
 * Apps Script de Google. Si alguna vez se colara un script ajeno, el navegador no lo ejecutaría ni dejaría enviar datos
 * a otro sitio. Solo en la compilación: el servidor de desarrollo necesita scripts en línea.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta name="referrer"', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer"`),
});

// IMPORTANTE: 'base' debe coincidir con el nombre del repositorio en GitHub.
export default defineConfig({
  base: '/cuaderno-docente/',
  plugins: [
    react(),
    csp(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inter (latín) también sin conexión; los demás alfabetos no se usan.
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}', '**/inter-latin*-wght-normal*.woff2'] },
      manifest: {
        name: 'Cuaderno docente',
        short_name: 'Cuaderno',
        start_url: '/cuaderno-docente/',
        scope: '/cuaderno-docente/',
        display: 'standalone',
        background_color: '#f3f5f8',
        theme_color: '#24477a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
