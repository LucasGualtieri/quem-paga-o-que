import { defineConfig } from 'vitest/config';

// Testes de integração: rodam dentro de `firebase emulators:exec` (npm run test:emulators na raiz).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
