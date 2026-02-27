jest.mock(
  'firebase-functions/v1',
  () => ({
    runWith: jest.fn().mockReturnValue({
      https: { onRequest: (handler: any) => handler },
    }),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  }),
  { virtual: true },
);

const mockStripeCreate = jest.fn();

const mockSet = jest.fn();
const mockDoc = jest.fn(() => ({ set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock(
  'firebase-admin',
  () => {
    const mockFirestore = Object.assign(
      () => ({
        collection: mockCollection,
      }),
      {
        FieldValue: { serverTimestamp: jest.fn(() => 'ts') },
      },
    );
    return {
      __esModule: true,
      initializeApp: jest.fn(),
      firestore: mockFirestore,
    };
  },
  { virtual: true },
);

jest.mock(
  '../functions/node_modules/firebase-admin/lib/index',
  () => {
    const mockFirestore = Object.assign(
      () => ({
        collection: mockCollection,
      }),
      {
        FieldValue: { serverTimestamp: jest.fn(() => 'ts') },
      },
    );
    return {
      __esModule: true,
      initializeApp: jest.fn(),
      firestore: mockFirestore,
    };
  },
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
}));

import * as functions from 'firebase-functions/v1';
import {
  createCheckoutSession,
  stripeClient,
  __test as checkoutTestUtils,
} from '../functions/src/createCheckoutSession';

describe('createCheckoutSession', () => {
  const originalStripeCreate = stripeClient.checkout.sessions.create;
  const originalDb = checkoutTestUtils.getDb();

  beforeEach(() => {
    jest.clearAllMocks();
    stripeClient.checkout.sessions.create = mockStripeCreate as any;
    checkoutTestUtils.setDb({ collection: mockCollection } as any);
    mockSet.mockClear();
    mockDoc.mockClear();
    mockCollection.mockClear();
  });

  afterAll(() => {
    stripeClient.checkout.sessions.create = originalStripeCreate;
    checkoutTestUtils.setDb(originalDb);
  });

  it('creates stripe session and returns url', async () => {
    mockStripeCreate.mockResolvedValue({ id: 'sess_1', url: 'https://sesh' });
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        userId: 'u1',
        amount: 5,
        successUrl: 'https://whisplist.app/success',
        cancelUrl: 'https://whisplist.app/cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createCheckoutSession(req, res);
    expect(functions.logger.error).not.toHaveBeenCalled();
    expect(mockStripeCreate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      url: 'https://sesh',
      sessionId: 'sess_1',
    });
    expect(mockCollection).toHaveBeenCalledWith('boostPayments');
    expect(mockDoc).toHaveBeenCalledWith('sess_1');
    expect(mockSet).toHaveBeenCalledWith({
      wishId: 'w1',
      userId: 'u1',
      status: 'pending',
      createdAt: 'ts',
    });
  });

  it('returns 400 when missing parameters', async () => {
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        userId: 'u1',
        successUrl: 'https://whisplist.app/success',
        cancelUrl: 'https://whisplist.app/cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid amount' });
  });

  it('rejects redirects to disallowed hosts', async () => {
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        userId: 'u1',
        amount: 10,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://whisplist.app/cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid redirect URL' });
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST methods', async () => {
    const req: any = { method: 'GET' };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('returns validation error for invalid amount type', async () => {
    const req: any = {
      method: 'POST',
      body: {
        wishId: 'w1',
        userId: 'u1',
        amount: '5',
        successUrl: 'https://whisplist.app/success',
        cancelUrl: 'https://whisplist.app/cancel',
      },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
    } as any;
    await createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid amount' });
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });
});
