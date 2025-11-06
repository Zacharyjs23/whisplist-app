import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
} from 'react';
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
import {
  initialWishlistState,
  wishlistReducer,
} from '@/src/reducers/wishlistReducer';

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
  const [saved, dispatch] = useReducer(
    wishlistReducer,
    initialWishlistState,
  );

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users', user.uid, 'savedWishes'),
      orderBy('timestamp', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const ids: string[] = [];
      snap.forEach((d) => {
        ids.push(d.id);
      });
      dispatch({ type: 'SET_ALL', payload: ids });
    });
    return unsub;
  }, [user]);

  const toggleSave = async (id: string) => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'savedWishes', id);
    const exists = !!saved[id];
    if (exists) {
      dispatch({ type: 'REMOVE_ITEM', payload: id });
      try {
        await deleteDoc(ref);
      } catch (err) {
        dispatch({ type: 'ADD_ITEM', payload: id });
        throw err;
      }
    } else {
      dispatch({ type: 'ADD_ITEM', payload: id });
      try {
        await setDoc(ref, { timestamp: serverTimestamp() });
      } catch (err) {
        dispatch({ type: 'REMOVE_ITEM', payload: id });
        throw err;
      }
    }
  };

  return (
    <SavedWishesContext.Provider value={{ saved, toggleSave }}>
      {children}
    </SavedWishesContext.Provider>
  );
};

export const useSavedWishes = () => useContext(SavedWishesContext);
