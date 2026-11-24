import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    '.next/**',
    'out/**',
    'node_modules/**',
    'next-env.d.ts',
    'src/lib/api/schema.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    rules: {
      // User-uploaded images are served by the API with fixed sizes; next/image adds no value for them.
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**', 'e2e/**', 'playwright.config.ts'],
    rules: { 'no-console': 'off' },
  },
])
