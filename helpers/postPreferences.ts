import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import type { PostType } from '@/types/post';
import { DEFAULT_POST_TYPE, POST_TYPE_ORDER, isPostType, normalizePostType } from '@/types/post';
import * as logger from '@/shared/logger';

const PREFERRED_KEY_PREFIX = 'preferredPostType.v1';
const USAGE_KEY_PREFIX = 'postTypeUsage.v1';
const PREFERRED_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const buildPreferredKey = (userId?: string | null) =>
  userId ? `${PREFERRED_KEY_PREFIX}:${userId}` : `${PREFERRED_KEY_PREFIX}:guest`;

const buildUsageKey = (userId: string) => `${USAGE_KEY_PREFIX}:${userId}`;

const parseStoredType = (raw: string | null): { type: PostType; sampledAt: number } | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && isPostType(parsed.type)) {
      return {
        type: parsed.type,
        sampledAt: typeof parsed.sampledAt === 'number' ? parsed.sampledAt : 0,
      };
    }
  } catch (err) {
    logger.warn('Failed to parse stored preferred post type', err);
  }
  return null;
};

const storePreferredType = async (userId: string, type: PostType) => {
  try {
    await AsyncStorage.setItem(
      buildPreferredKey(userId),
      JSON.stringify({ type, sampledAt: Date.now() }),
    );
  } catch (err) {
    logger.warn('Failed to persist preferred post type', err);
  }
};

export const getPreferredPostType = async (
  userId?: string | null,
): Promise<PostType | null> => {
  if (!userId) {
    return null;
  }
  const key = buildPreferredKey(userId);
  try {
    const cached = parseStoredType(await AsyncStorage.getItem(key));
    if (cached && Date.now() - cached.sampledAt < PREFERRED_TTL_MS) {
      return cached.type;
    }
  } catch (err) {
    logger.warn('Failed to read preferred post type cache', err);
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, 'wishes'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(20),
      ),
    );
    const counts: Partial<Record<PostType, number>> = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { type?: string | null };
      const normalized = normalizePostType(data.type ?? DEFAULT_POST_TYPE);
      counts[normalized] = (counts[normalized] ?? 0) + 1;
    });
    const top = POST_TYPE_ORDER.reduce<PostType | null>((best, current) => {
      const currentCount = counts[current] ?? 0;
      if (!best) return currentCount > 0 ? current : null;
      const bestCount = counts[best] ?? 0;
      if (currentCount > bestCount) return current;
      return best;
    }, null);

    if (top) {
      await storePreferredType(userId, top);
      return top;
    }
  } catch (err) {
    logger.warn('Failed to compute preferred post type from Firestore', err, { userId });
  }

  return null;
};

export const recordPostTypeUsage = async (
  userId: string | null | undefined,
  type: PostType,
) => {
  if (!userId) return;
  try {
    const key = buildUsageKey(userId);
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    const counts: Partial<Record<PostType, number>> =
      parsed && typeof parsed === 'object' && parsed.counts
        ? parsed.counts
        : {};
    counts[type] = (counts[type] ?? 0) + 1;
    await AsyncStorage.setItem(key, JSON.stringify({ counts, updatedAt: Date.now() }));

    const favorite = POST_TYPE_ORDER.reduce<PostType>((best, current) => {
      const bestCount = counts[best] ?? 0;
      const currentCount = counts[current] ?? 0;
      if (currentCount > bestCount) return current;
      return best;
    }, type);

    await storePreferredType(userId, favorite);
  } catch (err) {
    logger.warn('Failed to record post type usage', err, { userId, type });
  }
};

export const clearPreferredPostType = async (userId?: string | null) => {
  try {
    await AsyncStorage.removeItem(buildPreferredKey(userId));
    if (userId) {
      await AsyncStorage.removeItem(buildUsageKey(userId));
    }
  } catch (err) {
    logger.warn('Failed to clear preferred post type cache', err, { userId });
  }
};

