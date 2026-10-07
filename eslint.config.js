import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', 'dev-dist'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**', '*.config.ts', 'src/sim/**', 'tests/**', 'e2e/**', 'src/persist/**'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // The simulation core must stay deterministic and DOM-free.
    files: ['src/core/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng in core code.' },
        { object: 'Date', property: 'now', message: 'Core must not read the wall clock.' },
      ],
      'no-restricted-imports': ['error', { patterns: ['pixi.js', 'preact*', '@/ui/*', '@/render/*'] }],
    },
  },
);
