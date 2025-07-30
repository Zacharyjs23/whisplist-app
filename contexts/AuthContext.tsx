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
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';

WebBrowser.maybeCompleteAuthSession();

if (!auth || !db || !storage) {
  console.error('Firebase modules are undefined in AuthContext');
}

interface Profile {
  displayName: string | null;
  email: string | null;
  bio?: string;
  photoURL?: string | null;
  isAnonymous: boolean;
  publicProfileEnabled?: boolean;
  boostCredits?: number;
  createdAt?: any;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  pickImage: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signInAnonymously: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  pickImage: async () => undefined,
});

export const AuthProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
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
          setProfile(data);
        } else {
          const data: Profile = {
            displayName: u.displayName,
            email: u.email,
            bio: '',
            photoURL: u.photoURL,
            isAnonymous: u.isAnonymous,
            publicProfileEnabled: true,
            boostCredits: 0,
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, data);
          try {
            const inviteRef = await AsyncStorage.getItem('inviteRef');
            if (inviteRef) {
              const q = query(collection(db, 'users'), where('displayName', '==', inviteRef));
              const res = await getDocs(q);
              if (!res.empty) {
                const referrerId = res.docs[0].id;
                await updateDoc(doc(db, 'users', referrerId), { boostCredits: increment(1) });
                await updateDoc(ref, { boostCredits: increment(1) });
                await setDoc(doc(db, 'referrals', u.uid), {
                  referrerId,
                  referrerDisplayName:
                    res.docs[0].data().referralDisplayName || res.docs[0].data().displayName,
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

  // Temporary development bypass
  useEffect(() => {
    if (__DEV__ && !user && !loading) {
      const fakeUser = {
        uid: 'dev',
        email: 'dev@test.com',
        displayName: 'DevUser',
      } as User;
      setUser(fakeUser);
      setProfile({
        displayName: 'DevUser',
        email: 'dev@test.com',
        isAnonymous: false,
        publicProfileEnabled: true,
      });
    }
  }, [user, loading]);

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error('Failed to sign up', err);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error('Failed to sign in', err);
      throw err;
    }
  };

  const signInAnonymouslyFn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error('Failed to sign in anonymously', err);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const res = await promptAsync();
      if (res?.type === 'success' && res.authentication?.idToken) {
        const credential = GoogleAuthProvider.credential(res.authentication.idToken);
        await signInWithCredential(auth, credential);
      }
    } catch (err) {
      console.error('Failed to sign in with Google', err);
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('Failed to sign out', err);
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
      if (newData.publicProfileEnabled === undefined) newData.publicProfileEnabled = true;
      setProfile(newData);
    } catch (err) {
      console.error('Failed to update profile', err);
    }
  };

  const pickImage = async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
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
      console.error('Failed to pick image', err);
      return undefined;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signInAnonymously: signInAnonymouslyFn,
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
