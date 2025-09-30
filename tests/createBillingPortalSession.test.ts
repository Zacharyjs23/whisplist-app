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
const mockStripePortalCreate = jest.fn();
jest.mock(
  'stripe',
  () =>
    jest.fn().mockImplementation(() => ({
      customers: { create: mockStripeCustomersCreate },
      billingPortal: { sessions: { create: mockStripePortalCreate } },
    })),
  { virtual: true },
);

// Minimal Firestore admin mock to support user doc
const mockUserGet = jest.fn();
const mockUserUpdate = jest.fn().mockResolvedValue(undefined);
const mockUserSet = jest.fn().mockResolvedValue(undefined);
const mockStripeMapSet = jest.fn().mockResolvedValue(undefined);

jest.mock(
  'firebase-admin',
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: () => ({
      collection: (name: string) => {
        if (name === 'users') {
          return {
            doc: (uid: string) => ({
              get: mockUserGet,
              update: mockUserUpdate,
              set: mockUserSet,
            }),
          };
        }
        if (name === 'stripeCustomers') {
          return { doc: () => ({ set: mockStripeMapSet }) };
        }
        return { doc: () => ({}) } as any;
      },
    }),
  }),
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
}));

import { createBillingPortalSession } from '../functions/src/createBillingPortalSession';

describe('createBillingPortalSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a billing portal session and returns url', async () => {
    mockUserGet.mockResolvedValue({ get: () => undefined });
    mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_456' });
    mockStripePortalCreate.mockResolvedValue({ url: 'https://portal' });

    const req: any = {
      method: 'POST',
      body: {
        userId: 'u1',
        returnUrl: 'https://app/link',
      },
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createBillingPortalSession(req, res);
    expect(mockStripeCustomersCreate).toHaveBeenCalled();
    expect(mockStripePortalCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://portal' });
  });

  it('returns 400 on missing parameters', async () => {
    const req: any = { method: 'POST', body: { userId: 'u1' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createBillingPortalSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

