const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      Promise.resolve(
        Object.prototype.hasOwnProperty.call(mockStorage, key)
          ? mockStorage[key]
          : null,
      ),
    ),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
  __testing: {
    reset() {
      Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    },
  },
}));

jest.mock('@/firebase', () => ({
  db: null,
  auth: { currentUser: null },
}));

jest.mock('firebase/firestore', () => {
  class Timestamp {
    private readonly millis: number;
    constructor(seconds: number, nanos: number) {
      this.millis = seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
    toMillis() {
      return this.millis;
    }
    static fromMillis(ms: number) {
      const seconds = Math.floor(ms / 1000);
      const nanos = (ms % 1000) * 1_000_000;
      return new Timestamp(seconds, nanos);
    }
  }

  const queryStub = jest.fn();
  return {
    collection: jest.fn(),
    doc: jest.fn(),
    getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
    limit: jest.fn(() => ({ limit: true })),
    orderBy: jest.fn(() => ({ order: true })),
    query: jest.fn(() => queryStub),
    Timestamp,
    writeBatch: jest.fn(() => ({
      set: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  };
});

import {
  __resetRecentWishlistsForTests,
  getRecentWishlists,
  recordRecentWishlistView,
} from '@/src/features/wishlist/recentService';

describe('recentlists service', () => {
  const asyncStorage = require('@react-native-async-storage/async-storage');
  const userId = 'tester-1';

  beforeEach(async () => {
    asyncStorage.__testing.reset();
    await __resetRecentWishlistsForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps only the 10 most recent entries in order', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1_000;
      return now;
    });

    for (let i = 0; i < 12; i += 1) {
      await recordRecentWishlistView({
        userId,
        wishlistId: `list-${i}`,
        title: `Wish ${i}`,
      });
    }

    const recents = await getRecentWishlists(userId);
    expect(recents).toHaveLength(10);
    expect(recents[0].id).toBe('list-11');
    expect(recents[9].id).toBe('list-2');
  });

  it('deduplicates entries and promotes the latest view', async () => {
    let now = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 5_000;
      return now;
    });

    await recordRecentWishlistView({
      userId,
      wishlistId: 'alpha',
      title: 'Alpha',
    });
    await recordRecentWishlistView({
      userId,
      wishlistId: 'beta',
      title: 'Beta',
    });
    await recordRecentWishlistView({
      userId,
      wishlistId: 'alpha',
      title: 'Alpha updated',
    });

    const recents = await getRecentWishlists(userId);
    expect(recents).toHaveLength(2);
    expect(recents[0]).toMatchObject({ id: 'alpha', title: 'Alpha updated' });
    expect(recents[1].id).toBe('beta');
  });
});
