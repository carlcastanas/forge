import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'public/**', 'next-env.d.ts'],
  },
  {
    rules: {
      // Markdown from the parent repo is rendered as HTML that shiki has already
      // escaped; the rule cannot see that and fires on every prose renderer.
      'react/no-danger': 'off',
    },
  },
];

export default eslintConfig;
