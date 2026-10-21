import { defineConfig } from 'vitest/config';

// Configuración propia para no cargar el plugin PWA en los tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
