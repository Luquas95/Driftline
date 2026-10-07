import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/content/**'],
      exclude: ['src/core/types.ts', 'src/core/eventTypes.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
