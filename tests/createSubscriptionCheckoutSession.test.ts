jest.mock(
  'firebase-functions',
  () => ({
    runWith: jest.fn().mockReturnValue({
      https: { onRequest: (handler: any) => handler },
    }),
  }),
  { virtual: true },
);

const mockStripeCustomersCreate = jest.fn();
const mockStripeCheckoutCreate = jest.fn();
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
  });

  it('creates a subscription checkout session and returns url', async () => {
    mockUserGet.mockResolvedValue({ get: () => undefined }); // no customer on user
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_123' });
    mockStripeCheckoutCreate.mockResolvedValue({ id: 'sess_sub', url: 'https://sub' });

    const req: any = {
      method: 'POST',
      body: {
        userId: 'u1',
        priceId: 'price_123',
        successUrl: 's',
        cancelUrl: 'c',
      },
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createSubscriptionCheckoutSession(req, res);
    expect(mockStripeCustomersCreate).toHaveBeenCalled();
    expect(mockStripeCheckoutCreate).toHaveBeenCalled();
    expect(mockStripeMapSet).toHaveBeenCalled();
    expect(mockBillingSet).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://sub' });
  });

  it('returns 400 on missing parameters', async () => {
    const req: any = { method: 'POST', body: { userId: 'u1' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createSubscriptionCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
