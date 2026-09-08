const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        // site/ is a separate Next.js workspace with its own flat config and its own
        // eslint install. Linting it from here makes the root run load
        // site/node_modules/eslint-config-next, which needs dependencies the root
        // install does not have, and aborts the entire run. Lint it with
        // `npm run lint` inside site/ instead.
        ignores: [
            '.opencode/dist/**',
            '.cursor/**',
            'node_modules/**',
            'site/**',
            '.venv/**',
            'venv/**',
            'coverage/**',
            'workflows/**/*.workflow.*',
            '.claude/workflows/**'
        ]
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2022
            }
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            'no-undef': 'error',
            'eqeqeq': 'warn'
        }
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            sourceType: 'module'
        }
    }
];
