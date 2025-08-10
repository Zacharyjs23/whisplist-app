import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuthSession } from './AuthSessionContext';
import { db } from '../firebase';

interface SavedContextValue {
  saved: Record<string, boolean>;
  toggleSave: (id: string) => Promise<void>;
}

const SavedWishesContext = createContext<SavedContextValue>({
  saved: {},
  toggleSave: async () => {},
});

export const SavedWishesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuthSession();
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users', user.uid, 'savedWishes'),
      orderBy('timestamp', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const obj: Record<string, boolean> = {};
      snap.forEach((d) => {
        obj[d.id] = true;
      });
      setSaved(obj);
    });
    return unsub;
  }, [user]);

  const toggleSave = async (id: string) => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'savedWishes', id);
    if (saved[id]) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { timestamp: serverTimestamp() });
    }
  };

  return (
    <SavedWishesContext.Provider value={{ saved, toggleSave }}>
      {children}
    </SavedWishesContext.Provider>
  );
};

export const useSavedWishes = () => useContext(SavedWishesContext);
