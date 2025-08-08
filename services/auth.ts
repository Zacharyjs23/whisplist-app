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

export const signUp = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const signIn = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const signInAnonymouslyService = () => signInAnonymously(auth);

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(auth, email);

export const signOut = () => fbSignOut(auth);

export const signInWithGoogle = async (
  promptAsync: () => Promise<AuthSessionResult | void>,
) => {
  const res = await promptAsync();
  if (res && 'type' in res && res.type === 'success' && res.authentication?.idToken) {
    const credential = GoogleAuthProvider.credential(res.authentication.idToken);
    await signInWithCredential(auth, credential);
  }
};

