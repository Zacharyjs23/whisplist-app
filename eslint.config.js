// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
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
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
