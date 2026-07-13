// @ts-check

import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/*.js', '**/*.d.ts', '**/*.generated.ts', 'node_modules/', 'coverage/', 'cdk.out/', 'lib/', '.yarn/'],
  },

  // Registers the typescript parser and plugin without turning any rules on. Adopting
  // tseslint.configs.recommended is worth doing, but it reports 48 pre-existing problems, so it is
  // left for a change that can deal with them.
  tseslint.configs.base,
  importPlugin.flatConfigs.typescript,

  // Formatting belongs to prettier, so every rule that would fight it is switched off. This is what
  // replaces the two dozen indent, quote and spacing rules the old eslintrc spelled out by hand.
  prettier,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      curly: ['error', 'multi-line', 'consistent'],
      'dot-notation': 'error',
      'no-bitwise': 'error',
      'no-duplicate-imports': 'error',

      'import/no-unresolved': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external'],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/test/**', '**/scripts/**', '**/*.config.ts'],
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],

      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/return-await': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'public-static-field',
            'public-static-method',
            'protected-static-field',
            'protected-static-method',
            'private-static-field',
            'private-static-method',
            'field',
            'constructor',
            'method',
          ],
        },
      ],
    },
  },
);
