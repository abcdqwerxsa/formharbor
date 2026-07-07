//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // The CLI's generated demo routes use runtime guards (e.g. results.x && ...)
    // that the type-aware no-unnecessary-condition rule considers redundant.
    // Disable it for those generated files only; the rule stays active elsewhere.
    files: ['src/routes/demo/**/*.ts', 'src/routes/demo/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    ignores: ['eslint.config.js', 'prettier.config.js'],
  },
]
