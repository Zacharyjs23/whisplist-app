import { initializeApp, getApp, getApps } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import { Platform } from 'react-native';
import * as logger from '@/shared/logger';

const requiredEnvVars = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  missingEnvVars.forEach((name) =>
    logger.error(`Missing environment variable: ${name}`)
  );
  logger.error(
    'Firebase configuration incomplete. Firebase features will be disabled.'
  );
}

export const firebaseEnabled = missingEnvVars.length === 0;

const firebaseConfig = firebaseEnabled
  ? {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    }
  : undefined;

const app =
  firebaseConfig && getApps().length
    ? getApp()
    : firebaseConfig
    ? initializeApp(firebaseConfig)
    : undefined;

export const auth = app
  ? Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      })
  : undefined;
export const db = app ? getFirestore(app) : undefined;
export const storage = app ? getStorage(app) : undefined;

let analytics: Analytics | undefined;

if (app) {
  if (process.env.EXPO_PUBLIC_ENV === 'production') {
    isSupported()
      .then((supported) => {
        if (supported) {
          analytics = getAnalytics(app);
        }
      })
      .catch((error) => {
        logger.warn('Failed to initialize analytics:', error);
      });
  } else {
    logger.warn('Analytics disabled in non-production environment');
  }
} else {
  logger.warn('Analytics disabled due to missing Firebase configuration');
}

export { analytics };
