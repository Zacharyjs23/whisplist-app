import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../firebase';
import { signInAnonymouslyService } from '../services/auth';
import type { Profile } from '../types/Profile';
import * as logger from '@/shared/logger';

if (!auth || !db) {
  logger.error('Firebase modules are undefined in AuthSessionContext');
}

interface AuthSessionContextValue {
  user: User | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  loading: boolean;
}

const AuthSessionContext = createContext<AuthSessionContextValue>({
  user: null,
  profile: null,
  setProfile: () => {},
  loading: true,
});

export const AuthSessionProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymouslyService();
        } catch (err) {
          logger.error('Anonymous sign-in failed', err);
          setLoading(false);
        }
        return;
      }
      setUser(u);
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
          acceptedTermsAt: accepted ? (ts as unknown as Timestamp) : undefined,
        };
        await setDoc(ref, data);
        setProfile(data);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthSessionContext.Provider value={{ user, profile, setProfile, loading }}>
      {children}
    </AuthSessionContext.Provider>
  );
};

export const useAuthSession = () => useContext(AuthSessionContext);

