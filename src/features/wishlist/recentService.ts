import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '@/firebase';
import * as logger from '@/shared/logger';
import { functionUrl } from '@/services/functions';

export type RecentWishlistEntry = {
  id: string;
  title: string | null;
  coverUri: string | null;
  updatedAt: number;
};

type StoredBucket = {
  userKey: string;
  entries: RecentWishlistEntry[];
  updatedAt: number;
};

type Listener = (entries: RecentWishlistEntry[]) => void;

const MAX_DISPLAY = 10;
const MAX_STORAGE = 20;
const STORAGE_PREFIX = 'wishlist:recent:v1:';
const IDB_DB_NAME = 'wishlistRecent';
const IDB_STORE_NAME = 'recentBuckets';
const IDB_VERSION = 1;

const cache = new Map<string, RecentWishlistEntry[]>();
const subscribers = new Map<string, Set<Listener>>();
const loadPromises = new Map<string, Promise<RecentWishlistEntry[]>>();
const remoteHydrated = new Set<string>();
const pendingSync = new Set<string>();

let idbPromise: Promise<IDBDatabase | null> | null = null;

const hasIndexedDb =
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

function userKey(userId: string | null | undefined): string {
  if (typeof userId === 'string') {
    const normalized = userId.trim();
    if (normalized.length) return normalized;
  }
  return 'anon';
}

function sanitizeTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
}

function sanitizeCover(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

function toMillis(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === 'string' && input.trim().length) {
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (
    input &&
    typeof input === 'object' &&
    typeof (input as { toMillis?: () => number }).toMillis === 'function'
  ) {
    try {
      const value = (input as { toMillis: () => number }).toMillis();
      if (Number.isFinite(value)) return value;
    } catch {
      /* ignore */
    }
  }
  if (
    input &&
    typeof input === 'object' &&
    typeof (input as { toDate?: () => Date }).toDate === 'function'
  ) {
    try {
      const value = (input as { toDate: () => Date }).toDate().getTime();
      if (Number.isFinite(value)) return value;
    } catch {
      /* ignore */
    }
  }
  return Date.now();
}

function normalizeEntries(entries: RecentWishlistEntry[]): RecentWishlistEntry[] {
  return entries
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : '',
      title: sanitizeTitle(entry.title),
      coverUri: sanitizeCover(entry.coverUri),
      updatedAt: toMillis(entry.updatedAt),
    }))
    .filter((entry) => entry.id.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORAGE);
}

function notify(userKey: string) {
  const listeners = subscribers.get(userKey);
  if (!listeners?.size) return;
  const payload = (cache.get(userKey) ?? []).slice(0, MAX_DISPLAY);
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (err) {
      logger.warn('recentWishlists listener failed', err, {
        severity: 'low',
      });
    }
  });
}

function withIndexedDb<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T | null> {
  if (!hasIndexedDb) return Promise.resolve(null);
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(IDB_DB_NAME, IDB_VERSION);
        request.onupgradeneeded = () => {
          const dbInstance = request.result;
          if (!dbInstance.objectStoreNames.contains(IDB_STORE_NAME)) {
            dbInstance.createObjectStore(IDB_STORE_NAME, {
              keyPath: 'userKey',
            });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          logger.warn('recentWishlists IndexedDB open failed', request.error);
          resolve(null);
        };
      } catch (err) {
        logger.warn('recentWishlists IndexedDB init failed', err);
        resolve(null);
      }
    });
  }
  return idbPromise.then((database) => {
    if (!database) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = database.transaction(IDB_STORE_NAME, mode);
        const store = tx.objectStore(IDB_STORE_NAME);
        let resultValue: T | null = null;
        Promise.resolve(handler(store))
          .then((result) => {
            resultValue =
              result === undefined ? null : (result as T | null);
          })
          .catch((err) => {
            logger.warn('recentWishlists IndexedDB operation failed', err);
            resultValue = null;
            try {
              tx.abort();
            } catch {
              /* ignore */
            }
          });
        tx.oncomplete = () => resolve(resultValue);
        tx.onabort = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch (err) {
        logger.warn('recentWishlists IndexedDB transaction failed', err);
        resolve(null);
      }
    });
  });
}

async function readBucket(userKey: string): Promise<RecentWishlistEntry[]> {
  if (hasIndexedDb) {
    const bucket = await withIndexedDb<StoredBucket | undefined>(
      'readonly',
      async (store) => {
        const request = store.get(userKey);
        return await new Promise<StoredBucket | undefined>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result as StoredBucket | undefined);
          request.onerror = () => reject(request.error);
        });
      },
    );
    if (bucket?.entries?.length) {
      return normalizeEntries(bucket.entries);
    }
  }
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${userKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredBucket;
    return normalizeEntries(parsed?.entries ?? []);
  } catch (err) {
    logger.warn('recentWishlists storage read failed', err, { userKey });
    return [];
  }
}

async function persistBucket(
  userKey: string,
  entries: RecentWishlistEntry[],
): Promise<void> {
  const payload: StoredBucket = {
    userKey,
    entries: normalizeEntries(entries),
    updatedAt: Date.now(),
  };
  if (hasIndexedDb) {
    const success = await withIndexedDb<null>('readwrite', async (store) => {
      const request = store.put(payload);
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      return null;
    });
    if (success !== null) return;
  }
  try {
    await AsyncStorage.setItem(
      `${STORAGE_PREFIX}${userKey}`,
      JSON.stringify(payload),
    );
  } catch (err) {
    logger.warn('recentWishlists storage write failed', err, { userKey });
  }
}

async function removeBucket(userKey: string): Promise<void> {
  if (hasIndexedDb) {
    await withIndexedDb<null>('readwrite', async (store) => {
      store.delete(userKey);
      return null;
    });
  }
  try {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${userKey}`);
  } catch (err) {
    logger.warn('recentWishlists storage delete failed', err, { userKey });
  }
}

async function ensureCache(userKeyValue: string): Promise<RecentWishlistEntry[]> {
  const existing = cache.get(userKeyValue);
  if (existing) return existing;
  let pending = loadPromises.get(userKeyValue);
  if (!pending) {
    pending = readBucket(userKeyValue)
      .then((entries) => {
        cache.set(userKeyValue, entries);
        loadPromises.delete(userKeyValue);
        return entries;
      })
      .catch((err) => {
        logger.warn('recentWishlists cache hydration failed', err, {
          userKey: userKeyValue,
        });
        cache.set(userKeyValue, []);
        loadPromises.delete(userKeyValue);
        return [];
      });
    loadPromises.set(userKeyValue, pending);
  }
  return pending;
}

async function updateCache(
  userKeyValue: string,
  entries: RecentWishlistEntry[],
): Promise<void> {
  const normalized = normalizeEntries(entries);
  cache.set(userKeyValue, normalized);
  await persistBucket(userKeyValue, normalized);
  notify(userKeyValue);
}

export async function recordRecentWishlistView({
  userId,
  wishlistId,
  title,
  coverUri,
}: {
  userId: string | null | undefined;
  wishlistId: string | null | undefined;
  title?: string | null;
  coverUri?: string | null;
}): Promise<void> {
  if (typeof wishlistId !== 'string') return;
  const trimmed = wishlistId.trim();
  if (!trimmed.length) return;
  const key = userKey(userId);
  const current = await ensureCache(key);
  const sanitizedTitle = sanitizeTitle(title);
  const sanitizedCover = sanitizeCover(coverUri);
  const next: RecentWishlistEntry[] = [
    {
      id: trimmed,
      title: sanitizedTitle,
      coverUri: sanitizedCover,
      updatedAt: Date.now(),
    },
    ...current.filter((entry) => entry.id !== trimmed),
  ];
  await updateCache(key, next);
}

export async function getRecentWishlists(
  userId: string | null | undefined,
  limitResults: number = MAX_DISPLAY,
): Promise<RecentWishlistEntry[]> {
  const key = userKey(userId);
  await ensureCache(key);
  return (cache.get(key) ?? []).slice(0, limitResults);
}

export function subscribeRecentWishlists(
  userId: string | null | undefined,
  callback: Listener,
): () => void {
  const key = userKey(userId);
  const listeners = subscribers.get(key) ?? new Set<Listener>();
  listeners.add(callback);
  subscribers.set(key, listeners);
  void ensureCache(key)
    .then(() => callback((cache.get(key) ?? []).slice(0, MAX_DISPLAY)))
    .catch(() => callback([]));
  if (userId && !remoteHydrated.has(key)) {
    void hydrateRecentWishlists(userId).catch(() => {
      /* ignore */
    });
  }
  return () => {
    const set = subscribers.get(key);
    if (!set) return;
    set.delete(callback);
    if (!set.size) {
      subscribers.delete(key);
    }
  };
}

async function fetchRemoteEntries(userId: string): Promise<RecentWishlistEntry[]> {
  const viaApi = await fetchRecentViaApi(userId);
  if (viaApi) return viaApi;
  if (!db) return [];
  try {
    const coll = collection(db, 'users', userId, 'recentWishlists');
    const snap = await getDocs(
      query(coll, orderBy('updatedAt', 'desc'), limit(MAX_STORAGE)),
    );
    const entries: RecentWishlistEntry[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as DocumentData | undefined;
      const id = docSnap.id;
      if (typeof id !== 'string' || !id.length) return;
      entries.push({
        id,
        title: sanitizeTitle(data?.title),
        coverUri: sanitizeCover(data?.coverUri),
        updatedAt: toMillis(data?.updatedAt),
      });
    });
    return normalizeEntries(entries);
  } catch (err) {
    logger.warn('recentWishlists remote fetch failed', err, { userId });
    return [];
  }
}

async function fetchRecentViaApi(
  userId: string,
): Promise<RecentWishlistEntry[] | null> {
  if (typeof fetch !== 'function') return null;
  const currentUser = auth?.currentUser;
  if (!currentUser || currentUser.uid !== userId) return null;
  try {
    const token = await currentUser.getIdToken();
    const url = functionUrl('recentlists');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      logger.warn('recentWishlists API fetch failed', {
        status: response.status,
      });
      return null;
    }
    const payload = (await response.json()) as {
      items?: {
        id?: string;
        title?: string | null;
        coverUri?: string | null;
        updatedAt?: number;
      }[];
    };
    if (!payload?.items?.length) return [];
    const mapped = payload.items
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        title: sanitizeTitle(item.title ?? null),
        coverUri: sanitizeCover(item.coverUri ?? null),
        updatedAt: toMillis(item.updatedAt),
      }))
      .filter((entry) => entry.id.length);
    return normalizeEntries(mapped);
  } catch (err) {
    logger.warn('recentWishlists API fetch errored', err, { userId });
    return null;
  }
}

export async function hydrateRecentWishlists(userId: string): Promise<void> {
  const key = userKey(userId);
  await ensureCache(key);
  if (remoteHydrated.has(key)) return;
  if (!db) {
    remoteHydrated.add(key);
    return;
  }
  try {
    const remoteEntries = await fetchRemoteEntries(userId);
    const current = cache.get(key) ?? [];
    const merged = new Map<string, RecentWishlistEntry>();
    current.forEach((entry) => merged.set(entry.id, entry));
    remoteEntries.forEach((entry) => {
      const existing = merged.get(entry.id);
      if (!existing || existing.updatedAt < entry.updatedAt) {
        merged.set(entry.id, entry);
      }
    });
    await updateCache(key, Array.from(merged.values()));
  } finally {
    remoteHydrated.add(key);
  }
}

export async function flushRecentWishlists(userId: string): Promise<void> {
  if (!db) return;
  const key = userKey(userId);
  await ensureCache(key);
  if (pendingSync.has(key)) return;
  const entries = cache.get(key) ?? [];
  if (!entries.length) return;
  pendingSync.add(key);
  try {
    const coll = collection(db, 'users', userId, 'recentWishlists');
    const batch = writeBatch(db);
    entries.slice(0, MAX_STORAGE).forEach((entry) => {
      const ref = doc(coll, entry.id);
      batch.set(
        ref,
        {
          title: entry.title ?? null,
          coverUri: entry.coverUri ?? null,
          updatedAt: Timestamp.fromMillis(entry.updatedAt),
        },
        { merge: true },
      );
    });
    await batch.commit();
  } catch (err) {
    logger.warn('recentWishlists sync failed', err, { userId });
  } finally {
    pendingSync.delete(key);
  }
}

export async function clearRecentWishlists(
  userId: string | null | undefined,
): Promise<void> {
  const key = userKey(userId);
  cache.delete(key);
  remoteHydrated.delete(key);
  loadPromises.delete(key);
  await removeBucket(key);
  notify(key);
}

export async function __resetRecentWishlistsForTests(): Promise<void> {
  cache.clear();
  subscribers.clear();
  remoteHydrated.clear();
  pendingSync.clear();
  const keys = Array.from(loadPromises.keys());
  loadPromises.clear();
  await Promise.all(
    keys.map((key) =>
      removeBucket(key).catch(() => {
        /* ignore */
      }),
    ),
  );
}

export const __internal = {
  MAX_DISPLAY,
  MAX_STORAGE,
};
