jest.mock('@/firebase', () => ({ db: {} }));
jest.mock('@/helpers/followers', () => ({ getFollowingIds: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  deleteDoc: jest.fn(),
}));

import { getFollowingIds } from '@/helpers/followers';
import {
  listenTrendingWishes,
  listenWishes,
  getTopBoostedCreators,
  createBoostCheckout,
  createGiftCheckout,
  deleteWish,
} from '@/helpers/wishes';
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  getDocs,
  doc,
  deleteDoc,
} from 'firebase/firestore';

describe('listenTrendingWishes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries top liked wishes and maps data', () => {
    const docs = [
      { id: '1', data: () => ({ text: 'a' }) },
      { id: '2', data: () => ({ text: 'b' }) },
    ];
    (onSnapshot as jest.Mock).mockImplementation((q, cb) => {
      cb({ docs });
      return jest.fn();
    });

    const cb = jest.fn();
    listenTrendingWishes(cb);

    expect(collection).toHaveBeenCalledWith({}, 'wishes');
    expect(orderBy).toHaveBeenCalledWith('likes', 'desc');
    expect(limit).toHaveBeenCalledWith(20);
    expect(onSnapshot).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([
      { id: '1', text: 'a' },
      { id: '2', text: 'b' },
    ]);
  });
});

describe('listenWishes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('combines boosted and followed wishes and unsubscribes', async () => {
    (getFollowingIds as jest.Mock).mockResolvedValue(['u1', 'u2']);

    const boostedDocs = [{ id: 'b1', data: () => ({ text: 'boosted' }) }];
    const normalDocs = [{ id: 'n1', data: () => ({ text: 'normal' }) }];
    const unsubBoosted = jest.fn();
    const unsubNormal = jest.fn();

    (onSnapshot as jest.Mock)
      .mockImplementationOnce((q, cb) => {
        cb({ docs: boostedDocs });
        return unsubBoosted;
      })
      .mockImplementationOnce((q, cb) => {
        cb({ docs: normalDocs });
        return unsubNormal;
      });

    const cb = jest.fn();
    const unsub = listenWishes('user1', cb);
    await Promise.resolve();

    expect(getFollowingIds).toHaveBeenCalledWith('user1');
    expect(where).toHaveBeenCalledWith('boostedUntil', '>', expect.any(Date));
    expect(orderBy).toHaveBeenCalledWith('boostedUntil', 'desc');
    expect(where).toHaveBeenCalledWith('userId', 'in', ['u1', 'u2']);
    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');

    expect(cb).toHaveBeenNthCalledWith(1, [{ id: 'b1', text: 'boosted' }]);
    expect(cb).toHaveBeenNthCalledWith(2, [
      { id: 'b1', text: 'boosted' },
      { id: 'n1', text: 'normal' },
    ]);

    unsub();
    expect(unsubBoosted).toHaveBeenCalled();
    expect(unsubNormal).toHaveBeenCalled();
  });
});

describe('getTopBoostedCreators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aggregates boosted wishes by creator', async () => {
    const docs = [
      { data: () => ({ userId: 'u1', displayName: 'A' }) },
      { data: () => ({ userId: 'u1', displayName: 'A' }) },
      { data: () => ({ userId: 'u2', displayName: 'B' }) },
    ];
    (getDocs as jest.Mock).mockResolvedValue({
      forEach: (fn: any) => docs.forEach((d) => fn(d)),
    });

    const creators = await getTopBoostedCreators();

    expect(getDocs).toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith('boostedUntil', '>=', expect.any(Date));
    expect(creators).toEqual([
      { userId: 'u1', displayName: 'A', count: 2 },
      { userId: 'u2', displayName: 'B', count: 1 },
    ]);
  });
});

describe('checkout helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'testproj';
  });

  it('createBoostCheckout posts to function and returns url and sessionId', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: async () => ({ url: 'http://boost', sessionId: 'sess' }),
    });

    const result = await createBoostCheckout(
      'wish1',
      'user1',
      5,
      'http://success',
      'http://cancel',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://us-central1-testproj.cloudfunctions.net/createCheckoutSession',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wishId: 'wish1',
          userId: 'user1',
          amount: 5,
          successUrl: 'http://success',
          cancelUrl: 'http://cancel',
        }),
      },
    );
    expect(result).toEqual({ url: 'http://boost', sessionId: 'sess' });
  });

  it('createGiftCheckout posts to function and returns url', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: async () => ({ url: 'http://gift' }),
    });

    const result = await createGiftCheckout(
      'wish1',
      5,
      'user2',
      'http://gift-success',
      'http://gift-cancel',
      'supporter-1',
    );

    expect(global.fetch).toHaveBeenCalled();
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://us-central1-testproj.cloudfunctions.net/createGiftCheckoutSession',
    );
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({
      wishId: 'wish1',
      amount: 5,
      recipientId: 'user2',
      successUrl: 'http://gift-success',
      cancelUrl: 'http://gift-cancel',
      supporterId: 'supporter-1',
    });
    expect(result).toEqual({ url: 'http://gift' });
  });
});

describe('deleteWish', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes wish successfully', async () => {
    (doc as jest.Mock).mockReturnValue('ref');
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
    await deleteWish('w1');
    expect(doc).toHaveBeenCalledWith({}, 'wishes', 'w1');
    expect(deleteDoc).toHaveBeenCalledWith('ref');
  });

  it('throws on unauthorized deletion', async () => {
    const err = new Error('denied');
    (doc as jest.Mock).mockReturnValue('ref');
    (deleteDoc as jest.Mock).mockRejectedValue(err);
    await expect(deleteWish('w1')).rejects.toThrow(err);
  });
});
