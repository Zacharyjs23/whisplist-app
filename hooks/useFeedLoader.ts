import { useEffect, useState, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { cleanupExpiredWishes } from '@/helpers/wishes';
import type { Wish } from '@/types/Wish';
import * as logger from '@/shared/logger';
import { personalizeFeed } from '@/helpers/feedPersonalization';
import type { PostType } from '@/types/post';
import { apiGet } from '@/services/apiClient';
import { normalizeWishScope } from '@/types/WishScope';

type ApiFeedItem = {
  id: string;
  scope?: string;
  timestamp?: number | null;
  boostedUntil?: number | null;
  deadline?: number | null;
  expiresAt?: number | null;
  fulfilledAt?: number | null;
  stageUpdatedAt?: number | null;
  viewerContext?: Record<string, unknown>;
  [key: string]: unknown;
};

type FeedResponse = {
  ok?: boolean;
  data?: {
    items?: ApiFeedItem[];
  };
  error?: string;
};

const toTimestamp = (value: number | null | undefined): Timestamp | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Timestamp.fromMillis(value);
  }
  return null;
};

const deserializeWish = (item: ApiFeedItem): Wish => {
  const scope = normalizeWishScope(item.scope);
  const timestamp = toTimestamp(item.timestamp);
  const boostedUntil = toTimestamp(item.boostedUntil);
  const deadline = toTimestamp(item.deadline);
  const expiresAt = toTimestamp(item.expiresAt);
  const fulfilledAt = toTimestamp(item.fulfilledAt);
  const stageUpdatedAt = toTimestamp(item.stageUpdatedAt);

  const base: Record<string, unknown> = {
    ...item,
    scope,
    timestamp,
    boostedUntil,
    deadline,
    expiresAt,
    fulfilledAt,
    stageUpdatedAt,
  };

  return {
    id: item.id,
    ...(base as Record<string, unknown>),
  } as Wish;
};

const computeBoostedCount = (wishes: Wish[]): number => {
  const now = Date.now();
  return wishes.filter((wish) => {
    const boostedUntil = wish.boostedUntil as Timestamp | null | undefined;
    if (!boostedUntil || typeof boostedUntil.toMillis !== 'function') {
      return false;
    }
    return boostedUntil.toMillis() > now;
  }).length;
};

const newestTimestamp = (wishes: Wish[]): number | null => {
  if (!wishes.length) return null;
  const newest = wishes
    .map((wish) => {
      const ts = wish.timestamp as Timestamp | null | undefined;
      return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
    })
    .reduce((acc, value) => Math.max(acc, value), 0);
  return newest || null;
};

const fetchFeed = async (): Promise<ApiFeedItem[]> => {
  const response = await apiGet<FeedResponse>('/feed');
  if (response?.ok === false) {
    throw new Error(response.error ?? 'feed_fetch_failed');
  }
  return response?.data?.items ?? [];
};

export const useFeedLoader = (user: any) => {
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [rawWishes, setRawWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [boostedCount, setBoostedCount] = useState(0);
  const [latestTs, setLatestTs] = useState<number | null>(null);
  const [surpriseWish, setSurpriseWish] = useState<Wish | null>(null);
  const [preferredType, setPreferredType] = useState<PostType | null>(null);
  const userId = user?.uid ?? null;

  const hydrate = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const items = await fetchFeed();
        const wishes = items.map(deserializeWish);
        setRawWishes(wishes);
        setBoostedCount(computeBoostedCount(wishes));
        setLatestTs(newestTimestamp(wishes));
        setError(null);
        setHasMore(false);
      } catch (err) {
        logger.warn('Failed to load feed', err);
        if (!opts.silent) {
          setError(
            "Couldn't load data. Check your connection and try again.",
          );
        }
        throw err;
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    cleanupExpiredWishes(userId);
    void hydrate();
  }, [hydrate, userId]);

  useEffect(() => {
    let cancelled = false;
    const applyPersonalization = async () => {
      if (!rawWishes.length) {
        setWishList([]);
        setSurpriseWish(null);
        setPreferredType(null);
        return;
      }
      try {
        const result = await personalizeFeed(rawWishes, { userId });
        if (cancelled) return;
        setWishList(result.items);
        setSurpriseWish(result.surpriseWish ?? null);
        setPreferredType(result.preferredType ?? null);
      } catch (err) {
        logger.warn('Failed to personalize feed ordering', err);
        if (!cancelled) {
          setWishList(rawWishes);
          setSurpriseWish(null);
          setPreferredType(null);
        }
      }
    };
    void applyPersonalization();
    return () => {
      cancelled = true;
    };
  }, [rawWishes, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await hydrate({ silent: true });
    } catch {
      // hydrate already logged error
    } finally {
      setRefreshing(false);
    }
  }, [hydrate]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  const checkHasNewer = useCallback(async () => {
    if (!latestTs) return false;
    try {
      const items = await fetchFeed();
      return items.some(
        (item) =>
          typeof item.timestamp === 'number' && item.timestamp > latestTs,
      );
    } catch (err) {
      logger.warn('peek newer failed', err);
      return false;
    }
  }, [latestTs]);

  const getNewerCount = useCallback(async () => {
    if (!latestTs) return 0;
    try {
      const items = await fetchFeed();
      return items.filter(
        (item) =>
          typeof item.timestamp === 'number' && item.timestamp > latestTs,
      ).length;
    } catch (err) {
      logger.warn('newer count failed', err);
      return 0;
    }
  }, [latestTs]);

  return {
    wishList,
    loading,
    error,
    refreshing,
    onRefresh,
    loadMore,
    lastDoc: null as number | null,
    loadingMore,
    hasMore,
    boostedCount,
    checkHasNewer,
    getNewerCount,
    surpriseWish,
    preferredType,
  };
};

export default useFeedLoader;
