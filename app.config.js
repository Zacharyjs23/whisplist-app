import 'dotenv/config';
// Ensure Expo Router knows where the app root is, even when scripts don't pass it.
process.env.EXPO_ROUTER_APP_ROOT = process.env.EXPO_ROUTER_APP_ROOT || 'app';

/** @type {import('@expo/config-types').ExpoConfig} */
export default () => {
  const plugins = [
    'expo-router',
    'expo-audio',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0e0e0e',
      },
    ],
    'expo-notifications',
    'expo-web-browser',
  ];

  if (hasRevenueCatConfigPlugin()) {
    plugins.push('react-native-purchases');
  }

  return ({
  name: 'WhispList',
  slug: 'WhispList',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  splash: {
    image: './assets/images/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0e0e0e',
  },
  scheme: 'whisplist',
  userInterfaceStyle: 'dark',
  jsEngine: 'jsc',
  newArchEnabled: false,
  ios: {
    icon: './assets/images/icon.png',
    supportsTablet: true,
    bundleIdentifier: 'com.zachary.whisplist',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'This app uses the microphone to record voice notes for your posts.',
    },
  },
  android: {
    icon: './assets/images/icon.png',
    package: 'com.zachary.whisplist',
    // Ensure Google services config is bundled for FCM, etc.
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    compileSdkVersion: 35,
    targetSdkVersion: 35,
    minSdkVersion: 24,
  },
  web: {
    bundler: 'metro',
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins,
  // Disable typedRoutes on web to avoid certain Metro path resolution issues
  experiments: {
    typedRoutes: false,
  },
  extra: {
    eas: {
      projectId: '69cf3668-bd8e-4302-a57d-3ba9eabd2e5d',
    },
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  },
});
}

function hasRevenueCatConfigPlugin() {
  try {
    require.resolve('react-native-purchases/app.plugin');
    return true;
  } catch (_error) {
    return false;
  }
}
