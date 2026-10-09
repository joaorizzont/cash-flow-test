import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    rules: {
      'no-console': 'error',
      'no-inline-comments': 'error',
      'max-params': ['error', 3],
      complexity: ['error', 8],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
