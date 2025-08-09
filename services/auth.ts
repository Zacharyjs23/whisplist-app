import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { AuthSessionResult } from 'expo-auth-session';

const authNotInitialized = () =>
  Promise.reject(new Error('Firebase auth is not initialized'));

export const signUp = (email: string, password: string) =>
  auth
    ? createUserWithEmailAndPassword(auth, email, password)
    : authNotInitialized();

export const signIn = (email: string, password: string) =>
  auth
    ? signInWithEmailAndPassword(auth, email, password)
    : authNotInitialized();

export const signInAnonymouslyService = () =>
  auth ? signInAnonymously(auth) : authNotInitialized();

export const resetPassword = (email: string) =>
  auth ? sendPasswordResetEmail(auth, email) : authNotInitialized();

export const signOut = () => (auth ? fbSignOut(auth) : authNotInitialized());

export const signInWithGoogle = async (
  promptAsync: () => Promise<AuthSessionResult | void>,
) => {
  if (!auth) {
    return authNotInitialized();
  }

  const res = await promptAsync();
  if (res && 'type' in res && res.type === 'success' && res.authentication?.idToken) {
    const credential = GoogleAuthProvider.credential(res.authentication.idToken);
    await signInWithCredential(auth, credential);
  }
};

