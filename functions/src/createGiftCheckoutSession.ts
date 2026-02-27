import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';
import { assertValidRedirectUrl, RedirectUrlError } from './redirectValidation';

type StripeClient = InstanceType<typeof Stripe>;

let stripe: StripeClient | null;

const db = admin.firestore();
const MAX_AMOUNT = 10_000; // $10k limit to prevent unreasonable charges

function applyCors(res: Response) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function extractBearerToken(header?: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function authenticate(
  req: Request,
): Promise<DecodedIdToken | null> {
  const token = extractBearerToken(req.get('Authorization'));
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    logger.warn('createGiftCheckoutSession auth failed', error);
    return null;
  }
}

export const createGiftCheckoutSession = runWith({
  secrets: [STRIPE_SECRET_KEY],
})
  .https.onRequest(async (req: Request, res: Response) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const decoded = await authenticate(req);
    if (!decoded) {
      res.status(401).send('Authentication required');
      return;
    }

    const { wishId, amount, recipientId, successUrl, cancelUrl, supporterId } =
      req.body;
    if (
      !wishId ||
      amount === undefined ||
      amount === null ||
      !recipientId ||
      !successUrl ||
      !cancelUrl
    ) {
      res.status(400).send('Missing parameters');
      return;
    }

    const numAmount = Number(amount);
    if (
      !Number.isFinite(numAmount) ||
      numAmount <= 0 ||
      numAmount > MAX_AMOUNT
    ) {
      res.status(400).send('Invalid amount');
      return;
    }

    let safeSuccessUrl: string;
    let safeCancelUrl: string;
    try {
      safeSuccessUrl = assertValidRedirectUrl(successUrl, 'successUrl');
      safeCancelUrl = assertValidRedirectUrl(cancelUrl, 'cancelUrl');
    } catch (err) {
      if (err instanceof RedirectUrlError) {
        logger.warn(
          'createGiftCheckoutSession received invalid redirect URL',
          err,
        );
        res.status(400).send('Invalid redirect URL');
        return;
      }
      logger.error(
        'Unexpected error validating gift redirect URLs',
        err,
      );
      res.status(500).send('Internal error');
      return;
    }

    const supporter =
      typeof supporterId === 'string' && supporterId.trim().length > 0
        ? supporterId.trim()
        : decoded.uid;
    if (supporter !== decoded.uid) {
      res.status(403).send('Forbidden');
      return;
    }

    try {
      if (!stripe) {
        stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
          apiVersion: '2022-11-15',
        });
      }

      const userSnap = await db.collection('users').doc(recipientId).get();
      const stripeAccountId = userSnap.get('stripeAccountId');
      if (!stripeAccountId) {
        res.status(400).send('Recipient not enabled for Stripe');
        return;
      }

      const metadata: Record<string, string> = { wishId, recipientId };
      if (supporter) {
        metadata.supporterId = supporter;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(numAmount * 100),
              product_data: { name: 'WhispList Gift' },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: Math.round(numAmount * 100 * 0.1),
          transfer_data: { destination: stripeAccountId },
        },
        metadata,
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
      });

      await db
        .collection('gifts')
        .doc(wishId)
        .collection('gifts')
        .doc(session.id)
        .set({
          amount: numAmount,
          recipientId,
          supporterId: supporter,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

      res.json({ url: session.url });
    } catch (err) {
      logger.error('Error creating gift checkout session', err);
      res.status(500).send('Internal error');
    }
  });
