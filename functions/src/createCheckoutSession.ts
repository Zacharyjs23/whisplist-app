import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';
import { assertValidRedirectUrl, RedirectUrlError } from './redirectValidation';

export const stripeClient = new Stripe(STRIPE_SECRET_KEY.value(), {
  apiVersion: '2022-11-15',
});

type FirestoreInstance = ReturnType<typeof admin.firestore>;
let db: FirestoreInstance = admin.firestore();

export const __test = {
  setDb(replacement: Pick<FirestoreInstance, 'collection'>) {
    db = replacement as FirestoreInstance;
  },
  getDb(): FirestoreInstance {
    return db;
  },
};

interface CreateCheckoutSessionRequestBody {
  wishId: string;
  userId: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
}

interface CreateCheckoutSessionResponse {
  url: string | null;
  sessionId: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseRequestBody = (
  body: Request['body'],
): CreateCheckoutSessionRequestBody => {
  if (!body || typeof body !== 'object') {
    throw new Error('invalidBody');
  }
  const { wishId, userId, amount, successUrl, cancelUrl } =
    body as Partial<CreateCheckoutSessionRequestBody>;

  if (!isNonEmptyString(wishId)) {
    throw new Error('invalidWishId');
  }
  if (!isNonEmptyString(userId)) {
    throw new Error('invalidUserId');
  }
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    throw new Error('invalidAmount');
  }
  if (!isNonEmptyString(successUrl)) {
    throw new Error('invalidSuccessUrl');
  }
  if (!isNonEmptyString(cancelUrl)) {
    throw new Error('invalidCancelUrl');
  }

  return { wishId, userId, amount, successUrl, cancelUrl };
};

const errorResponseMap: Record<string, string> = {
  invalidBody: 'Invalid request payload',
  invalidWishId: 'Invalid wishId',
  invalidUserId: 'Invalid userId',
  invalidAmount: 'Invalid amount',
  invalidSuccessUrl: 'Invalid successUrl',
  invalidCancelUrl: 'Invalid cancelUrl',
};

export async function startPayment(
  req: Request,
  res: Response,
): Promise<void> {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: CreateCheckoutSessionRequestBody;
  try {
    body = parseRequestBody(req.body);
  } catch (parseError) {
    const message =
      parseError instanceof Error && parseError.message in errorResponseMap
        ? errorResponseMap[parseError.message]
        : 'Invalid request payload';
    if (parseError instanceof Error) {
      logger.warn('createCheckoutSession invalid payload', {
        error: parseError.message,
        bodyKeys: Object.keys(req.body ?? {}),
      });
    }
    res.status(400).json({ error: message });
    return;
  }

  const { wishId, userId, amount, successUrl, cancelUrl } = body;

  let safeSuccessUrl: string;
  let safeCancelUrl: string;
  try {
    safeSuccessUrl = assertValidRedirectUrl(successUrl, 'successUrl');
    safeCancelUrl = assertValidRedirectUrl(cancelUrl, 'cancelUrl');
  } catch (err) {
    if (err instanceof RedirectUrlError) {
      logger.warn('createCheckoutSession received invalid redirect URL', err);
      res.status(400).json({ error: 'Invalid redirect URL' });
      return;
    }
    logger.error('Unexpected error validating boost redirect URLs', err);
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  try {
    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: { name: 'WhispList Boost' },
          },
          quantity: 1,
        },
      ],
      metadata: { wishId, userId },
      success_url: safeSuccessUrl,
      cancel_url: safeCancelUrl,
    });

    await db.collection('boostPayments').doc(session.id).set({
      wishId,
      userId,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const response: CreateCheckoutSessionResponse = {
      url: session.url,
      sessionId: session.id,
    };

    res.json(response);
  } catch (err) {
    logger.error('Error creating checkout session', err);
    res.status(500).json({ error: 'Internal error' });
  }
}

export const createCheckoutSession = runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(startPayment);
