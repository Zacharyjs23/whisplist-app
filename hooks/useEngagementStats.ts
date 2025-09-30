import { useEffect, useState } from 'react';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase';
import {
  fromSnapshotData,
  getDefaultStats,
} from '@/helpers/engagement';
import type { EngagementStats } from '@/types/Engagement';

export function useEngagementStats(userId?: string | null) {
  const [stats, setStats] = useState<EngagementStats>(getDefaultStats);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !db) {
      setStats(getDefaultStats());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const ref = doc(db, 'users', userId, 'progress', 'engagement');
    let active = true;
    let unsubscribe: Unsubscribe | null = null;

    unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!active) return;
        if (snapshot.exists()) {
          setStats(fromSnapshotData(snapshot.data() as Partial<EngagementStats>));
        } else {
          setStats(getDefaultStats());
        }
        setLoading(false);
      },
      (err) => {
        if (!active) return;
        setError(err.message || 'Failed to load engagement stats');
        setStats(getDefaultStats());
        setLoading(false);
      },
    );

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  return { stats, loading, error } as const;
}

export default useEngagementStats;

