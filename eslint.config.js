import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-pages/**',
      'work/**',
      'outputs/**',
      'android/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'schemas/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue,js}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'vue/multi-word-component-names': ['error', { ignores: ['App'] }],
    },
  },
  {
    files: ['src/components/**/*.vue', 'src/views/**/*.vue'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/**'],
              message: 'UI 只能通过应用端口访问业务能力，不能直接调用数值/剧情引擎。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/economy/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: ['vue', 'pinia'], patterns: ['**/stores/**', '**/persistence/**'] },
      ],
    },
  },
  prettier,
];
