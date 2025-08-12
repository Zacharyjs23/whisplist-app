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

jest.mock(
  'firebase-admin',
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: () => ({
      collection: () => ({ doc: () => ({ set: jest.fn() }) }),
    }),
  }),
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
}));

import { createCheckoutSession } from '../functions/src/createCheckoutSession';

describe('createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates stripe session and returns url', async () => {
    mockStripeCreate.mockResolvedValue({ id: 'sess_1', url: 'https://sesh' });
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        userId: 'u1',
        amount: 5,
        successUrl: 's',
        cancelUrl: 'c',
      },
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createCheckoutSession(req, res);
    expect(mockStripeCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: 'https://sesh', sessionId: 'sess_1' });
  });

  it('returns 400 when missing parameters', async () => {
    const req: any = {
      method: 'POST',
      body: { wishId: 'w1', userId: 'u1', successUrl: 's', cancelUrl: 'c' },
    };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
    await createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing parameters');
  });
});
