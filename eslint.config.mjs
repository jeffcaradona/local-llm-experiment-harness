import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // ESLint already ignores node_modules and .git. Skip evidence and scratch output.
  globalIgnores([
    'results/',
    'models/',
    'local/',
    'coverage/',
    'dist/',
    'build/',
    'out/',
    'tmp/',
    'temp/',
    '.cache/',
  ]),
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Declare the Node globals we use; add others here as the code needs them.
      globals: {
        AbortSignal: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
]);
