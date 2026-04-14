import js from '@eslint/js';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  security.configs.recommended,
  {
    files: ['src/**/*.{js,mjs}', 'test/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.name="process"][property.name="env"]',
          message: 'Use src/env.mjs instead of reading process.env directly.',
        },
      ],
    },
  },
  {
    files: ['src/env.mjs'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['test/**/*.{js,mjs}'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
];
