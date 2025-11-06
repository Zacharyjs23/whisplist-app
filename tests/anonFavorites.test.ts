jest.mock(
  'firebase-functions/v1',
  () => ({
    firestore: {
      document: (_path: string) => ({ onWrite: (handler: any) => handler }),
    },
    https: { onCall: (handler: any) => handler },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }),
  { virtual: true },
);

const statsStore: Record<string, any> = {};
const tokenStore: Record<string, any> = {};

const mockFirestoreInstance = {
  collection: (name: string) => ({
    doc: (id: string) =>
      ({
        id,
        store: name === 'wishStats' ? statsStore : tokenStore,
      }) satisfies { id: string; store: Record<string, any> },
  }),
  runTransaction: async (fn: any) =>
    fn({
      get: async (ref: { id: string; store: Record<string, any> }) => ({
        exists: ref.store[ref.id] != null,
        data: () => ({ ...(ref.store[ref.id] ?? {}) }),
        get: (field: string) => ref.store[ref.id]?.[field],
      }),
      set: (
        ref: { id: string; store: Record<string, any> },
        data: any,
        options?: { merge?: boolean },
      ) => {
        if (options?.merge) {
          ref.store[ref.id] = { ...(ref.store[ref.id] ?? {}), ...data };
        } else {
          ref.store[ref.id] = data;
        }
      },
    }),
};

jest.mock(
  'firebase-admin',
  () => {
    const admin: any = () => ({});
    admin.firestore = jest.fn(() => mockFirestoreInstance);
    return admin;
  },
  { virtual: true },
);

import { favoritesOnWrite, rateLimiter } from '../functions/src/anonFavorites';

type RateLimiterCallable = (
  data: { wishId?: string; anonHash?: string },
  context?: unknown,
) => Promise<{ allowed: boolean; permitExpiresAt: number }>;

const invokeRateLimiter = rateLimiter as unknown as RateLimiterCallable;

const createChange = (before: any | null, after: any | null) => ({
  before: {
    exists: before != null,
    data: () => before,
  },
  after: {
    exists: after != null,
    data: () => after,
    ref: {
      update: jest.fn(),
    },
  },
});

describe('anon favorites functions', () => {
  const now = 1_700_000_000_000;
  let dateNowSpy: jest.SpyInstance;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    Object.keys(statsStore).forEach((key) => delete statsStore[key]);
    Object.keys(tokenStore).forEach((key) => delete tokenStore[key]);
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
  });

  it('increments favorites and stores sample notes', async () => {
    const change = createChange(null, {
      anonHash: 'hashA',
      note: 'Love this wish',
    });
    await favoritesOnWrite(
      change as any,
      { params: { wishId: 'wish1', entryId: 'hashA' } } as any,
    );

    expect(statsStore['wish1']).toEqual(
      expect.objectContaining({
        favorites: 1,
        sampleNotes: ['Love this wish'],
      }),
    );
  });

  it('filters profane notes and requests deletion', async () => {
    const change = createChange(null, {
      anonHash: 'hashB',
      note: 'This is shit',
    });
    const updateSpy = change.after.ref.update as jest.Mock;
    await favoritesOnWrite(
      change as any,
      { params: { wishId: 'wish2', entryId: 'hashB' } } as any,
    );

    expect(statsStore['wish2']).toEqual(
      expect.objectContaining({ favorites: 1, sampleNotes: [] }),
    );
    expect(updateSpy).toHaveBeenCalledWith({ note: null });
  });

  it('decrements favorites on removal and prunes note', async () => {
    statsStore['wish3'] = { favorites: 2, sampleNotes: ['First', 'Second'] };
    const change = createChange({ anonHash: 'hashC', note: 'Second' }, null);
    await favoritesOnWrite(
      change as any,
      { params: { wishId: 'wish3', entryId: 'hashC' } } as any,
    );

    expect(statsStore['wish3']).toEqual(
      expect.objectContaining({ favorites: 1, sampleNotes: ['First'] }),
    );
  });

  it('rateLimiter allows once per hour', async () => {
    const res1 = await invokeRateLimiter(
      { wishId: 'wish4', anonHash: 'hashD' },
      {},
    );
    expect(res1.allowed).toBe(true);
    const docId = 'wish4:hashD';
    expect(tokenStore[docId]).toBeDefined();
    const res2 = await invokeRateLimiter(
      { wishId: 'wish4', anonHash: 'hashD' },
      {},
    );
    expect(res2.allowed).toBe(false);
  });
});
