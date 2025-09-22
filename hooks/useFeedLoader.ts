import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, orderBy, query, where, limit } from 'firebase/firestore';
import { getFollowingIds } from '@/helpers/followers';
import { cleanupExpiredWishes } from '@/helpers/wishes';
import { Wish } from '@/types/Wish';
import { db } from '@/firebase';
import * as logger from '@/shared/logger';
import { chunk as chunkArray } from '@/helpers/chunk';
import { dedupeSortByTimestampDesc, toMillis } from '@/helpers/merge';

export const useFeedLoader = (user: any) => {
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Cursor based on timestamp because we batch queries across chunks
  const [lastCursorTs, setLastCursorTs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 20;
  const [boostedCount, setBoostedCount] = useState(0);
  const [latestTs, setLatestTs] = useState<number | null>(null);

  const fetchPageFromChunks = useCallback(
    async (
      followingIds: string[],
      pageSize: number,
      options: { beforeTs?: number | null; afterTs?: number | null } = {},
    ) => {
      if (!followingIds.length) {
        return { items: [] as Wish[], minTs: null as number | null, hasMore: false };
      }
      const { beforeTs, afterTs } = options;
      const chunks = chunkArray(followingIds, 10);
      const snaps = await Promise.all(
        chunks.map((chunk) => {
          const base = query(
            collection(db, 'wishes'),
            where('userId', 'in', chunk),
            orderBy('timestamp', 'desc'),
          );
          const q = beforeTs != null
            ? query(base, where('timestamp', '<', new Date(beforeTs)), limit(pageSize))
            : afterTs != null
            ? query(base, where('timestamp', '>', new Date(afterTs)), limit(pageSize))
            : query(base, limit(pageSize));
          return getDocs(q);
        }),
      );
      const items = snaps.flatMap((s) =>
        s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) } as Wish)),
      );
      const merged = dedupeSortByTimestampDesc(items);
      const page = merged.slice(0, pageSize);
      const minTs = page.length
        ? page.reduce(
            (min, w) => {
              const ms = w.timestamp?.toMillis?.() ?? 0;
              return min === null ? ms : Math.min(min, ms);
            },
            null as number | null,
          )
        : null;
      const anyChunkFull = snaps.some((s) => s.docs.length === pageSize);
      const hasMoreGuessed = merged.length > page.length || anyChunkFull;
      return { items: page, minTs, hasMore: hasMoreGuessed };
    },
    [],
  );

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
        setBoostedCount(boosted.length);
        let normal: Wish[] = [];
        if (following.length) {
          const { items, minTs, hasMore: more } = await fetchPageFromChunks(
            following,
            PAGE_SIZE,
          );
          normal = items;
          setLastCursorTs(minTs);
          setHasMore(more);
        } else {
          setHasMore(false);
          setLastCursorTs(null);
        }
        const combined = [...boosted, ...normal];
        setWishList(combined);
        // Track newest timestamp for new-content checks
        const newest = combined
          .map((w) => (w.timestamp && 'toDate' in (w.timestamp as any) ? (w.timestamp as any).toDate().getTime() : 0))
          .reduce((a, b) => Math.max(a, b), 0);
        setLatestTs(newest || null);
        setError(null);
      } catch (err) {
        logger.warn('Failed to load wishes', err);
        setError("Couldn't load data. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, fetchPageFromChunks]);

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
      setBoostedCount(boosted.length);
      let normal: Wish[] = [];
      if (user && followingIds.length) {
        const { items, minTs, hasMore: more } = await fetchPageFromChunks(
          followingIds,
          PAGE_SIZE,
        );
        normal = items;
        setLastCursorTs(minTs);
        setHasMore(more);
      } else {
        setHasMore(false);
        setLastCursorTs(null);
      }
      const combined = [...boosted, ...normal];
      setWishList(combined);
      const newest = combined
        .map((w) => (w.timestamp && 'toDate' in (w.timestamp as any) ? (w.timestamp as any).toDate().getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      setLatestTs(newest || null);
      setError(null);
    } catch (err) {
      logger.error('❌ Failed to refresh wishes:', err);
      setError("Couldn't load data. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }, [user, fetchPageFromChunks]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastCursorTs) return;
    setLoadingMore(true);
    try {
      const followingIds = user ? await getFollowingIds(user.uid) : [];
      if (!followingIds.length) {
        setHasMore(false);
        return;
      }
      const { items, minTs, hasMore: more } = await fetchPageFromChunks(
        followingIds,
        PAGE_SIZE,
        { beforeTs: lastCursorTs },
      );
      setLastCursorTs(minTs ?? lastCursorTs);
      setWishList((prev) => [...prev, ...items]);
      // Do not update latestTs here; loadMore appends older items
      setHasMore(more);
    } catch (err) {
      logger.warn('Failed to load more wishes', err);
      setError("Couldn't load data. Check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [lastCursorTs, user, loadingMore, hasMore, fetchPageFromChunks]);

  return {
    wishList,
    loading,
    error,
    refreshing,
    onRefresh,
    loadMore,
    lastDoc: lastCursorTs,
    loadingMore,
    hasMore,
    boostedCount,
    /**
     * Check if there are newer posts than the newest item currently loaded.
     */
    checkHasNewer: async () => {
      try {
        const followingIds = user ? await getFollowingIds(user.uid) : [];
        if (!followingIds.length || !latestTs) return false;
        const chunks = chunkArray(followingIds, 10);
        const snaps = await Promise.all(
          chunks.map((chunk) =>
            getDocs(
              query(
                collection(db, 'wishes'),
                where('userId', 'in', chunk),
                orderBy('timestamp', 'desc'),
                limit(1),
              ),
            ),
          ),
        );
        const maxTs = snaps.reduce((acc, s) => {
          const d = s.docs[0]?.data() as any;
          return Math.max(acc, toMillis(d?.timestamp));
        }, 0);
        return maxTs > latestTs;
      } catch (err) {
        logger.warn('peek newer failed', err);
        return false;
      }
    },
    /**
     * Return an approximate count of new items by peeking the first page.
     */
    getNewerCount: async () => {
      const followingIds = user ? await getFollowingIds(user.uid) : [];
      if (!followingIds.length || !latestTs) return 0;
      try {
        const { items } = await fetchPageFromChunks(
          followingIds,
          PAGE_SIZE,
          { afterTs: latestTs },
        );
        const base = latestTs ?? 0;
        return items.filter((w) => toMillis((w as any).timestamp) > base).length;
      } catch (err) {
        logger.warn('newer count failed', err);
        return 0;
      }
    },
  };
};

export default useFeedLoader;
