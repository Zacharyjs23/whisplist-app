jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(() => ({ serverTimestamp: true })),
}));

jest.mock('@/firebase', () => ({ db: null }));

import {
  revealOffer,
  RevealOfferError,
  resetRevealOfferDependencies,
  setRevealOfferDependencies,
  type FavoriteRecord,
} from '@/src/features/favorites/revealOffer';

type User = { uid: string };

describe('revealOffer', () => {
  let store: Map<string, FavoriteRecord>;
  const ensureRateLimit = jest.fn<Promise<void>, [string, string]>();
  const assertPermission = jest.fn<
    Promise<void>,
    [User, FavoriteRecord]
  >();
  const logAudit = jest.fn<Promise<void>, [Record<string, unknown>]>();
  const emitMetric = jest.fn<
    Promise<void>,
    [string, Record<string, unknown>]
  >();
  const generateCouponCode = jest.fn<Promise<string>, [FavoriteRecord, User]>();

  function primeStore(entries: FavoriteRecord[]) {
    store.clear();
    entries.forEach((entry) => {
      store.set(entry.id, { ...entry });
    });
  }

  beforeEach(() => {
    store = new Map();
    ensureRateLimit.mockResolvedValue();
    logAudit.mockResolvedValue();
    emitMetric.mockResolvedValue();
    generateCouponCode.mockResolvedValue('CODE-123');
    assertPermission.mockImplementation(async (user, favorite) => {
      if (favorite.ownerId !== user.uid) {
        throw new RevealOfferError('invalid_user', 'User mismatch');
      }
    });

    setRevealOfferDependencies({
      ensureRateLimit,
      assertPermission,
      logAudit,
      emitMetric,
      generateCouponCode,
      loadFavorite: async (favId: string) =>
        store.has(favId) ? { ...store.get(favId)! } : null,
      saveFavorite: async (favId: string, updates) => {
        const current = store.get(favId);
        if (!current) {
          throw new Error(`Unknown favorite ${favId}`);
        }
        store.set(favId, {
          ...current,
          ...updates,
        } as FavoriteRecord);
      },
    });
  });

  afterEach(() => {
    resetRevealOfferDependencies();
    jest.resetAllMocks();
  });

  it('reveals a hidden favorite and returns coupon code', async () => {
    primeStore([
      {
        id: 'fav-1',
        ownerId: 'user-1',
        state: 'hidden',
      },
    ]);

    const result = await revealOffer({ uid: 'user-1' }, 'fav-1');

    expect(result).toEqual({ couponCode: 'CODE-123', alreadyRevealed: false });
    expect(store.get('fav-1')).toMatchObject({
      state: 'revealed',
      couponCode: 'CODE-123',
    });
    expect(generateCouponCode).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'favorite_revealed',
        favId: 'fav-1',
        userId: 'user-1',
        couponCode: 'CODE-123',
      }),
    );
    expect(emitMetric).toHaveBeenCalledWith(
      'favorite_revealed',
      expect.objectContaining({ favId: 'fav-1', userId: 'user-1' }),
    );
  });

  it('returns existing coupon for duplicate reveal', async () => {
    primeStore([
      {
        id: 'fav-dup',
        ownerId: 'user-1',
        state: 'revealed',
        couponCode: 'EXISTING',
      },
    ]);

    const result = await revealOffer({ uid: 'user-1' }, 'fav-dup');

    expect(result).toEqual({
      couponCode: 'EXISTING',
      alreadyRevealed: true,
    });
    expect(generateCouponCode).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'favorite_reveal_duplicate',
        favId: 'fav-dup',
        userId: 'user-1',
        couponCode: 'EXISTING',
      }),
    );
    expect(emitMetric).toHaveBeenCalledWith(
      'favorite_reveal_duplicate',
      expect.objectContaining({ favId: 'fav-dup', userId: 'user-1' }),
    );
  });

  it('rejects expired favorites', async () => {
    primeStore([
      {
        id: 'fav-exp',
        ownerId: 'user-1',
        state: 'hidden',
        expiresAt: Date.now() - 1000,
      },
    ]);

    await expect(revealOffer({ uid: 'user-1' }, 'fav-exp')).rejects.toThrow(
      RevealOfferError,
    );
    expect(logAudit).not.toHaveBeenCalled();
    expect(store.get('fav-exp')?.state).toBe('hidden');
  });

  it('rejects invalid user', async () => {
    primeStore([
      {
        id: 'fav-owner',
        ownerId: 'user-2',
        state: 'hidden',
      },
    ]);

    await expect(revealOffer({ uid: 'user-1' }, 'fav-owner')).rejects.toThrow(
      RevealOfferError,
    );
    expect(ensureRateLimit).toHaveBeenCalledWith('user-1', 'fav-owner');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('honors rate-limit guard', async () => {
    ensureRateLimit.mockRejectedValueOnce(
      new RevealOfferError('rate_limited', 'Too many attempts'),
    );
    primeStore([
      {
        id: 'fav-rate',
        ownerId: 'user-1',
        state: 'hidden',
      },
    ]);

    await expect(revealOffer({ uid: 'user-1' }, 'fav-rate')).rejects.toThrow(
      RevealOfferError,
    );
    expect(logAudit).not.toHaveBeenCalled();
    expect(emitMetric).not.toHaveBeenCalled();
  });
});
