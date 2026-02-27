const mockApiPost = jest.fn();

type Request = Record<string, any>;
type Response = Record<string, any>;

jest.mock('../services/apiClient', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: () => ({ user: { uid: 'test-user' } }),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock(
  'firebase-functions/v1',
  () => ({
    region: jest.fn(() => ({ https: { onRequest: (handler: any) => handler } })),
    logger: mockLogger,
  }),
  { virtual: true },
);

let currentTimeMs = 1_700_000_000_000;

class MockTimestamp {
  private readonly millis: number;

  constructor(millis: number) {
    this.millis = millis;
  }

  toMillis() {
    return this.millis;
  }

  toDate() {
    return new Date(this.millis);
  }

  static now() {
    return new MockTimestamp(currentTimeMs);
  }

  static fromMillis(millis: number) {
    return new MockTimestamp(millis);
  }

  static fromDate(date: Date) {
    return new MockTimestamp(date.getTime());
  }
}

type DocumentData = Record<string, unknown>;

const store = new Map<string, DocumentData>();

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof MockTimestamp) {
    return new MockTimestamp(value.toMillis()) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => clone(entry)) as unknown as T;
  }
  const next: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, v]) => {
    next[key] = clone(v);
  });
  return next as T;
}

let autoCounter = 0;

class MockDocRef {
  constructor(private readonly path: string) {}

  get id() {
    const segments = this.path.split('/');
    return segments[segments.length - 1]!;
  }

  async get() {
    const data = store.get(this.path);
    return {
      exists: data !== undefined,
      data: () => (data ? clone(data) : undefined),
      get: (field: string) => (data && field in data ? clone(data[field]) : undefined),
      id: this.id,
    };
  }

  set(data: DocumentData) {
    store.set(this.path, clone(data));
    return Promise.resolve();
  }
}

class MockCollection {
  constructor(private readonly name: string) {}

  doc(id?: string) {
    const docId = id ?? `auto-${++autoCounter}`;
    return new MockDocRef(`${this.name}/${docId}`);
  }
}

const mockVerifyIdToken = jest.fn();

const FieldValue = {
  serverTimestamp: jest.fn(() => new MockTimestamp(currentTimeMs)),
};

const mockFirestoreInstance = {
  collection: (name: string) => new MockCollection(name),
  runTransaction: async (callback: (tx: any) => Promise<unknown>) => {
    const tx = {
      get: (ref: MockDocRef) => ref.get(),
      set: (ref: MockDocRef, data: DocumentData) => ref.set(data),
    };
    return callback(tx);
  },
};

const mockFirestoreFn = Object.assign(
  () => mockFirestoreInstance,
  {
    FieldValue,
    Timestamp: MockTimestamp,
  },
);

jest.mock(
  'firebase-admin',
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: mockFirestoreFn,
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
    apps: [],
  }),
  { virtual: true },
);

describe('wishlist creation client guard', () => {
  let wishlistCreationManager: typeof import('../src/features/wishlist/createWishlist').wishlistCreationManager;
  let testUtils: typeof import('../src/features/wishlist/createWishlist').__wishlistCreateTestUtils;

  beforeEach(() => {
    mockApiPost.mockReset();
    Object.values(mockLogger).forEach((fn) => fn.mockReset());
    ({ wishlistCreationManager, __wishlistCreateTestUtils: testUtils } = require('../src/features/wishlist/createWishlist'));
    testUtils.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prevents duplicate submissions while pending', async () => {
    jest.useFakeTimers();
    mockApiPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ok: true, data: { id: 'wl-1' } });
          }, 500);
        }),
    );

    const request = {
      userId: 'user-1',
      draft: {
        title: 'Birthday surprises',
        items: [{ name: 'Confetti' }],
      },
    };

    const first = wishlistCreationManager.submit(request);
    wishlistCreationManager.submit(request);
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(500);
    const result = await first;
    expect(result.id).toBe('wl-1');
  });

  it('reuses idempotency key after a failed attempt', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('network'));
    await expect(
      wishlistCreationManager.submit({
        userId: 'user-2',
        draft: {
          title: 'Travel checklist',
          items: [{ name: 'Passport' }],
        },
      }),
    ).rejects.toThrow('network');

    const firstKey = testUtils.getActiveKey();
    expect(typeof firstKey).toBe('string');

    mockApiPost.mockResolvedValueOnce({ ok: true, data: { id: 'wl-2' } });
    await wishlistCreationManager.submit({
      userId: 'user-2',
      draft: {
        title: 'Travel checklist',
        items: [{ name: 'Passport' }],
      },
    });

    const [, body] = mockApiPost.mock.calls[1]!;
    expect(body).toEqual(
      expect.objectContaining({
        idempotencyKey: firstKey,
      }),
    );
  });
});

describe('handleCreateWishlist', () => {
  let handleCreateWishlist: (req: Request, res: Response) => Promise<void>;

  beforeEach(() => {
    store.clear();
    autoCounter = 0;
    currentTimeMs = 1_700_000_000_000;
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' });
    Object.values(mockLogger).forEach((fn) => fn.mockReset());
    const { __httpApiTest } = require('../functions/src/httpApi');
    handleCreateWishlist = __httpApiTest.handleCreateWishlist;
  });

  function makeReq(
    overrides: Partial<Request> & { body?: any } = {},
  ): Request {
    const base: Partial<Request> = {
      method: 'POST',
      body: {
        userId: 'user-1',
        idempotencyKey: 'attempt-1',
        wishlist: {
          title: 'Weekend groceries',
          items: [{ name: 'Apples', priceCents: 299 }],
        },
      },
      get: jest.fn(() => 'Bearer token'),
    };
    return { ...(base as Request), ...overrides };
  }

  function makeRes(): Response {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    return res as Response;
  }

  function getWishlistDocs() {
    return Array.from(store.entries()).filter(([path]) =>
      path.startsWith('wishlists/'),
    );
  }

  it('creates a wishlist and stores idempotency key', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleCreateWishlist(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: { id: expect.any(String) },
    });

    const wishlists = getWishlistDocs();
    expect(wishlists).toHaveLength(1);

    const [keyPath, keyDoc] = Array.from(store.entries()).find(([path]) =>
      path.startsWith('idempotencyKeys/'),
    )!;
    expect(keyPath).toBe('idempotencyKeys/user-1_attempt-1');
    expect(keyDoc).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        wishlistId: res.json.mock.calls[0]![0].data.id,
      }),
    );
  });

  it('returns existing wishlist on repeat within window', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleCreateWishlist(req, res);
    const createdId = res.json.mock.calls[0]![0].data.id;

    const repeatRes = makeRes();
    await handleCreateWishlist(makeReq(), repeatRes);

    expect(repeatRes.status).toHaveBeenCalledWith(200);
    expect(repeatRes.json).toHaveBeenCalledWith({
      ok: true,
      data: { id: createdId },
    });
    expect(getWishlistDocs()).toHaveLength(1);
  });

  it('detects conflicting payloads', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleCreateWishlist(req, res);

    const conflictReq = makeReq({
      body: {
        userId: 'user-1',
        idempotencyKey: 'attempt-1',
        wishlist: {
          title: 'Different title',
          items: [{ name: 'Apples', priceCents: 299 }],
        },
      },
    });
    const conflictRes = makeRes();
    await handleCreateWishlist(conflictReq, conflictRes);

    expect(conflictRes.status).toHaveBeenCalledWith(409);
    expect(conflictRes.json).toHaveBeenCalledWith({
      ok: false,
      error: 'IDEMPOTENCY_CONFLICT',
    });
    expect(getWishlistDocs()).toHaveLength(1);
  });

  it('allows new wishlist after TTL expiry', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleCreateWishlist(req, res);
    const firstId = res.json.mock.calls[0]![0].data.id;

    currentTimeMs += 31_000;

    const retryRes = makeRes();
    await handleCreateWishlist(makeReq(), retryRes);
    const secondId = retryRes.json.mock.calls[0]![0].data.id;

    expect(secondId).not.toBe(firstId);
    expect(getWishlistDocs()).toHaveLength(2);
  });
});
