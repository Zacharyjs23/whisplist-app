jest.mock(
  'firebase-functions/v1',
  () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return {
      runWith: jest.fn().mockReturnValue({
        https: { onRequest: (handler) => handler },
      }),
      logger,
    };
  },
  { virtual: true },
);

jest.mock(
  'firebase-admin',
  () => {
    const FieldValue = { serverTimestamp: jest.fn(() => 'ts') };
    const firestore = Object.assign(
      () => ({
        doc: jest.fn(),
      }),
      { FieldValue },
    );
    return {
      __esModule: true,
      initializeApp: jest.fn(),
      firestore,
    };
  },
  { virtual: true },
);

jest.mock('../functions/src/secrets', () => ({
  STRIPE_SECRET_KEY: { value: jest.fn(() => 'sk_test') },
}));

import { createHash } from 'node:crypto';
import * as functions from 'firebase-functions/v1';
import {
  handleExpressCheckout,
  __test as expressTestUtils,
} from '../functions/src/expressCheckout';

class MockDoc {
  constructor(path) {
    this.path = path;
  }

  async get() {
    if (this.path.startsWith('users/')) {
      const parts = this.path.split('/');
      if (parts.length === 4 && parts[2] === 'followers') {
        const key = `${parts[1]}/${parts[3]}`;
        return followersStore.has(key)
          ? { exists: true, data: () => ({}) }
          : { exists: false, data: () => ({}) };
      }
      if (parts.length === 4 && parts[2] === 'checkoutTokens') {
        const key = `${parts[1]}/${parts[3]}`;
        if (!tokensStore.has(key)) {
          return { exists: false, data: () => ({}) };
        }
        return {
          exists: true,
          data: () => tokensStore.get(key),
        };
      }
    }
    if (this.path.startsWith('expressCheckoutRequests/')) {
      const data = requestStore.get(this.path);
      return data
        ? { exists: true, data: () => ({ ...data }) }
        : { exists: false, data: () => ({}) };
    }
    return { exists: false, data: () => ({}) };
  }

  async create(data) {
    if (requestStore.has(this.path)) {
      const error = new Error('already exists');
      error.code = 'already-exists';
      throw error;
    }
    requestStore.set(this.path, { ...data });
  }

  async set(data, options = {}) {
    if (this.path.startsWith('expressCheckoutRequests/')) {
      const existing = requestStore.get(this.path) ?? {};
      if (options.merge) {
        requestStore.set(this.path, { ...existing, ...data });
      } else {
        requestStore.set(this.path, { ...data });
      }
      return;
    }
    if (this.path.startsWith('users/')) {
      const parts = this.path.split('/');
      if (parts.length === 4 && parts[2] === 'checkoutTokens') {
        const key = `${parts[1]}/${parts[3]}`;
        const existing = tokensStore.get(key) ?? {};
        tokensStore.set(key, options.merge ? { ...existing, ...data } : { ...data });
      }
    }
  }
}

let followersStore;
let tokensStore;
let requestStore;
let mockStripeCreate;

const makeResponse = () => {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    set: jest.fn(),
  };
};

const mockDb = {
  doc: jest.fn((path) => new MockDoc(path)),
};

beforeEach(() => {
  followersStore = new Set();
  tokensStore = new Map();
  requestStore = new Map();
  mockStripeCreate = jest.fn();
  expressTestUtils.setDb(mockDb);
  expressTestUtils.setStripe({
    paymentIntents: { create: mockStripeCreate },
  });
  mockDb.doc.mockImplementation((path) => new MockDoc(path));
  jest.clearAllMocks();
});

describe('expressCheckout', () => {
  it('processes express checkout for a follower with valid token', async () => {
    followersStore.add('curator_1/buyer_1');
    tokensStore.set('buyer_1/token_123', {
      curatorId: 'curator_1',
      paymentMethodId: 'pm_1',
      customerId: 'cus_1',
      status: 'active',
    });
    mockStripeCreate.mockResolvedValue({
      id: 'pi_123',
      status: 'succeeded',
      currency: 'usd',
    });

    const req = {
      method: 'POST',
      body: {
        wishId: 'wish_1',
        curatorId: 'curator_1',
        buyerId: 'buyer_1',
        tokenId: 'token_123',
        amount: 500,
        currency: 'usd',
        idempotencyKey: 'key_123456',
      },
    };
    const res = makeResponse();

    await handleExpressCheckout(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      orderId: 'pi_123',
      orderStatus: 'succeeded',
    });
    expect(mockStripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        currency: 'usd',
        customer: 'cus_1',
        payment_method: 'pm_1',
        off_session: true,
        confirm: true,
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^express-/),
      }),
    );
    expect(functions.logger.info).toHaveBeenCalledWith(
      'checkout.express.used',
      expect.objectContaining({
        buyerId: 'buyer_1',
        curatorId: 'curator_1',
        wishId: 'wish_1',
        tokenId: 'token_123',
      }),
    );
    const requestId = createHash('sha256')
      .update('wish_1:curator_1:buyer_1:key_123456')
      .digest('hex');
    const stored = requestStore.get(`expressCheckoutRequests/${requestId}`);
    expect(stored).toMatchObject({
      status: 'complete',
      orderId: 'pi_123',
      orderStatus: 'succeeded',
    });
  });

  it('rejects express checkout when buyer is not a follower', async () => {
    tokensStore.set('buyer_2/token_456', {
      curatorId: 'curator_2',
      paymentMethodId: 'pm_2',
      customerId: 'cus_2',
    });
    const req = {
      method: 'POST',
      body: {
        wishId: 'wish_9',
        curatorId: 'curator_2',
        buyerId: 'buyer_2',
        tokenId: 'token_456',
        amount: 900,
        idempotencyKey: 'key_abcdef12',
      },
    };
    const res = makeResponse();

    await handleExpressCheckout(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Express checkout available to followers only',
    });
    expect(mockStripeCreate).not.toHaveBeenCalled();
    const requestId = createHash('sha256')
      .update('wish_9:curator_2:buyer_2:key_abcdef12')
      .digest('hex');
    const stored = requestStore.get(`expressCheckoutRequests/${requestId}`);
    expect(stored).toMatchObject({
      status: 'failed',
      errorCode: 'not_follower',
    });
  });

  it('reuses prior result when the same idempotency key is submitted', async () => {
    followersStore.add('curator_3/buyer_3');
    tokensStore.set('buyer_3/token_xyz', {
      curatorId: 'curator_3',
      paymentMethodId: 'pm_3',
      customerId: 'cus_3',
      status: 'active',
    });
    mockStripeCreate.mockResolvedValue({
      id: 'pi_existing',
      status: 'succeeded',
      currency: 'usd',
    });

    const req = {
      method: 'POST',
      body: {
        wishId: 'wish_3',
        curatorId: 'curator_3',
        buyerId: 'buyer_3',
        tokenId: 'token_xyz',
        amount: 1200,
        idempotencyKey: 'key_shared_1',
      },
    };
    const res1 = makeResponse();
    await handleExpressCheckout(req, res1);
    expect(res1.status).toHaveBeenCalledWith(200);
    expect(mockStripeCreate).toHaveBeenCalledTimes(1);

    const res2 = makeResponse();
    mockStripeCreate.mockClear();
    await handleExpressCheckout(req, res2);
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(res2.json).toHaveBeenCalledWith({
      orderId: 'pi_existing',
      orderStatus: 'succeeded',
    });
    expect(mockStripeCreate).not.toHaveBeenCalled();
  });
});
