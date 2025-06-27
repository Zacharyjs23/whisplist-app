const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure Hermes can load CJS modules like firebase
config.resolver.sourceExts.push('cjs');

// Support TypeScript paths such as "@/*" defined in tsconfig.json
config.resolver.alias = {
  ...config.resolver.alias,
  '@': path.resolve(__dirname),
};

module.exports = config;
