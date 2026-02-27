const mockStorage: Record<string, string> = {};
const mockListeners = new Map<
  string,
  Set<(snapshot: { docs: { id: string; data: () => any }[] }) => void>
>();
const mockStore = new Map<string, any>();

function mockNotify(path: string) {
  const callbacks = mockListeners.get(path);
  if (!callbacks?.size) return;
  const docs = Array.from(mockStore.entries())
    .filter(([key]) => key.startsWith(`${path}/`))
    .map(([key, value]) => {
      const id = key.slice(path.length + 1);
      return {
        id,
        data: () => ({ ...value }),
      };
    })
    .sort((a, b) => {
      const left = typeof a.data().pinnedAt === 'number' ? a.data().pinnedAt : 0;
      const right =
        typeof b.data().pinnedAt === 'number' ? b.data().pinnedAt : 0;
      return right - left;
    });
  callbacks.forEach((cb) => {
    setTimeout(() => cb({ docs }), 0);
  });
}

function mockResolvePath(segments: string[]): string {
  return segments
    .map((seg) => `${seg}`)
    .filter((seg) => seg.length)
    .join('/');
}

const mockApplyServerTimestamp = (data: Record<string, any>) => {
  if (data.pinnedAt && data.pinnedAt.__serverTimestamp) {
    return {
      ...data,
      pinnedAt: Date.now(),
    };
  }
  return data;
};

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      Promise.resolve(Object.prototype.hasOwnProperty.call(mockStorage, key) ? mockStorage[key] : null),
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

  const collection = (db: any, ...segments: string[]) => ({
    path: mockResolvePath(segments),
  });

  const doc = (db: any, ...segments: string[]) => {
    const path = mockResolvePath(segments);
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const id = segments[segments.length - 1];
    return { path, parentPath, id };
  };

  const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => ({
    field,
    direction,
  });

  const query = (
    target: { path: string },
    ...clauses: { field: string; direction: 'asc' | 'desc' }[]
  ) => ({
    path: target.path,
    orderBy: clauses.find((clause) => clause.field) ?? null,
  });

  const getDocs = async (q: { path: string }) => {
    const docs = Array.from(mockStore.entries())
      .filter(([key]) => key.startsWith(`${q.path}/`))
      .map(([key, value]) => {
        const id = key.slice(q.path.length + 1);
        return {
          id,
          data: () => ({ ...value }),
        };
      })
      .sort((a, b) => {
        const left = typeof a.data().pinnedAt === 'number' ? a.data().pinnedAt : 0;
        const right =
          typeof b.data().pinnedAt === 'number' ? b.data().pinnedAt : 0;
        return right - left;
      });
    return { docs };
  };

  const onSnapshot = (
    q: { path: string },
    onNext: (snapshot: { docs: { id: string; data: () => any }[] }) => void,
    onError?: (err: any) => void,
  ) => {
    const set = mockListeners.get(q.path) ?? new Set();
    set.add(onNext);
    mockListeners.set(q.path, set);
    try {
      mockNotify(q.path);
    } catch (err) {
      onError?.(err);
    }
    return () => {
      const current = mockListeners.get(q.path);
      if (!current) return;
      current.delete(onNext);
      if (!current.size) {
        mockListeners.delete(q.path);
      }
    };
  };

  const setDoc = async (
    ref: { path: string; parentPath: string },
    data: Record<string, any>,
    options?: { merge?: boolean },
  ) => {
    const prev = mockStore.get(ref.path) || {};
    const next =
      options?.merge && mockStore.has(ref.path)
        ? { ...prev, ...mockApplyServerTimestamp(data) }
        : mockApplyServerTimestamp(data);
    mockStore.set(ref.path, next);
    mockNotify(ref.parentPath);
  };

  const deleteDoc = async (ref: { path: string; parentPath: string }) => {
    mockStore.delete(ref.path);
    mockNotify(ref.parentPath);
  };

  const runTransaction = async (
    _db: any,
    updateFn: (tx: {
      get: (ref: { path: string }) => Promise<{
        exists: () => boolean;
        data: () => any;
      }>;
      set: (
        ref: { path: string; parentPath: string },
        data: Record<string, any>,
        options?: { merge?: boolean },
      ) => void;
      delete: (ref: { path: string; parentPath: string }) => void;
    }) => Promise<any> | any,
  ) => {
    const mutations: (() => void)[] = [];
    const tx = {
      get: async (ref: { path: string }) => {
        const data = mockStore.get(ref.path);
        return {
          exists: () => data !== undefined,
          data: () => (data ? { ...data } : undefined),
        };
      },
      set: (
        ref: { path: string; parentPath: string },
        data: Record<string, any>,
        options?: { merge?: boolean },
      ) => {
        mutations.push(() =>
          setDoc(ref, data, options).catch(() => {
            /* noop */
          }),
        );
      },
      delete: (ref: { path: string; parentPath: string }) => {
        mutations.push(() =>
          deleteDoc(ref).catch(() => {
            /* noop */
          }),
        );
      },
    };
    const result = await updateFn(tx);
    // Apply mutations synchronously to maintain order for tests.
    for (const mutate of mutations) {
      await mutate();
    }
    return result;
  };

  const serverTimestamp = () => ({ __serverTimestamp: true });

  return {
    __esModule: true,
    collection,
    doc,
    orderBy,
    query,
    getDocs,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    deleteDoc,
    setDoc,
    Timestamp,
    __testing: {
      reset() {
        mockListeners.clear();
        mockStore.clear();
      },
    },
  };
});

jest.mock('@/firebase', () => ({
  __esModule: true,
  db: {},
}));

const loadController = () => {
  let mod: typeof import('../src/features/wishlist/pinController');
  jest.isolateModules(() => {
    mod = require('../src/features/wishlist/pinController') as typeof import('../src/features/wishlist/pinController');
  });
  return mod!;
};

describe('pinController integration', () => {
  beforeEach(() => {
    const firestore = require('firebase/firestore');
    firestore.__testing.reset();
    const asyncStorage = require('@react-native-async-storage/async-storage');
    asyncStorage.__testing.reset();
  });

  it('persists pins across restart', async () => {
    const controllerA = loadController();
    const { bootstrapPins, upsertPin, getPins } = controllerA;
    const updates: any[] = [];

    const bootstrap = await bootstrapPins('user-1', (pins) => {
      updates.push(pins);
    });
    expect(Array.isArray(bootstrap.initial)).toBe(true);
    expect(bootstrap.initial.length).toBe(0);

    await upsertPin('user-1', 'wish-1', { title: 'Birthday Club' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pinsBeforeRestart = await getPins('user-1');
    expect(pinsBeforeRestart).toHaveLength(1);
    expect(pinsBeforeRestart[0].title).toBe('Birthday Club');

    expect(updates.at(-1)).toBeDefined();
    expect(updates.at(-1)?.[0]?.wishlistId).toBe('wish-1');

    bootstrap.unsubscribe();

    const controllerB = loadController();
    const pinsAfterRestart = await controllerB.getPins('user-1');
    expect(pinsAfterRestart).toHaveLength(1);
    expect(pinsAfterRestart[0]).toMatchObject({
      wishlistId: 'wish-1',
      title: 'Birthday Club',
    });
  });
});
