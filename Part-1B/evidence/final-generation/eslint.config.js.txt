import js from '@eslint/js';

export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js', '.harness/**/*.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        TextDecoder: 'readonly',
        DOMException: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
];
