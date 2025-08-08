const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Remove 'cjs' from assetExts and add it to sourceExts
const assetExts = config.resolver.assetExts.filter((ext) => ext !== 'cjs');
const sourceExts = [...config.resolver.sourceExts, 'cjs'];

config.resolver.assetExts = assetExts;
config.resolver.sourceExts = sourceExts;

// Setup tsconfig alias @ -> project root
config.resolver.alias = {
  ...config.resolver.alias,
  '@': path.resolve(__dirname),
};

module.exports = config;
