import type {
  OrderByDirection,
  UpdateData,
  WhereFilterOp,
} from 'firebase-admin/firestore';

type GenericUpdateData = UpdateData<Record<string, unknown>>;

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
    return {
      runWith: jest.fn(() => ({
        https: {
          onRequest: (handler: any) => handler,
          onCall: (handler: any) => handler,
        },
        region: jest.fn(() => ({
          https: {
            onRequest: (handler: any) => handler,
            onCall: (handler: any) => handler,
          },
        })),
      })),
      https: {
        onRequest: (handler: any) => handler,
        HttpsError: MockHttpsError,
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    };
  },
  { virtual: true },
);

const mockConstructEvent = jest.fn();

jest.mock(
  'stripe',
  () =>
    jest.fn().mockImplementation(() => ({
      webhooks: { constructEvent: mockConstructEvent },
    })),
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test_123') },
  STRIPE_WEBHOOK_SECRET: { value: jest.fn(() => 'whsec_test') },
}));

jest.mock('../functions/src/splitpay/notifications', () => ({
  notifyOwnerWishFunded: jest.fn(),
  notifyPledgerCaptured: jest.fn(),
  notifyPledgerExpired: jest.fn(),
}));

jest.mock('../functions/src/payments/stripe', () => ({
  // Not used in webhook tests but mocked for completeness
  capturePaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
}));

type Store = Map<string, any>;

const wishesStore: Store = new Map();
const subStores: Map<string, Store> = new Map();
const stripeEventsStore: Store = new Map();

const mockFieldValue = {
  serverTimestamp: jest.fn(() => ({ __fieldValue: 'serverTimestamp' })),
  increment: (value: number) => ({ __fieldValue: 'increment', value }),
};

const timestamp = {
  fromMillis: (ms: number) => makeTimestamp(ms),
  now: () => makeTimestamp(Date.now()),
};

function makeTimestamp(ms: number) {
  return {
    __isMockTimestamp: true,
    _millis: ms,
    toMillis: () => ms,
  };
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as unknown as T;
  }
  if ((value as any).__isMockTimestamp) {
    return makeTimestamp((value as any)._millis) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
    result[key] = clone(val);
  });
  return result as unknown as T;
}

function applyUpdate(target: Record<string, any>, updates: GenericUpdateData) {
  Object.entries(updates).forEach(([key, raw]) => {
    const value = raw as any;
    if (
      value &&
      typeof value === 'object' &&
      value.__fieldValue === 'serverTimestamp'
    ) {
      target[key] = makeTimestamp(Date.now());
    } else if (
      value &&
      typeof value === 'object' &&
      value.__fieldValue === 'increment'
    ) {
      const current = typeof target[key] === 'number' ? target[key] : 0;
      target[key] = current + value.value;
    } else {
      target[key] = clone(value);
    }
  });
}

class MockDocumentSnapshot {
  constructor(
    private readonly idValue: string,
    private readonly dataValue: any,
  ) {}

  get exists() {
    return this.dataValue !== undefined;
  }

  get id() {
    return this.idValue;
  }

  data() {
    return clone(this.dataValue);
  }

  get(field: string) {
    return this.dataValue?.[field];
  }
}

class MockDocumentRef {
  constructor(
    private readonly store: Store,
    private readonly path: string,
    private readonly docId: string,
  ) {}

  get id() {
    return this.docId;
  }

  get fullPath() {
    return `${this.path}/${this.docId}`;
  }

  async get() {
    const data = this.store.get(this.docId);
    return new MockDocumentSnapshot(this.docId, data);
  }

  async set(data: Record<string, any>, options?: { merge?: boolean }) {
    if (options?.merge) {
      const existing = this.store.get(this.docId) ?? {};
      const merged = clone(existing);
      applyUpdate(merged, data as GenericUpdateData);
      this.store.set(this.docId, merged);
    } else {
      this.store.set(this.docId, clone(data));
    }
  }

  async update(data: Record<string, any>) {
    const target = this.store.get(this.docId);
    if (!target) {
      throw new Error(`Document ${this.fullPath} does not exist`);
    }
    applyUpdate(target, data as GenericUpdateData);
    this.store.set(this.docId, target);
  }

  collection(name: string) {
    const subPath = `${this.fullPath}/${name}`;
    if (!subStores.has(subPath)) {
      subStores.set(subPath, new Map());
    }
    return new MockCollection(subStores.get(subPath)!, subPath);
  }
}

class MockQuery {
  constructor(
    private readonly store: Store,
    private readonly filters: { field: string; value: unknown }[] = [],
    private readonly orderByField: string | null = null,
    private readonly orderDirection: 'asc' | 'desc' = 'asc',
    private readonly path: string,
  ) {}

  where(field: string, _op: WhereFilterOp, value: unknown) {
    return new MockQuery(
      this.store,
      [...this.filters, { field, value }],
      this.orderByField,
      this.orderDirection,
      this.path,
    );
  }

  orderBy(field: string, direction: OrderByDirection) {
    const dir = (direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    return new MockQuery(this.store, this.filters, field, dir, this.path);
  }

  async get() {
    const docs = Array.from(this.store.entries()).map(([id, data]) => {
      const ref = new MockDocumentRef(this.store, this.path, id);
      return {
        id,
        ref,
        data: () => clone(data),
        get: (field: string) => data?.[field],
      };
    });
    const filtered = docs.filter((doc) =>
      this.filters.every((filter) => doc.get(filter.field) === filter.value),
    );
    if (this.orderByField) {
      filtered.sort((a, b) => {
        const dir = this.orderDirection === 'desc' ? -1 : 1;
        const av = a.get(this.orderByField!);
        const bv = b.get(this.orderByField!);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    return { docs: filtered };
  }
}

class MockCollection {
  constructor(
    private readonly store: Store,
    private readonly path: string,
  ) {}

  doc(id: string) {
    if (!this.store.has(id)) {
      this.store.set(id, undefined);
    }
    return new MockDocumentRef(this.store, this.path, id);
  }

  where(field: string, op: WhereFilterOp, value: unknown) {
    return new MockQuery(this.store, [], null, 'asc', this.path).where(
      field,
      op,
      value,
    );
  }

  async get() {
    return new MockQuery(this.store, [], null, 'asc', this.path).get();
  }
}

const mockDb = {
  collection(name: string) {
    if (name === 'wishes') {
      return new MockCollection(wishesStore, 'wishes');
    }
    if (name === 'stripeEvents') {
      return new MockCollection(stripeEventsStore, 'stripeEvents');
    }
    throw new Error(`Unknown collection ${name}`);
  },
  runTransaction: async (updateFn: any) =>
    updateFn({
      get: (ref: MockDocumentRef) => ref.get(),
      update: (ref: MockDocumentRef, data: Record<string, any>) =>
        ref.update(data),
    }),
};

jest.mock(
  'firebase-admin',
  () => {
    const mockFirestore = Object.assign(() => mockDb, {
      FieldValue: mockFieldValue,
      Timestamp: timestamp,
    });
    const mockApp = {
      firestore: mockFirestore,
      messaging: () => ({ send: jest.fn() }),
    };
    return {
      __esModule: true,
      initializeApp: jest.fn(() => mockApp),
      app: jest.fn(() => mockApp),
      apps: [],
      firestore: mockFirestore,
      messaging: jest.fn(() => ({ send: jest.fn() })),
    };
  },
  { virtual: true },
);

const { stripeWebhook } = require('../functions/src/stripeWebhook');
const notifications = require('../functions/src/splitpay/notifications');

const mockNotifyOwnerFunded =
  notifications.notifyOwnerWishFunded as jest.MockedFunction<
    typeof notifications.notifyOwnerWishFunded
  >;
const mockNotifyCaptured =
  notifications.notifyPledgerCaptured as jest.MockedFunction<
    typeof notifications.notifyPledgerCaptured
  >;

function resetStores() {
  wishesStore.clear();
  subStores.clear();
  stripeEventsStore.clear();
  jest.clearAllMocks();
}

function setWish(id: string, data: Record<string, any>) {
  wishesStore.set(id, clone(data));
}

function setPledge(
  wishId: string,
  pledgeId: string,
  data: Record<string, any>,
) {
  const path = `wishes/${wishId}/pledges`;
  if (!subStores.has(path)) {
    subStores.set(path, new Map());
  }
  subStores.get(path)!.set(pledgeId, clone(data));
}

function getWish(id: string) {
  return clone(wishesStore.get(id));
}

function getPledge(wishId: string, pledgeId: string) {
  const path = `wishes/${wishId}/pledges`;
  return clone(subStores.get(path)?.get(pledgeId));
}

describe('stripeWebhook payment_intent handling', () => {
  beforeEach(() => {
    resetStores();
  });

  it('processes payment_intent.succeeded once and ignores duplicates', async () => {
    setWish('wish3', {
      splitPayEnabled: true,
      targetAmount: 500,
      fundedAmount: 0,
      status: 'funding',
      userId: 'owner-3',
      title: 'Birthday surprise',
      fundingCurrency: 'usd',
    });
    setPledge('wish3', 'pledgeE', {
      uid: 'supporter-E',
      amount: 500,
      status: 'authorized',
      paymentIntentId: 'pi_E',
      createdAt: 1,
      currency: 'usd',
    });

    const event = {
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_E',
          amount_received: 500,
          currency: 'usd',
          metadata: {
            splitPay: 'true',
            wishId: 'wish3',
            pledgeId: 'pledgeE',
          },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    const req: any = {
      rawBody: Buffer.from('{}'),
      headers: { 'stripe-signature': 'sig' },
    };
    const res: any = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await stripeWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockNotifyCaptured).toHaveBeenCalledTimes(1);
    expect(mockNotifyOwnerFunded).toHaveBeenCalledTimes(1);

    const wishAfter = getWish('wish3');
    const pledgeAfter = getPledge('wish3', 'pledgeE');
    expect(wishAfter.fundedAmount).toBe(500);
    expect(wishAfter.status).toBe('fulfilled');
    expect(wishAfter.fundingSupporters).toBe(1);
    expect(pledgeAfter.status).toBe('captured');

    // Second call with same event id should be ignored
    const res2: any = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    await stripeWebhook(req, res2);

    expect(res2.json).toHaveBeenCalledWith({ received: true });
    expect(mockNotifyCaptured).toHaveBeenCalledTimes(1);
    expect(mockNotifyOwnerFunded).toHaveBeenCalledTimes(1);

    const eventsDoc = stripeEventsStore.get('evt_1');
    expect(eventsDoc).toBeDefined();
  });
});
