import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'docs',
      'brand',
      'migration',
      // SQL, seeds and the schema harness. supabase/functions is TypeScript,
      // and is linted with everything else.
      'supabase/migrations',
      'supabase/checks',
      'supabase/templates',
      'supabase/tests',
      'src/lib/database.types.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Money is integers. Block the float helpers that tend to creep in.
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='parseFloat']", message: 'Money is integer minor units. Use lib/money.' },
        { selector: "MemberExpression[property.name='toFixed']", message: 'Format with Intl.NumberFormat, not toFixed.' },
      ],
    },
  },
);
