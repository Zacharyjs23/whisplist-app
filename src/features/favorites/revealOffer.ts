import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { db } from '@/firebase';
import * as logger from '@/shared/logger';

export type FavoriteState = 'hidden' | 'revealed' | 'expired';

export interface FavoriteRecord {
  id: string;
  ownerId: string;
  state: FavoriteState;
  couponCode?: string | null;
  expiresAt?: number | null;
  revealedAt?: number | null;
}

export type RevealOfferResult = {
  couponCode: string;
  alreadyRevealed: boolean;
};

export type RevealOfferErrorCode =
  | 'invalid_user'
  | 'invalid_favorite'
  | 'not_found'
  | 'permission_denied'
  | 'rate_limited'
  | 'expired'
  | 'invalid_state';

export class RevealOfferError extends Error {
  public readonly code: RevealOfferErrorCode;

  constructor(code: RevealOfferErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'RevealOfferError';
  }
}

type RevealOfferDependencies = {
  loadFavorite: (favId: string) => Promise<FavoriteRecord | null>;
  saveFavorite: (
    favId: string,
    updates: Partial<FavoriteRecord>,
  ) => Promise<void>;
  assertPermission: (
    user: { uid: string },
    favorite: FavoriteRecord,
  ) => Promise<void>;
  ensureRateLimit: (userId: string, favId: string) => Promise<void>;
  logAudit: (event: Record<string, unknown>) => Promise<void>;
  emitMetric: (
    metric: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  generateCouponCode: (
    favorite: FavoriteRecord,
    user: { uid: string },
  ) => Promise<string>;
  markExpired?: (favId: string, favorite: FavoriteRecord) => Promise<void>;
};

const FAVORITES_COLLECTION = 'anonFavorites';

function coerceMillis(input: unknown): number | null {
  if (!input) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input instanceof Date) return input.getTime();
  if (
    typeof (input as { toMillis?: () => number })?.toMillis === 'function'
  ) {
    try {
      return (input as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof (input as { toDate?: () => Date })?.toDate === 'function') {
    try {
      const value = (input as { toDate: () => Date }).toDate().getTime();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }
  if (typeof input === 'string') {
    const parsed = Date.parse(input);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const favoriteConverter: FirestoreDataConverter<FavoriteRecord> = {
  toFirestore(favorite: FavoriteRecord) {
    return {
      ownerId: favorite.ownerId,
      state: favorite.state,
      couponCode: favorite.couponCode ?? null,
      expiresAt: favorite.expiresAt ? new Date(favorite.expiresAt) : null,
      revealedAt: favorite.revealedAt ? new Date(favorite.revealedAt) : null,
    };
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ownerId: (data.ownerId as string) ?? '',
      state: (data.state as FavoriteState) ?? 'hidden',
      couponCode: (data.couponCode as string | null | undefined) ?? null,
      expiresAt: coerceMillis(data.expiresAt),
      revealedAt: coerceMillis(data.revealedAt),
    };
  },
};

function createDefaultDependencies(): RevealOfferDependencies {
  return {
    async loadFavorite(favId: string) {
      if (!db) return null;
      const ref = doc(db, FAVORITES_COLLECTION, favId).withConverter(
        favoriteConverter,
      );
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
    async saveFavorite(favId: string, updates: Partial<FavoriteRecord>) {
      if (!db) return;
      const ref = doc(db, FAVORITES_COLLECTION, favId);
      await setDoc(
        ref,
        {
          ...updates,
          revealedAt: updates.revealedAt
            ? new Date(updates.revealedAt)
            : updates.revealedAt ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    },
    async assertPermission(user, favorite) {
      if (!user?.uid) {
        throw new RevealOfferError('invalid_user', 'User is required');
      }
      if (favorite.ownerId && favorite.ownerId !== user.uid) {
        throw new RevealOfferError(
          'permission_denied',
          'Favorite not owned by user',
        );
      }
    },
    async ensureRateLimit() {
      // Default implementation is a no-op; platform deployments can override.
    },
    async logAudit(event) {
      logger.log('audit:fav_reveal', event);
    },
    async emitMetric(metric, payload) {
      logger.log(`metric:${metric}`, payload);
    },
    async generateCouponCode() {
      return `CPN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    },
    async markExpired(favId, favorite) {
      if (!db) return;
      const ref = doc(db, FAVORITES_COLLECTION, favId);
      await setDoc(
        ref,
        {
          state: 'expired',
          expiredAt: serverTimestamp(),
          couponCode: favorite.couponCode ?? null,
        },
        { merge: true },
      );
    },
  };
}

let dependencies: RevealOfferDependencies = createDefaultDependencies();

export function setRevealOfferDependencies(
  overrides: Partial<RevealOfferDependencies>,
) {
  dependencies = { ...dependencies, ...overrides };
}

export function resetRevealOfferDependencies() {
  dependencies = createDefaultDependencies();
}

function assertFavId(favId: string | null | undefined): string {
  if (!favId || typeof favId !== 'string' || !favId.trim()) {
    throw new RevealOfferError('invalid_favorite', 'Favorite id required');
  }
  return favId.trim();
}

function assertUser(user: { uid?: string } | null | undefined): {
  uid: string;
} {
  if (!user?.uid) {
    throw new RevealOfferError('invalid_user', 'User id required');
  }
  return { uid: user.uid };
}

function isExpired(favorite: FavoriteRecord): boolean {
  if (favorite.state === 'expired') return true;
  const expMillis = coerceMillis(favorite.expiresAt);
  if (expMillis && expMillis <= Date.now()) {
    return true;
  }
  return false;
}

export async function revealOffer(
  user: { uid?: string } | null | undefined,
  favoriteId: string | null | undefined,
): Promise<RevealOfferResult> {
  const typedUser = assertUser(user);
  const favId = assertFavId(favoriteId);

  await dependencies.ensureRateLimit(typedUser.uid, favId);

  const favorite = await dependencies.loadFavorite(favId);
  if (!favorite) {
    throw new RevealOfferError('not_found', 'Favorite not found');
  }

  await dependencies.assertPermission(typedUser, favorite);

  if (isExpired(favorite)) {
    await dependencies.markExpired?.(favId, favorite);
    throw new RevealOfferError('expired', 'Favorite offer expired');
  }

  const existingCode =
    favorite.couponCode && favorite.couponCode.trim().length
      ? favorite.couponCode
      : null;

  if (favorite.state === 'revealed') {
    const couponCode = existingCode ?? (await dependencies.generateCouponCode(favorite, typedUser));
    await dependencies.logAudit({
      type: 'favorite_reveal_duplicate',
      favId,
      userId: typedUser.uid,
      couponCode,
    });
    await dependencies.emitMetric('favorite_reveal_duplicate', {
      favId,
      userId: typedUser.uid,
    });
    return { couponCode, alreadyRevealed: true };
  }

  if (favorite.state !== 'hidden') {
    throw new RevealOfferError(
      'invalid_state',
      `Cannot reveal favorite in state ${favorite.state}`,
    );
  }

  const couponCode =
    existingCode ?? (await dependencies.generateCouponCode(favorite, typedUser));

  const revealedAt = Date.now();
  await dependencies.saveFavorite(favId, {
    state: 'revealed',
    couponCode,
    revealedAt,
  });

  await dependencies.logAudit({
    type: 'favorite_revealed',
    favId,
    userId: typedUser.uid,
    couponCode,
    revealedAt,
  });
  await dependencies.emitMetric('favorite_revealed', {
    favId,
    userId: typedUser.uid,
    couponCode,
  });

  return { couponCode, alreadyRevealed: false };
}

export const __testing = {
  coerceMillis,
  isExpired,
};
