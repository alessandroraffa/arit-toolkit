import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';

export default tseslint.config(
  // Global ignores (test/** intentionally NOT ignored — linted below)
  {
    ignores: ['dist/**', 'node_modules/**', '*.mjs', 'coverage/**'],
  },

  // ESLint recommended for all files
  eslint.configs.recommended,

  // Source files: strict type-checked + complexity rules
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],

      // Complexity and size limits
      'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'warn',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ['warn', { max: 10 }],
      'max-depth': ['warn', { max: 3 }],
      'max-nested-callbacks': ['warn', { max: 3 }],
      'max-params': ['warn', { max: 3 }],
      'max-statements': ['warn', { max: 15 }],
      'max-classes-per-file': ['error', 1],
    },
  },

  // Test files: basic TS linting + vitest plugin + relaxed complexity
  {
    files: ['test/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    plugins: { vitest },
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      // Vitest recommended rules
      ...vitest.configs.recommended.rules,

      // Relaxed TypeScript rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Relaxed complexity for tests
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      complexity: 'off',
      'max-params': 'off',
      'max-nested-callbacks': ['warn', { max: 4 }],
      'max-depth': ['warn', { max: 4 }],
    },
  }
);
