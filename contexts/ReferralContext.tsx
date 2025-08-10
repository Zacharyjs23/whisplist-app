import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type ReactElement,
} from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  increment,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthSession } from './AuthSessionContext';
import * as logger from '@/shared/logger';

interface ReferralContextValue {
  checkInvite: () => Promise<void>;
  processReferral: (userId: string) => Promise<void>;
}

const ReferralContext = createContext<ReferralContextValue>({
  checkInvite: async () => {},
  processReferral: async () => {},
});

export const ReferralProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const { user, profile } = useAuthSession();
  const processedRef = useRef(false);

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
      logger.error('Failed to parse initial URL', err);
    }
  };

  const processReferral = async (userId: string) => {
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
          await updateDoc(doc(db, 'users', userId), { boostCredits: increment(1) });
          await setDoc(doc(db, 'referrals', userId), {
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
      logger.error('Failed to process referral', err);
    }
  };

  useEffect(() => {
    void checkInvite();
  }, []);

  useEffect(() => {
    if (user && profile && !processedRef.current) {
      processedRef.current = true;
      void processReferral(user.uid);
    }
  }, [user, profile]);

  return (
    <ReferralContext.Provider value={{ checkInvite, processReferral }}>
      {children}
    </ReferralContext.Provider>
  );
};

export const useReferral = () => useContext(ReferralContext);

