import js from '@eslint/js';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  // Flags innerHTML / outerHTML / insertAdjacentHTML / document.write with dynamic input.
  noUnsanitized.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: false }],
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
  {
    files: ['tests/**', 'playwright.config.ts', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The tests feed javascript: URLs to the validators on purpose.
    files: ['tests/**'],
    rules: { 'no-script-url': 'off' },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
