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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  User,
  updateProfile as fbUpdateProfile,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { auth, db, storage } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import type { Profile } from '../types/Profile';

WebBrowser.maybeCompleteAuthSession();

if (!auth || !db || !storage) {
  console.error('Firebase modules are undefined in AuthContext');
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  pickImage: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  authError: null,
  setAuthError: () => {},
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signInAnonymously: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  pickImage: async () => undefined,
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

  useEffect(() => {
    const checkInvite = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          const parsed = Linking.parse(url);
          const ref = parsed.queryParams?.ref as string | undefined;
          if (ref) {
            await AsyncStorage.setItem('inviteRef', ref);
          }
        }
      } catch (err) {
        console.error('Failed to parse initial URL', err);
      }
    };
    checkInvite();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
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
          try {
            const inviteRef = await AsyncStorage.getItem('inviteRef');
            if (inviteRef) {
              const q = query(
                collection(db, 'users'),
                where('displayName', '==', inviteRef),
              );
              const res = await getDocs(q);
              if (!res.empty) {
                const referrerId = res.docs[0].id;
                await updateDoc(doc(db, 'users', referrerId), {
                  boostCredits: increment(1),
                });
                await updateDoc(ref, { boostCredits: increment(1) });
                await setDoc(doc(db, 'referrals', u.uid), {
                  referrerId,
                  referrerDisplayName:
                    res.docs[0].data().referralDisplayName ||
                    res.docs[0].data().displayName,
                  timestamp: serverTimestamp(),
                });
              }
              await AsyncStorage.removeItem('inviteRef');
            }
          } catch (err) {
            console.error('Failed to process referral', err);
          }
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
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signInAnonymouslyFn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const res = await promptAsync();
      if (res?.type === 'success' && res.authentication?.idToken) {
        const credential = GoogleAuthProvider.credential(
          res.authentication.idToken,
        );
        await signInWithCredential(auth, credential);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const updateProfileInfo = async (data: Partial<Profile>) => {
    try {
      if (!user) return;
      const ref = doc(db, 'users', user.uid);
      await updateDoc(ref, data);
      if (data.displayName || data.photoURL) {
        await fbUpdateProfile(user, {
          displayName: data.displayName ?? user.displayName ?? undefined,
          photoURL: data.photoURL ?? user.photoURL ?? undefined,
        });
      }
      const snap = await getDoc(ref);
      const newData = snap.data() as Profile;
      if (newData.publicProfileEnabled === undefined)
        newData.publicProfileEnabled = true;
      if (newData.developerMode === undefined) newData.developerMode = false;
      setProfile(newData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    }
  };

  const pickImage = async () => {
    try {
      const { granted } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!user) return;
        const storageRef = ref(storage, `profiles/${user.uid}`);
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        await updateProfileInfo({ photoURL: url });
        return url;
      }
      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      return undefined;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authError,
        setAuthError,
        signUp,
        signIn,
        signInWithGoogle,
        signInAnonymously: signInAnonymouslyFn,
        resetPassword,
        signOut,
        updateProfile: updateProfileInfo,
        pickImage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
