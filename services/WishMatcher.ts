import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/firebase';
import { appConfig } from '@/appConfig';
import * as logger from '@/shared/logger';

const DEFAULT_TTL_MS = appConfig.wishMatcher.cacheTtlMs;
const PROCESSING_TIMEOUT_MS = 2 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;

const inflightRefreshes = new Map<string, Promise<unknown>>();
const lastTriggerAt = new Map<string, number>();

const generateWishMatchesCallable = httpsCallable<
  { wishId: string; force?: boolean },
  { status?: string }
>(functions, 'generateWishMatches');

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === 'function') {
      try {
        return candidate.toDate();
      } catch {
        return null;
      }
    }
    if (typeof candidate.seconds === 'number') {
      return new Date(candidate.seconds * 1000);
    }
  }
  return null;
};

export type WishMatch = {
  id: string;
  score: number;
  textPreview: string;
  summary?: string | null;
  reason?: string | null;
  category?: string | null;
  displayName?: string | null;
  matchedAt?: Date | null;
  mood?: string | null;
  tags?: string[];
};

export type WishMatchMetaStatus =
  | 'idle'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'empty';

export type WishMatchMeta = {
  status: WishMatchMetaStatus;
  updatedAt?: Date | null;
  requestedAt?: Date | null;
  error?: string | null;
  matchCount?: number;
  ttlMs?: number;
  model?: string | null;
};

export type WishMatchState = {
  matches: WishMatch[];
  meta: WishMatchMeta | null;
};

const META_STATUSES: readonly WishMatchMetaStatus[] = [
  'idle',
  'processing',
  'ready',
  'failed',
  'empty',
] as const;

const normalizeStatus = (value: unknown): WishMatchMetaStatus =>
  typeof value === 'string' &&
  META_STATUSES.includes(value as WishMatchMetaStatus)
    ? (value as WishMatchMetaStatus)
    : 'idle';

type ListenerOptions = {
  autoRefresh?: boolean;
};

const sanitizeMatchDoc = (docSnap: QueryDocumentSnapshot): WishMatch => {
  const data = docSnap.data() as Record<string, unknown>;
  const fallbackText =
    typeof data.text === 'string' && data.text.trim().length ? data.text : '';
  const textPreview =
    typeof data.textPreview === 'string' && data.textPreview.trim().length
      ? data.textPreview
      : fallbackText;
  return {
    id: docSnap.id,
    score: typeof data.score === 'number' ? data.score : 0,
    textPreview,
    summary: typeof data.summary === 'string' ? data.summary : null,
    reason: typeof data.reason === 'string' ? data.reason : null,
    category: typeof data.category === 'string' ? data.category : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    matchedAt: toDate(data.matchedAt),
    mood: typeof data.mood === 'string' ? data.mood : null,
    tags: Array.isArray(data.tags)
      ? (data.tags as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : undefined,
  };
};

const refreshQueue: Record<string, Promise<void> | undefined> = {};

const requestRefresh = async (wishId: string, force = false): Promise<void> => {
  try {
    const payload = { wishId, force };
    await generateWishMatchesCallable(payload);
  } catch (error) {
    logger.warn('Wish matcher refresh failed', error, { wishId, force });
    throw error;
  }
};

const maybeTriggerRefresh = (wishId: string, meta: WishMatchMeta | null) => {
  const now = Date.now();
  const last = lastTriggerAt.get(wishId);
  if (last && now - last < MIN_REFRESH_INTERVAL_MS) return;
  if (inflightRefreshes.has(wishId)) return;

  const ttlMs =
    meta?.ttlMs && Number.isFinite(meta.ttlMs) && meta.ttlMs > 0
      ? meta.ttlMs
      : DEFAULT_TTL_MS;
  const updatedAtMs = meta?.updatedAt?.getTime?.() ?? 0;
  const requestedAtMs = meta?.requestedAt?.getTime?.() ?? 0;
  const status = meta?.status ?? 'idle';

  const isProcessingTimedOut =
    status === 'processing' &&
    requestedAtMs > 0 &&
    now - requestedAtMs > PROCESSING_TIMEOUT_MS;
  const isStale =
    (status === 'ready' || status === 'empty') &&
    (!updatedAtMs || now - updatedAtMs > ttlMs);
  const shouldTrigger =
    !meta ||
    status === 'idle' ||
    status === 'processing' ||
    isProcessingTimedOut ||
    isStale;

  if (!shouldTrigger) return;

  lastTriggerAt.set(wishId, now);
  const refreshPromise = requestRefresh(
    wishId,
    status === 'processing' && isProcessingTimedOut,
  )
    .catch((error) => {
      logger.warn('Wish matcher auto-refresh error', error, { wishId });
    })
    .finally(() => {
      inflightRefreshes.delete(wishId);
    });
  inflightRefreshes.set(wishId, refreshPromise);
};

export const refreshWishMatches = async (
  wishId: string,
  options: { force?: boolean } = {},
): Promise<void> => {
  if (!wishId) return;
  if (refreshQueue[wishId]) {
    return refreshQueue[wishId];
  }
  const promise = requestRefresh(wishId, options.force === true).finally(() => {
    delete refreshQueue[wishId];
  });
  refreshQueue[wishId] = promise;
  await promise;
};

export const listenWishMatches = (
  wishId: string,
  cb: (state: WishMatchState) => void,
  onError?: (error: unknown) => void,
  options: ListenerOptions = {},
): Unsubscribe => {
  const { autoRefresh = true } = options;
  let currentMeta: WishMatchMeta | null = null;
  let currentMatches: WishMatch[] = [];

  const emit = () => {
    cb({ matches: currentMatches, meta: currentMeta });
  };

  const matchesUnsub = onSnapshot(
    query(
      collection(db, 'wishes', wishId, 'related'),
      orderBy('score', 'desc'),
      limit(5),
    ),
    (snapshot) => {
      currentMatches = snapshot.docs.map(sanitizeMatchDoc);
      emit();
    },
    (error) => {
      onError?.(error);
    },
  );

  const metaRef = doc(db, 'wishes', wishId, 'relatedMeta', 'state');
  const metaUnsub = onSnapshot(
    metaRef,
    (snap) => {
      if (!snap.exists()) {
        currentMeta = null;
      } else {
        const data = snap.data() as Record<string, unknown>;
        currentMeta = {
          status: normalizeStatus(data.status),
          updatedAt: toDate(data.updatedAt),
          requestedAt: toDate(data.requestedAt),
          error: typeof data.error === 'string' ? data.error : null,
          matchCount:
            typeof data.matchCount === 'number' ? data.matchCount : undefined,
          ttlMs:
            typeof data.ttlMs === 'number' && Number.isFinite(data.ttlMs)
              ? (data.ttlMs as number)
              : undefined,
          model: typeof data.model === 'string' ? (data.model as string) : null,
        };
      }
      emit();
      if (autoRefresh) {
        maybeTriggerRefresh(wishId, currentMeta);
      }
    },
    (error) => {
      onError?.(error);
    },
  );

  if (autoRefresh) {
    maybeTriggerRefresh(wishId, currentMeta);
  }

  return () => {
    matchesUnsub();
    metaUnsub();
  };
};
