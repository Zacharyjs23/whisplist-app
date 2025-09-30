const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
// Note: We delegate to Expo/Metro's default resolver by returning undefined
// from our custom resolver. Do not directly invoke metro-resolver here, as it
// can bypass Expo's withMetroResolvers logic (e.g., expo-router entry mapping).

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Support CJS and SVG as source files
const assetExts = config.resolver.assetExts
  .filter((ext) => ext !== 'cjs' && ext !== 'svg');
const sourceExts = [...config.resolver.sourceExts, 'cjs', 'svg'];

config.resolver.assetExts = assetExts;
config.resolver.sourceExts = sourceExts;

// Use react-native-svg-transformer for .svg imports
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

// Setup tsconfig alias @ -> project root
config.resolver.alias = {
  ...config.resolver.alias,
  '@': path.resolve(__dirname),
  // Workaround: Metro (web) sometimes mis-resolves this deep dep.
  // Alias to a tiny shim to unblock web dev.
  'set-function-length': path.resolve(__dirname, 'shims/set-function-length.js'),
};

// Conditionally alias optional native modules to local shims when not installed.
function tryResolve(mod) {
  try {
    return require.resolve(mod);
  } catch {
    return null;
  }
}

const maybeExpoImageManipulator = tryResolve('expo-image-manipulator');
if (!maybeExpoImageManipulator) {
  config.resolver.alias['expo-image-manipulator'] = path.resolve(
    __dirname,
    'shims/expo-image-manipulator.js',
  );
}

const maybeRNPurchases = tryResolve('react-native-purchases');
if (!maybeRNPurchases) {
  config.resolver.alias['react-native-purchases'] = path.resolve(
    __dirname,
    'shims/react-native-purchases.js',
  );
}

// Stronger interception: ensure any request resolves to our shim
// even if alias isn't honored in some resolution branches on web.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'set-function-length') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/set-function-length.js'),
    };
  }
  if (moduleName === 'expo-image-manipulator' && !maybeExpoImageManipulator) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/expo-image-manipulator.js'),
    };
  }
  if (moduleName === 'react-native-purchases' && !maybeRNPurchases) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/react-native-purchases.js'),
    };
  }
  // Delegate to Expo/Metro's upstream resolver chain
  return context.resolveRequest(context, moduleName, platform);
};

// Enable support for packages that use the `exports` field in their package.json.
// This allows Metro to resolve modern ESM-only packages such as `i18next`.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
