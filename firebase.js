import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey) {
  console.error('Firebase config appears to be missing. Check environment variables.');
}

let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('Firebase app initialized');
} catch (err) {
  console.error('Failed to initialize Firebase app', err);
}

let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  // ✅ Use AsyncStorage for persistent login on native
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

if (!auth) {
  console.error('Firebase auth not initialized');
} else {
  console.log('Firebase Auth initialized');
}

const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
