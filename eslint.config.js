// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/**'],
  },
  // Allow optional native modules that are dynamically imported and not always installed
  {
    files: [
      'app/(tabs)/settings/subscriptions.tsx',
      'app/(tabs)/settings.tsx',
      'contexts/SubscriptionContext.tsx',
    ],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['functions/**/*.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['tests/**/*.{js,ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-named-as-default': 'off',
      'import/no-unresolved': 'off',
    },
  },
]);
