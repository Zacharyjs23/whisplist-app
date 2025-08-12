jest.mock(
  'firebase-functions',
  () => ({
    runWith: jest.fn().mockReturnValue({
      https: { onRequest: (handler: any) => handler },
    }),
  }),
  { virtual: true },
);

const mockStripeCreate = jest.fn();
jest.mock(
  'stripe',
  () =>
    jest.fn().mockImplementation(() => ({
      checkout: { sessions: { create: mockStripeCreate } },
    })),
  { virtual: true },
);

const mockUserGet = jest.fn();
jest.mock(
  'firebase-admin',
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: () => ({
      collection: (name: string) => {
        if (name === 'users') {
          return { doc: () => ({ get: mockUserGet }) };
        }
        return {
          doc: () => ({
            collection: () => ({ doc: () => ({ set: jest.fn() }) }),
          }),
        };
      },
    }),
  }),
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
}));

import { createGiftCheckoutSession } from '../functions/src/createGiftCheckoutSession';

describe('createGiftCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates stripe gift session and returns url', async () => {
    mockUserGet.mockResolvedValue({ get: (f: string) => (f === 'stripeAccountId' ? 'acct_1' : undefined) });
    mockStripeCreate.mockResolvedValue({ id: 'sess_g1', url: 'https://gift' });
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        recipientId: 'rec1',
        amount: 20,
        successUrl: 's',
        cancelUrl: 'c',
      },
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createGiftCheckoutSession(req, res);
    expect(mockStripeCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://gift' });
  });

  it('returns 400 when recipient lacks stripe account', async () => {
    mockUserGet.mockResolvedValue({ get: () => undefined });
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        recipientId: 'rec1',
        amount: 20,
        successUrl: 's',
        cancelUrl: 'c',
      },
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createGiftCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Recipient not enabled for Stripe');
  });
});
