import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'android', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // App.jsx is deliberately one monolithic file (see README's "Important architectural
    // note") that now also exports pure functions/context as test seams for the Vitest
    // suite -- react-refresh/only-export-components exists purely to keep Vite Fast Refresh
    // working per-file, which doesn't apply to those non-component exports.
    files: ['src/App.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
