import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/firebase';

export type WishMeta = {
  giftCount: number;
  hasGiftMessage: boolean;
  isSupporter: boolean;
  giftTotal: number;
};

type CacheEntry = {
  promise: Promise<WishMeta>;
  timestamp: number;
  ownerId: string | null | undefined;
  viewerId: string | null | undefined;
};

const CACHE_TTL_MS = 1000 * 60; // 1 minute
const cache = new Map<string, CacheEntry>();

async function loadWishMeta(
  wishId: string,
  ownerId: string | null | undefined,
  viewerId: string | null | undefined,
): Promise<WishMeta> {
  const supporter = ownerId
    ? await (async () => {
        try {
          const snap = await getDoc(doc(db, 'users', ownerId));
          return snap.exists() ? !!snap.get('isSupporter') : false;
        } catch {
          return false;
        }
      })()
    : false;

  const canReadGifts = ownerId && viewerId && ownerId === viewerId;

  if (!canReadGifts) {
    return {
      giftCount: 0,
      hasGiftMessage: false,
      isSupporter: supporter,
      giftTotal: 0,
    };
  }

  try {
    const [wishGiftsSnap, globalGiftsSnap, topLevelGiftsSnap] =
      await Promise.all([
        getDocs(collection(db, 'wishes', wishId, 'gifts')),
        getDocs(collection(db, 'gifts', wishId, 'gifts')),
        getDocs(
          query(
            collection(db, 'gifts'),
            where('wishId', '==', wishId),
            where('status', 'in', ['confirmed', 'completed']),
          ),
        ),
      ]);

    let hasMessage = false;
    let total = 0;
    const seen = new Set<string>();
    const addTotals = (snap: typeof wishGiftsSnap) => {
      snap.forEach((d) => {
        if (seen.has(d.id)) return;
        const data = d.data() as Record<string, unknown>;
        const status =
          typeof data?.status === 'string' ? (data.status as string) : null;
        if (status && status !== 'completed' && status !== 'confirmed') {
          return;
        }
        if (typeof data?.message === 'string' && data.message.length)
          hasMessage = true;
        if (typeof data?.amount === 'number') {
          total += data.amount;
        }
        seen.add(d.id);
      });
    };
    addTotals(wishGiftsSnap);
    addTotals(globalGiftsSnap as any);
    addTotals(topLevelGiftsSnap);

    return {
      giftCount: seen.size,
      hasGiftMessage: hasMessage,
      isSupporter: supporter,
      giftTotal: total,
    };
  } catch (err) {
    if ((err as FirestoreError)?.code === 'permission-denied') {
      return {
        giftCount: 0,
        hasGiftMessage: false,
        isSupporter: supporter,
        giftTotal: 0,
      };
    }
    throw err;
  }
}

export function getWishMeta(
  wishId: string,
  ownerId?: string | null,
  viewerId?: string | null,
): Promise<WishMeta> {
  const now = Date.now();
  const cached = cache.get(wishId);
  if (
    cached &&
    now - cached.timestamp < CACHE_TTL_MS &&
    cached.ownerId === ownerId &&
    cached.viewerId === viewerId
  ) {
    return cached.promise;
  }
  const promise = loadWishMeta(wishId, ownerId ?? null, viewerId ?? null).catch(
    (err) => {
      cache.delete(wishId);
      throw err;
    },
  );
  cache.set(wishId, {
    promise,
    timestamp: now,
    ownerId: ownerId ?? null,
    viewerId: viewerId ?? null,
  });
  return promise;
}

export function primeWishMeta(
  wishId: string,
  ownerId?: string | null,
  viewerId?: string | null,
) {
  const existing = cache.get(wishId);
  if (
    existing &&
    existing.ownerId === (ownerId ?? null) &&
    existing.viewerId === (viewerId ?? null) &&
    Date.now() - existing.timestamp < CACHE_TTL_MS
  ) {
    return;
  }
  cache.set(wishId, {
    promise: loadWishMeta(wishId, ownerId ?? null, viewerId ?? null),
    timestamp: Date.now(),
    ownerId: ownerId ?? null,
    viewerId: viewerId ?? null,
  });
}

export function clearWishMetaCache(wishId?: string) {
  if (wishId) {
    cache.delete(wishId);
  } else {
    cache.clear();
  }
}
