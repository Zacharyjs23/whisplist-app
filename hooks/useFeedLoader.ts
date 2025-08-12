import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  limit,
  startAfter,
} from 'firebase/firestore';
import { getFollowingIds } from '@/helpers/followers';
import { cleanupExpiredWishes } from '@/helpers/wishes';
import { Wish } from '@/types/Wish';
import { db } from '@/firebase';
import * as logger from '@/shared/logger';

export const useFeedLoader = (user: any) => {
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastDoc, setLastDoc] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cleanupExpiredWishes();
    const load = async () => {
      setLoading(true);
      try {
        const following = user ? await getFollowingIds(user.uid) : [];
        const now = new Date();
        const boostedSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('boostedUntil', '>', now),
            orderBy('boostedUntil', 'desc'),
          ),
        );
        const boosted = boostedSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        let normal: Wish[] = [];
        if (following.length) {
          const q = query(
            collection(db, 'wishes'),
            where('userId', 'in', following),
            orderBy('timestamp', 'desc'),
            limit(20),
          );
          const snap = await getDocs(q);
          setLastDoc(snap.docs[snap.docs.length - 1] || null);
          normal = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Wish, 'id'>),
          })) as Wish[];
        }
        setWishList([...boosted, ...normal]);
        setError(null);
      } catch (err) {
        logger.warn('Failed to load wishes', err);
        setError("Couldn't load data. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const followingIds = user ? await getFollowingIds(user.uid) : [];
      const now = new Date();
      const boostedSnap = await getDocs(
        query(
          collection(db, 'wishes'),
          where('boostedUntil', '>', now),
          orderBy('boostedUntil', 'desc'),
        ),
      );
      const boosted = boostedSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];
      let normal: Wish[] = [];
      if (user && followingIds.length) {
        const normalSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('userId', 'in', followingIds),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        );
        setLastDoc(normalSnap.docs[normalSnap.docs.length - 1] || null);
        normal = normalSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
      }
      setWishList([...boosted, ...normal]);
      setError(null);
    } catch (err) {
      logger.error('❌ Failed to refresh wishes:', err);
      setError("Couldn't load data. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!lastDoc) return;
    try {
      const followingIds = user ? await getFollowingIds(user.uid) : [];
      if (!followingIds.length) return;
      const snap = await getDocs(
        query(
          collection(db, 'wishes'),
          where('userId', 'in', followingIds),
          orderBy('timestamp', 'desc'),
          startAfter(lastDoc),
          limit(20),
        ),
      );
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      const more = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];
      setWishList((prev) => [...prev, ...more]);
    } catch (err) {
      logger.warn('Failed to load more wishes', err);
      setError("Couldn't load data. Check your connection and try again.");
    }
  }, [lastDoc, user]);

  return {
    wishList,
    loading,
    error,
    refreshing,
    onRefresh,
    loadMore,
    lastDoc,
  };
};

export default useFeedLoader;
