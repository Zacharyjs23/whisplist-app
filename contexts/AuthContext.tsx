import * as React from 'react';
import {
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
import { auth, db, storage } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';

WebBrowser.maybeCompleteAuthSession();

interface Profile {
  displayName: string | null;
  email: string | null;
  bio?: string;
  photoURL?: string | null;
  isAnonymous: boolean;
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
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data() as Profile);
        } else {
          const data: Profile = {
            displayName: u.displayName,
            email: u.email,
            bio: '',
            photoURL: u.photoURL,
            isAnonymous: u.isAnonymous,
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, data);
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
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInAnonymouslyFn = async () => {
    await signInAnonymously(auth);
  };

  const signInWithGoogle = async () => {
    const res = await promptAsync();
    if (res?.type === 'success' && res.authentication?.idToken) {
      const credential = GoogleAuthProvider.credential(res.authentication.idToken);
      await signInWithCredential(auth, credential);
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  const updateProfileInfo = async (data: Partial<Profile>) => {
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
    setProfile(snap.data() as Profile);
  };

  const pickImage = async () => {
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
