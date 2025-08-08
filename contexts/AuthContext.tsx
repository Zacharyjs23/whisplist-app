import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import {
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { auth, db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../types/Profile';
import { useReferral } from '../hooks/useReferral';
import {
  signUp as signUpService,
  signIn as signInService,
  signInWithGoogle as signInWithGoogleService,
  signInAnonymouslyService,
  resetPassword as resetPasswordService,
  signOut as signOutService,
} from '../services/auth';

WebBrowser.maybeCompleteAuthSession();

if (!auth || !db) {
  console.error('Firebase modules are undefined in AuthContext');
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  loading: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  setProfile: () => {},
  loading: true,
  authError: null,
  setAuthError: () => {},
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signInAnonymously: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  const { checkInvite, processReferral } = useReferral();

  useEffect(() => {
    void checkInvite();
  }, [checkInvite]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymouslyService();
        } catch (err) {
          console.error('Anonymous sign-in failed', err);
          setLoading(false);
        }
        return;
      }
      setUser(u);
      if (u) {
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as Profile;
          if (data.publicProfileEnabled === undefined) {
            data.publicProfileEnabled = true;
          }
          if (data.boostCredits === undefined) data.boostCredits = 0;
          if (data.developerMode === undefined) data.developerMode = false;
          if (!data.acceptedTermsAt) {
            const accepted = await AsyncStorage.getItem('acceptedTerms');
            if (accepted) {
              const ts = serverTimestamp();
              await updateDoc(ref, { acceptedTermsAt: ts });
              data.acceptedTermsAt = ts as unknown as Timestamp;
            }
          }
          setProfile(data);
        } else {
          const accepted = await AsyncStorage.getItem('acceptedTerms');
          const ts = serverTimestamp();
          const data: Profile = {
            displayName: u.displayName,
            email: u.email,
            bio: '',
            photoURL: u.photoURL,
            isAnonymous: u.isAnonymous,
            publicProfileEnabled: true,
            boostCredits: 0,
            createdAt: serverTimestamp() as unknown as Timestamp,
            developerMode: false,
            acceptedTermsAt: accepted
              ? (ts as unknown as Timestamp)
              : undefined,
          };
          await setDoc(ref, data);
          await processReferral(u.uid);
          setProfile(data);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      await signUpService(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInService(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signInAnonymouslyFn = async () => {
    try {
      await signInAnonymouslyService();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await signInWithGoogleService(promptAsync);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await resetPasswordService(email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await signOutService();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        setProfile,
        loading,
        authError,
        setAuthError,
        signUp,
        signIn,
        signInWithGoogle,
        signInAnonymously: signInAnonymouslyFn,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
