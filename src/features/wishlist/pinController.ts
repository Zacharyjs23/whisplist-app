import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import * as logger from '@/shared/logger';

export type PinRecord = {
  id: string;
  wishlistId: string;
  pinnedAt: number;
  title: string | null;
  coverUri: string | null;
};

type CacheEntry = {
  pins: PinRecord[];
  fetchedAt: number;
};

type ListenerEntry = {
  unsubscribe: Unsubscribe | null;
  callbacks: Set<(pins: PinRecord[]) => void>;
};

const STORAGE_PREFIX = 'wishlist:pins:v1:';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const memoryCache = new Map<string, CacheEntry>();
const listeners = new Map<string, ListenerEntry>();

const isWeb = Platform.OS === 'web';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function coerceTimestamp(input: unknown): number {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : Date.now();
  }
  if (typeof input === 'string') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
    const dateParsed = new Date(input).getTime();
    return Number.isFinite(dateParsed) ? dateParsed : Date.now();
  }
  if (input instanceof Date) {
    const value = input.getTime();
    return Number.isFinite(value) ? value : Date.now();
  }
  if (input instanceof Timestamp) {
    return input.toMillis();
  }
  if (
    input &&
    typeof input === 'object' &&
    typeof (input as { toDate?: () => Date }).toDate === 'function'
  ) {
    try {
      const value = (input as { toDate: () => Date }).toDate().getTime();
      return Number.isFinite(value) ? value : Date.now();
    } catch {
      return Date.now();
    }
  }
  return Date.now();
}

function normalizeDoc(id: string, data: DocumentData | undefined): PinRecord {
  const wishlistId =
    typeof data?.wishlistId === 'string' && data.wishlistId
      ? data.wishlistId
      : id;
  const pinnedAt = coerceTimestamp(data?.pinnedAt);
  const title =
    typeof data?.title === 'string' && data.title.trim().length
      ? data.title.trim()
      : null;
  const coverUri =
    typeof data?.coverUri === 'string' && data.coverUri.trim().length
      ? data.coverUri.trim()
      : null;
  return {
    id,
    wishlistId,
    pinnedAt,
    title,
    coverUri,
  };
}

function sortPins(pins: PinRecord[]): PinRecord[] {
  return [...pins].sort((a, b) => b.pinnedAt - a.pinnedAt);
}

function shallowEqualPins(a: PinRecord[], b: PinRecord[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.wishlistId !== right.wishlistId ||
      left.pinnedAt !== right.pinnedAt ||
      left.title !== right.title ||
      left.coverUri !== right.coverUri
    ) {
      return false;
    }
  }
  return true;
}

async function persistToStorage(
  userId: string,
  pins: PinRecord[],
): Promise<void> {
  try {
    const payload = JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      pins,
    });
    await AsyncStorage.setItem(storageKey(userId), payload);
  } catch (err) {
    logger.warn('Failed to persist pin cache', err, { userId });
  }
}

async function removeFromStorage(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch (err) {
    logger.warn('Failed to clear pin cache storage', err, { userId });
  }
}

async function loadFromStorage(userId: string): Promise<PinRecord[] | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: number;
      pins?: PinRecord[];
    };
    if (!parsed || !Array.isArray(parsed.pins)) return null;
    const normalized = parsed.pins
      .map((p) => ({
        ...p,
        pinnedAt: coerceTimestamp(p.pinnedAt),
      }))
      .filter((p) => typeof p.wishlistId === 'string' && p.wishlistId.length);
    return sortPins(normalized);
  } catch (err) {
    logger.warn('Failed to load pin cache from storage', err, { userId });
    return null;
  }
}

function updateMemoryCache(userId: string, pins: PinRecord[], persist = true) {
  const sorted = sortPins(pins);
  const existing = memoryCache.get(userId);
  if (existing && shallowEqualPins(existing.pins, sorted)) {
    memoryCache.set(userId, { pins: existing.pins, fetchedAt: Date.now() });
    return;
  }
  memoryCache.set(userId, { pins: sorted, fetchedAt: Date.now() });
  if (persist) {
    void persistToStorage(userId, sorted);
  }
}

async function fetchRemotePins(userId: string): Promise<PinRecord[]> {
  try {
    const coll = collection(db, 'users', userId, 'pinnedWishlists');
    const q = query(coll, orderBy('pinnedAt', 'desc'));
    const snap = await getDocs(q);
    const pins = snap.docs.map((docSnap) =>
      normalizeDoc(docSnap.id, docSnap.data()),
    );
    updateMemoryCache(userId, pins);
    return pins;
  } catch (err) {
    logger.error('Failed to fetch pins from Firestore', err, { userId });
    const existing = memoryCache.get(userId);
    return existing ? existing.pins : [];
  }
}

function ensureListener(userId: string): ListenerEntry | null {
  if (!userId) return null;
  const existing = listeners.get(userId);
  if (existing && existing.unsubscribe) {
    return existing;
  }
  const entry: ListenerEntry = existing ?? {
    unsubscribe: null,
    callbacks: new Set(),
  };
  const coll = collection(db, 'users', userId, 'pinnedWishlists');
  const q = query(coll, orderBy('pinnedAt', 'desc')) as Query<DocumentData>;
  entry.unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const pins = snapshot.docs.map((docSnap: QueryDocumentSnapshot) =>
        normalizeDoc(docSnap.id, docSnap.data()),
      );
      updateMemoryCache(userId, pins);
      entry.callbacks.forEach((cb) => {
        try {
          cb(pins);
        } catch (err) {
          logger.warn('Pin listener callback failed', err);
        }
      });
    },
    (error) => {
      logger.warn('Pin listener error', error, { userId });
    },
  );
  listeners.set(userId, entry);
  return entry;
}

export async function getPins(userId: string): Promise<PinRecord[]> {
  if (!userId) return [];
  const entry = memoryCache.get(userId);
  const now = Date.now();
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.pins;
  }
  const cached = await loadFromStorage(userId);
  if (cached && cached.length) {
    updateMemoryCache(userId, cached, false);
    // Refresh in background
    void fetchRemotePins(userId);
    return cached;
  }
  return fetchRemotePins(userId);
}

export function subscribeToPinUpdates(
  userId: string,
  callback: (pins: PinRecord[]) => void,
): () => void {
  if (!userId) return () => {};
  const entry = ensureListener(userId);
  if (!entry) return () => {};
  entry.callbacks.add(callback);
  const cache = memoryCache.get(userId);
  if (cache) {
    try {
      callback(cache.pins);
    } catch (err) {
      logger.warn('Pin listener immediate callback failed', err);
    }
  }
  return () => {
    entry.callbacks.delete(callback);
    if (!entry.callbacks.size) {
      entry.unsubscribe?.();
      listeners.delete(userId);
    }
  };
}

export async function bootstrapPins(
  userId: string,
  onChange?: (pins: PinRecord[]) => void,
): Promise<{
  initial: PinRecord[];
  unsubscribe: () => void;
}> {
  if (!userId) {
    return { initial: [], unsubscribe: () => {} };
  }
  const initial = await getPins(userId);
  if (onChange && initial.length) {
    try {
      onChange(initial);
    } catch (err) {
      logger.warn('Pin bootstrap callback failed', err);
    }
  }
  const unsubscribe = subscribeToPinUpdates(userId, (pins) => {
    if (!onChange) return;
    try {
      onChange(pins);
    } catch (err) {
      logger.warn('Pin listener callback failed', err);
    }
  });
  return { initial, unsubscribe };
}

type PinMeta = {
  title?: string | null;
  coverUri?: string | null;
};

export async function upsertPin(
  userId: string,
  wishlistId: string,
  meta: PinMeta = {},
): Promise<{ pinned: true; pin: PinRecord }> {
  const trimmedUser = userId?.trim();
  const trimmedWish = wishlistId?.trim();
  if (!trimmedUser || !trimmedWish) {
    throw new Error('userId and wishlistId are required');
  }
  const ref = doc(db, 'users', trimmedUser, 'pinnedWishlists', trimmedWish);
  const now = Date.now();
  const localPin: PinRecord = {
    id: trimmedWish,
    wishlistId: trimmedWish,
    pinnedAt: now,
    title: typeof meta.title === 'string' ? meta.title : null,
    coverUri: typeof meta.coverUri === 'string' ? meta.coverUri : null,
  };

  let pinResult: PinRecord = localPin;
  await runTransaction(db as Firestore, async (tx) => {
    const snap = await tx.get(ref);
    const payload: Record<string, unknown> = {
      wishlistId: trimmedWish,
    };
    if (meta.title !== undefined) payload.title = meta.title;
    if (meta.coverUri !== undefined) payload.coverUri = meta.coverUri;
    if (snap.exists()) {
      tx.set(ref, payload, { merge: true });
      const merged = { ...snap.data(), ...payload };
      pinResult = normalizeDoc(trimmedWish, merged);
    } else {
      tx.set(
        ref,
        {
          ...payload,
          pinnedAt: serverTimestamp(),
        },
        { merge: false },
      );
      pinResult = {
        ...localPin,
        ...payload,
      };
    }
  });

  const cache = memoryCache.get(trimmedUser);
  const nextPins = cache ? [...cache.pins] : [];
  const existingIndex = nextPins.findIndex(
    (pin) => pin.wishlistId === trimmedWish,
  );
  if (existingIndex >= 0) {
    nextPins.splice(existingIndex, 1, pinResult);
  } else {
    nextPins.unshift(pinResult);
  }
  updateMemoryCache(trimmedUser, nextPins);
  return { pinned: true, pin: pinResult };
}

export async function removePin(
  userId: string,
  wishlistId: string,
): Promise<void> {
  const trimmedUser = userId?.trim();
  const trimmedWish = wishlistId?.trim();
  if (!trimmedUser || !trimmedWish) return;
  try {
    const ref = doc(db, 'users', trimmedUser, 'pinnedWishlists', trimmedWish);
    await deleteDoc(ref);
  } catch (err) {
    logger.warn('Failed to delete pin', err, {
      userId: trimmedUser,
      wishlistId: trimmedWish,
    });
  }
  const cache = memoryCache.get(trimmedUser);
  if (cache) {
    const nextPins = cache.pins.filter(
      (pin) => pin.wishlistId !== trimmedWish,
    );
    updateMemoryCache(trimmedUser, nextPins);
  }
}

export async function clearPinCache(
  userId?: string,
  options: { removeStorage?: boolean } = {},
): Promise<void> {
  if (!userId) {
    if (options.removeStorage && !isWeb) {
      // Removing all keys is not supported without knowing userId.
      logger.warn('Skipping global pin cache removal without userId');
    }
    return;
  }
  memoryCache.delete(userId);
  const listener = listeners.get(userId);
  if (listener) {
    listener.unsubscribe?.();
    listeners.delete(userId);
  }
  if (options.removeStorage) {
    await removeFromStorage(userId);
  }
}

export const __testing = {
  memoryCache,
  listeners,
  clearAll: async () => {
    listeners.forEach((entry) => entry.unsubscribe?.());
    listeners.clear();
    memoryCache.clear();
  },
};
