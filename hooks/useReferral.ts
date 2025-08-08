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

export const useReferral = () => {
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
      console.error('Failed to process referral', err);
    }
  };

  return { checkInvite, processReferral };
};

