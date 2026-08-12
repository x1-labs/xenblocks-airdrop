import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      // TypeScript already reports undefined identifiers, and the base rule
      // cannot see type-position uses (`IDL as anchor.Idl`), so it reports
      // false positives. typescript-eslint recommends disabling it.
      // This also makes an explicit `globals` list unnecessary.
      'no-undef': 'off',
    },
  },
  prettier,
  {
    ignores: ['dist/', 'node_modules/', '*.js', '!eslint.config.js'],
  },
];
