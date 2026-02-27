const mockRecords = {
  boosts: new Map<string, any>(),
  gifts: new Map<string, any>(),
  wishGifts: new Map<string, any>(),
  wishes: new Map<string, any>(),
  billing: new Map<string, any>(),
  stripeCustomers: new Map<string, any>(),
  userUpdates: [] as { id: string; data: Record<string, unknown> }[],
};

const mockUsersState: Record<string, Record<string, unknown>> = {
  'recipient-1': {
    stripeAccountId: 'acct_recipient',
    email: 'recipient@example.com',
    displayName: 'Recipient One',
  },
  'supporter-42': {
    email: 'supporter@example.com',
    displayName: 'Sky Supporter',
  },
};

const mockStripeSessionCreate = jest.fn();
const mockStripeCustomerCreate = jest.fn();
const mockStripeConstructEvent = jest.fn();
const mockVerifyIdToken = jest.fn();
process.env.EXPO_PUBLIC_STRIPE_PRICE_BASIC = 'price_monthly';
process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON = 'price_monthly_patron';
process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON_ANNUAL =
  'price_monthly_patron_annual';

jest.mock(
  'firebase-functions',
  () => ({
    https: {
      onRequest: (...args: any[]) => {
        const handler = typeof args[0] === 'function' ? args[0] : args[1];
        return handler;
      },
    },
    runWith: jest.fn(() => ({
      https: {
        onRequest: (...args: any[]) => {
          const handler = typeof args[0] === 'function' ? args[0] : args[1];
          return handler;
        },
      },
    })),
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  }),
  { virtual: true },
);

jest.mock(
  'firebase-functions/v1',
  () => ({
    https: {
      onRequest: (...args: any[]) => {
        const handler = typeof args[0] === 'function' ? args[0] : args[1];
        return handler;
      },
    },
    runWith: jest.fn(() => ({
      https: {
        onRequest: (...args: any[]) => {
          const handler = typeof args[0] === 'function' ? args[0] : args[1];
          return handler;
        },
      },
    })),
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  }),
  { virtual: true },
);

jest.mock(
  'stripe',
  () =>
    jest.fn().mockImplementation(() => ({
      checkout: { sessions: { create: mockStripeSessionCreate } },
      customers: { create: mockStripeCustomerCreate },
      webhooks: { constructEvent: mockStripeConstructEvent },
    })),
  { virtual: true },
);

function mockCreateFirestore() {
  const applyPatch = (
    existing: Record<string, any> | undefined,
    patch: Record<string, any>,
    merge: boolean,
  ) => {
    const base = merge ? { ...(existing ?? {}) } : {};
    Object.entries(patch ?? {}).forEach(([key, value]) => {
      if (value && typeof value === 'object' && value.__type === 'increment') {
        const current = typeof base[key] === 'number' ? base[key] : 0;
        base[key] = current + value.value;
      } else {
        base[key] = value;
      }
    });
    return base;
  };

  const makeGiftDoc = (
    wishId: string,
    giftId: string,
    store: Map<string, any>,
  ) => {
    const key = `${wishId}/${giftId}`;
    const doc = {
      async set(data: any, options?: { merge?: boolean }) {
        const next = applyPatch(store.get(key), data, !!options?.merge);
        store.set(key, next);
      },
      async update(data: any) {
        await doc.set(data, { merge: true });
      },
      async get() {
        const record = store.get(key);
        return {
          exists: () => record !== undefined,
          data: () => (record ? { ...record } : undefined),
          get: (field: string) => record?.[field],
        };
      },
    };
    return doc;
  };

  const makeUserRef = (id: string) => ({
    async get() {
      const data = mockUsersState[id];
      return {
        exists: () => !!data,
        get: (field: string) => data?.[field],
        data: () => ({ ...(data ?? {}) }),
      };
    },
    async update(patch: Record<string, unknown>) {
      mockUsersState[id] = { ...(mockUsersState[id] ?? {}), ...patch };
      mockRecords.userUpdates.push({ id, data: patch });
    },
    async set(patch: Record<string, unknown>, options?: { merge?: boolean }) {
      if (options?.merge) {
        mockUsersState[id] = { ...(mockUsersState[id] ?? {}), ...patch };
      } else {
        mockUsersState[id] = { ...patch };
      }
      mockRecords.userUpdates.push({ id, data: patch });
    },
    collection(sub: string) {
      if (sub === 'billing') {
        return {
          doc: (docId: string) => ({
            async set(data: any) {
              mockRecords.billing.set(`${id}/${docId}`, data);
            },
          }),
        };
      }
      return {
        doc: () => ({ set: jest.fn(), get: jest.fn() }),
      };
    },
  });

  const makeWishDoc = (id: string) => {
    const doc = {
      async set(data: any, options?: { merge?: boolean }) {
        const next = applyPatch(
          mockRecords.wishes.get(id),
          data,
          !!options?.merge,
        );
        mockRecords.wishes.set(id, next);
      },
      async update(data: any) {
        await doc.set(data, { merge: true });
      },
      async get() {
        const record = mockRecords.wishes.get(id);
        return {
          exists: () => record !== undefined,
          data: () => (record ? { ...record } : undefined),
          get: (field: string) => record?.[field],
        };
      },
      collection(sub: string) {
        if (sub === 'gifts') {
          return {
            doc(giftId: string) {
              return makeGiftDoc(id, giftId, mockRecords.wishGifts);
            },
          };
        }
        return { doc: () => ({ set: jest.fn(), get: jest.fn() }) };
      },
    };
    return doc;
  };

  return {
    collection(name: string) {
      if (name === 'boostPayments') {
        return {
          doc(id: string) {
            return {
              async set(data: any) {
                mockRecords.boosts.set(id, data);
              },
            };
          },
        };
      }
      if (name === 'gifts') {
        return {
          doc(wishId: string) {
            return {
              collection(sub: string) {
                if (sub === 'gifts') {
                  return {
                    doc(giftId: string) {
                      return makeGiftDoc(wishId, giftId, mockRecords.gifts);
                    },
                  };
                }
                return { doc: () => ({ set: jest.fn(), get: jest.fn() }) };
              },
            };
          },
        };
      }
      if (name === 'wishes') {
        return {
          doc: makeWishDoc,
        };
      }
      if (name === 'users') {
        return {
          doc: makeUserRef,
        };
      }
      if (name === 'stripeCustomers') {
        return {
          doc(id: string) {
            return {
              async set(data: any) {
                mockRecords.stripeCustomers.set(id, data);
              },
            };
          },
        };
      }
      return {
        doc: () => ({ set: jest.fn(), get: jest.fn() }),
      };
    },
    batch() {
      const ops: (() => Promise<void>)[] = [];
      return {
        set(docRef: any, data: any, options?: { merge?: boolean }) {
          ops.push(() => docRef.set(data, options));
        },
        update(docRef: any, data: any) {
          ops.push(() => docRef.update(data));
        },
        async commit() {
          for (const op of ops) {
            await op();
          }
        },
      };
    },
  };
}

function mockFirestore() {
  return mockCreateFirestore();
}

(mockFirestore as any).FieldValue = {
  serverTimestamp: () => 'ts',
  increment: (value: number) => ({ __type: 'increment', value }),
};

(mockFirestore as any).Timestamp = {
  fromMillis: (value: number) => ({ toMillis: () => value }),
};

jest.mock(
  'firebase-admin',
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: mockFirestore,
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  }),
  { virtual: true },
);

jest.mock('../functions/src/engagement', () => ({
  incrementEngagement: jest.fn(),
}));

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
  STRIPE_WEBHOOK_SECRET: { value: jest.fn(() => 'wh_test') },
}));

import {
  createCheckoutSession,
  stripeClient,
} from '../functions/src/createCheckoutSession';
import { createGiftCheckoutSession } from '../functions/src/createGiftCheckoutSession';
import { createSubscriptionCheckoutSession } from '../functions/src/createSubscriptionCheckoutSession';
import { stripeWebhook } from '../functions/src/stripeWebhook';

describe('funding flow integration', () => {
  const originalCheckoutCreate = stripeClient.checkout.sessions.create;

  beforeEach(() => {
    mockRecords.boosts.clear();
    mockRecords.gifts.clear();
    mockRecords.wishGifts.clear();
    mockRecords.wishes.clear();
    mockRecords.billing.clear();
    mockRecords.stripeCustomers.clear();
    mockRecords.userUpdates.length = 0;
    mockUsersState['supporter-42'].stripeCustomerId = undefined;
    mockStripeSessionCreate.mockReset();
    mockStripeCustomerCreate.mockReset();
    mockStripeConstructEvent.mockReset();
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockResolvedValue({ uid: 'supporter-42' });
    stripeClient.checkout.sessions.create = mockStripeSessionCreate as any;
    mockStripeSessionCreate
      .mockResolvedValueOnce({ id: 'sess_boost', url: 'https://boost' })
      .mockResolvedValueOnce({ id: 'sess_gift', url: 'https://gift' })
      .mockResolvedValueOnce({ id: 'sess_sub', url: 'https://sub' });
    mockStripeCustomerCreate.mockResolvedValue({ id: 'cus_new' });
  });

  afterAll(() => {
    stripeClient.checkout.sessions.create = originalCheckoutCreate;
  });

  it('records boost, gift, and subscription artifacts', async () => {
    const boostRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createCheckoutSession(
      {
        method: 'POST',
        body: {
          wishId: 'wish-boost',
          userId: 'supporter-42',
          amount: 15,
          successUrl: 'https://whisplist.app/boost-success',
          cancelUrl: 'https://whisplist.app/boost-cancel',
        },
      } as any,
      boostRes,
    );

    expect(boostRes.json).toHaveBeenCalledWith({
      url: 'https://boost',
      sessionId: 'sess_boost',
    });
    expect(mockRecords.boosts.get('sess_boost')).toMatchObject({
      wishId: 'wish-boost',
      userId: 'supporter-42',
      status: 'pending',
    });

    const giftRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createGiftCheckoutSession(
      {
        method: 'POST',
        get: (header: string) =>
          header === 'Authorization' ? 'Bearer token' : undefined,
        body: {
          wishId: 'wish-boost',
          recipientId: 'recipient-1',
          amount: 30,
          supporterId: 'supporter-42',
          successUrl: 'https://whisplist.app/gift-success',
          cancelUrl: 'https://whisplist.app/gift-cancel',
        },
      } as any,
      giftRes,
    );

    expect(giftRes.json).toHaveBeenCalledWith({ url: 'https://gift' });
    expect(mockRecords.gifts.get('wish-boost/sess_gift')).toMatchObject({
      amount: 30,
      recipientId: 'recipient-1',
      supporterId: 'supporter-42',
      status: 'pending',
    });

    const webhookReq = {
      headers: { 'stripe-signature': 'sig' },
      rawBody: Buffer.from(''),
    } as any;
    const webhookRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;
    mockStripeConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_gift',
          mode: 'payment',
          metadata: {
            wishId: 'wish-boost',
            recipientId: 'recipient-1',
            supporterId: 'supporter-42',
          },
          amount_total: 3000,
          currency: 'usd',
        },
      },
    });

    await stripeWebhook(webhookReq, webhookRes);

    expect(webhookRes.json).toHaveBeenCalledWith({ received: true });
    expect(mockRecords.gifts.get('wish-boost/sess_gift')).toMatchObject({
      status: 'completed',
      amount: 30,
    });
    expect(mockRecords.wishes.get('wish-boost')).toMatchObject({
      fundingRaised: 30,
      fundingSupporters: 1,
    });

    const subRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createSubscriptionCheckoutSession(
      {
        method: 'POST',
        get: (header: string) =>
          header === 'Authorization' ? 'Bearer token' : undefined,
        body: {
          userId: 'supporter-42',
          priceId: 'price_monthly',
          successUrl: 'https://whisplist.app/sub-success',
          cancelUrl: 'https://whisplist.app/sub-cancel',
        },
      } as any,
      subRes,
    );

    expect(subRes.json).toHaveBeenCalledWith({ url: 'https://sub' });
    expect(mockStripeCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: 'supporter-42' } }),
    );
    expect(mockUsersState['supporter-42'].stripeCustomerId).toBe('cus_new');
    expect(mockRecords.billing.get('supporter-42/lastCheckout')).toMatchObject({
      sessionId: 'sess_sub',
      priceId: 'price_monthly',
    });
    expect(mockRecords.stripeCustomers.get('cus_new')).toEqual({
      userId: 'supporter-42',
    });
  });

  it('updates subscription state from webhook events', async () => {
    mockRecords.stripeCustomers.set('cus_existing', { userId: 'supporter-42' });

    const webhookReq = {
      headers: { 'stripe-signature': 'sig' },
      rawBody: Buffer.from('subscription'),
    } as any;
    const webhookRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;

    mockStripeConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_existing',
          status: 'active',
          current_period_end: 1_700_000_000,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_monthly' } }] },
          metadata: { userId: 'supporter-42' },
        },
      },
    });

    await stripeWebhook(webhookReq, webhookRes);

    expect(webhookRes.json).toHaveBeenCalledWith({ received: true });
    expect(mockRecords.billing.get('supporter-42/subscription')).toMatchObject({
      status: 'active',
      priceId: 'price_monthly',
      planKey: 'supporter_monthly',
      stripeSubscriptionId: 'sub_123',
    });
    expect(mockUsersState['supporter-42'].isSupporter).toBe(true);
    expect(mockRecords.userUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'supporter-42',
          data: expect.objectContaining({
            isSupporter: true,
            supporterPlan: 'supporter_monthly',
          }),
        }),
      ]),
    );
  });
});
