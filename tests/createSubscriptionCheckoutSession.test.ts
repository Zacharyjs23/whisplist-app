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
    logger: {
      warn: jest.fn(),
      error: jest.fn(),
    },
  }),
  { virtual: true },
);

const mockStripeCustomersCreate = jest.fn();
const mockStripeCheckoutCreate = jest.fn();
const mockVerifyIdToken = jest.fn();
process.env.EXPO_PUBLIC_STRIPE_PRICE_BASIC = 'price_monthly';
process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON = 'price_patron';
process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON_ANNUAL = 'price_patron_annual';

jest.mock(
  'stripe',
  () =>
    jest.fn().mockImplementation(() => ({
      customers: { create: mockStripeCustomersCreate },
      checkout: { sessions: { create: mockStripeCheckoutCreate } },
    })),
  { virtual: true },
);

// Minimal Firestore admin mock to support user + nested billing writes
const mockUserGet = jest.fn();
const mockUserUpdate = jest.fn().mockResolvedValue(undefined);
const mockUserSet = jest.fn().mockResolvedValue(undefined);
const mockStripeMapSet = jest.fn().mockResolvedValue(undefined);
const mockBillingSet = jest.fn().mockResolvedValue(undefined);

jest.mock(
  'firebase-admin',
  () => {
    const firestoreFn: any = () => ({
      collection: (name: string) => {
        if (name === 'users') {
          return {
            doc: (uid: string) => ({
              get: mockUserGet,
              update: mockUserUpdate,
              set: mockUserSet,
              collection: (_sub: string) => ({
                doc: () => ({ set: mockBillingSet }),
              }),
            }),
          };
        }
        if (name === 'stripeCustomers') {
          return { doc: () => ({ set: mockStripeMapSet }) };
        }
        return { doc: () => ({}) } as any;
      },
    });
    firestoreFn.FieldValue = { serverTimestamp: jest.fn(() => 'ts') };
    return {
      __esModule: true,
      initializeApp: jest.fn(),
      firestore: firestoreFn,
      auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    };
  },
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
}));

import { createSubscriptionCheckoutSession } from '../functions/src/createSubscriptionCheckoutSession';

describe('createSubscriptionCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1' });
  });

  it('creates a subscription checkout session and returns url', async () => {
    mockUserGet.mockResolvedValue({ get: () => undefined }); // no customer on user
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_123' });
    mockStripeCheckoutCreate.mockResolvedValue({
      id: 'sess_sub',
      url: 'https://sub',
    });

    const req: any = {
      method: 'POST',
      get: (header: string) =>
        header === 'Authorization' ? 'Bearer token' : undefined,
      body: {
        userId: 'u1',
        priceId: 'price_monthly',
        successUrl: 'https://whisplist.app/subscribe-success',
        cancelUrl: 'https://whisplist.app/subscribe-cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createSubscriptionCheckoutSession(req, res);
    expect(mockStripeCustomersCreate).toHaveBeenCalled();
    expect(mockStripeCheckoutCreate).toHaveBeenCalled();
    expect(mockStripeMapSet).toHaveBeenCalled();
    expect(mockBillingSet).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://sub' });
  });

  it('rejects unknown price ids', async () => {
    mockUserGet.mockResolvedValue({ get: () => undefined });
    const req: any = {
      method: 'POST',
      get: (header: string) =>
        header === 'Authorization' ? 'Bearer token' : undefined,
      body: {
        userId: 'u1',
        priceId: 'price_invalid',
        successUrl: 'https://whisplist.app/subscribe-success',
        cancelUrl: 'https://whisplist.app/subscribe-cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createSubscriptionCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid price');
    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns 400 on missing parameters', async () => {
    const req: any = {
      method: 'POST',
      get: (header: string) =>
        header === 'Authorization' ? 'Bearer token' : undefined,
      body: { userId: 'u1' },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createSubscriptionCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects disallowed redirect host', async () => {
    const req: any = {
      method: 'POST',
      get: (header: string) =>
        header === 'Authorization' ? 'Bearer token' : undefined,
      body: {
        userId: 'u1',
        priceId: 'price_monthly',
        successUrl: 'https://malicious.example/ok',
        cancelUrl: 'https://malicious.example/cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createSubscriptionCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid redirect URL');
    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
  });
});
