import type {
  OrderByDirection,
  UpdateData,
  WhereFilterOp,
} from 'firebase-admin/firestore';

type GenericUpdateData = UpdateData<Record<string, unknown>>;

jest.mock('../functions/src/payments/stripe', () => ({
  capturePaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
}));

jest.mock('../functions/src/splitpay/notifications', () => ({
  notifyOwnerWishFunded: jest.fn(),
  notifyPledgerCaptured: jest.fn(),
  notifyPledgerExpired: jest.fn(),
}));

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
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      https: { HttpsError: MockHttpsError },
      runWith: jest.fn(() => ({
        https: {
          onRequest: (handler: any) => handler,
          onCall: (handler: any) => handler,
        },
        region: jest.fn(() => ({
          https: {
            onCall: (handler: any) => handler,
            onRequest: (handler: any) => handler,
          },
        })),
      })),
      region: jest.fn(() => ({
        https: {
          onRequest: (handler: any) => handler,
          onCall: (handler: any) => handler,
        },
      })),
      pubsub: {
        schedule: jest.fn(() => ({ onRun: (handler: any) => handler })),
      },
    };
  },
  { virtual: true },
);

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
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: Object.assign(() => mockDb, {
      FieldValue: mockFieldValue,
      Timestamp: timestamp,
    }),
  }),
  { virtual: true },
);

const { settleWishInternal } = require('../functions/src/splitpay/settleWish');
const stripeHelpers = require('../functions/src/payments/stripe');
const notificationHelpers = require('../functions/src/splitpay/notifications');

const mockCapture = stripeHelpers.capturePaymentIntent as jest.MockedFunction<
  typeof stripeHelpers.capturePaymentIntent
>;
const mockCancel = stripeHelpers.cancelPaymentIntent as jest.MockedFunction<
  typeof stripeHelpers.cancelPaymentIntent
>;
const mockRetrieve = stripeHelpers.retrievePaymentIntent as jest.MockedFunction<
  typeof stripeHelpers.retrievePaymentIntent
>;

const mockNotifyOwnerFunded =
  notificationHelpers.notifyOwnerWishFunded as jest.MockedFunction<
    typeof notificationHelpers.notifyOwnerWishFunded
  >;
const mockNotifyCaptured =
  notificationHelpers.notifyPledgerCaptured as jest.MockedFunction<
    typeof notificationHelpers.notifyPledgerCaptured
  >;
const mockNotifyExpired =
  notificationHelpers.notifyPledgerExpired as jest.MockedFunction<
    typeof notificationHelpers.notifyPledgerExpired
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

function getWish(wishId: string) {
  return clone(wishesStore.get(wishId));
}

function getPledge(wishId: string, pledgeId: string) {
  const path = `wishes/${wishId}/pledges`;
  return clone(subStores.get(path)?.get(pledgeId));
}

describe('settleWishInternal', () => {
  beforeEach(() => {
    resetStores();
  });

  it('captures pledges FIFO and downsizes the final capture', async () => {
    setWish('wish1', {
      splitPayEnabled: true,
      targetAmount: 1000,
      fundedAmount: 200,
      status: 'funding',
      userId: 'owner-1',
      title: 'Dream laptop',
      fundingCurrency: 'usd',
    });
    setPledge('wish1', 'pledgeA', {
      uid: 'supporter-A',
      amount: 500,
      status: 'authorized',
      paymentIntentId: 'pi_A',
      createdAt: 1,
      currency: 'usd',
    });
    setPledge('wish1', 'pledgeB', {
      uid: 'supporter-B',
      amount: 600,
      status: 'authorized',
      paymentIntentId: 'pi_B',
      createdAt: 2,
      currency: 'usd',
    });

    mockRetrieve.mockResolvedValueOnce({
      id: 'pi_A',
      amount_capturable: 500,
    } as any);
    mockRetrieve.mockResolvedValueOnce({
      id: 'pi_B',
      amount_capturable: 600,
    } as any);
    mockCapture.mockResolvedValue({ status: 'succeeded' } as any);

    const result = await settleWishInternal('wish1', {
      trigger: 'manual',
      now: new Date(),
    });

    expect(mockRetrieve).toHaveBeenCalledTimes(2);
    expect(mockCapture).toHaveBeenNthCalledWith(1, 'pi_A', {});
    expect(mockCapture).toHaveBeenNthCalledWith(2, 'pi_B', { amount: 300 });
    expect(mockCancel).not.toHaveBeenCalled();

    const pledgeA = getPledge('wish1', 'pledgeA');
    const pledgeB = getPledge('wish1', 'pledgeB');
    const wish = getWish('wish1');

    expect(pledgeA.status).toBe('captured');
    expect(pledgeA.capturedAmount).toBe(500);
    expect(pledgeB.status).toBe('captured');
    expect(pledgeB.capturedAmount).toBe(300);
    expect(wish.fundedAmount).toBe(1000);
    expect(wish.status).toBe('fulfilled');
    expect(wish.fundingSupporters).toBe(2);

    expect(result.status).toBe('fulfilled');
    expect(result.capturedAmount).toBe(800);
    expect(result.canceledAmount).toBe(0);

    expect(mockNotifyCaptured).toHaveBeenCalledTimes(2);
    expect(mockNotifyOwnerFunded).toHaveBeenCalledWith({
      ownerId: 'owner-1',
      wishId: 'wish1',
      wishTitle: 'Dream laptop',
    });
    expect(mockNotifyExpired).not.toHaveBeenCalled();
  });

  it('cancels authorized pledges when deadline passes without funding', async () => {
    const pastDeadline = makeTimestamp(Date.now() - 1000);
    setWish('wish2', {
      splitPayEnabled: true,
      targetAmount: 1500,
      fundedAmount: 400,
      status: 'funding',
      userId: 'owner-2',
      title: 'Emergency fund',
      fundingCurrency: 'usd',
      deadline: pastDeadline,
    });
    setPledge('wish2', 'pledgeC', {
      uid: 'supporter-C',
      amount: 300,
      status: 'authorized',
      paymentIntentId: 'pi_C',
      createdAt: 1,
    });
    setPledge('wish2', 'pledgeD', {
      uid: 'supporter-D',
      amount: 400,
      status: 'authorized',
      paymentIntentId: 'pi_D',
      createdAt: 2,
    });

    mockCancel.mockResolvedValue({ status: 'canceled' } as any);

    const result = await settleWishInternal('wish2', {
      trigger: 'schedule',
      now: new Date(),
    });

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalledTimes(2);

    const pledgeC = getPledge('wish2', 'pledgeC');
    const pledgeD = getPledge('wish2', 'pledgeD');
    const wish = getWish('wish2');

    expect(pledgeC.status).toBe('canceled');
    expect(pledgeD.status).toBe('canceled');
    expect(wish.status).toBe('expired');
    expect(wish.fundingSupporters).toBeUndefined();

    expect(result.status).toBe('expired');
    expect(result.capturedAmount).toBe(0);
    expect(result.canceledAmount).toBe(700);

    expect(mockNotifyExpired).toHaveBeenCalledTimes(2);
    expect(mockNotifyOwnerFunded).not.toHaveBeenCalled();
    expect(mockNotifyCaptured).not.toHaveBeenCalled();
  });
});
