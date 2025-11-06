import { useEffect, useState } from 'react';
import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { db } from '@/firebase';
import * as logger from '@/shared/logger';

export type WishStats = {
  favorites: number;
  sampleNotes: string[];
};

const DEFAULT: WishStats = {
  favorites: 0,
  sampleNotes: [],
};

export function useWishStats(wishId: string | null | undefined) {
  const [stats, setStats] = useState<WishStats>(DEFAULT);
  const [loading, setLoading] = useState<boolean>(!!wishId);

  useEffect(() => {
    if (!wishId) {
      setStats(DEFAULT);
      setLoading(false);
      return () => {};
    }
    const ref = doc(db, 'wishStats', wishId);
    setLoading(true);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<WishStats>;
          setStats({
            favorites: typeof data.favorites === 'number' ? data.favorites : 0,
            sampleNotes: Array.isArray(data.sampleNotes)
              ? (data.sampleNotes.filter(
                  (n) => typeof n === 'string',
                ) as string[])
              : [],
          });
        } else {
          setStats(DEFAULT);
        }
        setLoading(false);
      },
      (error: FirestoreError) => {
        logger.warn('wishStats listener failed', error, { wishId });
        setStats(DEFAULT);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [wishId]);

  return { stats, loading };
}
