import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';
import { assertValidRedirectUrl, RedirectUrlError } from './redirectValidation';

type StripeClient = InstanceType<typeof Stripe>;

let stripe: StripeClient | null = null;
const db = admin.firestore();

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
    logger.warn('createBillingPortalSession auth failed', error);
    return null;
  }
}

async function getOrCreateCustomer(userId: string): Promise<string> {
  const userRef = db.collection('users').doc(userId);
  const snap = await userRef.get();
  const existing = snap.get('stripeCustomerId');
  if (existing) return existing as string;

  if (!stripe)
    stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: '2022-11-15',
    });
  const email = snap.get('email') || undefined;
  const displayName = snap.get('displayName') || undefined;
  const customer = await stripe.customers.create({
    email,
    name: displayName,
    metadata: { userId },
  });
  await Promise.all([
    userRef
      .update({ stripeCustomerId: customer.id })
      .catch(() =>
        userRef.set({ stripeCustomerId: customer.id }, { merge: true }),
      ),
    db.collection('stripeCustomers').doc(customer.id).set({ userId }),
  ]);
  return customer.id;
}

export const createBillingPortalSession = runWith({
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

    const { userId, returnUrl } = req.body || {};
    const requestedUserId =
      typeof userId === 'string' && userId.trim().length ? userId.trim() : null;
    if (!requestedUserId || !returnUrl) {
      res.status(400).send('Missing parameters');
      return;
    }
    if (requestedUserId !== decoded.uid) {
      res.status(403).send('Forbidden');
      return;
    }

    let safeReturnUrl: string;
    try {
      safeReturnUrl = assertValidRedirectUrl(returnUrl, 'returnUrl');
    } catch (err) {
      if (err instanceof RedirectUrlError) {
        logger.warn(
          'createBillingPortalSession received invalid return URL',
          err,
        );
        res.status(400).send('Invalid redirect URL');
        return;
      }
      logger.error(
        'Unexpected error validating billing portal return URL',
        err,
      );
      res.status(500).send('Internal error');
      return;
    }
    try {
      if (!stripe)
        stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
          apiVersion: '2022-11-15',
        });
      const customerId = await getOrCreateCustomer(requestedUserId);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: safeReturnUrl,
      });
      res.json({ url: session.url });
    } catch (err) {
      logger.error('Error creating billing portal session', err);
      res.status(500).send('Internal error');
    }
  });
