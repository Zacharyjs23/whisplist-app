import { createHash } from 'node:crypto';
const mockCreateManualPaymentIntent = jest.fn();
const mockNotifyOwnerOfPledge = jest.fn();
const mockLogPledgeCreated = jest.fn();
const mockAssertGiftPotEnabled = jest.fn();

type Store = Map<string, any>;

const store: Store = new Map();

const autoId = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return `mock-${counter.toString(16)}`;
  };
})();

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
    result[key] = deepClone(val);
  });
  return result as unknown as T;
}

class MockDocumentRef {
  constructor(private readonly path: string) {}

  get id() {
    const segments = this.path.split('/');
    return segments[segments.length - 1]!;
  }

  async get() {
    const data = store.get(this.path);
    return {
      exists: data !== undefined,
      data: () => (data ? deepClone(data) : undefined),
      get: (field: string) => data?.[field],
    };
  }

  async set(data: Record<string, any>, options?: { merge?: boolean }) {
    const current = options?.merge ? store.get(this.path) ?? {} : {};
    const next = { ...(deepClone(current) as Record<string, any>) };
    Object.entries(data ?? {}).forEach(([key, value]) => {
      if (value instanceof Date) {
        next[key] = new Date(value.getTime());
      } else {
        next[key] = deepClone(value);
      }
    });
    store.set(this.path, next);
  }

  async create(data: Record<string, any>) {
    if (store.has(this.path)) {
      const error: { code: string } = { code: 'already-exists' };
      throw error;
    }
    await this.set(data);
  }

  collection(name: string) {
    return new MockCollection(`${this.path}/${name}`);
  }
}

class MockCollection {
  constructor(private readonly path: string) {}

  doc(id?: string) {
    const docId = id ?? autoId();
    return new MockDocumentRef(`${this.path}/${docId}`);
  }
}

jest.mock(
  'firebase-admin',
  () => {
    const FieldValue = {
      serverTimestamp: jest.fn(() => new Date()),
    };
    const firestoreInstance = {
      collection: (name: string) => new MockCollection(name),
    };
    const firestore = jest.fn(() => firestoreInstance);
    (firestore as any).FieldValue = FieldValue;

    return {
      __esModule: true,
      initializeApp: jest.fn(),
      credential: { applicationDefault: jest.fn() },
      firestore,
      apps: [],
    };
  },
  { virtual: true },
);

jest.mock(
  'firebase-functions/v1',
  () => {
    class MockHttpsError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }
    const passThrough = (handler: any) => handler;
    const region = jest.fn(() => ({ https: { onCall: passThrough } }));
    return {
      __esModule: true,
      https: { HttpsError: MockHttpsError },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      runWith: jest.fn(() => ({
        region,
        https: { onCall: passThrough },
      })),
      region,
    };
  },
  { virtual: true },
);

jest.mock(
  '../functions/src/payments/stripe',
  () => ({
    createManualPaymentIntent: mockCreateManualPaymentIntent,
  }),
);

jest.mock(
  '../functions/src/splitpay/notifications',
  () => ({
    notifyOwnerOfPledge: mockNotifyOwnerOfPledge,
  }),
);

jest.mock(
  '../functions/src/analytics/splitPay',
  () => ({
    logPledgeCreated: mockLogPledgeCreated,
  }),
);

jest.mock(
  '../functions/src/featureFlags',
  () => ({
    assertGiftPotEnabled: mockAssertGiftPotEnabled,
  }),
);

let createPledge: (
  data: Record<string, unknown>,
  context: Record<string, unknown>,
) => Promise<{
  pledgeId: string;
  clientSecret: string;
  paymentIntentId: string;
  status: string;
}>;


function setDoc(path: string, data: Record<string, unknown>) {
  store.set(path, deepClone(data));
}

function getDoc(path: string) {
  return store.get(path);
}

describe('createPledge idempotency', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    jest.isolateModules(() => {
      ({ createPledge } = require('../functions/src/splitpay/createPledge'));
    });
    setDoc('wishes/wish-1', {
      splitPayEnabled: true,
      targetAmount: 100000,
      fundedAmount: 0,
      status: 'open',
      title: 'Test Wish',
      fundingCurrency: 'USD',
      userId: 'owner-1',
    });
    setDoc('users/user-1', { stripeCustomerId: 'cus_123' });
    mockCreateManualPaymentIntent.mockResolvedValue({
      id: 'pi_test',
      client_secret: 'secret_test',
      status: 'requires_capture',
    });
  });

  it('reuses intent when idempotency key repeats', async () => {
    const key = 'dedupe-key-123456';
    const context = { auth: { uid: 'user-1' } };

    const first = await createPledge(
      { wishId: 'wish-1', amount: 5000, idempotencyKey: key },
      context,
    );
    expect(first).toEqual({
      pledgeId: first.pledgeId,
      clientSecret: 'secret_test',
      paymentIntentId: 'pi_test',
      status: 'authorized',
    });
    expect(mockCreateManualPaymentIntent).toHaveBeenCalledTimes(1);
    const expectedId = createHash('sha256')
      .update('wish-1:user-1:dedupe-key-123456')
      .digest('hex');
    expect(first.pledgeId).toBe(expectedId);
    expect(getDoc(`wishes/wish-1/pledges/${expectedId}`)).toMatchObject({
      idempotencyKey: key,
      paymentIntentId: 'pi_test',
    });
    expect(getDoc(`splitpayPledgeRequests/${expectedId}`)).toMatchObject({
      status: 'complete',
      pledgeId: expectedId,
    });

    const second = await createPledge(
      { wishId: 'wish-1', amount: 5000, idempotencyKey: key },
      context,
    );
    expect(second).toEqual(first);
    expect(mockCreateManualPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('creates new intent when no idempotency key provided', async () => {
    const context = { auth: { uid: 'user-1' } };
    const result = await createPledge({ wishId: 'wish-1', amount: 5000 }, context);
    expect(result.paymentIntentId).toBe('pi_test');
    expect(mockCreateManualPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid idempotency keys', async () => {
    const context = { auth: { uid: 'user-1' } };
    await expect(
      createPledge(
        { wishId: 'wish-1', amount: 5000, idempotencyKey: 'bad key' },
        context,
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('requires authentication', async () => {
    await expect(
      createPledge({ wishId: 'wish-1', amount: 5000 }, {} as any),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
