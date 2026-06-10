// ESLint 9 defaults to "flat config" and no longer auto-discovers .eslintrc.json,
// which broke the husky pre-commit / lint-staged hook ("couldn't find eslint.config.js").
// This shim makes ESLint 9 reuse the existing .eslintrc.json rules verbatim via
// @eslint/eslintrc FlatCompat, so no rules change and every eslint invocation works
// without needing ESLINT_USE_FLAT_CONFIG=false.
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ignorePatterns, ...eslintrc } = require('./.eslintrc.json');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  // Global ignores (translated from the .eslintrc.json ignorePatterns).
  { ignores: ['**/*.js', '**/*.d.ts', '**/*.generated.ts', 'node_modules/', 'coverage/'] },
  // Flat config lints only .js by default; scope the translated rules to TypeScript.
  // (Per-override `files`, e.g. for .projenrc.js, win via the spread.)
  ...compat.config(eslintrc).map((config) => ({ files: ['**/*.ts', '**/*.tsx'], ...config })),
];
