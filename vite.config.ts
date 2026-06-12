/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Served from https://cpv0310.github.io/battletanks/ — assets must resolve under this subpath
  base: '/battletanks/',
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/bots/sanitize.ts', 'src/ui/storage.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/testHelpers.ts'],
    },
  },
})
