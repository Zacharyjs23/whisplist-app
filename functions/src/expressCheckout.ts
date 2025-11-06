import { createHash } from 'node:crypto';
import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from './secrets';

const stripeClient = new Stripe(STRIPE_SECRET_KEY.value(), {
  apiVersion: '2022-11-15',
});

type FirestoreInstance = ReturnType<typeof admin.firestore>;
let db: FirestoreInstance = admin.firestore();
type StripeClient = typeof stripeClient;
let stripe: StripeClient = stripeClient;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_\-.]{8,128}$/;

export const __test = {
  setDb(replacement: Pick<FirestoreInstance, 'doc' | 'runTransaction'>) {
    db = replacement as FirestoreInstance;
  },
  getDb(): FirestoreInstance {
    return db;
  },
  setStripe(client: StripeClient) {
    stripe = client;
  },
  getStripe(): StripeClient {
    return stripe;
  },
};

type ExpressCheckoutRequestBody = {
  wishId: string;
  curatorId: string;
  buyerId: string;
  tokenId: string;
  amount: number;
  currency?: string | null;
  idempotencyKey: string;
};

type ExpressCheckoutResponseBody =
  | {
      orderId: string;
      orderStatus: string;
    }
  | {
      error: string;
    };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseAmount = (value: unknown): number => {
  if (typeof value !== 'number') {
    throw new Error('invalidAmount');
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error('invalidAmount');
  }
  if (value <= 0) {
    throw new Error('invalidAmount');
  }
  return value;
};

const parseIdempotencyKey = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('invalidIdempotencyKey');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('invalidIdempotencyKey');
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw new Error('invalidIdempotencyKey');
  }
  return trimmed;
};

const parseRequestBody = (
  body: Request['body'],
): ExpressCheckoutRequestBody => {
  if (!body || typeof body !== 'object') {
    throw new Error('invalidBody');
  }
  const {
    wishId,
    curatorId,
    buyerId,
    tokenId,
    amount,
    currency,
    idempotencyKey,
  } = body as Partial<ExpressCheckoutRequestBody>;

  if (!isNonEmptyString(wishId)) {
    throw new Error('invalidWishId');
  }
  if (!isNonEmptyString(curatorId)) {
    throw new Error('invalidCuratorId');
  }
  if (!isNonEmptyString(buyerId)) {
    throw new Error('invalidBuyerId');
  }
  if (!isNonEmptyString(tokenId)) {
    throw new Error('invalidTokenId');
  }

  const parsedAmount = parseAmount(amount);
  const parsedKey = parseIdempotencyKey(idempotencyKey);

  const currencyCode =
    typeof currency === 'string' && currency.trim().length > 0
      ? currency.trim().toLowerCase()
      : 'usd';

  return {
    wishId: wishId.trim(),
    curatorId: curatorId.trim(),
    buyerId: buyerId.trim(),
    tokenId: tokenId.trim(),
    amount: parsedAmount,
    currency: currencyCode,
    idempotencyKey: parsedKey,
  };
};

const errorResponseMap: Record<string, string> = {
  invalidBody: 'Invalid request payload',
  invalidWishId: 'Invalid wishId',
  invalidCuratorId: 'Invalid curatorId',
  invalidBuyerId: 'Invalid buyerId',
  invalidTokenId: 'Invalid tokenId',
  invalidAmount: 'Invalid amount',
  invalidIdempotencyKey: 'Invalid idempotency key',
};

const makeRequestId = ({
  wishId,
  curatorId,
  buyerId,
  idempotencyKey,
}: {
  wishId: string;
  curatorId: string;
  buyerId: string;
  idempotencyKey: string;
}): string =>
  createHash('sha256')
    .update(`${wishId}:${curatorId}:${buyerId}:${idempotencyKey}`)
    .digest('hex');

const isFirestoreAlreadyExists = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return (
    code === 6 ||
    code === 'ALREADY_EXISTS' ||
    code === 'already-exists' ||
    code === 'resource-exhausted'
  );
};

const respond = (res: Response, status: number, body: ExpressCheckoutResponseBody) => {
  res.status(status).json(body);
};

async function ensureFollower({
  buyerId,
  curatorId,
}: {
  buyerId: string;
  curatorId: string;
}): Promise<boolean> {
  try {
    const followerSnap = await db
      .doc(`users/${curatorId}/followers/${buyerId}`)
      .get();
    return followerSnap.exists;
  } catch (error) {
    logger.error('Failed to check follower relationship', {
      error,
      buyerId,
      curatorId,
    });
    throw new Error('followerCheckFailed');
  }
}

type SavedTokenRecord = {
  curatorId: string;
  paymentMethodId: string;
  customerId: string;
  status?: string | null;
};

const loadSavedToken = async ({
  buyerId,
  tokenId,
}: {
  buyerId: string;
  tokenId: string;
}): Promise<SavedTokenRecord | null> => {
  try {
    const tokenSnap = await db
      .doc(`users/${buyerId}/checkoutTokens/${tokenId}`)
      .get();
    if (!tokenSnap.exists) {
      return null;
    }
    const data = tokenSnap.data() as Partial<SavedTokenRecord>;
    if (
      typeof data?.paymentMethodId === 'string' &&
      data.paymentMethodId &&
      typeof data?.customerId === 'string' &&
      data.customerId &&
      typeof data?.curatorId === 'string' &&
      data.curatorId
    ) {
      return {
        curatorId: data.curatorId,
        paymentMethodId: data.paymentMethodId,
        customerId: data.customerId,
        status: data.status ?? null,
      };
    }
    return null;
  } catch (error) {
    logger.error('Failed to load express checkout token', {
      error,
      buyerId,
      tokenId,
    });
    throw new Error('tokenLookupFailed');
  }
};

async function recordResult(
  requestPath: string,
  payload: Record<string, unknown>,
) {
  try {
    await db.doc(requestPath).set(
      {
        ...payload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    logger.warn('Failed to record express checkout result', {
      requestPath,
      error,
    });
  }
}

async function handleExpressCheckout(
  req: Request,
  res: Response,
): Promise<void> {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body: ExpressCheckoutRequestBody;
  try {
    body = parseRequestBody(req.body);
  } catch (err) {
    const message =
      err instanceof Error && err.message in errorResponseMap
        ? errorResponseMap[err.message]
        : 'Invalid request payload';
    logger.warn('expressCheckout invalid payload', {
      error: err instanceof Error ? err.message : String(err),
      providedKeys: Object.keys(req.body ?? {}),
    });
    respond(res, 400, { error: message });
    return;
  }

  const { wishId, curatorId, buyerId, tokenId, amount, currency, idempotencyKey } =
    body;

  const requestId = makeRequestId({ wishId, curatorId, buyerId, idempotencyKey });
  const requestPath = `expressCheckoutRequests/${requestId}`;
  const requestRef = db.doc(requestPath);

  try {
    await requestRef.create({
      wishId,
      curatorId,
      buyerId,
      tokenId,
      amount,
      currency,
      idempotencyKey,
      status: 'processing',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (isFirestoreAlreadyExists(error)) {
      const existingSnap = await requestRef.get();
      if (existingSnap.exists) {
        const data = existingSnap.data() ?? {};
        if (
          typeof data.orderId === 'string' &&
          typeof data.orderStatus === 'string' &&
          data.status === 'complete'
        ) {
          respond(res, 200, {
            orderId: data.orderId,
            orderStatus: data.orderStatus,
          });
          return;
        }
        if (data.status === 'failed') {
          respond(res, 409, {
            error:
              typeof data.errorMessage === 'string'
                ? data.errorMessage
                : 'Previous attempt failed',
          });
          return;
        }
      }
      respond(res, 409, {
        error:
          'An identical express checkout request is already processing. Please retry shortly.',
      });
      return;
    }
    logger.error('Failed to create express checkout request record', {
      error,
      requestId,
    });
    respond(res, 500, { error: 'Internal error' });
    return;
  }

  try {
    const follower = await ensureFollower({ buyerId, curatorId });
    if (!follower) {
      await recordResult(requestPath, {
        status: 'failed',
        errorCode: 'not_follower',
        errorMessage: 'Express checkout available to followers only',
      });
      respond(res, 403, {
        error: 'Express checkout available to followers only',
      });
      return;
    }

    const savedToken = await loadSavedToken({ buyerId, tokenId });
    if (!savedToken) {
      await recordResult(requestPath, {
        status: 'failed',
        errorCode: 'token_not_found',
        errorMessage: 'Saved payment token could not be found',
      });
      respond(res, 404, {
        error: 'Saved payment token could not be found',
      });
      return;
    }

    if (savedToken.curatorId !== curatorId) {
      await recordResult(requestPath, {
        status: 'failed',
        errorCode: 'token_mismatch',
        errorMessage: 'Payment token does not belong to this curator',
      });
      respond(res, 403, {
        error: 'Payment token does not belong to this curator',
      });
      return;
    }

    if (savedToken.status && savedToken.status !== 'active') {
      await recordResult(requestPath, {
        status: 'failed',
        errorCode: 'token_inactive',
        errorMessage: 'Saved payment token is no longer active',
      });
      respond(res, 409, {
        error: 'Saved payment token is no longer active',
      });
      return;
    }

    const payment = await stripe.paymentIntents.create(
      {
        amount,
        currency: currency ?? 'usd',
        customer: savedToken.customerId,
        payment_method: savedToken.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          wishId,
          curatorId,
          buyerId,
          tokenId,
          expressCheckout: 'true',
        },
        description: `Express checkout for wish ${wishId}`,
      },
      { idempotencyKey: `express-${requestId}` },
    );

    const orderStatus =
      typeof payment.status === 'string' ? payment.status : 'processing';
    const orderId = payment.id;

    await recordResult(requestPath, {
      status: 'complete',
      orderId,
      orderStatus,
      paymentIntentId: payment.id,
    });

    logger.info('checkout.express.used', {
      buyerId,
      curatorId,
      wishId,
      tokenId,
      orderId,
      orderStatus,
      amount,
      currency,
    });

    respond(res, 200, { orderId, orderStatus });
  } catch (error) {
    logger.error('Express checkout failed', {
      error,
      buyerId,
      curatorId,
      wishId,
    });
    await recordResult(requestPath, {
      status: 'failed',
      errorMessage:
        error instanceof Error ? error.message : 'Express checkout failed',
    });
    respond(res, 500, { error: 'Unable to process express checkout' });
  }
}

export const expressCheckout = runWith({
  timeoutSeconds: 30,
  secrets: [STRIPE_SECRET_KEY],
}).https.onRequest(handleExpressCheckout);

export { handleExpressCheckout };
