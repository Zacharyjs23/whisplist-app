import { initializeApp, getApp, getApps } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import { Platform, ToastAndroid, Alert } from 'react-native';
import * as logger from '@/shared/logger';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
  // For multi-tab support, import persistentMultipleTabManager from 'firebase/firestore'
  // and pass it to persistentLocalCache as:
  // persistentLocalCache({ tabManager: persistentMultipleTabManager() })
} catch (error) {
  logger.error('Failed to initialize Firestore:', error, {
    userId: auth.currentUser?.uid,
    severity: 'high',
  });
  if (__DEV__) {
    const message = `Failed to initialize Firestore: ${error}`;
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
    } else {
      Alert.alert('Firestore Error', message);
    }
  }
  db = getFirestore(app);
}

export { db };
export const storage = getStorage(app);

let analytics: Analytics | undefined;
if (process.env.EXPO_PUBLIC_ENV === 'production') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch((error) => {
      logger.error('Failed to initialize analytics:', error, {
        userId: auth.currentUser?.uid,
        severity: 'high',
      });
      if (__DEV__) {
        const message = `Failed to initialize analytics: ${error}`;
        if (Platform.OS === 'android') {
          ToastAndroid.show(message, ToastAndroid.LONG);
        } else {
          Alert.alert('Analytics Error', message);
        }
      }
    });
} else {
  logger.warn('Analytics disabled in non-production environment');
}

export { analytics };
